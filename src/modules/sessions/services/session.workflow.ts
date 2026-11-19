import { catalogsRepo, dictionaryRepo, filesRepo, logsRepo, projectsRepo, rowsRepo, sessionsRepo } from '@/db/repositories';
import type { ContractClass, DocType, LogActor, MappingRow, Session, SessionMode, SessionStatus } from '@/db/types';
import { db } from '@/db/schema';
import { catalogId } from '@/modules/catalog/services/catalog';
import { ensureCatalog } from '@/modules/catalog/services/catalog.workflow';
import { uid } from '@/shared/utils/text';
import { countExistingKeys, detectCandidates } from './detect';
import { detectDocMeta, detectSigning } from './docMeta';
import { applyReplacements, DocxError, readDocx, type VerifyIssue, verifyDocx } from './docx';
import { assignKeys, buildRows, canMove, isExtraField, readiness, STATUS_LABEL } from './mapping';

export class WorkflowError extends Error {}

export interface CreateSessionInput {
  file: File;
  projectId: string;
  /** Omit (or 'auto') to detect from the document (BR-16). */
  docType?: DocType | 'auto';
  decisionType?: string;
  templateName?: string;
  /** 'auto': pre-keyed when the file already contains {{keys}}. */
  mode?: SessionMode | 'auto';
  batchId?: string;
  queueOrder?: number;
}

async function nextQueueOrder(): Promise<number> {
  const all = await sessionsRepo.all();
  return all.reduce((m, s) => Math.max(m, s.queueOrder ?? 0), 0) + 1;
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  if (!/\.docx$/i.test(input.file.name)) throw new WorkflowError('Chỉ nhận tệp Word .docx (không nhận .doc, .pdf, ảnh).');
  const project = await projectsRepo.get(input.projectId);
  if (!project) throw new WorkflowError('Chưa chọn dự án.');
  const doc = await readDocx(input.file);
  const detected = detectDocMeta(doc, input.file.name);
  const docType: DocType = input.docType && input.docType !== 'auto' ? input.docType : detected.docType ?? 'hop_dong';
  const decisionType = docType === 'quyet_dinh' ? (input.decisionType || detected.decisionType) : undefined;
  const existingKeys = countExistingKeys(doc);
  const mode: SessionMode = input.mode && input.mode !== 'auto' ? input.mode : existingKeys > 0 ? 'da_co_key' : 'chen_key';
  if (mode === 'da_co_key' && !existingKeys) throw new WorkflowError('Tệp không có key {{…}} nào — chọn chế độ "Chèn key".');
  const candidates = detectCandidates(doc, { onlyExistingKeys: mode === 'da_co_key' });
  const catalog = await ensureCatalog(project.hrmVersion, docType, decisionType ?? '');
  const now = Date.now();
  const meta = { ...detected.meta };
  if (input.docType && input.docType !== 'auto') meta.source = 'nguoi_dung';
  const session: Session = {
    id: uid('s_'),
    projectId: project.id,
    fileName: input.file.name,
    docType,
    decisionType,
    hrmVersion: project.hrmVersion,
    status: 'nhap',
    templateName: input.templateName?.trim() || detected.templateName,
    mode,
    docMeta: meta,
    signing: docType === 'quyet_dinh' ? undefined : detectSigning(doc),
    queueOrder: input.queueOrder ?? (await nextQueueOrder()),
    batchId: input.batchId,
    createdAt: now,
    updatedAt: now,
  };
  const textOf = (part: string, index: number) => doc.paragraphs.find((p) => p.part === part && p.index === index)?.text ?? '';
  const rows = buildRows(session.id, candidates, catalog.fields, textOf);
  await db.transaction('rw', [db.sessions, db.files, db.rows, db.logs], async () => {
    await sessionsRepo.put(session);
    await filesRepo.put({ sessionId: session.id, original: input.file });
    await rowsRepo.bulkPut(rows);
    await logsRepo.add(session.id, 'he_thong', 'Tạo phiên',
      `${mode === 'da_co_key' ? 'Tệp đã có key' : 'Chèn key'} · ${candidates.length} chỗ, ${rows.filter((r) => r.fieldCode).length} gợi ý trường, ${rows.filter((r) => r.proposedSkip).length} đề xuất bỏ · tự nhận: ${docType}${decisionType ? ' / ' + decisionType : ''}`);
  });
  return session;
}

export interface BatchItemResult {
  fileName: string;
  session?: Session;
  error?: string;
}

/** FR-02: several files at once → one session each, queue order = selection order. One bad file does not stop the rest. */
export async function createSessions(files: File[], projectId: string, opts: Pick<CreateSessionInput, 'mode'> = {}): Promise<BatchItemResult[]> {
  const batchId = uid('b_');
  let order = await nextQueueOrder();
  const out: BatchItemResult[] = [];
  for (const file of files) {
    try {
      out.push({ fileName: file.name, session: await createSession({ file, projectId, mode: opts.mode, batchId, queueOrder: order++ }) });
    } catch (e) {
      out.push({ fileName: file.name, error: e instanceof Error ? e.message : 'Lỗi không xác định' });
    }
  }
  return out;
}

async function mustSession(id: string): Promise<Session> {
  const s = await sessionsRepo.get(id);
  if (!s) throw new WorkflowError('Không tìm thấy phiên.');
  return s;
}

export async function setStatus(id: string, to: SessionStatus, actor: LogActor, detail?: string): Promise<Session> {
  const s = await mustSession(id);
  if (!canMove(s.status, to)) throw new WorkflowError(`Không thể chuyển từ "${STATUS_LABEL[s.status]}" sang "${STATUS_LABEL[to]}".`);
  if (s.status === to) return s;
  const next = { ...s, status: to, updatedAt: Date.now() };
  await sessionsRepo.put(next);
  await logsRepo.add(id, actor, `Trạng thái → ${STATUS_LABEL[to]}`, detail);
  return next;
}

/** Any edit after approval sends the session back to "Chờ duyệt" and drops the exported file. */
async function reopenIfApproved(s: Session) {
  if (s.status === 'da_duyet' || s.status === 'dung') {
    await sessionsRepo.put({ ...s, status: 'cho_duyet', approvedAt: undefined, updatedAt: Date.now() });
    const f = await filesRepo.get(s.id);
    if (f) await filesRepo.put({ sessionId: s.id, original: f.original });
    await logsRepo.add(s.id, 'nguoi_dung', 'Sửa sau khi duyệt', 'Phiên quay về Chờ duyệt, file xuất cũ bị bỏ');
  } else if (s.status === 'nhap' || s.status === 'cho_ai') {
    await sessionsRepo.put({ ...s, status: 'cho_duyet', updatedAt: Date.now() });
  } else {
    await sessionsRepo.put({ ...s, updatedAt: Date.now() });
  }
}

const LOCKED: SessionStatus[] = ['dang_tao', 'da_tao', 'hoan_tat'];

export async function updateRow(row: MappingRow, patch: Partial<MappingRow>): Promise<void> {
  const s = await mustSession(row.sessionId);
  if (LOCKED.includes(s.status)) throw new WorkflowError('Phiên đã sang EasyHRM — không sửa bảng ghép được nữa.');
  const next: MappingRow = { ...row, ...patch, key: undefined };
  if ('fieldCode' in patch || 'extraLabel' in patch || 'gapGroup' in patch) {
    next.source = 'nguoi_dung';
    next.confidence = undefined;
  }
  if (next.fieldCode && !isExtraField(next.fieldCode)) next.extraLabel = next.gapGroup ? next.extraLabel : undefined;
  await rowsRepo.put(next);
  await reopenIfApproved(s);
}

export async function approveAllWithField(sessionId: string): Promise<number> {
  const s = await mustSession(sessionId);
  if (LOCKED.includes(s.status)) throw new WorkflowError('Phiên đã sang EasyHRM.');
  const rows = await rowsRepo.bySession(sessionId);
  const changed = rows.filter((r) => r.status === 'cho' && r.fieldCode && !r.gapGroup).map((r) => ({ ...r, status: 'duyet' as const }));
  await rowsRepo.bulkPut(changed);
  if (changed.length) {
    await logsRepo.add(sessionId, 'nguoi_dung', 'Duyệt hàng loạt', `${changed.length} dòng đã có trường`);
    await reopenIfApproved(s);
  }
  return changed.length;
}

export async function updateTemplateInfo(sessionId: string, templateCode: string, templateName: string) {
  const s = await mustSession(sessionId);
  await sessionsRepo.put({ ...s, templateCode: templateCode.trim() || undefined, templateName: templateName.trim() || undefined, updatedAt: Date.now() });
}

export async function handToClaude(sessionId: string): Promise<Session> {
  const s = await mustSession(sessionId);
  if (s.status === 'nhap') return setStatus(sessionId, 'cho_ai', 'nguoi_dung', 'Giao cho Claude');
  return s;
}

export interface ApproveResult {
  ok: boolean;
  problems: string[];
  issues: VerifyIssue[];
  keys: string[];
}

/** "Duyệt phiên": generate keys, write the .docx, verify it. Warnings (personal data left) need explicit acceptance. */
export async function approveSession(sessionId: string, acceptWarnings = false): Promise<ApproveResult> {
  const s = await mustSession(sessionId);
  if (!['nhap', 'cho_ai', 'cho_duyet'].includes(s.status)) throw new WorkflowError('Phiên không ở trạng thái duyệt được.');
  const catalog = await catalogsRepo.get(catalogId(s.hrmVersion, s.docType, s.decisionType ?? ''));
  const fields = catalog?.fields ?? [];
  const rows = await rowsRepo.bySession(sessionId);
  const problems = readiness(rows, fields).map((p) => p.message);
  if (problems.length) return { ok: false, problems, issues: [], keys: [] };

  const dict = new Map((await dictionaryRepo.byProject(s.projectId)).map((d) => [d.fieldCode, d.key]));
  const keyed = assignKeys(rows, fields, dict);
  const file = await filesRepo.get(sessionId);
  if (!file) throw new WorkflowError('Mất tệp gốc của phiên.');
  try {
    const { blob } = await applyReplacements(
      file.original,
      keyed.filter((r) => r.status === 'duyet' && r.key).map((r) => ({ location: r.location, expected: r.text, key: r.key! })),
    );
    const v = await verifyDocx(blob);
    const errors = v.issues.filter((i) => i.level === 'loi');
    const warnings = v.issues.filter((i) => i.level === 'canh_bao');
    if (errors.length || (warnings.length && !acceptWarnings)) return { ok: false, problems: [], issues: v.issues, keys: v.keys };

    const outputName = `${s.fileName.replace(/\.docx$/i, '')}_TenKey.docx`;
    const now = Date.now();
    await db.transaction('rw', [db.rows, db.files, db.sessions, db.keyDictionary, db.logs], async () => {
      await rowsRepo.bulkPut(keyed);
      await filesRepo.put({ sessionId, original: file.original, output: blob, outputName });
      await sessionsRepo.put({ ...s, status: 'da_duyet', approvedAt: now, updatedAt: now });
      await dictionaryRepo.record(
        s.projectId,
        keyed.filter((r) => r.status === 'duyet' && r.key && r.fieldCode && !isExtraField(r.fieldCode)).map((r) => ({ fieldCode: r.fieldCode!, key: r.key! })),
      );
      await logsRepo.add(sessionId, 'nguoi_dung', 'Duyệt phiên', `${v.keys.length} key: ${v.keys.join(', ')}${warnings.length ? ` · chấp nhận ${warnings.length} cảnh báo` : ''}`);
    });
    return { ok: true, problems: [], issues: v.issues, keys: v.keys };
  } catch (e) {
    if (e instanceof DocxError) return { ok: false, problems: [e.message], issues: [], keys: [] };
    throw e;
  }
}

export async function markActivated(sessionId: string) {
  return setStatus(sessionId, 'hoan_tat', 'nguoi_dung', 'Người dùng xác nhận đã bật Hiệu lực trên EasyHRM');
}

export const deleteSession = (id: string) => sessionsRepo.removeCascade(id);

export interface MetaPatch {
  docType?: DocType;
  decisionType?: string;
  templateName?: string;
  contractClass?: ContractClass;
  termMonths?: number | null;
  signing?: Partial<NonNullable<Session['signing']>>;
}

/**
 * Change template metadata (user edit or AI `doc_meta`). Changing document/decision type switches the field catalog:
 * catalog fields that do not exist in the new catalog are cleared (extra fields are kept).
 */
export async function updateSessionMeta(sessionId: string, patch: MetaPatch, actor: LogActor): Promise<Session> {
  const s = await mustSession(sessionId);
  if (LOCKED.includes(s.status)) throw new WorkflowError('Phiên đã sang EasyHRM — không đổi thông tin mẫu được.');
  const docType = patch.docType ?? s.docType;
  const decisionType = docType === 'quyet_dinh' ? (patch.decisionType ?? s.decisionType) : undefined;
  const typeChanged = docType !== s.docType || decisionType !== s.decisionType;
  const source = actor === 'ai' ? 'ai' : 'nguoi_dung';
  const next: Session = {
    ...s,
    docType,
    decisionType,
    templateName: patch.templateName?.trim() || s.templateName,
    docMeta: {
      ...(s.docMeta ?? { source }),
      ...(patch.contractClass ? { contractClass: patch.contractClass } : {}),
      ...(patch.termMonths !== undefined ? { termMonths: patch.termMonths ?? undefined } : {}),
      source,
    },
    signing: patch.signing ? { ...(s.signing ?? { source }), ...patch.signing, source } : s.signing,
    updatedAt: Date.now(),
  };
  await db.transaction('rw', [db.sessions, db.rows, db.logs, db.catalogs], async () => {
    if (typeChanged) {
      const project = await projectsRepo.get(s.projectId);
      const catalog = await ensureCatalog(project?.hrmVersion ?? s.hrmVersion, docType, decisionType ?? '');
      const codes = new Set(catalog.fields.map((f) => f.code));
      const rows = await rowsRepo.bySession(sessionId);
      await rowsRepo.bulkPut(rows.map((r) => (r.fieldCode && !isExtraField(r.fieldCode) && !codes.has(r.fieldCode) ? { ...r, fieldCode: undefined, format: undefined, key: undefined } : r)));
    }
    await sessionsRepo.put(next);
    const what = [
      patch.docType && `loại văn bản ${docType}`,
      patch.decisionType && `loại QĐ ${decisionType}`,
      patch.templateName && `tên mẫu "${next.templateName}"`,
      patch.contractClass && `phân loại ${patch.contractClass}`,
      patch.termMonths !== undefined && `thời hạn ${patch.termMonths ?? '—'} tháng`,
      patch.signing && 'người ký / vị trí ký',
    ].filter(Boolean).join(', ');
    await logsRepo.add(sessionId, actor, 'Thông tin mẫu', what || 'không đổi');
  });
  if (s.status === 'da_duyet' || s.status === 'dung') await reopenIfApproved(next);
  return next;
}

export interface AcceptAllResult {
  approved: number;
  skipped: number;
  left: string[]; // candidateIds still waiting (no proposal or T4)
}

/** FR-09: apply every proposal in one click — rows with a field/extra field → Duyệt, rows proposed as fixed → Bỏ. */
export async function acceptAllProposals(sessionId: string): Promise<AcceptAllResult> {
  const s = await mustSession(sessionId);
  if (LOCKED.includes(s.status)) throw new WorkflowError('Phiên đã sang EasyHRM.');
  const rows = await rowsRepo.bySession(sessionId);
  let approved = 0;
  let skipped = 0;
  const left: string[] = [];
  const next = rows.map((r) => {
    if (r.status !== 'cho') return r;
    if (r.proposedSkip) {
      skipped++;
      return { ...r, status: 'bo' as const };
    }
    const hasField = !!r.fieldCode || !!r.fixedKey || (!!r.gapGroup && r.gapGroup !== 'T4' && !!r.extraLabel?.trim());
    if (hasField) {
      approved++;
      return { ...r, status: 'duyet' as const };
    }
    left.push(r.candidateId);
    return r;
  });
  await rowsRepo.bulkPut(next);
  if (approved || skipped) {
    await logsRepo.add(sessionId, 'nguoi_dung', 'Duyệt toàn bộ đề xuất', `${approved} duyệt, ${skipped} bỏ${left.length ? `, còn ${left.length} dòng chờ` : ''}`);
    await reopenIfApproved(s);
  }
  return { approved, skipped, left };
}

/** FR-12: put approved sessions into Claude's EasyHRM queue (order = queueOrder). */
export async function handToHrm(sessionIds: string[]): Promise<{ queued: string[]; refused: { id: string; reason: string }[] }> {
  const queued: string[] = [];
  const refused: { id: string; reason: string }[] = [];
  for (const id of sessionIds) {
    const s = await sessionsRepo.get(id);
    if (!s) refused.push({ id, reason: 'Không có phiên' });
    else if (s.status !== 'da_duyet' && s.status !== 'dung') refused.push({ id, reason: `Đang "${STATUS_LABEL[s.status]}" — cần Đã duyệt` });
    else {
      await sessionsRepo.put({ ...s, handedToHrmAt: Date.now(), updatedAt: Date.now() });
      await logsRepo.add(id, 'nguoi_dung', 'Giao Claude tạo trên EasyHRM');
      queued.push(id);
    }
  }
  return { queued, refused };
}
