import type { MappingRow, Project, Session } from '@/db/types';
import { sampleCatalog } from '@/modules/catalog/services/catalog';
import { assignKeys } from '@/modules/sessions/services/mapping';
import { applyProposal, buildTask, checkProtocol, hrmReportSchema, PROTOCOL, proposalSchema } from './protocol';

const catalog = sampleCatalog('2.5.39', 'quyet_dinh', 'Quyết định điều chuyển');
const project: Project = { id: 'p1', name: 'Công ty Mẫu A', url: 'https://hrm-mau-a.example.vn', mst: '0101234567', username: 'cauhinh.mau', hrmVersion: '2.5.39', createdAt: 0, updatedAt: 0 };
const session: Session = { id: 's1', projectId: 'p1', fileName: 'QD dieu chuyen.docx', docType: 'quyet_dinh', decisionType: 'Quyết định điều chuyển', hrmVersion: '2.5.39', status: 'cho_ai', createdAt: 0, updatedAt: 0 };
const mk = (id: string, patch: Partial<MappingRow> = {}): MappingRow => ({
  id: `s1:${id}`, sessionId: 's1', candidateId: id, location: { part: 'word/document.xml', paragraph: 0, start: 0, end: 1 },
  text: '012345678901', context: 'Ông Nguyễn Văn Mẫu, CCCD [[012345678901]]', ruleHint: 'id_number', status: 'cho', ...patch,
});

describe('buildTask', () => {
  it('masks personal values and carries project + fields', () => {
    const t = buildTask(session, project, [mk('c1')], catalog);
    expect(t.protocol).toBe(PROTOCOL);
    expect(t.key_rule).toBe('TenKey');
    expect(t.project.mst).toBe('0101234567');
    expect(JSON.stringify(t.candidates)).not.toMatch(/012345678901|Nguyễn/);
    expect(t.candidates[0].text).toBe('[số giấy tờ]');
    expect(t.hrm_job).toBeUndefined();
    expect(t.catalog_verified).toBe(false);
  });
  it('adds hrm_job after approval', () => {
    const rows = assignKeys([mk('c1', { status: 'duyet', fieldCode: 'nv.so_cccd' }), mk('c2', { status: 'duyet', gapGroup: 'T3', extraLabel: 'Lương bằng chữ' })], catalog.fields);
    const t = buildTask({ ...session, status: 'da_duyet', templateName: 'QĐ điều chuyển' }, project, rows, catalog);
    expect(t.hrm_job?.mapping).toEqual([{ key: 'SoCCCD', field_code: 'nv.so_cccd', field_label: 'Số CCCD', field_group: 'Nhân viên', format: undefined }]);
    expect(t.hrm_job?.unmapped_keys).toEqual(['LuongBangChu']);
    expect(t.hrm_job?.output_file_name).toBe('QD dieu chuyen_TenKey.docx');
  });
});

describe('applyProposal', () => {
  const rows = [mk('c1'), mk('c2'), mk('c3', { status: 'duyet', fieldCode: 'nv.email', source: 'nguoi_dung' })];
  it('accepts known fields, rejects unknown codes and user-decided rows, never approves', () => {
    const p = proposalSchema.parse({
      protocol: PROTOCOL, session_id: 's1',
      proposals: [
        { candidate_id: 'c1', field_code: 'nv.so_cccd', confidence: 'cao', reason: 'sau CCCD' },
        { candidate_id: 'c2', field_code: 'khong.co', confidence: 'cao' },
        { candidate_id: 'c3', field_code: 'nv.ho_va_ten', confidence: 'cao' },
        { candidate_id: 'c9', field_code: 'nv.ho_va_ten', confidence: 'cao' },
      ],
      gaps: [{ candidate_id: 'c2', group: 'T3', label: 'Lương bằng chữ' }],
    });
    const r = applyProposal(rows, catalog.fields, p);
    expect(r.accepted).toBe(2);
    expect(r.rejected.map((e) => e.path)).toEqual(['proposals.1', 'proposals.2', 'proposals.3']);
    expect(r.rows[0]).toMatchObject({ fieldCode: 'nv.so_cccd', source: 'ai', status: 'cho', confidence: 'cao' });
    expect(r.rows[1]).toMatchObject({ gapGroup: 'T3', extraLabel: 'Lương bằng chữ', status: 'cho' });
    expect(r.rows[2]).toMatchObject({ fieldCode: 'nv.email', source: 'nguoi_dung' });
  });
  it('validates shapes and protocol', () => {
    expect(proposalSchema.safeParse({ protocol: PROTOCOL, session_id: 's1', proposals: [{ candidate_id: 'c1' }] }).success).toBe(false);
    expect(checkProtocol('tstudio/0')).not.toBeNull();
    expect(checkProtocol(PROTOCOL)).toBeNull();
    expect(hrmReportSchema.safeParse({ protocol: PROTOCOL, session_id: 's1', outcome: 'thanh_cong' }).success).toBe(true);
  });
});
