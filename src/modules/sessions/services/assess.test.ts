import type { MappingRow } from '@/db/types';
import { assessRow, beforeFromContext, classify, deriveLabel, ensureAssessed, needsAssessment, rowKind, switchKind } from './assess';

const row = (patch: Partial<MappingRow> = {}): MappingRow => ({
  id: 's:c1', sessionId: 's', candidateId: 'c1', location: { part: 'word/document.xml', paragraph: 0, start: 0, end: 1 },
  text: '……', context: '', ruleHint: 'dotted_blank', status: 'cho', ...patch,
});

describe('CR-2026-003 Y1 — tự đánh giá key không có trường', () => {
  it('derives a label from the lead-in', () => {
    expect(deriveLabel('Địa điểm làm việc: ', 'dotted_blank', 'c1').label).toBe('Địa điểm làm việc');
    expect(deriveLabel('2. Mức lương chính: ', 'money', 'c2').label).toBe('Mức lương chính');
    expect(deriveLabel('Điều 1. Điều chuyển đối với ông ', 'person_name', 'c3').label).toBe('Điều chuyển');
    expect(deriveLabel('Hà Nội, ', 'date_blank', 'c4')).toEqual({ label: 'Ngày lập văn bản', fromCue: false });
    expect(deriveLabel('', 'money', 'c5')).toEqual({ label: 'Số tiền c5', fromCue: false });
    expect(deriveLabel('', 'existing_key', 'c6', 'DiaDiemLamViec').label).toBe('Dia Diem Lam Viec');
  });

  it('classifies bổ sung (T2) vs chưa có (T1/T3)', () => {
    expect(classify('Lý do điều chuyển').group).toBe('T2');
    expect(classify('Địa điểm làm việc').group).toBe('T2');
    expect(classify('Số sổ BHXH').group).toBe('T1');
    expect(classify('Trình độ chuyên môn').group).toBe('T1');
    expect(classify('Lương bằng chữ').group).toBe('T3');
    expect(classify('Nội dung khác', true).group).toBe('T1');
  });

  it('assessRow always yields a key-able conclusion, highlighted as studio', () => {
    const p = assessRow(row(), 'Địa điểm làm việc: ');
    expect(p).toMatchObject({ fieldCode: 'extra:DiaDiemLamViec', extraLabel: 'Địa điểm làm việc', gapGroup: 'T2', assessedBy: 'studio', confidence: 'trung_binh' });
    expect(rowKind({ ...row(), ...p })).toBe('bo_sung');
    const q = assessRow(row(), 'Số sổ BHXH: ');
    expect(q.gapGroup).toBe('T1');
    expect(rowKind({ ...row(), ...q })).toBe('chua_co');
  });

  it('ensureAssessed fills T4 / unlabeled AI gaps and stale catalog fields, leaves decided rows', () => {
    const rows = [
      row({ candidateId: 'c1', context: 'Lý do: [[……]]' }),
      row({ candidateId: 'c2', gapGroup: 'T4', source: 'ai', gapNote: 'không chắc', context: 'x [[……]]' }),
      row({ candidateId: 'c3', fieldCode: 'old.field', context: 'Chức danh mới: [[……]]' }),
      row({ candidateId: 'c4', status: 'bo' }),
      row({ candidateId: 'c5', proposedSkip: true }),
      row({ candidateId: 'c6', fieldCode: 'nv.email' }),
    ];
    const r = ensureAssessed(rows, new Set(['nv.email']));
    expect(r.changed).toBe(3);
    expect(r.rows[0].extraLabel).toBe('Lý do');
    expect(r.rows[1].confidence).toBe('thap');
    expect(r.rows[1].reason).toContain('không chắc');
    expect(r.rows[2].fieldCode).toBe('extra:ChucDanhMoi');
    expect(r.rows[3]).toBe(rows[3]);
    expect(r.rows[4]).toBe(rows[4]);
    expect(r.rows.filter((x) => needsAssessment(x, new Set(['nv.email'])))).toHaveLength(0);
  });

  it('switchKind moves between bổ sung and chưa có, keeping the label', () => {
    const r = { ...row(), ...assessRow(row(), 'Lý do: ') } as MappingRow;
    expect(switchKind(r, 'chua_co', 'T3')).toMatchObject({ gapGroup: 'T3', extraLabel: 'Lý do', fieldCode: 'extra:LyDo', source: 'nguoi_dung' });
    expect(switchKind(r, 'bo_sung').gapGroup).toBe('T2');
    expect(beforeFromContext('…abc: [[x]] y')).toBe('abc: ');
  });
});
