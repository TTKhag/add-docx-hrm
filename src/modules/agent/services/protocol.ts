import { z } from 'zod';
import type { Catalog, CatalogField, ContractClass, GapGroup, MappingRow, Project, Session } from '@/db/types';
import type { ParsedDocx } from '@/modules/sessions/services/docx';
import { contextOf } from '@/modules/sessions/services/detect';
import { hintLabel, maskCandidateText, maskContext, maskParagraph, type MaskedParagraph, unmaskRange } from '@/modules/sessions/services/mask';
import { EXTRA_PREFIX, isExtraField, unmappedKeys } from '@/modules/sessions/services/mapping';
import { toTenKey } from '@/modules/sessions/services/tenKey';
import skillMeta from '../../../../skill/skill-meta.json';

/**
 * Claude ↔ Studio protocol (FR-02). Studio hands out a task (masked), Claude answers with a proposal or an HRM report.
 * Everything Claude sends is validated here before it touches the mapping table.
 */

export const PROTOCOL = skillMeta.protocol;

export interface TaskCandidate {
  id: string;
  text: string;      // masked
  context: string;   // masked, candidate shown as ⟦[label]⟧
  rule_hint: string;
  current?: { field_code?: string; status: string; source?: string };
}

export interface HrmJob {
  template_code?: string;
  template_name?: string;
  output_file_name?: string;
  mapping: { key: string; field_code: string; field_label: string; field_group: string; format?: string }[];
  extra_fields: { key: string; label: string }[];
  unmapped_keys: string[];
  // v2
  doc_type?: Session['docType'];
  decision_type?: string;
  contract?: { phan_loai?: string; thoi_han_thang?: number };
  signing?: { company_title?: string; company_signer_name?: string; employee_anchor?: string; company_anchor?: string };
  signer_defaults?: Project['signerDefaults'];
  file?: { name: string; size: number; sha256: string };
  handed_to_claude: boolean;
  queue_order?: number;
  /** When a field_label is missing on EasyHRM: create a "Trường giá trị bổ sung" with this key/label and map it (FR-04). */
  on_missing_field: 'tao_truong_bo_sung';
}

export const CONTRACT_CLASS_LABEL: Record<ContractClass, string> = {
  xac_dinh: 'Hợp đồng xác định thời hạn',
  khong_xac_dinh: 'Hợp đồng không xác định thời hạn',
  thu_viec: 'Hợp đồng thử việc',
  cong_tac_vien: 'Hợp đồng cộng tác viên',
  khac: 'Hợp đồng khác',
};

export interface TaskParagraph {
  id: string;                 // p12 — use in add_candidates.paragraph_id
  where: 'than' | 'dau_trang' | 'chan_trang';
  text: string;               // masked; candidates shown as ⟦c7:…⟧
}

export interface AgentTask {
  protocol: string;
  session_id: string;
  status: Session['status'];
  hrm_version: string;
  doc_type: Session['docType'];
  decision_type?: string;
  key_rule: 'TenKey';
  project: { name: string; url: string; mst?: string; username: string };
  catalog_verified: boolean;
  candidates: TaskCandidate[];
  fields: CatalogField[];
  hrm_job?: HrmJob;
  next_step: string;
  // v2
  mode?: 'chen_key' | 'da_co_key';
  template_name?: string;
  doc_meta?: {
    title?: string; subject?: string; detected_doc_type?: string; detected_decision_type?: string;
    contract_class?: ContractClass; term_months?: number; source: string; confidence?: string;
  };
  signing?: HrmJob['signing'];
  decision_types?: string[];
  /** Whole document, personal values masked. Read it all before proposing (references/phan-tich-mau-hrm.md). */
  document?: TaskParagraph[];
}

export function nextStepFor(status: Session['status']): string {
  switch (status) {
    case 'nhap':
    case 'cho_ai':
      return 'Đọc toàn bộ document, kiểm doc_meta, đề xuất trường cho từng candidate, thêm chỗ sót (add_candidates), đặt tên trường bổ sung cho chỗ không có trường, rồi gọi submitProposal. Không tự duyệt.';
    case 'cho_duyet':
      return 'Đang chờ người dùng duyệt trên Studio. Dừng lại, không sang EasyHRM.';
    case 'da_duyet':
    case 'dung':
      return 'Đã duyệt. Tạo mẫu trên EasyHRM theo hrm_job. Chỉ bấm Lưu không hỏi lại khi câu lệnh của người dùng trong chat đã đồng ý Lưu; nếu không, hỏi trước. Xong gọi submitHrmReport.';
    case 'dang_tao':
      return 'Đang tạo trên EasyHRM. Tiếp tục kịch bản (kiểm danh sách trước khi Lưu lại để tránh tạo trùng), rồi gọi submitHrmReport.';
    case 'da_tao':
      return 'Đã tạo trên EasyHRM. Người dùng tự xem trước và bật Hiệu lực — Claude không làm bước này.';
    case 'hoan_tat':
      return 'Phiên đã hoàn tất. Không cần làm gì.';
  }
}

export function buildHrmJob(
  session: Session, rows: MappingRow[], catalog: Catalog | undefined,
  extra: { project?: Project; file?: HrmJob['file'] } = {},
): HrmJob {
  const fields = catalog?.fields ?? [];
  const seen = new Set<string>();
  const mapping: HrmJob['mapping'] = [];
  const extraFields: HrmJob['extra_fields'] = [];
  for (const r of rows) {
    if (r.status !== 'duyet' || !r.key || seen.has(r.key)) continue;
    seen.add(r.key);
    if (isExtraField(r.fieldCode)) extraFields.push({ key: r.key, label: r.extraLabel ?? r.key });
    else if (r.fieldCode) {
      const f = fields.find((x) => x.code === r.fieldCode);
      if (f) mapping.push({ key: r.key, field_code: f.code, field_label: f.label, field_group: f.group, format: r.format });
    }
  }
  return {
    template_code: session.templateCode,
    template_name: session.templateName,
    output_file_name: outputFileName(session),
    mapping,
    extra_fields: extraFields,
    unmapped_keys: unmappedKeys(rows),
    doc_type: session.docType,
    decision_type: session.decisionType,
    contract: session.docType === 'quyet_dinh' ? undefined : {
      phan_loai: session.docMeta?.contractClass ? CONTRACT_CLASS_LABEL[session.docMeta.contractClass] : undefined,
      thoi_han_thang: session.docMeta?.termMonths,
    },
    signing: session.docType === 'quyet_dinh' ? undefined : signingOut(session),
    signer_defaults: session.docType === 'quyet_dinh' ? undefined : extra.project?.signerDefaults,
    file: extra.file,
    handed_to_claude: !!session.handedToHrmAt,
    queue_order: session.queueOrder,
    on_missing_field: 'tao_truong_bo_sung',
  };
}

function signingOut(s: Session): HrmJob['signing'] {
  if (!s.signing) return undefined;
  return {
    company_title: s.signing.companyTitle,
    company_signer_name: s.signing.companySignerName,
    employee_anchor: s.signing.employeeAnchor,
    company_anchor: s.signing.companyAnchor,
  };
}

export function outputFileName(session: Session): string {
  const base = session.fileName.replace(/\.docx$/i, '');
  return `${base}_TenKey.docx`;
}

const WHERE = (part: string): TaskParagraph['where'] => (part.includes('header') ? 'dau_trang' : part.includes('footer') ? 'chan_trang' : 'than');

/** Paragraph id used with the AI: p<index in ParsedDocx.paragraphs + 1>. */
export const paragraphId = (i: number) => `p${i + 1}`;

/** Masked whole-document view + per-paragraph offset maps (kept server-side to resolve add_candidates). */
export function maskDocument(doc: ParsedDocx, rows: MappingRow[]): { paragraphs: TaskParagraph[]; maps: Map<string, { part: string; index: number; text: string; mp: MaskedParagraph }> } {
  const paragraphs: TaskParagraph[] = [];
  const maps = new Map<string, { part: string; index: number; text: string; mp: MaskedParagraph }>();
  doc.paragraphs.forEach((p, i) => {
    if (!p.text.trim()) return;
    const marks = rows
      .filter((r) => r.location.part === p.part && r.location.paragraph === p.index)
      .map((r) => ({ start: r.location.start, end: r.location.end, id: r.candidateId, hint: r.ruleHint, text: r.text }));
    const mp = maskParagraph(p.text, marks);
    const id = paragraphId(i);
    maps.set(id, { part: p.part, index: p.index, text: p.text, mp });
    paragraphs.push({ id, where: WHERE(p.part), text: mp.masked });
  });
  return { paragraphs, maps };
}

export function buildTask(
  session: Session,
  project: Project,
  rows: MappingRow[],
  catalog: Catalog | undefined,
  extra: { doc?: ParsedDocx; decisionTypes?: string[]; file?: HrmJob['file'] } = {},
): AgentTask {
  const approvedish = ['da_duyet', 'dang_tao', 'da_tao', 'hoan_tat', 'dung'].includes(session.status);
  const forAi = ['nhap', 'cho_ai', 'cho_duyet'].includes(session.status);
  const m = session.docMeta;
  return {
    protocol: PROTOCOL,
    session_id: session.id,
    status: session.status,
    hrm_version: session.hrmVersion,
    doc_type: session.docType,
    decision_type: session.docType === 'quyet_dinh' ? session.decisionType : undefined,
    key_rule: 'TenKey',
    project: { name: project.name, url: project.url, mst: project.mst || undefined, username: project.username },
    catalog_verified: !!catalog?.verified,
    candidates: rows.map((r) => ({
      id: r.candidateId,
      text: maskCandidateText(r.text, r.ruleHint),
      context: maskContext(r.context, r.ruleHint),
      rule_hint: r.ruleHint,
      current: r.fieldCode || r.status !== 'cho' ? { field_code: r.fieldCode, status: r.status, source: r.source } : undefined,
    })),
    fields: catalog?.fields ?? [],
    hrm_job: approvedish ? buildHrmJob(session, rows, catalog, { project, file: extra.file }) : undefined,
    next_step: nextStepFor(session.status),
    mode: session.mode ?? 'chen_key',
    template_name: session.templateName,
    doc_meta: m ? {
      title: m.title, subject: m.subject, detected_doc_type: m.detectedDocType, detected_decision_type: m.detectedDecisionType,
      contract_class: m.contractClass, term_months: m.termMonths, source: m.source, confidence: m.confidence,
    } : undefined,
    signing: session.docType === 'quyet_dinh' ? undefined : signingOut(session),
    decision_types: session.docType === 'quyet_dinh' && forAi ? extra.decisionTypes : undefined,
    document: forAi && extra.doc ? maskDocument(extra.doc, rows).paragraphs : undefined,
  };
}

// ---------- incoming ----------

const confidence = z.enum(['cao', 'trung_binh', 'thap']);

export const proposalSchema = z.object({
  protocol: z.string(),
  session_id: z.string().min(1),
  skill_version: z.string().optional(),
  proposals: z
    .array(
      z.object({
        candidate_id: z.string().min(1),
        field_code: z.string().min(1),
        confidence,
        reason: z.string().max(300).optional(),
      }),
    )
    .default([]),
  gaps: z
    .array(
      z.object({
        candidate_id: z.string().min(1),
        group: z.enum(['T1', 'T2', 'T3', 'T4']),
        label: z.string().max(120).optional(),
        note: z.string().max(300).optional(),
      }),
    )
    .default([]),
  extra_candidates: z.array(z.object({ hint: z.string().max(300) })).default([]),
  // v2
  add_candidates: z
    .array(
      z.object({
        paragraph_id: z.string().regex(/^p\d+$/),
        match: z.string().min(1).max(200),
        occurrence: z.number().int().min(1).max(50).default(1),
        field_code: z.string().min(1).optional(),
        gap: z.object({ group: z.enum(['T1', 'T2', 'T3', 'T4']), label: z.string().max(120).optional(), note: z.string().max(300).optional() }).optional(),
        confidence: confidence.default('trung_binh'),
        reason: z.string().max(300).optional(),
      }),
    )
    .default([]),
  skip: z.array(z.object({ candidate_id: z.string().min(1), reason: z.string().max(300).optional() })).default([]),
  doc_meta: z
    .object({
      doc_type: z.enum(['hop_dong', 'phu_luc', 'thanh_ly', 'quyet_dinh']).optional(),
      decision_type: z.string().min(3).max(120).optional(),
      template_name: z.string().min(2).max(255).optional(),
      contract_class: z.enum(['xac_dinh', 'khong_xac_dinh', 'thu_viec', 'cong_tac_vien', 'khac']).optional(),
      term_months: z.number().int().min(0).max(10000).nullable().optional(),
      reason: z.string().max(300).optional(),
    })
    .optional(),
  signing: z
    .object({
      company_title: z.string().max(120).optional(),
      company_signer_name: z.string().max(120).optional(),
      employee_anchor: z.string().max(120).optional(),
      company_anchor: z.string().max(160).optional(),
    })
    .optional(),
});

export type Proposal = z.infer<typeof proposalSchema>;

export const hrmReportSchema = z.object({
  protocol: z.string(),
  session_id: z.string().min(1),
  skill_version: z.string().optional(),
  outcome: z.enum(['thanh_cong', 'dung_giua_chung', 'that_bai']),
  template_code: z.string().max(20).optional(),
  template_name: z.string().max(255).optional(),
  steps: z.array(z.string().max(300)).default([]),
  user_steps: z.array(z.string().max(300)).default([]),
  mapped_keys: z.array(z.string()).default([]),
  unmapped_keys: z.array(z.string()).default([]),
  hrm_messages: z.array(z.string().max(500)).default([]),
  // v2
  created_extra_fields: z.array(z.object({ key: z.string(), label: z.string().max(255) })).default([]),
  signer: z.string().max(200).optional(),
});

export type HrmReportInput = z.infer<typeof hrmReportSchema>;

export interface ProtocolError {
  path: string;
  message: string;
}

export function zodErrors(e: z.ZodError): ProtocolError[] {
  return e.issues.map((i) => ({ path: i.path.join('.') || '(gốc)', message: i.message }));
}

export function checkProtocol(p: string): ProtocolError | null {
  if (p !== PROTOCOL) {
    return { path: 'protocol', message: `Giao thức "${p}" không khớp "${PROTOCOL}". Hãy cập nhật skill trong Claude (màn Cài vào Claude).` };
  }
  return null;
}

export interface ApplyProposalResult {
  rows: MappingRow[];
  accepted: number;
  rejected: ProtocolError[];
}

/**
 * Merge an AI proposal into rows. AI never approves: rows stay "cho".
 * Rows the user already decided (status ≠ cho) are not touched.
 */
export function applyProposal(rows: MappingRow[], fields: CatalogField[], p: Proposal): ApplyProposalResult {
  const byId = new Map(rows.map((r) => [r.candidateId, { ...r }]));
  const rejected: ProtocolError[] = [];
  let accepted = 0;
  const codes = new Set(fields.map((f) => f.code));

  p.proposals.forEach((item, i) => {
    const row = byId.get(item.candidate_id);
    const path = `proposals.${i}`;
    if (!row) return rejected.push({ path, message: `Không có candidate "${item.candidate_id}".` });
    if (row.status !== 'cho') return rejected.push({ path, message: `${item.candidate_id} đã được người dùng quyết định — bỏ qua.` });
    if (!codes.has(item.field_code)) return rejected.push({ path, message: `Mã trường "${item.field_code}" không có trong danh mục của phiếu việc.` });
    const f = fields.find((x) => x.code === item.field_code)!;
    Object.assign(row, {
      fieldCode: f.code,
      format: f.kind === 'date' ? 'dd/MM/yyyy' : f.kind === 'number' ? '#,##0' : undefined,
      source: 'ai',
      confidence: item.confidence,
      reason: item.reason ? `AI: ${item.reason}` : 'AI đề xuất',
      gapGroup: undefined,
      gapNote: undefined,
      extraLabel: undefined,
      proposedSkip: undefined,
    } satisfies Partial<MappingRow>);
    accepted++;
  });

  p.gaps.forEach((g, i) => {
    const row = byId.get(g.candidate_id);
    const path = `gaps.${i}`;
    if (!row) return rejected.push({ path, message: `Không có candidate "${g.candidate_id}".` });
    if (row.status !== 'cho') return rejected.push({ path, message: `${g.candidate_id} đã được người dùng quyết định — bỏ qua.` });
    const extra = gapToExtra(g.group, g.label);
    Object.assign(row, {
      fieldCode: undefined,
      gapGroup: g.group,
      extraLabel: g.label,
      gapNote: g.note,
      source: 'ai',
      confidence: extra.fieldCode ? 'trung_binh' : 'thap',
      reason: extra.fieldCode
        ? `AI: trường giá trị bổ sung "${g.label}" (${g.group})${g.note ? ' — ' + g.note : ''}`
        : `AI: ${g.group}${g.note ? ' — ' + g.note : ''}`,
      proposedSkip: undefined,
      ...extra,
    } satisfies Partial<MappingRow>);
    accepted++;
  });

  p.skip.forEach((k, i) => {
    const row = byId.get(k.candidate_id);
    const path = `skip.${i}`;
    if (!row) return rejected.push({ path, message: `Không có candidate "${k.candidate_id}".` });
    if (row.status !== 'cho') return rejected.push({ path, message: `${k.candidate_id} đã được người dùng quyết định — bỏ qua.` });
    Object.assign(row, {
      proposedSkip: true,
      fieldCode: row.fixedKey ? row.fieldCode : undefined,
      source: 'ai',
      confidence: undefined,
      reason: `AI đề xuất Bỏ${k.reason ? ': ' + k.reason : ''}`,
    } satisfies Partial<MappingRow>);
    accepted++;
  });

  return { rows: rows.map((r) => byId.get(r.candidateId)!), accepted, rejected };
}

export { hintLabel };

// ---------- v2: AI-added candidates ----------

export interface ResolvedAdd {
  rows: MappingRow[];             // new rows (status cho, source ai)
  proposals: Proposal['proposals'];
  gaps: Proposal['gaps'];
  rejected: ProtocolError[];
}

/**
 * FR-06: turn `add_candidates` (text the AI saw in the masked document) into real rows located in the original file.
 * The AI never sees the original value; Studio maps the masked range back and stores the original text.
 */
export function resolveAddedCandidates(doc: ParsedDocx, rows: MappingRow[], adds: Proposal['add_candidates'], sessionId: string): ResolvedAdd {
  const { maps } = maskDocument(doc, rows);
  const out: ResolvedAdd = { rows: [], proposals: [], gaps: [], rejected: [] };
  let n = rows.reduce((m, r) => Math.max(m, Number(r.candidateId.slice(1)) || 0), 0);
  const taken = (part: string, index: number, start: number, end: number) =>
    [...rows, ...out.rows].some((r) => r.location.part === part && r.location.paragraph === index && start < r.location.end && r.location.start < end);
  adds.forEach((a, i) => {
    const path = `add_candidates.${i}`;
    const para = maps.get(a.paragraph_id);
    if (!para) return out.rejected.push({ path, message: `Không có đoạn "${a.paragraph_id}".` });
    let from = -1;
    for (let k = 0; k < a.occurrence; k++) {
      from = para.mp.masked.indexOf(a.match, from + 1);
      if (from < 0) break;
    }
    if (from < 0) return out.rejected.push({ path, message: `Không thấy "${a.match}" (lần ${a.occurrence}) trong ${a.paragraph_id}. Chép đúng chữ trong document.` });
    const range = unmaskRange(para.mp, from, from + a.match.length);
    if (!range) return out.rejected.push({ path, message: `"${a.match}" trùng một chỗ đã có (⟦c…⟧) — dùng proposals với candidate đó.` });
    if (!para.text.slice(range.start, range.end).trim()) return out.rejected.push({ path, message: 'Đoạn chọn chỉ có khoảng trắng.' });
    if (taken(para.part, para.index, range.start, range.end)) return out.rejected.push({ path, message: `"${a.match}" chồng lên một chỗ đã có.` });
    if (!a.field_code && !a.gap) return out.rejected.push({ path, message: 'Cần field_code hoặc gap cho chỗ thêm.' });
    n++;
    const candidateId = `c${n}`;
    out.rows.push({
      id: `${sessionId}:${candidateId}`,
      sessionId,
      candidateId,
      location: { part: para.part, paragraph: para.index, start: range.start, end: range.end },
      text: para.text.slice(range.start, range.end),
      context: contextOf(para.text, range.start, range.end),
      ruleHint: 'ai_added',
      status: 'cho',
      source: 'ai',
      addedBy: 'ai',
    });
    if (a.field_code) out.proposals.push({ candidate_id: candidateId, field_code: a.field_code, confidence: a.confidence, reason: a.reason });
    else if (a.gap) out.gaps.push({ candidate_id: candidateId, group: a.gap.group, label: a.gap.label, note: a.gap.note ?? a.reason });
  });
  return out;
}

/** Gap T1–T3 → "Trường giá trị bổ sung" (FR-07). T4 stays a question for the user. */
export function gapToExtra(group: GapGroup, label?: string): Partial<MappingRow> {
  if (group === 'T4' || !label?.trim()) return {};
  return { fieldCode: `${EXTRA_PREFIX}${toTenKey(label)}`, extraLabel: label.trim() };
}
