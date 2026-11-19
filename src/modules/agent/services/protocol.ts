import { z } from 'zod';
import type { Catalog, CatalogField, MappingRow, Project, Session } from '@/db/types';
import { hintLabel, maskCandidateText, maskContext } from '@/modules/sessions/services/mask';
import { isExtraField, unmappedKeys } from '@/modules/sessions/services/mapping';
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
}

export function nextStepFor(status: Session['status']): string {
  switch (status) {
    case 'nhap':
    case 'cho_ai':
      return 'Đề xuất trường cho từng candidate rồi gọi submitProposal. Không tự duyệt.';
    case 'cho_duyet':
      return 'Đang chờ người dùng duyệt trên Studio. Dừng lại, không sang EasyHRM.';
    case 'da_duyet':
    case 'dung':
      return 'Đã duyệt. Có thể tạo mẫu trên EasyHRM theo hrm_job; hỏi người dùng trước khi bấm Lưu; xong gọi submitHrmReport.';
    case 'dang_tao':
      return 'Đang tạo trên EasyHRM. Tiếp tục kịch bản, hỏi trước khi Lưu, rồi gọi submitHrmReport.';
    case 'da_tao':
      return 'Đã tạo trên EasyHRM. Người dùng tự xem trước và bật Hiệu lực — Claude không làm bước này.';
    case 'hoan_tat':
      return 'Phiên đã hoàn tất. Không cần làm gì.';
  }
}

export function buildHrmJob(session: Session, rows: MappingRow[], catalog: Catalog | undefined): HrmJob {
  const fields = catalog?.fields ?? [];
  const seen = new Set<string>();
  const mapping: HrmJob['mapping'] = [];
  const extra: HrmJob['extra_fields'] = [];
  for (const r of rows) {
    if (r.status !== 'duyet' || !r.key || seen.has(r.key)) continue;
    seen.add(r.key);
    if (isExtraField(r.fieldCode)) extra.push({ key: r.key, label: r.extraLabel ?? r.key });
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
    extra_fields: extra,
    unmapped_keys: unmappedKeys(rows),
  };
}

export function outputFileName(session: Session): string {
  const base = session.fileName.replace(/\.docx$/i, '');
  return `${base}_TenKey.docx`;
}

export function buildTask(
  session: Session,
  project: Project,
  rows: MappingRow[],
  catalog: Catalog | undefined,
): AgentTask {
  const approvedish = ['da_duyet', 'dang_tao', 'da_tao', 'hoan_tat', 'dung'].includes(session.status);
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
    hrm_job: approvedish ? buildHrmJob(session, rows, catalog) : undefined,
    next_step: nextStepFor(session.status),
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
    } satisfies Partial<MappingRow>);
    accepted++;
  });

  p.gaps.forEach((g, i) => {
    const row = byId.get(g.candidate_id);
    const path = `gaps.${i}`;
    if (!row) return rejected.push({ path, message: `Không có candidate "${g.candidate_id}".` });
    if (row.status !== 'cho') return rejected.push({ path, message: `${g.candidate_id} đã được người dùng quyết định — bỏ qua.` });
    Object.assign(row, {
      fieldCode: undefined,
      gapGroup: g.group,
      extraLabel: g.label,
      gapNote: g.note,
      source: 'ai',
      confidence: 'thap',
      reason: `AI: ${g.group}${g.note ? ' — ' + g.note : ''}`,
    } satisfies Partial<MappingRow>);
    accepted++;
  });

  return { rows: rows.map((r) => byId.get(r.candidateId)!), accepted, rejected };
}

export { hintLabel };
