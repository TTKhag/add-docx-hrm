import type { MappingRow } from '@/db/types';
import { sampleCatalog } from '@/modules/catalog/services/catalog';
import { assignKeys, buildRows, canMove, gapReport, readiness, unmappedKeys } from './mapping';
import type { Candidate } from './detect';

const fields = sampleCatalog('2.5.39', 'hop_dong').fields;
const loc = (paragraph: number, start: number, end: number) => ({ part: 'word/document.xml', paragraph, start, end });

const row = (id: string, patch: Partial<MappingRow>): MappingRow => ({
  id: `s:${id}`, sessionId: 's', candidateId: id, location: loc(0, 0, 1), text: '…', context: '', ruleHint: 'dotted_blank', status: 'duyet', ...patch,
});

describe('buildRows', () => {
  it('suggests fields from the words before the blank', () => {
    const texts = ['Ông/Bà: …………', 'Ngày sinh: ……/……/……', 'Không rõ: ……'];
    const cands: Candidate[] = [
      { candidateId: 'c1', location: loc(0, 8, 12), text: '…………', context: '', ruleHint: 'dotted_blank' },
      { candidateId: 'c2', location: loc(1, 11, 21), text: '……/……/……', context: '', ruleHint: 'dotted_blank' },
      { candidateId: 'c3', location: loc(2, 10, 12), text: '……', context: '', ruleHint: 'dotted_blank' },
    ];
    const rows = buildRows('s', cands, fields, (_p, i) => texts[i]);
    expect(rows[0].fieldCode).toBe('nv.ho_va_ten');
    expect(rows[1].fieldCode).toBe('nv.ngay_sinh');
    expect(rows[1].format).toBe('dd/MM/yyyy');
    // CR-2026-003: no field → Studio concludes instead of leaving "— Chọn trường —"
    expect(rows[2].fieldCode).toBe('extra:KhongRo');
    expect(rows[2].assessedBy).toBe('studio');
    expect(rows.every((r) => r.status === 'cho')).toBe(true);
  });
  it('maps an existing key to the field with the same TenKey', () => {
    const cands: Candidate[] = [{ candidateId: 'c1', location: loc(0, 0, 12), text: '{{ho_va_ten}}', context: '', ruleHint: 'existing_key' }];
    const rows = buildRows('s', cands, fields, () => '{{ho_va_ten}}');
    expect(rows[0].fieldCode).toBe('nv.ho_va_ten');
    expect(rows[0].confidence).toBe('cao');
  });
});

describe('assignKeys', () => {
  it('same field → same key; colliding labels get a group suffix; dictionary keys win', () => {
    const rows = [
      row('c1', { fieldCode: 'nv.ho_va_ten' }),
      row('c2', { fieldCode: 'nv.ho_va_ten' }),
      row('c3', { fieldCode: 'hd.ngay_hieu_luc' }),
      row('c4', { fieldCode: 'nv.ngay_sinh' }),
      row('c5', { status: 'bo', fieldCode: 'nv.email' }),
      row('c6', { fieldCode: 'extra:DiaDiemLamViec', extraLabel: 'Địa điểm làm việc' }),
      row('c7', { gapGroup: 'T3', extraLabel: 'Lương bằng chữ' }),
    ];
    const dict = new Map([['nv.ngay_sinh', 'NgaySinhNV']]);
    const out = assignKeys(rows, fields, dict);
    expect(out.map((r) => r.key)).toEqual(['HoVaTen', 'HoVaTen', 'NgayHieuLuc', 'NgaySinhNV', undefined, 'DiaDiemLamViec', 'LuongBangChu']);
  });
  it('different fields with the same label do not share a key', () => {
    const custom = [
      { code: 'a', label: 'Ngày hiệu lực', group: 'Hợp đồng', kind: 'date' as const },
      { code: 'b', label: 'Ngày hiệu lực', group: 'Phụ lục', kind: 'date' as const },
    ];
    const out = assignKeys([row('c1', { fieldCode: 'a' }), row('c2', { fieldCode: 'b' })], custom);
    expect(out.map((r) => r.key)).toEqual(['NgayHieuLuc', 'NgayHieuLucPhuLuc']);
  });
});

describe('readiness & gaps', () => {
  it('blocks pending rows, approved rows without field, and T4', () => {
    const rows = [
      row('c1', { status: 'cho' }),
      row('c2', {}),
      row('c3', { gapGroup: 'T4', extraLabel: 'x' }),
      row('c4', { fieldCode: 'nv.email' }),
    ];
    const msgs = readiness(rows, fields).map((p) => p.candidateId);
    expect(msgs).toEqual(['c1', 'c2', 'c3']);
  });
  it('ready when every row is decided', () => {
    expect(readiness([row('c1', { fieldCode: 'nv.email' }), row('c2', { status: 'bo' })], fields)).toEqual([]);
  });
  it('gap report and unmapped keys', () => {
    const rows = assignKeys([row('c1', { gapGroup: 'T3', extraLabel: 'Lương bằng chữ' }), row('c2', { fieldCode: 'nv.email' })], fields);
    expect(gapReport(rows)).toHaveLength(1);
    expect(unmappedKeys(rows)).toEqual(['LuongBangChu']);
  });
});

describe('status transitions', () => {
  it('follows the state diagram', () => {
    expect(canMove('cho_duyet', 'da_duyet')).toBe(true);
    expect(canMove('cho_ai', 'da_duyet')).toBe(false);
    expect(canMove('hoan_tat', 'nhap')).toBe(false);
    expect(canMove('dung', 'da_duyet')).toBe(true);
  });
});
