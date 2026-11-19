import JSZip from 'jszip';
import type { DocLocation } from '@/db/types';
import { isValidTenKey, wrapKey } from './tenKey';

/**
 * Minimal, dependency-light .docx text model.
 * Reads WordprocessingML paragraphs (document, headers, footers), maps paragraph text to <w:t> nodes,
 * and rewrites text ranges so each {{TenKey}} lands inside ONE <w:t> (EasyHRM may not detect keys split across runs).
 */

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ParsedParagraph {
  part: string;
  index: number;
  text: string;
}

export interface ParsedDocx {
  parts: string[];
  paragraphs: ParsedParagraph[];
}

interface Segment {
  node: Element; // <w:t>
  start: number;
  end: number;
}

export class DocxError extends Error {}

const PART_RE = /^word\/(document|header\d*|footer\d*)\.xml$/;

function sortParts(names: string[]): string[] {
  const rank = (n: string) => (n.includes('header') ? 0 : n.includes('document') ? 1 : 2);
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));
}

export async function loadZip(data: Blob | ArrayBuffer | Uint8Array): Promise<JSZip> {
  try {
    const zip = await JSZip.loadAsync(data);
    if (!zip.file('word/document.xml')) throw new DocxError('Tệp không có word/document.xml — không phải .docx hợp lệ.');
    return zip;
  } catch (e) {
    if (e instanceof DocxError) throw e;
    throw new DocxError('Không đọc được tệp. Chỉ nhận tệp Word .docx.');
  }
}

function textParts(zip: JSZip): string[] {
  return sortParts(Object.keys(zip.files).filter((n) => PART_RE.test(n)));
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new DocxError('Nội dung XML của tệp bị lỗi.');
  return doc;
}

/** Paragraphs in document order; nested paragraphs (text boxes) are listed on their own. */
function paragraphsOf(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
}

function closestParagraph(el: Element): Element | null {
  let cur: Element | null = el.parentElement;
  while (cur) {
    if (cur.namespaceURI === W_NS && cur.localName === 'p') return cur;
    cur = cur.parentElement;
  }
  return null;
}

function segmentsOf(p: Element): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  for (const t of Array.from(p.getElementsByTagNameNS(W_NS, 't'))) {
    if (closestParagraph(t) !== p) continue; // belongs to a nested paragraph
    const len = (t.textContent ?? '').length;
    segs.push({ node: t, start: pos, end: pos + len });
    pos += len;
  }
  return segs;
}

function paragraphText(p: Element): string {
  return segmentsOf(p).map((s) => s.node.textContent ?? '').join('');
}

export async function readDocx(data: Blob | ArrayBuffer | Uint8Array): Promise<ParsedDocx> {
  const zip = await loadZip(data);
  const parts = textParts(zip);
  const paragraphs: ParsedParagraph[] = [];
  for (const part of parts) {
    const doc = parseXml(await zip.file(part)!.async('string'));
    paragraphsOf(doc).forEach((p, index) => paragraphs.push({ part, index, text: paragraphText(p) }));
  }
  return { parts, paragraphs };
}

export interface Replacement {
  location: DocLocation;
  expected: string; // the original text that must still be at location
  key: string;      // TenKey without braces
}

function setText(t: Element, value: string) {
  t.textContent = value;
  if (/^\s|\s$|\s\s/.test(value)) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}

/** Replace [start, end) of a paragraph by `insert`, writing it entirely into the first touched <w:t>. */
function replaceRange(p: Element, start: number, end: number, insert: string) {
  const segs = segmentsOf(p).filter((s) => s.end > start && s.start < end);
  if (!segs.length) throw new DocxError('Không tìm thấy vị trí cần thay trong tệp.');
  segs.forEach((s, i) => {
    const text = s.node.textContent ?? '';
    const from = Math.max(0, start - s.start);
    const to = Math.min(text.length, end - s.start);
    const next = text.slice(0, from) + (i === 0 ? insert : '') + text.slice(to);
    setText(s.node, next);
  });
}

export interface ApplyResult {
  blob: Blob;
  applied: number;
}

/** Apply replacements and blank author metadata. Fails if any location no longer holds the expected text. */
export async function applyReplacements(
  data: Blob | ArrayBuffer | Uint8Array,
  replacements: Replacement[],
): Promise<ApplyResult> {
  const zip = await loadZip(data);
  const byPart = new Map<string, Replacement[]>();
  for (const r of replacements) {
    if (!isValidTenKey(r.key)) throw new DocxError(`Key "${r.key}" không đúng dạng {{TenKey}}.`);
    const list = byPart.get(r.location.part) ?? [];
    list.push(r);
    byPart.set(r.location.part, list);
  }
  let applied = 0;
  for (const [part, list] of byPart) {
    const file = zip.file(part);
    if (!file) throw new DocxError(`Thiếu phần ${part} trong tệp.`);
    const doc = parseXml(await file.async('string'));
    const paras = paragraphsOf(doc);
    // Right-to-left inside each paragraph keeps earlier offsets valid.
    const sorted = [...list].sort(
      (a, b) => a.location.paragraph - b.location.paragraph || b.location.start - a.location.start,
    );
    for (const r of sorted) {
      const p = paras[r.location.paragraph];
      if (!p) throw new DocxError('Vị trí đoạn văn không còn trong tệp.');
      const current = paragraphText(p).slice(r.location.start, r.location.end);
      if (current !== r.expected) {
        throw new DocxError(`Nội dung tại vị trí đã thay đổi ("${r.expected}" → "${current}").`);
      }
      replaceRange(p, r.location.start, r.location.end, wrapKey(r.key));
      applied++;
    }
    zip.file(part, new XMLSerializer().serializeToString(doc));
  }
  await scrubCoreProps(zip);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
  return { blob, applied };
}

async function scrubCoreProps(zip: JSZip) {
  const core = zip.file('docProps/core.xml');
  if (!core) return;
  const xml = await core.async('string');
  const cleaned = xml
    .replace(/(<dc:creator[^>]*>)[\s\S]*?(<\/dc:creator>)/, '$1$2')
    .replace(/(<cp:lastModifiedBy[^>]*>)[\s\S]*?(<\/cp:lastModifiedBy>)/, '$1$2');
  zip.file('docProps/core.xml', cleaned);
}

export interface VerifyIssue {
  level: 'loi' | 'canh_bao';
  code: 'key_split' | 'key_invalid' | 'pii_left' | 'author_left' | 'comments';
  message: string;
}

export interface VerifyResult {
  keys: string[];          // unique valid keys found
  issues: VerifyIssue[];
}

const KEY_ANY_RE = /\{\{([^{}]*)\}\}/g;
const PII_RES: { re: RegExp; label: string }[] = [
  { re: /(?<!\d)\d{12}(?!\d)/, label: 'số CCCD (12 chữ số)' },
  { re: /(?<!\d)0\d{9}(?!\d)/, label: 'số điện thoại' },
  { re: /(?<![\d.])\d{1,3}(?:\.\d{3}){2,}(?![\d.])/, label: 'số tiền' },
];

/** Check the produced file: every key is a valid TenKey inside one <w:t>, no obvious personal data left. */
export async function verifyDocx(data: Blob | ArrayBuffer | Uint8Array): Promise<VerifyResult> {
  const zip = await loadZip(data);
  const keys = new Set<string>();
  const issues: VerifyIssue[] = [];
  for (const part of textParts(zip)) {
    const doc = parseXml(await zip.file(part)!.async('string'));
    for (const p of paragraphsOf(doc)) {
      const segs = segmentsOf(p);
      const full = segs.map((s) => s.node.textContent ?? '').join('');
      const inRuns = segs.flatMap((s) => Array.from((s.node.textContent ?? '').matchAll(KEY_ANY_RE)).map((m) => m[1]));
      const inPara = Array.from(full.matchAll(KEY_ANY_RE)).map((m) => m[1]);
      if (inPara.length > inRuns.length) {
        issues.push({ level: 'loi', code: 'key_split', message: `Key bị Word chẻ thành nhiều đoạn trong ${part}: "${full.slice(0, 80)}"` });
      }
      for (const k of inPara) {
        if (isValidTenKey(k)) keys.add(k);
        else issues.push({ level: 'loi', code: 'key_invalid', message: `Key "{{${k}}}" không đúng dạng {{TenKey}}.` });
      }
      const withoutKeys = full.replace(KEY_ANY_RE, ' ');
      for (const { re, label } of PII_RES) {
        const m = withoutKeys.match(re);
        if (m) issues.push({ level: 'canh_bao', code: 'pii_left', message: `Còn ${label} "${mask(m[0])}" trong ${part}.` });
      }
    }
  }
  const core = zip.file('docProps/core.xml');
  if (core) {
    const xml = await core.async('string');
    const creator = xml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/)?.[1]?.trim();
    if (creator) issues.push({ level: 'canh_bao', code: 'author_left', message: 'Thuộc tính tác giả của tệp còn tên người.' });
  }
  if (zip.file('word/comments.xml')) {
    issues.push({ level: 'canh_bao', code: 'comments', message: 'Tệp có comment — kiểm tra comment không chứa dữ liệu cá nhân.' });
  }
  return { keys: [...keys].sort(), issues };
}

export function mask(value: string): string {
  if (value.length <= 4) return '•'.repeat(value.length);
  return value.slice(0, 2) + '•'.repeat(Math.max(1, value.length - 4)) + value.slice(-2);
}
