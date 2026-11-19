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
  date_blank: '[ngày trống]',
  doc_number: '[số văn bản]',
  ai_added: '[AI thêm]',
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
// Cues in any case: "Ông/Bà:", "đối với ông …", "bà …", "Họ và tên:".
const CUE = '(?:[ÔôOo]ng\\/[Bb]à|[ÔôOo]ng|[Bb]à|[Aa]nh|[Cc]hị|[Hh]ọ và tên|[Hh]ọ tên|HỌ VÀ TÊN|ÔNG|BÀ)';
const NAME_CUE_RE = new RegExp(`(${CUE}\\s*:?\\s*)((?:\\p{Lu}[\\p{Ll}]*\\s?){2,5})`, 'gu');

export function maskContext(context: string, hint: RuleHint): string {
  // Context marks the candidate as [[...]]; swap it for a label first.
  let out = context.replace(/\[\[([\s\S]*?)\]\]/, `⟦${HINT_LABEL[hint]}⟧`);
  for (const [re, label] of PII_MASKS) out = out.replace(re, label);
  out = out.replace(NAME_CUE_RE, (_m, cue: string) => `${cue}[tên người] `);
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** A masked stand-in for the candidate's own text (blanks are kept literally — they hold no data). */
export function maskCandidateText(text: string, hint: RuleHint): string {
  if (hint === 'dotted_blank' || hint === 'underscore_blank' || hint === 'date_blank') return text;
  if (hint === 'existing_key') return text;
  if (hint === 'ai_added') return maskInline(text);
  return HINT_LABEL[hint];
}

// ---------- full-text masking for the AI (FR-05/FR-06) ----------

export interface MaskSeg {
  oStart: number; // original offsets
  oEnd: number;
  mStart: number; // masked offsets
  mEnd: number;
  kind: 'text' | 'pii' | 'cand';
}

export interface MaskedParagraph {
  masked: string;
  segs: MaskSeg[];
}

export interface ParagraphMark {
  start: number;
  end: number;
  id: string;       // candidate id, e.g. c7
  hint: RuleHint;
  text: string;     // original candidate text
}

const NAME_AFTER_CUE_RE = new RegExp(`(?<=${CUE}\\s*:?\\s+)(?:\\p{Lu}\\p{Ll}*)(?:\\s\\p{Lu}\\p{Ll}*){1,4}`, 'gu');

function piiHits(text: string): { start: number; end: number; label: string }[] {
  const hits: { start: number; end: number; label: string }[] = [];
  const add = (re: RegExp, label: string) => {
    for (const m of text.matchAll(re)) hits.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, label });
  };
  for (const [re, label] of PII_MASKS) add(new RegExp(re.source, re.flags), label);
  add(NAME_AFTER_CUE_RE, '[tên người]');
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}

/** Mask a stand-alone piece of text (e.g. an AI-added candidate): personal values become type labels. */
export function maskInline(text: string): string {
  let out = '';
  let pos = 0;
  for (const h of piiHits(text)) {
    out += text.slice(pos, h.start) + h.label;
    pos = h.end;
  }
  return out + text.slice(pos);
}

/**
 * Masked paragraph for the AI: candidates become ⟦c7:…⟧, other personal values become labels.
 * `segs` maps every masked range back to the original text so the AI can point at text it saw (FR-06).
 */
export function maskParagraph(text: string, marks: ParagraphMark[]): MaskedParagraph {
  const spans: { start: number; end: number; out: string; kind: 'pii' | 'cand' }[] = marks.map((m) => ({
    start: m.start,
    end: m.end,
    out: `⟦${m.id}:${maskCandidateText(m.text, m.hint)}⟧`,
    kind: 'cand' as const,
  }));
  for (const h of piiHits(text)) {
    if (!spans.some((s) => h.start < s.end && s.start < h.end)) spans.push({ start: h.start, end: h.end, out: h.label, kind: 'pii' });
  }
  spans.sort((a, b) => a.start - b.start);
  const segs: MaskSeg[] = [];
  let masked = '';
  let pos = 0;
  const pushText = (to: number) => {
    if (to <= pos) return;
    segs.push({ oStart: pos, oEnd: to, mStart: masked.length, mEnd: masked.length + (to - pos), kind: 'text' });
    masked += text.slice(pos, to);
    pos = to;
  };
  for (const s of spans) {
    pushText(s.start);
    segs.push({ oStart: s.start, oEnd: s.end, mStart: masked.length, mEnd: masked.length + s.out.length, kind: s.kind });
    masked += s.out;
    pos = s.end;
  }
  pushText(text.length);
  return { masked, segs };
}

/**
 * Map a range of the masked text back to the original paragraph. A range touching a masked value expands to the whole value.
 * Returns undefined when it overlaps an existing candidate (⟦…⟧) — those already have a row.
 */
export function unmaskRange(mp: MaskedParagraph, mStart: number, mEnd: number): { start: number; end: number } | undefined {
  let start: number | undefined;
  let end: number | undefined;
  for (const s of mp.segs) {
    if (s.mEnd <= mStart || s.mStart >= mEnd) continue;
    if (s.kind === 'cand') return undefined;
    const a = s.kind === 'text' ? s.oStart + Math.max(0, mStart - s.mStart) : s.oStart;
    const b = s.kind === 'text' ? s.oStart + Math.min(s.mEnd, mEnd) - s.mStart : s.oEnd;
    start = start === undefined ? a : Math.min(start, a);
    end = end === undefined ? b : Math.max(end, b);
  }
  return start === undefined || end === undefined || end <= start ? undefined : { start, end };
}
