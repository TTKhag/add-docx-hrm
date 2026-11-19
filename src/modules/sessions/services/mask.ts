import type { RuleHint } from '@/db/types';

/**
 * Mask personal values before anything is handed to the AI (SEC-05).
 * The candidate itself becomes a type label; other personal-looking values in the context are masked too.
 */

const HINT_LABEL: Record<RuleHint, string> = {
  dotted_blank: '[chỗ trống]',
  underscore_blank: '[chỗ trống]',
  bracket: '[ngoặc vuông]',
  date: '[ngày]',
  date_words: '[ngày bằng chữ]',
  money: '[số tiền]',
  id_number: '[số giấy tờ]',
  phone: '[số điện thoại]',
  person_name: '[tên người]',
  existing_key: '[key có sẵn]',
  manual: '[giá trị]',
};

export function hintLabel(hint: RuleHint): string {
  return HINT_LABEL[hint];
}

const PII_MASKS: [RegExp, string][] = [
  [/\{\{[^{}]*\}\}/g, '[key có sẵn]'],
  [/ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/giu, '[ngày bằng chữ]'],
  [/(?<!\d)\d{1,2}\/\d{1,2}\/\d{4}(?!\d)/g, '[ngày]'],
  [/(?<![\d.])\d{1,3}(?:\.\d{3})+(?:\s?(?:đồng|đ|VNĐ|VND))?(?![\d.])/giu, '[số tiền]'],
  [/(?<!\d)0\d{9}(?!\d)/g, '[số điện thoại]'],
  [/(?<!\d)(?:\d{12}|\d{9})(?!\d)/g, '[số giấy tờ]'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]'],
];

/** Words after typical person-name cues are replaced with [tên người]. */
const NAME_CUE_RE = /((?:Ông|Bà|Ông\/Bà|Anh|Chị|Họ và tên|Họ tên)\s*:?\s*)((?:\p{Lu}[\p{Ll}]*\s?){2,5})/gu;

export function maskContext(context: string, hint: RuleHint): string {
  // Context marks the candidate as [[...]]; swap it for a label first.
  let out = context.replace(/\[\[([\s\S]*?)\]\]/, `⟦${HINT_LABEL[hint]}⟧`);
  for (const [re, label] of PII_MASKS) out = out.replace(re, label);
  out = out.replace(NAME_CUE_RE, (_m, cue: string) => `${cue}[tên người] `);
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** A masked stand-in for the candidate's own text (blanks are kept literally — they hold no data). */
export function maskCandidateText(text: string, hint: RuleHint): string {
  if (hint === 'dotted_blank' || hint === 'underscore_blank') return text;
  if (hint === 'existing_key') return text;
  return HINT_LABEL[hint];
}
