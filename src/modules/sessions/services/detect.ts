import type { DocLocation, RuleHint } from '@/db/types';
import type { ParsedDocx } from './docx';

export interface Candidate {
  candidateId: string;
  location: DocLocation;
  text: string;
  context: string;
  ruleHint: RuleHint;
}

interface Rule {
  hint: RuleHint;
  re: RegExp; // must be global
}

// Order matters only for ties; overlaps keep the longest match.
const RULES: Rule[] = [
  { hint: 'existing_key', re: /\{\{[^{}\n]{1,80}\}\}/g },
  { hint: 'date_words', re: /ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/giu },
  { hint: 'dotted_blank', re: /(?:[.…]{2,}\s*\/\s*){1,2}[.…]{2,}/g }, // ……/……/…… date blanks
  { hint: 'dotted_blank', re: /(?:[.…]\s?){3,}[.…]|…\s?…/g }, // '…' counts as three dots
  { hint: 'underscore_blank', re: /_{3,}/g },
  { hint: 'bracket', re: /\[[^\][\n]{1,60}\]/g },
  { hint: 'date', re: /(?<!\d)\d{1,2}\/\d{1,2}\/\d{4}(?!\d)/g },
  { hint: 'money', re: /(?<![\d.])\d{1,3}(?:\.\d{3})+(?:\s?(?:đồng|đ|VNĐ|VND))?(?![\d.])/giu },
  { hint: 'id_number', re: /(?<!\d)(?:\d{12}|\d{9})(?!\d)/g },
  { hint: 'phone', re: /(?<!\d)0\d{9}(?!\d)/g },
  // A filled-in sample name right after a person cue: "Ông/Bà: Nguyễn Văn Mẫu", "Đại diện: Ông Trần Văn Mẫu"
  { hint: 'person_name', re: /(?<=(?:Ông\/Bà|Ông|Bà|Anh|Chị|Họ và tên|Họ tên)\s*:?\s+)(?:\p{Lu}\p{Ll}*)(?:\s\p{Lu}\p{Ll}*){1,4}/gu },
];

interface Hit {
  start: number;
  end: number;
  hint: RuleHint;
}

export function detectInText(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const { hint, re } of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      let end = start + m[0].length;
      // trim trailing spaces captured by dotted patterns
      while (end > start && text[end - 1] === ' ') end--;
      if (end > start) hits.push({ start, end, hint });
    }
  }
  // longest-first, then drop overlaps
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Hit[] = [];
  for (const h of hits) {
    if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  }
  return kept.sort((a, b) => a.start - b.start);
}

const CONTEXT_RADIUS = 70;

export function contextOf(text: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_RADIUS);
  const to = Math.min(text.length, end + CONTEXT_RADIUS);
  return (from > 0 ? '…' : '') + text.slice(from, start) + '[[' + text.slice(start, end) + ']]' + text.slice(end, to) + (to < text.length ? '…' : '');
}

export function detectCandidates(doc: ParsedDocx): Candidate[] {
  const out: Candidate[] = [];
  let n = 0;
  for (const p of doc.paragraphs) {
    if (!p.text.trim()) continue;
    for (const h of detectInText(p.text)) {
      n++;
      out.push({
        candidateId: `c${n}`,
        location: { part: p.part, paragraph: p.index, start: h.start, end: h.end },
        text: p.text.slice(h.start, h.end),
        context: contextOf(p.text, h.start, h.end),
        ruleHint: h.hint,
      });
    }
  }
  return out;
}
