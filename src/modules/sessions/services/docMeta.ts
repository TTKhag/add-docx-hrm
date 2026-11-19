import type { ContractClass, DocMeta, DocType, Signing } from '@/db/types';
import { normalize } from '@/shared/utils/text';
import type { ParsedDocx, ParsedParagraph } from './docx';

/**
 * Read template metadata from the document itself (BR-16): document type, decision type, template name,
 * contract classification/term and the signature block. Rule-based; the AI may correct it via `doc_meta`.
 */

const BODY = 'word/document.xml';

function bodyParas(doc: ParsedDocx): ParsedParagraph[] {
  return doc.paragraphs.filter((p) => p.part === BODY && p.text.trim());
}

/** Mostly-uppercase line (Vietnamese aware): a heading like "QUYẾT ĐỊNH" or "HỢP ĐỒNG LAO ĐỘNG". */
export function isHeading(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
  return upper / letters.length >= 0.8;
}

const DOC_TYPE_RULES: { re: RegExp; type: DocType }[] = [
  { re: /^(bien ban )?thanh ly/, type: 'thanh_ly' },
  { re: /^phu luc/, type: 'phu_luc' },
  { re: /^hop dong/, type: 'hop_dong' },
  { re: /^quyet dinh/, type: 'quyet_dinh' },
  { re: /^thong bao/, type: 'quyet_dinh' }, // EasyHRM keeps "Thông báo" with decision templates
];

/** Specific phrases first; values are EasyHRM "Loại quyết định" names (v2.5.39). */
export const DECISION_RULES: { re: RegExp; type: string }[] = [
  { re: /bo nhiem lai/, type: 'Quyết định bổ nhiệm lại' },
  { re: /bo nhiem chuc danh nghe nghiep|chuc danh nghe nghiep/, type: 'Quyết định bổ nhiệm chức danh nghề nghiệp' },
  { re: /dieu dong|kiem nhiem|biet phai/, type: 'Quyết định điều động, kiêm nhiệm' },
  { re: /dieu chuyen|luan chuyen|chuyen cong tac/, type: 'Quyết định điều chuyển' },
  { re: /nang bac luong|nang luong|dieu chinh luong|phu cap tham nien|nang ngach/, type: 'Quyết định điều chỉnh lương' },
  { re: /nghi huu|huu tri/, type: 'Quyết định nghỉ hưu' },
  { re: /thoi viec|cham dut hop dong|nghi viec/, type: 'Quyết định thôi việc' },
  { re: /thu viec/, type: 'Quyết định thử việc' },
  { re: /cu di hoc|di hoc|dao tao/, type: 'Quyết định cử đi học' },
  { re: /cu di cong tac|di cong tac/, type: 'Quyết định cử đi công tác' },
  { re: /giao nhiem vu|phan cong/, type: 'Quyết định giao nhiệm vụ' },
  { re: /tiep nhan|bo nhiem|tuyen dung/, type: 'Quyết định tiếp nhận, bổ nhiệm' },
  { re: /\bluong\b/, type: 'Quyết định lương' },
];

export function detectDecisionType(text: string): string | undefined {
  const n = normalize(text);
  return DECISION_RULES.find((r) => r.re.test(n))?.type;
}

/** "STT 05 - Quyết định bổ nhiệm lại_mau (1).docx" → "Quyết định bổ nhiệm lại". */
export function templateNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.docx$/i, '')
    .replace(/_TenKey$/i, '')
    .replace(/^\s*STT\s*\d+\s*[-–.:_]\s*/i, '')
    .replace(/[\s_-]*\(\d+\)\s*$/, '')
    .replace(/[\s_-]+m[aẫ]u\s*$/iu, '')
    .replace(/_/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function detectContract(text: string): { contractClass?: ContractClass; termMonths?: number } {
  const n = normalize(text);
  let contractClass: ContractClass | undefined;
  if (/khong xac dinh thoi han/.test(n)) contractClass = 'khong_xac_dinh';
  else if (/hop dong thu viec|thoi gian thu viec/.test(n)) contractClass = 'thu_viec';
  else if (/cong tac vien/.test(n)) contractClass = 'cong_tac_vien';
  else if (/xac dinh thoi han|thoi han hop dong/.test(n)) contractClass = 'xac_dinh';
  let termMonths: number | undefined;
  const m = n.match(/(?:thoi han(?: hop dong)?|co thoi han)\s*:?\s*(\d{1,3})\s*(thang|nam)/);
  if (m) termMonths = Number(m[1]) * (m[2] === 'nam' ? 12 : 1);
  if (contractClass === 'khong_xac_dinh') termMonths = undefined;
  return { contractClass, termMonths };
}

export interface DetectedMeta {
  docType?: DocType;
  decisionType?: string;
  templateName: string;
  meta: DocMeta;
}

export function detectDocMeta(doc: ParsedDocx, fileName: string): DetectedMeta {
  const paras = bodyParas(doc);
  const head = paras.slice(0, 25);
  let title: string | undefined;
  let docType: DocType | undefined;
  for (const p of head) {
    const t = p.text.trim();
    if (!isHeading(t)) continue;
    const n = normalize(t);
    if (/^cong hoa|^doc lap|^so\s*:/.test(n)) continue;
    const hit = DOC_TYPE_RULES.find((r) => r.re.test(n));
    if (hit) {
      title = t;
      docType = hit.type;
      break;
    }
  }
  const fileNorm = normalize(fileName);
  if (!docType) docType = DOC_TYPE_RULES.find((r) => r.re.test(fileNorm.replace(/^stt\s*\d+\s*[-.:_]\s*/, '')))?.type;

  const titleIdx = title ? head.findIndex((p) => p.text.trim() === title) : -1;
  const subject = head
    .slice(Math.max(0, titleIdx), titleIdx + 5)
    .map((p) => p.text.trim())
    .find((t) => /^(v[ềe]\s*vi[ệe]c|v\/v)/iu.test(t) || (titleIdx >= 0 && t !== title && /^v[ềe]\s/iu.test(t)));

  const decisionType = docType === 'quyet_dinh'
    ? detectDecisionType(`${subject ?? ''} ${title ?? ''}`) ?? detectDecisionType(fileName)
    : undefined;

  const contract = docType && docType !== 'quyet_dinh' ? detectContract(paras.map((p) => p.text).join('\n')) : {};
  const fromFile = templateNameFromFile(fileName);
  const confidence = docType && (docType !== 'quyet_dinh' || decisionType) ? (title ? 'cao' : 'trung_binh') : 'thap';

  return {
    docType,
    decisionType,
    templateName: fromFile || subject || title || 'Mẫu mới',
    meta: {
      title,
      subject,
      detectedDocType: docType,
      detectedDecisionType: decisionType,
      ...contract,
      source: 'quy_tac',
      confidence,
    },
  };
}

const EMPLOYEE_ANCHORS = [/^nguoi lao dong$/, /^ben b$/, /^ben nhan$/, /^vien chuc$/, /^nguoi duoc tuyen dung$/];
const COMPANY_ANCHORS = [/^dai dien (nguoi su dung lao dong|don vi|cong ty|ben a)/, /^nguoi su dung lao dong$/, /^ben a$/, /^dai dien$/];
const TITLES = /^(kt\.?\s*)?(tong giam doc|pho tong giam doc|giam doc|pho giam doc|hieu truong|pho hieu truong|truong phong|chu tich|truong khoa|thu truong)\b/;

/** Signature block: anchors for drag-and-drop and the company signer's title (contracts only). */
export function detectSigning(doc: ParsedDocx): Signing | undefined {
  const paras = bodyParas(doc);
  const tail = paras.slice(-40);
  let employeeAnchor: string | undefined;
  let companyAnchor: string | undefined;
  let companyTitle: string | undefined;
  tail.forEach((p, i) => {
    const t = p.text.trim();
    const n = normalize(t).replace(/[.:,]+$/, '');
    if (!employeeAnchor && EMPLOYEE_ANCHORS.some((re) => re.test(n))) employeeAnchor = t;
    if (!companyAnchor && COMPANY_ANCHORS.some((re) => re.test(n))) {
      companyAnchor = t;
      const next = tail.slice(i + 1, i + 4).map((x) => x.text.trim()).find((x) => TITLES.test(normalize(x)));
      if (next) companyTitle = titleCase(next.replace(/^KT\.?\s*/i, ''));
    }
    if (!companyTitle && TITLES.test(n) && isHeading(t)) companyTitle = titleCase(t.replace(/^KT\.?\s*/i, ''));
  });
  if (!employeeAnchor && !companyAnchor) return undefined;
  return { employeeAnchor, companyAnchor, companyTitle, source: 'quy_tac' };
}

function titleCase(s: string): string {
  const lower = s.toLocaleLowerCase('vi');
  return lower.charAt(0).toLocaleUpperCase('vi') + lower.slice(1);
}
