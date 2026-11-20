import type { Confidence, GapGroup, MappingRow, RuleHint } from '@/db/types';
import { normalize } from '@/shared/utils/text';
import { toTenKey } from './tenKey';

/**
 * CR-2026-003 Y1: every row without a catalog field gets a conclusion, never "— Chọn trường —".
 *  - 'bo_sung' → Trường giá trị bổ sung (T2, typed in each time a document is made)
 *  - 'chua_co' → Tham số EasyHRM chưa có (T1: data that belongs to HR records, T3: computed/joined)
 * Both become an EasyHRM "Trường giá trị bổ sung" (an unmapped {{key}} would print as is — tri-thuc
 * hop-dong-loai-hop-dong-mau-nguoi-ky §4); 'chua_co' is also reported to the product team (BR-19).
 */

export type RowKind = 'truong' | 'bo_sung' | 'chua_co' | 'none';

export const EXTRA_PREFIX = 'extra:';

/** What the row currently concludes. */
export function rowKind(row: Pick<MappingRow, 'fieldCode' | 'gapGroup' | 'extraLabel'>): RowKind {
  if (row.gapGroup === 'T1' || row.gapGroup === 'T3') return row.extraLabel?.trim() ? 'chua_co' : 'none';
  if (row.fieldCode?.startsWith(EXTRA_PREFIX) || row.gapGroup === 'T2') return row.extraLabel?.trim() ? 'bo_sung' : 'none';
  if (row.fieldCode) return 'truong';
  return 'none';
}

/** Rows that still need a conclusion (decided "Bỏ" rows and AI/rule "Bỏ" proposals are left alone). */
export function needsAssessment(row: MappingRow, catalogCodes?: Set<string>): boolean {
  if (row.status === 'bo' || (row.proposedSkip && row.status === 'cho')) return false;
  const kind = rowKind(row);
  if (kind === 'truong') return catalogCodes ? !catalogCodes.has(row.fieldCode!) : false;
  return kind === 'none';
}

// BR-18 — normalized fragments. T1: data EasyHRM keeps in employee/contract records. T3: computed or joined values.
const T3_HINTS = ['bang chu', 'tong cong', 'tong so', 'tong thu nhap', 'thanh tien', 'cong don', 'so nam cong tac', 'so thang cong tac', 'tham nien'];
const T1_HINTS = [
  'dan toc', 'ton giao', 'trinh do', 'chuyen mon', 'chuyen nganh', 'bang cap', 'hoc ham', 'hoc vi', 'so bhxh', 'so so bhxh', 'so bao hiem', 'bao hiem xa hoi',
  'ma so thue', 'tai khoan', 'ngan hang', 'he so', 'bac luong', 'ngach', 'gioi tinh', 'noi sinh', 'que quan', 'thuong tru', 'cho o', 'tam tru', 'ho khau',
  'dien thoai', 'email', 'ngay vao', 'ngay sinh', 'cccd', 'cmnd', 'can cuoc', 'ho chieu', 'ngay cap', 'noi cap', 'quoc tich', 'ma nhan vien', 'ma nv',
  'phu cap', 'chuc danh', 'chuc vu', 'phong ban', 'khoa phong', 'bo phan', 'don vi cong tac', 'ho va ten', 'ho ten', 'luong co ban', 'muc luong',
  'so hop dong', 'ngay ky hop dong', 'loai hop dong', 'tinh trang hon nhan',
];

export function classify(label: string, cueKnown = false): { group: GapGroup; why: string } {
  const n = normalize(label);
  const t3 = T3_HINTS.find((h) => n.includes(h));
  if (t3) return { group: 'T3', why: `giá trị phải tính/ghép ("${t3}")` };
  const t1 = T1_HINTS.find((h) => n.includes(h));
  if (t1) return { group: 'T1', why: 'dữ liệu vốn có trong hồ sơ nhân sự nhưng danh mục chưa có trường' };
  if (cueKnown) return { group: 'T1', why: 'chữ dẫn khớp một trường hồ sơ nhưng danh mục chưa có trường này' };
  return { group: 'T2', why: 'giá trị nhập mỗi lần lập văn bản' };
}

const FALLBACK: Partial<Record<RuleHint, string>> = {
  date: 'Ngày', date_words: 'Ngày', date_blank: 'Ngày', money: 'Số tiền', doc_number: 'Số văn bản', person_name: 'Họ tên',
  id_number: 'Số giấy tờ', phone: 'Số điện thoại',
};

const capitalize = (s: string) => (s ? s[0].toLocaleUpperCase('vi') + s.slice(1) : s);

/** Spread a TenKey back into words: "DiaDiemLamViec" → "Dia Diem Lam Viec". */
const spreadKey = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/**
 * FR-32: label from the words right before the blank ("Địa điểm làm việc: ……" → "Địa điểm làm việc").
 * No usable lead-in → a label by value type, suffixed with the candidate id so distinct blanks never share a key.
 */
export function deriveLabel(before: string, hint: RuleHint, candidateId: string, fixedKey?: string): { label: string; fromCue: boolean } {
  if (fixedKey) return { label: spreadKey(fixedKey), fromCue: true };
  let s = before.replace(/[…_.\s]+$/u, '').replace(/[:：\-–]\s*$/u, '').trim();
  // last clause only
  const cut = Math.max(s.lastIndexOf(','), s.lastIndexOf(';'), s.lastIndexOf('('), s.lastIndexOf('.'), s.lastIndexOf('"'), s.lastIndexOf('“'));
  if (cut >= 0) s = s.slice(cut + 1);
  s = s
    .replace(/^\s*(điều\s+\d+\.?|\d+(\.\d+)*[.)]|[a-zđ][.)]|[-–•+*])\s*/iu, '')
    .replace(/\s+(ông|bà|ông\/bà|ông \(bà\)|anh|chị)\s*$/iu, '')
    .replace(/\s+(là|tại|của|cho|với|đối với|vào)\s*$/iu, '')
    .trim();
  const words = s.split(/\s+/).filter(Boolean);
  const label = words.slice(-6).join(' ');
  const letters = label.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 3 && words.length <= 10) return { label: capitalize(label), fromCue: true };
  const isDate = hint === 'date' || hint === 'date_words' || hint === 'date_blank';
  if (isDate && /,\s*$/.test(before) && before.trim().length < 40) return { label: 'Ngày lập văn bản', fromCue: false };
  return { label: `${FALLBACK[hint] ?? 'Nội dung'} ${candidateId}`, fromCue: false };
}

/** Text before the candidate, from the stored context ("…abc[[value]]xyz…"). */
export function beforeFromContext(context: string): string {
  return (context.split('[[')[0] ?? '').replace(/^…/, '');
}

export interface AssessOptions {
  /** Lead-in matched a rule in suggest.ts but the catalog lacks the field. */
  cueKnown?: boolean;
  /** Label/note proposed by the AI (gap without usable label, or T4). */
  aiLabel?: string;
  aiNote?: string;
}

/** Patch that gives a row its conclusion. Pure. */
export function assessRow(row: MappingRow, before: string, opts: AssessOptions = {}): Partial<MappingRow> {
  const derived = opts.aiLabel?.trim() ? { label: opts.aiLabel.trim(), fromCue: true } : deriveLabel(before, row.ruleHint, row.candidateId, row.fixedKey);
  const c = classify(derived.label, opts.cueKnown);
  const confidence: Confidence = opts.aiNote !== undefined || !derived.fromCue ? 'thap' : 'trung_binh';
  const kindLabel = c.group === 'T2' ? 'Trường giá trị bổ sung' : 'Tham số EasyHRM chưa có';
  return {
    fieldCode: `${EXTRA_PREFIX}${toTenKey(derived.label)}`,
    extraLabel: derived.label,
    gapGroup: c.group,
    gapNote: opts.aiNote,
    confidence,
    assessedBy: 'studio',
    source: row.source ?? 'quy_tac',
    reason: `Studio đánh giá: ${kindLabel} — ${c.why}${derived.fromCue ? '' : '; tên tự đặt, nên sửa'}${opts.aiNote ? ` · AI: ${opts.aiNote}` : ''}`,
  };
}

/** Patch for a user switching the conclusion in the table (FR-35). */
export function switchKind(row: MappingRow, to: 'bo_sung' | 'chua_co', group?: GapGroup): Partial<MappingRow> {
  const label = row.extraLabel?.trim() || deriveLabel(beforeFromContext(row.context), row.ruleHint, row.candidateId, row.fixedKey).label;
  const g: GapGroup = to === 'bo_sung' ? 'T2' : group === 'T3' ? 'T3' : 'T1';
  return { fieldCode: `${EXTRA_PREFIX}${toTenKey(label)}`, extraLabel: label, gapGroup: g, format: undefined, assessedBy: undefined, source: 'nguoi_dung', proposedSkip: undefined };
}

/** Apply assessment to every row that still lacks a conclusion. */
export function ensureAssessed(
  rows: MappingRow[],
  catalogCodes: Set<string>,
  beforeOf: (row: MappingRow) => string = (r) => beforeFromContext(r.context),
  cueKnownOf: (row: MappingRow) => boolean = () => false,
): { rows: MappingRow[]; changed: number } {
  let changed = 0;
  const out = rows.map((r) => {
    if (!needsAssessment(r, catalogCodes)) return r;
    changed++;
    const aiLabel = r.gapGroup === 'T4' ? r.extraLabel : undefined;
    const aiNote = r.source === 'ai' ? (r.gapNote ?? (r.gapGroup ? 'AI chưa chắc là tham số' : undefined)) : undefined;
    return { ...r, ...assessRow({ ...r, fieldCode: undefined }, beforeOf(r), { cueKnown: cueKnownOf(r), aiLabel, aiNote }) };
  });
  return { rows: out, changed };
}
