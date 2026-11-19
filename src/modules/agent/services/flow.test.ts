import 'fake-indexeddb/auto';
import { makeDocx } from '@/test/makeDocx';
import { db } from '@/db/schema';
import { rowsRepo, sessionsRepo, reportsRepo } from '@/db/repositories';
import { saveProject } from '@/modules/projects/services/projects.workflow';
import { approveAllWithField, approveSession, createSession, updateRow } from '@/modules/sessions/services/session.workflow';
import { readDocx } from '@/modules/sessions/services/docx';
import { exportBackup, parseBackup, restoreBackup } from '@/modules/backup/services/backup';
import { getTask, reportSkillVersion, startHrm, submitHrmReport, submitProposal } from './agent.workflow';
import { PROTOCOL } from './protocol';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function setup() {
  const p = await saveProject({ name: 'Công ty Mẫu A', url: 'https://hrm-mau-a.example.vn', mst: '0101234567', username: 'cauhinh.mau', hrmVersion: '2.5.39', note: '' });
  if (!p.ok) throw new Error('project');
  const bytes = await makeDocx([['Ông/Bà: ', '…………'], ['Sinh ngày: ……/……/……'], ['Địa điểm làm việc: ……']]);
  const file = new File([bytes.slice().buffer as ArrayBuffer], 'HD mau.docx');
  const s = await createSession({ file, projectId: p.project.id, docType: 'hop_dong' });
  return { project: p.project, session: s };
}

describe('end-to-end flow (Studio side)', () => {
  it('create → propose → approve → HRM report, with guards', async () => {
    const { session } = await setup();
    const t0 = await getTask(session.id);
    expect(t0.ok).toBe(true);
    if (!t0.ok) return;
    expect(t0.data.candidates).toHaveLength(3);
    expect(t0.data.candidates[0].current?.field_code).toBe('nv.ho_va_ten'); // rule suggestion

    // Claude cannot jump to EasyHRM before approval
    expect((await startHrm(session.id)).ok).toBe(false);

    const prop = await submitProposal(JSON.stringify({
      protocol: PROTOCOL, session_id: session.id, skill_version: '1.0.0',
      proposals: [{ candidate_id: 'c2', field_code: 'nv.ngay_sinh', confidence: 'cao' }],
      gaps: [{ candidate_id: 'c3', group: 'T2', label: 'Địa điểm làm việc' }],
    }));
    expect(prop.ok).toBe(true);
    expect((await sessionsRepo.get(session.id))?.status).toBe('cho_duyet');

    // still blocked: user has not approved
    expect((await startHrm(session.id)).ok).toBe(false);
    const notReady = await approveSession(session.id);
    expect(notReady.ok).toBe(false);

    await approveAllWithField(session.id);
    const rows = await rowsRepo.bySession(session.id);
    const c3 = rows.find((r) => r.candidateId === 'c3')!;
    await updateRow(c3, { status: 'duyet', fieldCode: 'extra:DiaDiemLamViec', extraLabel: 'Địa điểm làm việc', gapGroup: undefined });

    const ok = await approveSession(session.id);
    expect(ok.ok).toBe(true);
    expect(ok.keys).toEqual(['DiaDiemLamViec', 'HoVaTen', 'NgaySinh']);
    const f = await db.files.get(session.id);
    const out = await readDocx(f!.output!);
    expect(out.paragraphs.map((p) => p.text)).toEqual(['Ông/Bà: {{HoVaTen}}', 'Sinh ngày: {{NgaySinh}}', 'Địa điểm làm việc: {{DiaDiemLamViec}}']);

    const t1 = await getTask(session.id);
    if (!t1.ok) throw new Error();
    expect(t1.data.hrm_job?.mapping.map((m) => m.key)).toEqual(['HoVaTen', 'NgaySinh']);
    expect(t1.data.hrm_job?.extra_fields).toEqual([{ key: 'DiaDiemLamViec', label: 'Địa điểm làm việc' }]);

    // proposals are refused after approval
    expect((await submitProposal({ protocol: PROTOCOL, session_id: session.id, proposals: [] })).ok).toBe(false);
    // report refused before startHrm
    expect((await submitHrmReport({ protocol: PROTOCOL, session_id: session.id, outcome: 'thanh_cong' })).ok).toBe(false);

    expect((await startHrm(session.id)).ok).toBe(true);
    const rep = await submitHrmReport({ protocol: PROTOCOL, session_id: session.id, outcome: 'thanh_cong', template_code: 'HD001', steps: ['Tạo mẫu'] });
    expect(rep.ok).toBe(true);
    expect((await sessionsRepo.get(session.id))?.status).toBe('da_tao');
    expect((await reportsRepo.bySession(session.id))[0].templateCode).toBe('HD001');
  });

  it('rejects wrong protocol and reports skill version', async () => {
    const { session } = await setup();
    const r = await submitProposal({ protocol: 'tstudio/0', session_id: session.id });
    expect(r.ok).toBe(false);
    const v = await reportSkillVersion('0.9.0');
    expect(v.ok && v.data.upToDate).toBe(false);
  });

  it('backup → restore keeps sessions and files', async () => {
    const { session } = await setup();
    const json = await exportBackup();
    await db.delete();
    await db.open();
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary).toEqual({ projects: 1, sessions: 1, catalogs: 1 });
    await restoreBackup(parsed.data);
    const f = await db.files.get(session.id);
    expect((await readDocx(f!.original)).paragraphs).toHaveLength(3);
    expect(parseBackup('{"x":1}').ok).toBe(false);
  });
});
