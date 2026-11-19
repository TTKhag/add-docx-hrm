import type { CatalogField, GapGroup, MappingRow, SessionStatus } from '@/db/types';
import type { Candidate } from './detect';
import { suggestByCue, suggestForExistingKey } from './suggest';
import { isValidTenKey, toTenKey, uniqueKey } from './tenKey';

export const EXTRA_PREFIX = 'extra:';

export function isExtraField(code?: string): boolean {
  return !!code && code.startsWith(EXTRA_PREFIX);
}

export function buildRows(
  sessionId: string,
  candidates: Candidate[],
  fields: CatalogField[],
  paragraphText: (part: string, index: number) => string,
): MappingRow[] {
  return candidates.map((c) => {
    const row: MappingRow = {
      id: `${sessionId}:${c.candidateId}`,
      sessionId,
      candidateId: c.candidateId,
      location: c.location,
      text: c.text,
      context: c.context,
      ruleHint: c.ruleHint,
      status: 'cho',
    };
    const before = paragraphText(c.location.part, c.location.paragraph).slice(0, c.location.start);
    const s = c.ruleHint === 'existing_key' ? suggestForExistingKey(c.text, fields) : suggestByCue(before, fields);
    if (s) {
      row.fieldCode = s.fieldCode;
      row.confidence = s.confidence;
      row.reason = s.reason;
      row.source = 'quy_tac';
    }
    const f = fields.find((x) => x.code === row.fieldCode);
    if (f) row.format = defaultFormat(f);
    return row;
  });
}

export function defaultFormat(f: CatalogField): string | undefined {
  if (f.kind === 'date') return 'dd/MM/yyyy';
  if (f.kind === 'number') return '#,##0';
  return undefined;
}

/** Label used to build a row's key: field label, or the extra/gap label. */
export function rowLabel(row: MappingRow, fields: CatalogField[]): string | undefined {
  if (row.fieldCode && !isExtraField(row.fieldCode)) return fields.find((f) => f.code === row.fieldCode)?.label;
  return row.extraLabel?.trim() || undefined;
}

/** Identity of "the same meaning": same catalog field, or same extra/gap label. */
function meaningId(row: MappingRow, fields: CatalogField[]): string | undefined {
  if (row.fieldCode && !isExtraField(row.fieldCode)) return `f:${row.fieldCode}`;
  const label = rowLabel(row, fields);
  return label ? `x:${toTenKey(label)}` : undefined;
}

/**
 * Generate TenKey for every approved row. Same meaning → same key (BR-03); different meanings that collide get a group suffix.
 * `dictionary` maps fieldCode → key already used in this project, so keys stay stable across sessions.
 */
export function assignKeys(
  rows: MappingRow[],
  fields: CatalogField[],
  dictionary: Map<string, string> = new Map(),
): MappingRow[] {
  const keyOf = new Map<string, string>(); // meaningId → key
  const taken = new Set<string>();
  // First pass: reserve dictionary keys for fields present in this session.
  for (const r of rows) {
    const id = meaningId(r, fields);
    if (r.status !== 'duyet' || !id || keyOf.has(id)) continue;
    const dictKey = r.fieldCode ? dictionary.get(r.fieldCode) : undefined;
    if (dictKey && isValidTenKey(dictKey) && !taken.has(dictKey)) {
      keyOf.set(id, dictKey);
      taken.add(dictKey);
    }
  }
  for (const r of rows) {
    const id = meaningId(r, fields);
    if (r.status !== 'duyet' || !id || keyOf.has(id)) continue;
    const label = rowLabel(r, fields)!;
    const group = fields.find((f) => f.code === r.fieldCode)?.group;
    const k = uniqueKey(toTenKey(label), taken, group);
    keyOf.set(id, k);
    taken.add(k);
  }
  return rows.map((r) => {
    const id = meaningId(r, fields);
    const key = r.status === 'duyet' && id ? keyOf.get(id) : undefined;
    return { ...r, key };
  });
}

export interface ReadinessProblem {
  candidateId?: string;
  message: string;
}

/** What blocks "Duyệt phiên". */
export function readiness(rows: MappingRow[], fields: CatalogField[]): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  if (!rows.some((r) => r.status === 'duyet')) problems.push({ message: 'Chưa có dòng nào được duyệt làm tham số.' });
  for (const r of rows) {
    if (r.status === 'cho') problems.push({ candidateId: r.candidateId, message: `${r.candidateId}: chưa duyệt hoặc bỏ.` });
    if (r.status === 'duyet') {
      const hasField = !!r.fieldCode && (isExtraField(r.fieldCode) || fields.some((f) => f.code === r.fieldCode));
      const isGap = !!r.gapGroup && r.gapGroup !== 'T4' && !!r.extraLabel?.trim();
      if (r.gapGroup === 'T4') problems.push({ candidateId: r.candidateId, message: `${r.candidateId}: nhóm T4 (không chắc là tham số) — chọn Duyệt kèm trường hoặc Bỏ.` });
      else if (!hasField && !isGap) problems.push({ candidateId: r.candidateId, message: `${r.candidateId}: chưa chọn trường hoặc tên tham số thiếu.` });
    }
  }
  return problems;
}

export interface GapLine {
  candidateId: string;
  group: GapGroup;
  key?: string;
  label?: string;
  note?: string;
  suggestion: string;
}

export const GAP_LABEL: Record<GapGroup, string> = {
  T1: 'T1 · Có dữ liệu, thiếu trường',
  T2: 'T2 · Nhập mỗi lần',
  T3: 'T3 · Cần tính / ghép',
  T4: 'T4 · Không chắc là tham số',
};

const GAP_SUGGESTION: Record<GapGroup, string> = {
  T1: 'Tạm nhập tay; đề nghị đội sản phẩm bổ sung trường.',
  T2: 'Tạo "Trường giá trị bổ sung" trên EasyHRM (cần người dùng đồng ý).',
  T3: 'Chưa có trường — chuyển đội sản phẩm như đề xuất tính năng.',
  T4: 'Giữ nguyên văn bản, hỏi người dùng.',
};

export function gapReport(rows: MappingRow[]): GapLine[] {
  return rows
    .filter((r) => r.gapGroup && r.status !== 'bo')
    .map((r) => ({
      candidateId: r.candidateId,
      group: r.gapGroup!,
      key: r.key,
      label: r.extraLabel,
      note: r.gapNote,
      suggestion: GAP_SUGGESTION[r.gapGroup!],
    }));
}

/** Keys that EasyHRM cannot fill (gap rows): printing would leave {{...}} visible. */
export function unmappedKeys(rows: MappingRow[]): string[] {
  return [...new Set(rows.filter((r) => r.status === 'duyet' && r.key && r.gapGroup && !r.fieldCode).map((r) => r.key!))];
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  nhap: 'Nháp',
  cho_ai: 'Chờ AI',
  cho_duyet: 'Chờ duyệt',
  da_duyet: 'Đã duyệt',
  dang_tao: 'Đang tạo trên HRM',
  da_tao: 'Đã tạo, chờ bật',
  hoan_tat: 'Hoàn tất',
  dung: 'Dừng giữa chừng',
};

/** Allowed status moves (state diagram in the spec). */
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  nhap: ['cho_ai', 'cho_duyet', 'da_duyet'],
  cho_ai: ['cho_duyet', 'nhap'],
  cho_duyet: ['da_duyet', 'cho_ai'],
  da_duyet: ['dang_tao', 'cho_duyet'],
  dang_tao: ['da_tao', 'dung'],
  da_tao: ['hoan_tat', 'dang_tao'],
  hoan_tat: [],
  dung: ['da_duyet', 'dang_tao'],
};

export function canMove(from: SessionStatus, to: SessionStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}
