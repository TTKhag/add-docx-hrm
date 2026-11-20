import { catalogsRepo, filesRepo, logsRepo, projectsRepo, reportsRepo, rowsRepo, sessionsRepo, settingsRepo, jobsRepo } from '@/db/repositories';
import type { Session } from '@/db/types';
import { catalogId, DECISION_TYPES } from '@/modules/catalog/services/catalog';
import { ensureCatalog, previewCatalogImport, saveCatalog } from '@/modules/catalog/services/catalog.workflow';
import { readDocx } from '@/modules/sessions/services/docx';
import { STATUS_LABEL } from '@/modules/sessions/services/mapping';
import { setStatus, updateSessionMeta, WorkflowError } from '@/modules/sessions/services/session.workflow';
import { ensureAssessed } from '@/modules/sessions/services/assess';
import { ensureHandoff } from '@/modules/handoff/services/handoff';

import type { AgentJob } from '@/db/types';
import { completeJob as completeJobSvc, DutyError, getDuty, isOnDuty, startDuty as startDutySvc, stopDuty as stopDutySvc, waitForJob as waitForJobSvc, WAIT_MAX_MS } from './duty';
import skillMeta from '../../../../skill/skill-meta.json';
import {
  type AgentTask, applyProposal, buildTask, checkProtocol, type HrmJob, hrmReportSchema, PROTOCOL, type ProtocolError, proposalSchema,
  resolveAddedCandidates, zodErrors,
} from './protocol';

const AI_STATUSES: Session['status'][] = ['nhap', 'cho_ai', 'cho_duyet'];

/** File info for hrm_job, from the approved package (CR-2026-003 FR-46). */
async function outputInfo(sessionId: string): Promise<HrmJob['file'] | undefined> {
  const h = await ensureHandoff(sessionId);
  if (!h) return undefined;
  return { name: h.fileName, size: h.size, sha256: h.sha256, version: h.version, mirrored_path: h.mirroredPath };
}

/** Uniform result for everything exposed to Claude. Plain JSON only. */
export type AgentResult<T = unknown> = { ok: true; data: T; message: string } | { ok: false; errors: ProtocolError[]; message: string };

const fail = (message: string, errors: ProtocolError[] = []): AgentResult<never> => ({ ok: false, message, errors });

function parseInput(input: unknown): unknown {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      throw new WorkflowError('Dữ liệu không phải JSON hợp lệ.');
    }
  }
  return input;
}

async function guard<T>(fn: () => Promise<AgentResult<T>>): Promise<AgentResult<T>> {
  try {
    return await fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Lỗi không xác định');
  }
}

export async function getTask(sessionId: string): Promise<AgentResult<AgentTask>> {
  return guard(async () => {
    const s = await sessionsRepo.get(sessionId);
    if (!s) return fail(`Không có phiên "${sessionId}".`);
    const project = await projectsRepo.get(s.projectId);
    if (!project) return fail('Phiên không gắn với dự án nào — khai báo dự án trên Studio.');
    const rows = await rowsRepo.bySession(s.id);
    const catalog = await catalogsRepo.get(catalogId(s.hrmVersion, s.docType, s.decisionType ?? ''));
    const forAi = AI_STATUSES.includes(s.status);
    const file = await filesRepo.get(s.id);
    const doc = forAi && file ? await readDocx(file.original) : undefined;
    const task = buildTask(s, project, rows, catalog, { doc, decisionTypes: DECISION_TYPES, file: forAi ? undefined : await outputInfo(s.id) });
    return { ok: true, data: task, message: `Phiên ${s.id}: ${STATUS_LABEL[s.status]}` };
  });
}

export async function getStatus(sessionId: string): Promise<AgentResult<{ status: Session['status']; label: string }>> {
  return guard(async () => {
    const s = await sessionsRepo.get(sessionId);
    if (!s) return fail(`Không có phiên "${sessionId}".`);
    return { ok: true, data: { status: s.status, label: STATUS_LABEL[s.status] }, message: STATUS_LABEL[s.status] };
  });
}

export async function submitProposal(input: unknown): Promise<AgentResult<{ accepted: number; rejected: ProtocolError[] }>> {
  return guard(async () => {
    const parsed = proposalSchema.safeParse(parseInput(input));
    if (!parsed.success) return fail('Đề xuất sai cấu trúc — không áp dụng gì.', zodErrors(parsed.error));
    const p = parsed.data;
    const perr = checkProtocol(p.protocol);
    if (perr) return fail(perr.message, [perr]);
    const s = await sessionsRepo.get(p.session_id);
    if (!s) return fail(`Không có phiên "${p.session_id}".`);
    if (!AI_STATUSES.includes(s.status)) return fail(`Phiên đang "${STATUS_LABEL[s.status]}" — không nhận đề xuất.`);
    // 1) template metadata first: it may switch the field catalog (doc/decision type).
    const metaNotes: string[] = [];
    let cur = s;
    if (p.doc_meta || p.signing) {
      const dm = p.doc_meta ?? {};
      cur = await updateSessionMeta(s.id, {
        docType: dm.doc_type,
        decisionType: dm.decision_type,
        templateName: dm.template_name,
        contractClass: dm.contract_class,
        termMonths: dm.term_months,
        signing: p.signing ? {
          companyTitle: p.signing.company_title, companySignerName: p.signing.company_signer_name,
          employeeAnchor: p.signing.employee_anchor, companyAnchor: p.signing.company_anchor,
        } : undefined,
      }, 'ai');
      if (dm.decision_type && !DECISION_TYPES.includes(dm.decision_type)) metaNotes.push(`Loại QĐ "${dm.decision_type}" không có trong danh mục mẫu — kiểm tra trên EasyHRM`);
    }
    const project = await projectsRepo.get(cur.projectId);
    const catalog = await ensureCatalog(project?.hrmVersion ?? cur.hrmVersion, cur.docType, cur.decisionType ?? '');
    let rows = await rowsRepo.bySession(s.id);
    // 2) candidates the AI found in the full text.
    const addRejected: ProtocolError[] = [];
    if (p.add_candidates.length) {
      const file = await filesRepo.get(s.id);
      if (!file) return fail('Mất tệp gốc của phiên.');
      const added = resolveAddedCandidates(await readDocx(file.original), rows, p.add_candidates, s.id);
      rows = [...rows, ...added.rows];
      p.proposals.push(...added.proposals);
      p.gaps.push(...added.gaps);
      addRejected.push(...added.rejected);
      if (added.rows.length) metaNotes.push(`AI thêm ${added.rows.length} chỗ từ toàn văn`);
    }
    const r = applyProposal(rows, catalog.fields, p);
    r.rejected.unshift(...addRejected);
    // FR-36: rows the AI left without a usable conclusion (T4, gap without label, no proposal) → Studio concludes.
    const assessed = ensureAssessed(r.rows, new Set(catalog.fields.map((f) => f.code)));
    if (assessed.changed) metaNotes.push(`Studio tự đánh giá ${assessed.changed} chỗ AI chưa kết luận`);
    await rowsRepo.bulkPut(assessed.rows);
    if (p.skill_version) await settingsRepo.set('skillVersionReported', p.skill_version);
    await logsRepo.add(s.id, 'ai', 'Gửi đề xuất', `${r.accepted} nhận, ${r.rejected.length} từ chối${metaNotes.length ? ' · ' + metaNotes.join(' · ') : ''}${p.extra_candidates.length ? ` · AI báo thêm ${p.extra_candidates.length} chỗ có thể bị sót` : ''}`);
    for (const extra of p.extra_candidates) await logsRepo.add(s.id, 'ai', 'Chỗ có thể bị sót', extra.hint);
    const st = (await sessionsRepo.get(s.id))!.status;
    if (st === 'nhap') await setStatus(s.id, 'cho_ai', 'he_thong');
    if (st !== 'cho_duyet') await setStatus(s.id, 'cho_duyet', 'ai');
    return {
      ok: true,
      data: { accepted: r.accepted, rejected: r.rejected },
      message: `Đã nhận ${r.accepted} đề xuất${r.rejected.length ? `, từ chối ${r.rejected.length} (xem rejected)` : ''}. Phiên chuyển sang Chờ duyệt — người dùng duyệt trên Studio.`,
    };
  });
}

/** Claude calls this right before working in EasyHRM. Only allowed after the user approved (BR-07). */
export async function startHrm(sessionId: string): Promise<AgentResult<{ status: Session['status'] }>> {
  return guard(async () => {
    const s = await sessionsRepo.get(sessionId);
    if (!s) return fail(`Không có phiên "${sessionId}".`);
    if (s.status !== 'da_duyet' && s.status !== 'dung' && s.status !== 'dang_tao') {
      return fail(`Phiên đang "${STATUS_LABEL[s.status]}". Chỉ sang EasyHRM khi người dùng đã duyệt trên Studio.`);
    }
    const next = await setStatus(s.id, 'dang_tao', 'ai', 'Claude bắt đầu thao tác trên EasyHRM');
    return { ok: true, data: { status: next.status }, message: 'Bắt đầu. Bấm Lưu khi câu lệnh của người dùng đã đồng ý Lưu; không thì hỏi trước.' };
  });
}

export async function submitHrmReport(input: unknown): Promise<AgentResult<{ status: Session['status'] }>> {
  return guard(async () => {
    const parsed = hrmReportSchema.safeParse(parseInput(input));
    if (!parsed.success) return fail('Báo cáo sai cấu trúc.', zodErrors(parsed.error));
    const r = parsed.data;
    const perr = checkProtocol(r.protocol);
    if (perr) return fail(perr.message, [perr]);
    const s = await sessionsRepo.get(r.session_id);
    if (!s) return fail(`Không có phiên "${r.session_id}".`);
    if (s.status !== 'dang_tao') return fail(`Phiên đang "${STATUS_LABEL[s.status]}" — gọi startHrm trước khi báo cáo.`);
    await reportsRepo.add({
      sessionId: s.id, at: Date.now(), outcome: r.outcome, templateCode: r.template_code, templateName: r.template_name,
      steps: r.steps, userSteps: r.user_steps, mappedKeys: r.mapped_keys, unmappedKeys: r.unmapped_keys, hrmMessages: r.hrm_messages,
      skillVersion: r.skill_version, createdExtraFields: r.created_extra_fields, signer: r.signer,
    });
    if (r.template_code || r.template_name) {
      const fresh = (await sessionsRepo.get(s.id))!;
      await sessionsRepo.put({ ...fresh, templateCode: r.template_code ?? fresh.templateCode, templateName: r.template_name ?? fresh.templateName });
    }
    const to = r.outcome === 'thanh_cong' ? 'da_tao' : 'dung';
    if (to === 'da_tao') {
      const fresh = (await sessionsRepo.get(s.id))!;
      await sessionsRepo.put({ ...fresh, handedToHrmAt: undefined });
    }
    const next = await setStatus(s.id, to, 'ai', r.outcome === 'thanh_cong' ? 'Đã tạo mẫu trên EasyHRM' : 'Dừng giữa chừng');
    return {
      ok: true,
      data: { status: next.status },
      message: to === 'da_tao' ? 'Đã ghi báo cáo. Người dùng tự xem trước và bật Hiệu lực — Claude không làm bước này.' : 'Đã ghi báo cáo dừng giữa chừng.',
    };
  });
}

export async function submitCatalog(input: unknown): Promise<AgentResult<{ id: string; added: number; removed: number; changed: number }>> {
  return guard(async () => {
    const pre = await previewCatalogImport(parseInput(input));
    if (!pre.ok) return fail('Danh mục sai cấu trúc.', pre.errors);
    await saveCatalog(pre.next);
    return {
      ok: true,
      data: { id: pre.next.id, added: pre.diff.added.length, removed: pre.diff.removed.length, changed: pre.diff.changed.length },
      message: `Đã lưu danh mục ${pre.next.id}.`,
    };
  });
}

export async function reportSkillVersion(version: string): Promise<AgentResult<{ reported: string; latest: string; upToDate: boolean }>> {
  return guard(async () => {
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return fail('Phiên bản phải có dạng x.y.z.');
    await settingsRepo.set('skillVersionReported', version);
    await settingsRepo.set('skillReportedAt', Date.now());
    const upToDate = compareVersion(version, skillMeta.version) >= 0;
    return {
      ok: true,
      data: { reported: version, latest: skillMeta.version, upToDate },
      message: upToDate ? `Đã kết nối, skill ${version}.` : `Skill ${version} cũ hơn bản ${skillMeta.version} — nhắc người dùng cập nhật.`,
    };
  });
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export async function listSessions(): Promise<AgentResult<{ id: string; file: string; status: string; project?: string }[]>> {
  return guard(async () => {
    const [sessions, projects] = await Promise.all([sessionsRepo.all(), projectsRepo.all()]);
    const name = new Map(projects.map((p) => [p.id, p.name]));
    return {
      ok: true,
      data: sessions.slice(0, 30).map((s) => ({ id: s.id, file: s.fileName, status: STATUS_LABEL[s.status], project: name.get(s.projectId) })),
      message: `${sessions.length} phiên`,
    };
  });
}

const queueSort = (a: Session, b: Session) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0) || a.createdAt - b.createdAt;

/** FR-12: sessions handed to Claude for EasyHRM, in queue order. */
export async function listQueue(): Promise<AgentResult<{ id: string; file: string; template_name?: string; status: string; project?: string; queue_order?: number }[]>> {
  return guard(async () => {
    const [sessions, projects] = await Promise.all([sessionsRepo.all(), projectsRepo.all()]);
    const name = new Map(projects.map((p) => [p.id, p.name]));
    const q = sessions.filter((s) => s.handedToHrmAt && (s.status === 'da_duyet' || s.status === 'dung' || s.status === 'dang_tao')).sort(queueSort);
    return {
      ok: true,
      data: q.map((s) => ({ id: s.id, file: s.fileName, template_name: s.templateName, status: s.status, project: name.get(s.projectId), queue_order: s.queueOrder })),
      message: q.length ? `${q.length} phiên chờ tạo trên EasyHRM (làm lần lượt theo thứ tự).` : 'Hàng đợi EasyHRM trống.',
    };
  });
}

/** Sessions waiting for the AI analysis (Nháp / Chờ AI), in queue order. */
export async function listForAi(): Promise<AgentResult<{ id: string; file: string; status: string; queue_order?: number }[]>> {
  return guard(async () => {
    const q = (await sessionsRepo.all()).filter((s) => s.status === 'nhap' || s.status === 'cho_ai').sort(queueSort);
    return { ok: true, data: q.map((s) => ({ id: s.id, file: s.fileName, status: s.status, queue_order: s.queueOrder })), message: `${q.length} phiên chờ AI phân tích.` };
  });
}

const CHUNK_MAX = 200_000;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * FR-11: the approved .docx (with keys) for Claude to load into EasyHRM's file input.
 * Read in chunks: offset/length are in bytes; join the decoded chunks and check size + sha256.
 */
export async function getOutputFile(sessionId: string, offset = 0, length = CHUNK_MAX): Promise<AgentResult<{ name: string; size: number; sha256: string; offset: number; length: number; base64: string; done: boolean }>> {
  return guard(async () => {
    const s = await sessionsRepo.get(sessionId);
    if (!s) return fail(`Không có phiên "${sessionId}".`);
    if (!['da_duyet', 'dang_tao', 'dung', 'da_tao'].includes(s.status)) return fail(`Phiên đang "${STATUS_LABEL[s.status]}" — chưa có tệp đã duyệt.`);
    const h = await ensureHandoff(sessionId);
    if (!h) return fail('Phiên chưa có gói giao việc — người dùng cần Duyệt phiên.');
    const all = new Uint8Array(await h.blob.arrayBuffer());
    const len = Math.max(1, Math.min(length, CHUNK_MAX));
    const part = all.subarray(offset, offset + len);
    const done = offset + part.length >= all.length;
    return {
      ok: true,
      data: { name: h.fileName, size: all.length, sha256: h.sha256, offset, length: part.length, base64: toBase64(part), done },
      message: done ? 'Đoạn cuối của tệp.' : `Còn tiếp từ offset ${offset + part.length}.`,
    };
  });
}

// ---------- CR-2026-003: Claude on duty (job queue) + approved-file packages ----------

/** Claude calls this once after the user's duty prompt. `consent_save`: the prompt contains consent to press Lưu. */
export async function startDuty(opts: { hours?: number; consent_save?: boolean; skill_version?: string } = {}): Promise<AgentResult<{ until: string; waiting: number }>> {
  return guard(async () => {
    const d = await startDutySvc({ hours: opts.hours, consentSave: opts.consent_save, skillVersion: opts.skill_version });
    if (opts.skill_version) await settingsRepo.set('skillVersionReported', opts.skill_version);
    const waiting = (await jobsRepo.byStatus('cho')).length;
    return { ok: true, data: { until: new Date(d.until).toISOString(), waiting }, message: `Bắt đầu trực tới ${new Date(d.until).toLocaleTimeString('vi-VN')}. ${waiting} việc đang chờ. Lặp waitForJob(${WAIT_MAX_MS}).` };
  });
}

type JobOut = { id: string; kind: AgentJob['kind']; session_ids: string[]; created_at: string };
const jobOut = (j: AgentJob): JobOut => ({ id: j.id, kind: j.kind, session_ids: j.sessionIds, created_at: new Date(j.createdAt).toISOString() });

/** Wait ≤ 25 s for the next job the user handed over. `data.job` null = nothing yet (call again); `data.stop` = end duty. */
type WaitData = { job: JobOut | null; stop: boolean; reason?: string };
export async function waitForJob(timeoutMs = WAIT_MAX_MS): Promise<AgentResult<WaitData>> {
  return guard<WaitData>(async () => {
    try {
      const r = await waitForJobSvc(timeoutMs);
      if (r.kind === 'job') {
        return { ok: true, data: { job: jobOut(r.job), stop: false }, message: `Việc ${r.job.id}: ${r.job.kind === 'phan_tich' ? 'phân tích' : 'tạo trên EasyHRM'} ${r.job.sessionIds.length} phiên. Làm xong gọi completeJob("${r.job.id}").` };
      }
      if (r.kind === 'stop') return { ok: true, data: { job: null, stop: true, reason: r.reason }, message: `Dừng trực: ${r.reason}` };
      return { ok: true, data: { job: null, stop: false }, message: 'Chưa có việc — gọi waitForJob lại.' };
    } catch (e) {
      if (e instanceof DutyError) return fail(e.message);
      throw e;
    }
  });
}

export async function completeJob(id: string, note?: string): Promise<AgentResult<{ id: string }>> {
  return guard(async () => {
    try {
      await completeJobSvc(id, note);
      return { ok: true, data: { id }, message: `Đã hoàn tất việc ${id}. Gọi waitForJob để nhận việc tiếp.` };
    } catch (e) {
      if (e instanceof DutyError) return fail(e.message);
      throw e;
    }
  });
}

export async function stopDuty(): Promise<AgentResult<{ stopped: boolean }>> {
  return guard(async () => {
    await stopDutySvc();
    return { ok: true, data: { stopped: true }, message: 'Đã dừng trực.' };
  });
}

export async function getDutyStatus(): Promise<AgentResult<{ on_duty: boolean; until?: string; waiting: number; running: number }>> {
  return guard(async () => {
    const d = await getDuty();
    const [waiting, running] = await Promise.all([jobsRepo.byStatus('cho'), jobsRepo.byStatus('dang_lam')]);
    return { ok: true, data: { on_duty: isOnDuty(d), until: d ? new Date(d.until).toISOString() : undefined, waiting: waiting.length, running: running.length }, message: isOnDuty(d) ? 'Đang trực.' : 'Chưa trực.' };
  });
}

/** FR-46: the approved package of a session (file info, version, path in the handoff folder). */
export async function getHandoff(sessionId: string): Promise<AgentResult<{ name: string; size: number; sha256: string; version: number; approved_at: string; mirrored_path?: string; hrm_job: unknown }>> {
  return guard(async () => {
    const s = await sessionsRepo.get(sessionId);
    if (!s) return fail(`Không có phiên "${sessionId}" trong trình duyệt này. Nếu người dùng duyệt ở trình duyệt khác, đọc thư mục giao việc (EasyHRM-Studio/hang-doi.json).`);
    const h = await ensureHandoff(sessionId);
    if (!h) return fail(`Phiên đang "${STATUS_LABEL[s.status]}" — chưa có gói giao việc.`);
    return {
      ok: true,
      data: { name: h.fileName, size: h.size, sha256: h.sha256, version: h.version, approved_at: new Date(h.approvedAt).toISOString(), mirrored_path: h.mirroredPath, hrm_job: h.job },
      message: `Gói phiên bản ${h.version}: ${h.fileName} (${(h.size / 1024).toFixed(0)} KB).${h.mirroredPath ? ` Có bản trên máy: ${h.mirroredPath}` : ''}`,
    };
  });
}

export interface TemplateStudioApi {
  protocol: string;
  skillLatest: string;
  getTask: typeof getTask;
  getStatus: typeof getStatus;
  submitProposal: typeof submitProposal;
  startHrm: typeof startHrm;
  submitHrmReport: typeof submitHrmReport;
  submitCatalog: typeof submitCatalog;
  reportSkillVersion: typeof reportSkillVersion;
  listSessions: typeof listSessions;
  listQueue: typeof listQueue;
  listForAi: typeof listForAi;
  getOutputFile: typeof getOutputFile;
  startDuty: typeof startDuty;
  waitForJob: typeof waitForJob;
  completeJob: typeof completeJob;
  stopDuty: typeof stopDuty;
  getDutyStatus: typeof getDutyStatus;
  getHandoff: typeof getHandoff;
}

export function createAgentApi(): TemplateStudioApi {
  return Object.freeze({
    protocol: PROTOCOL,
    skillLatest: skillMeta.version,
    getTask, getStatus, submitProposal, startHrm, submitHrmReport, submitCatalog, reportSkillVersion, listSessions,
    listQueue, listForAi, getOutputFile, startDuty, waitForJob, completeJob, stopDuty, getDutyStatus, getHandoff,
  });
}
