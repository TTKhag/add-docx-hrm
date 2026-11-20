import 'fake-indexeddb/auto';
import { makeDocx } from '@/test/makeDocx';
import { db } from '@/db/schema';
import { rowsRepo, sessionsRepo } from '@/db/repositories';
import { saveProject } from '@/modules/projects/services/projects.workflow';
import { acceptAllProposals, approveSession, createSessions, handToHrm } from '@/modules/sessions/services/session.workflow';
import { readDocx, verifyDocx } from '@/modules/sessions/services/docx';
import { migrateBackupTables } from '@/modules/backup/services/backup';
import { getOutputFile, getTask, listForAi, listQueue, startHrm, submitHrmReport, submitProposal } from './agent.workflow';
import { PROTOCOL } from './protocol';

// Sample data only.
beforeEach(async () => {
  await db.delete();
  await db.open();
});

const asFile = (bytes: Uint8Array, name: string) => new File([bytes.slice().buffer as ArrayBuffer], name);

async function project() {
  const p = await saveProject({ name: 'Bệnh viện Mẫu', url: 'https://hrm-mau.example.vn', mst: '0101234567', username: 'cauhinh.mau', hrmVersion: '2.5.39', note: '' });
  if (!p.ok) throw new Error('project');
  return p.project;
}

const decision = () => makeDocx([
  ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
  ['QUYẾT ĐỊNH'],
  ['Về bổ nhiệm lại ……………'],
  ['Căn cứ Nghị định số 115/2020/NĐ-CP ngày 25 tháng 9 năm 2020 của Chính phủ;'],
  ['Điều 1. Bổ nhiệm lại chức vụ Phó Trưởng khoa đối với ông Nguyễn Văn Mẫu, thời gian giữ chức vụ là 05 năm.'],
  ['Hà Nội, ngày ….. tháng ….. năm 20…..'],
]);

describe('v2: batch → AI full-text proposal → one-click approve → queue → file for Claude', () => {
  it('runs the whole Studio side without the user creating any data', async () => {
    const p = await project();
    const preKeyed = await makeDocx([['HỢP ĐỒNG LAO ĐỘNG'], ['Ông/Bà: ', '{{HoVaTen}}'], ['Lương: {{LuongCoBan}}']]);
    const res = await createSessions([asFile(await decision(), 'STT 05 - Quyết định bổ nhiệm lại_mau.docx'), asFile(preKeyed, 'HDLD co key.docx'), asFile(new Uint8Array([1, 2, 3]), 'hong.docx')], p.id);
    expect(res.map((r) => !!r.session)).toEqual([true, true, false]); // one bad file does not stop the batch
    const [qd, hd] = [res[0].session!, res[1].session!];
    expect(qd.decisionType).toBe('Quyết định bổ nhiệm lại');
    expect(qd.templateName).toBe('Quyết định bổ nhiệm lại');
    expect(hd.mode).toBe('da_co_key');
    expect(hd.queueOrder).toBe(qd.queueOrder! + 1);
    expect((await listForAi()).ok && (await listForAi() as { data: { id: string }[] }).data.map((x) => x.id)).toEqual([qd.id, hd.id]);

    // AI sees the whole document, masked
    const t = await getTask(qd.id);
    if (!t.ok) throw new Error(t.message);
    const text = t.data.document!.map((d) => d.text).join('\n');
    expect(text).toContain('Phó Trưởng khoa');
    expect(text).not.toContain('Nguyễn Văn Mẫu');
    expect(t.data.decision_types).toContain('Quyết định bổ nhiệm lại');
    const rows0 = await rowsRepo.bySession(qd.id);
    expect(rows0.filter((r) => r.ruleHint === 'date_blank')).toHaveLength(1);
    expect(rows0.find((r) => r.ruleHint === 'date_words')?.proposedSkip).toBe(true); // legal basis
    const p5 = t.data.document!.find((d) => d.text.includes('Phó Trưởng khoa'))!;

    const subject = rows0.find((r) => r.context.includes('Về bổ nhiệm lại'))!;
    const dateRow = rows0.find((r) => r.ruleHint === 'date_blank')!;
    const nameRow = rows0.find((r) => r.ruleHint === 'person_name')!; // "đối với ông Nguyễn Văn Mẫu" (lowercase cue)
    expect(nameRow.text).toBe('Nguyễn Văn Mẫu');
    const prop = await submitProposal({
      protocol: PROTOCOL, session_id: qd.id, skill_version: '2.1.0',
      doc_meta: { template_name: 'Quyết định bổ nhiệm lại RHM' },
      proposals: [
        { candidate_id: dateRow.candidateId, field_code: 'qd.ngay_quyet_dinh', confidence: 'cao' },
        { candidate_id: nameRow.candidateId, field_code: 'nv.ho_va_ten', confidence: 'cao' },
      ],
      gaps: [{ candidate_id: subject.candidateId, group: 'T2', label: 'Chức vụ bổ nhiệm lại' }],
      add_candidates: [
        { paragraph_id: p5.id, match: 'Phó Trưởng khoa', gap: { group: 'T2', label: 'Chức vụ bổ nhiệm lại' } },
        { paragraph_id: p5.id, match: '[tên người]', field_code: 'nv.ho_va_ten', confidence: 'cao' }, // already a candidate → refused
        { paragraph_id: p5.id, match: 'không có chữ này', field_code: 'nv.ho_va_ten' },
        { paragraph_id: p5.id, match: '05 năm', gap: { group: 'T2', label: 'Thời gian giữ chức vụ' } },
      ],
    });
    if (!prop.ok) throw new Error(prop.message);
    expect(prop.data.rejected).toHaveLength(2);
    const rows1 = await rowsRepo.bySession(qd.id);
    const added = rows1.filter((r) => r.addedBy === 'ai');
    expect(added.map((r) => r.text)).toEqual(['Phó Trưởng khoa', '05 năm']);
    expect(rows1.find((r) => r.candidateId === subject.candidateId)?.fieldCode).toBe('extra:ChucVuBoNhiemLai'); // gap → extra field
    expect((await sessionsRepo.get(qd.id))?.templateName).toBe('Quyết định bổ nhiệm lại RHM');

    // user: one click
    const acc = await acceptAllProposals(qd.id);
    expect(acc.left).toEqual([]);
    const ap = await approveSession(qd.id);
    expect(ap.ok).toBe(true);
    expect(ap.keys).toEqual(['ChucVuBoNhiemLai', 'HoVaTen', 'NgayQuyetDinh', 'ThoiGianGiuChucVu']);
    const out = await readDocx((await db.files.get(qd.id))!.output!);
    const all = out.paragraphs.map((x) => x.text).join('\n');
    expect(all).toContain('chức vụ {{ChucVuBoNhiemLai}} đối với ông {{HoVaTen}}, thời gian giữ chức vụ là {{ThoiGianGiuChucVu}}.');
    expect(all).toContain('ngày 25 tháng 9 năm 2020'); // legal basis kept

    // pre-keyed: keys kept, unknown key becomes an extra field via AI
    await submitProposal({ protocol: PROTOCOL, session_id: hd.id, proposals: [], gaps: [{ candidate_id: 'c2', group: 'T1', label: 'Lương cơ bản' }] });
    const hrows = await rowsRepo.bySession(hd.id);
    expect(hrows[0].fieldCode).toBe('nv.ho_va_ten');
    await acceptAllProposals(hd.id);
    const hap = await approveSession(hd.id);
    expect(hap.keys).toEqual(['HoVaTen', 'LuongCoBan']); // file keys never renamed
    expect((await verifyDocx((await db.files.get(hd.id))!.output!)).issues.filter((i) => i.level === 'loi')).toEqual([]);

    // queue for EasyHRM
    expect((await handToHrm([hd.id, qd.id])).queued).toEqual([hd.id, qd.id]);
    const q = await listQueue();
    if (!q.ok) throw new Error();
    expect(q.data.map((x) => x.id)).toEqual([qd.id, hd.id]); // queue order, not hand order
    const job = await getTask(qd.id);
    if (!job.ok) throw new Error();
    expect(job.data.document).toBeUndefined(); // no document once approved
    expect(job.data.hrm_job?.extra_fields).toEqual([{ key: 'ChucVuBoNhiemLai', label: 'Chức vụ bổ nhiệm lại' }, { key: 'ThoiGianGiuChucVu', label: 'Thời gian giữ chức vụ' }]);
    expect(job.data.hrm_job?.handed_to_claude).toBe(true);
    expect(job.data.hrm_job?.file?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // file chunks reassemble to the exact bytes
    const size = job.data.hrm_job!.file!.size;
    const parts: Uint8Array[] = [];
    for (let off = 0; ;) {
      const c = await getOutputFile(qd.id, off, 1000);
      if (!c.ok) throw new Error(c.message);
      parts.push(Uint8Array.from(atob(c.data.base64), (ch) => ch.charCodeAt(0)));
      off += c.data.length;
      if (c.data.done) break;
    }
    const joined = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of parts) { joined.set(x, o); o += x.length; }
    expect(joined.length).toBe(size);
    expect(new Uint8Array(await (await db.files.get(qd.id))!.output!.arrayBuffer())).toEqual(joined);

    // report with created extra fields; session leaves the queue
    expect((await startHrm(qd.id)).ok).toBe(true);
    const rep = await submitHrmReport({ protocol: PROTOCOL, session_id: qd.id, outcome: 'thanh_cong', template_code: 'MQD020', created_extra_fields: [{ key: 'ChucVuBoNhiemLai', label: 'Chức vụ bổ nhiệm lại' }] });
    expect(rep.ok).toBe(true);
    const q2 = await listQueue();
    expect(q2.ok && q2.data.map((x) => x.id)).toEqual([hd.id]);
  });

  it('migrates v1 backups (mode + queue order)', () => {
    const t = migrateBackupTables(1, { projects: [], rows: [], catalogs: [], keyDictionary: [], logs: [], hrmReports: [], settings: [], files: [],
      sessions: [{ id: 'b', createdAt: 2 }, { id: 'a', createdAt: 1 }] });
    expect(t.sessions).toEqual([{ id: 'a', createdAt: 1, mode: 'chen_key', queueOrder: 1 }, { id: 'b', createdAt: 2, mode: 'chen_key', queueOrder: 2 }]);
  });
});
