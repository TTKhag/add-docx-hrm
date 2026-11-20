import 'fake-indexeddb/auto';
import { makeDocx } from '@/test/makeDocx';
import { db } from '@/db/schema';
import { jobsRepo, rowsRepo, settingsRepo } from '@/db/repositories';
import { saveProject } from '@/modules/projects/services/projects.workflow';
import { approveAllAndExport, createSession, handToHrm, updateRow } from '@/modules/sessions/services/session.workflow';
import { rowKind } from '@/modules/sessions/services/assess';
import { handoffHistory } from '@/modules/handoff/services/handoff';
import { packageDir, upsertQueue } from '@/modules/handoff/services/mirror';
import { backfillV3 } from '@/app/backfillV3';
import { completeJob, getHandoff, getOutputFile, getTask, startDuty, stopDuty, waitForJob } from './agent.workflow';
import { DUTY_KEY, enqueueJob, isOnDuty, requeueStale, STALE_JOB_MS } from './duty';
import { claudeLink, promptDuty } from './prompts';

// Sample data only.
beforeEach(async () => {
  await db.delete();
  await db.open();
});

const asFile = (bytes: Uint8Array, name: string) => new File([bytes.slice().buffer as ArrayBuffer], name);

async function setup() {
  const p = await saveProject({ name: 'Bệnh viện Mẫu', url: 'https://hrm-mau.example.vn', mst: '0101234567', username: 'cauhinh.mau', hrmVersion: '2.5.39', note: '' });
  if (!p.ok) throw new Error('project');
  const doc = await makeDocx([
    ['HỢP ĐỒNG LAO ĐỘNG'],
    ['Ông/Bà: ……………'],
    ['Địa điểm làm việc: ……………'],
    ['Số sổ BHXH: ……………'],
    ['Tổng thu nhập tháng: ……………'],
  ]);
  return createSession({ file: asFile(doc, 'HDLD mau.docx'), projectId: p.project.id });
}

describe('CR-2026-003', () => {
  it('Y1+Y2: every key has a conclusion; "Duyệt toàn bộ & xuất tệp" works with no manual field choice', async () => {
    const s = await setup();
    const rows = await rowsRepo.bySession(s.id);
    expect(rows.every((r) => rowKind(r) !== 'none')).toBe(true);
    const by = (t: string) => rows.find((r) => r.context.includes(t))!;
    expect(rowKind(by('Địa điểm'))).toBe('bo_sung');
    expect(rowKind(by('BHXH'))).toBe('chua_co');
    expect(by('Tổng thu nhập').gapGroup).toBe('T3');
    const r = await approveAllAndExport(s.id);
    expect(r.ok).toBe(true);
    expect(r.keys).toEqual(expect.arrayContaining(['DiaDiemLamViec', 'SoSoBHXH', 'TongThuNhapThang']));
    // Y4: package frozen at approval
    expect(r.handoff?.version).toBe(1);
    expect(r.handoff?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const t = await getTask(s.id);
    if (!t.ok) throw new Error(t.message);
    expect(t.data.hrm_job?.file?.version).toBe(1);
    expect(t.data.hrm_job?.extra_fields.map((x) => x.key)).toEqual(expect.arrayContaining(['DiaDiemLamViec', 'SoSoBHXH']));
  });

  it('Y4: packages survive reopening (superseded, not deleted) and re-approval creates version 2', async () => {
    const s = await setup();
    await approveAllAndExport(s.id);
    const g = await getHandoff(s.id);
    expect(g.ok && g.data.version).toBe(1);
    const row = (await rowsRepo.bySession(s.id))[0];
    await updateRow(row, { status: 'cho' }); // reopen
    expect((await getOutputFile(s.id)).ok).toBe(false);
    expect((await handoffHistory(s.id)).map((h) => h.active)).toEqual([0]);
    await approveAllAndExport(s.id);
    const hist = await handoffHistory(s.id);
    expect(hist.map((h) => [h.version, h.active])).toEqual([[1, 0], [2, 1]]);
    const c = await getOutputFile(s.id, 0, 200000);
    expect(c.ok && c.data.sha256).toBe(hist[1].sha256);
  });

  it('Y4: back-fill creates packages for sessions approved before v3', async () => {
    const s = await setup();
    await approveAllAndExport(s.id);
    await db.handoffs.clear();
    const r = await backfillV3(true);
    expect(r.packages).toBe(1);
    expect((await handoffHistory(s.id))[0].active).toBe(1);
  });

  it('Y3: duty — jobs flow from Studio clicks to Claude without any prompt', async () => {
    const s = await setup();
    expect((await waitForJob(0)).ok).toBe(false); // ERR-33
    const d = await startDuty({ hours: 2, consent_save: true, skill_version: '2.1.0' });
    expect(d.ok).toBe(true);
    expect(isOnDuty(await settingsRepo.get(DUTY_KEY))).toBe(true);
    const idle = await waitForJob(0);
    expect(idle.ok && idle.data.job).toBeNull();
    await approveAllAndExport(s.id);
    await handToHrm([s.id]);
    const j1 = await enqueueJob('tao_hrm', [s.id]);
    const j2 = await enqueueJob('tao_hrm', [s.id]);
    expect(j2.id).toBe(j1.id); // no duplicate while waiting
    const got = await waitForJob(0);
    if (!got.ok || !got.data.job) throw new Error('no job');
    expect(got.data.job).toMatchObject({ id: j1.id, kind: 'tao_hrm', session_ids: [s.id] });
    expect((await jobsRepo.get(j1.id))?.status).toBe('dang_lam');
    expect((await completeJob('j_khong_co')).ok).toBe(false); // ERR-34
    expect((await completeJob(j1.id, 'MQD020 tạo xong')).ok).toBe(true);
    expect((await jobsRepo.get(j1.id))?.status).toBe('xong');
    // stale running job goes back to the queue (BR-24)
    const j3 = await enqueueJob('phan_tich', [s.id]);
    await waitForJob(0);
    expect(await requeueStale(Date.now() + STALE_JOB_MS + 1)).toBe(1);
    expect((await jobsRepo.get(j3.id))?.status).toBe('cho');
    await stopDuty();
    expect(isOnDuty(await settingsRepo.get(DUTY_KEY))).toBe(false);
  });

  it('Y3: duty ends by itself when the shift is over', async () => {
    await startDuty({ hours: 1 });
    const d = await settingsRepo.get<{ until: number }>(DUTY_KEY);
    await settingsRepo.set(DUTY_KEY, { ...d, until: Date.now() - 1 });
    const r = await waitForJob(0);
    expect(r.ok && r.data.stop).toBe(true);
  });

  it('prompt, deep link and folder layout helpers', () => {
    const p = promptDuty(4);
    expect(p).toContain('bấm Lưu');
    expect(claudeLink(p, 'desktop').startsWith('claude://claude.ai/new?q=')).toBe(true);
    expect(claudeLink('a b', 'web')).toBe('https://claude.ai/new?q=a%20b');
    expect(packageDir('Bệnh viện Mẫu', 3, 's_1')).toEqual(['EasyHRM-Studio', 'Benh-vien-Mau', '003-s_1']);
    const e = (id: string, o: number) => ({ session_id: id, project: 'x', queue_order: o, file: 'f', path: 'p', size: 1, sha256: 'h', version: 1, approved_at: '' });
    expect(upsertQueue([e('a', 2), e('b', 1)], { ...e('a', 2), version: 2 }).map((x) => [x.session_id, x.version])).toEqual([['b', 1], ['a', 2]]);
  });
});
