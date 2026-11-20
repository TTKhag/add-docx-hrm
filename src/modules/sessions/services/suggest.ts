import type { CatalogField, Confidence } from '@/db/types';
import { normalize } from '@/shared/utils/text';
import { normalizeExistingKey, toTenKey } from './tenKey';

/**
 * Rule-based suggestions (no AI): look at the words right before a candidate and pick a catalog field
 * whose label contains a matching keyword. Always "trung_binh" — the user (or AI) still confirms.
 */

interface CueRule {
  cue: RegExp;          // tested against normalized text before the candidate
  labelHints: string[]; // normalized fragments to look for in field labels, in priority order
}

const CUE_RULES: CueRule[] = [
  { cue: /dai dien\s*:?\s*(ong|ba)?\s*$/, labelHints: ['nguoi dai dien'] },
  { cue: /(ho va ten|ho ten|ong\/ba|ong|ba)\s*:?\s*$/, labelHints: ['ho va ten', 'ho ten'] },
  { cue: /(ma nhan vien|ma nv)\s*:?\s*$/, labelHints: ['ma nhan vien'] },
  { cue: /(ngay sinh|sinh ngay)\s*:?\s*$/, labelHints: ['ngay sinh'] },
  { cue: /(so cccd|so cmnd|can cuoc|cccd|cmnd)[^:]*:?\s*$/, labelHints: ['cccd', 'can cuoc', 'cmnd'] },
  { cue: /(cap ngay|ngay cap)\s*:?\s*$/, labelHints: ['ngay cap'] },
  { cue: /(noi cap|tai)\s*:?\s*$/, labelHints: ['noi cap'] },
  { cue: /(thuong tru|dia chi thuong tru)\s*:?\s*$/, labelHints: ['thuong tru', 'dia chi'] },
  { cue: /(cho o hien tai|tam tru|noi o)\s*:?\s*$/, labelHints: ['cho o', 'tam tru', 'dia chi'] },
  { cue: /dia chi\s*:?\s*$/, labelHints: ['dia chi'] },
  { cue: /(dien thoai|so dien thoai|sdt)\s*:?\s*$/, labelHints: ['dien thoai'] },
  { cue: /email\s*:?\s*$/, labelHints: ['email'] },
  { cue: /quoc tich\s*:?\s*$/, labelHints: ['quoc tich'] },
  { cue: /(chuc danh|chuc vu|vi tri)\s*:?\s*$/, labelHints: ['chuc danh', 'chuc vu'] },
  { cue: /(phong ban|bo phan|don vi cong tac)\s*:?\s*$/, labelHints: ['phong ban', 'bo phan'] },
  { cue: /(muc luong|luong co ban|luong chinh)[^:]*:?\s*$/, labelHints: ['luong co ban', 'muc luong', 'luong'] },
  { cue: /bang chu\s*:?\s*$/, labelHints: ['bang chu'] },
  { cue: /(so hop dong|so hd)\s*:?\s*$/, labelHints: ['so hop dong'] },
  { cue: /(ke tu ngay|tu ngay|hieu luc tu ngay|ngay hieu luc)\s*:?\s*$/, labelHints: ['ngay hieu luc', 'tu ngay'] },
  { cue: /(den ngay|ngay ket thuc)\s*:?\s*$/, labelHints: ['ngay ket thuc', 'den ngay'] },
  { cue: /(so quyet dinh|so qd)\s*:?\s*$/, labelHints: ['so quyet dinh'] },
  { cue: /(ma so thue|mst)\s*:?\s*$/, labelHints: ['ma so thue'] },
  { cue: /(so tai khoan|stk)\s*:?\s*$/, labelHints: ['so tai khoan'] },
];

export interface Suggestion {
  fieldCode: string;
  confidence: Confidence;
  reason: string;
}

function findField(fields: CatalogField[], hints: string[]): CatalogField | undefined {
  for (const h of hints) {
    const f = fields.find((x) => normalize(x.label).includes(h));
    if (f) return f;
  }
  return undefined;
}

/** `before` = paragraph text before the candidate. */
export function suggestByCue(before: string, fields: CatalogField[]): Suggestion | undefined {
  const tail = normalize(before).slice(-60);
  for (const rule of CUE_RULES) {
    if (rule.cue.test(tail)) {
      const f = findField(fields, rule.labelHints);
      if (f) return { fieldCode: f.code, confidence: 'trung_binh', reason: `Quy tắc: đứng sau "${tail.split(' ').slice(-3).join(' ').trim()}"` };
    }
  }
  return undefined;
}

/** True when the lead-in matches a known HR cue, whether or not the catalog has the field (BR-18). */
export function cueMatches(before: string): boolean {
  const tail = normalize(before).slice(-60);
  return CUE_RULES.some((r) => r.cue.test(tail));
}

/** For a key already present in the file ({{HoVaTen}}, {{ho_ten}}), find the field with the same TenKey. */
export function suggestForExistingKey(raw: string, fields: CatalogField[]): Suggestion | undefined {
  const inner = raw.replace(/^\{\{|\}\}$/g, '');
  const target = normalizeExistingKey(inner);
  const f = fields.find((x) => toTenKey(x.label).toLowerCase() === target.toLowerCase());
  if (f) return { fieldCode: f.code, confidence: 'cao', reason: 'Key có sẵn trùng tên trường' };
  return undefined;
}
