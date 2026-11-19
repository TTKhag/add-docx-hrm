import { catalogsRepo, logsRepo, projectsRepo, reportsRepo, rowsRepo, sessionsRepo, settingsRepo } from '@/db/repositories';
import type { Session } from '@/db/types';
import { catalogId } from '@/modules/catalog/services/catalog';
import { previewCatalogImport, saveCatalog } from '@/modules/catalog/services/catalog.workflow';
import { STATUS_LABEL } from '@/modules/sessions/services/mapping';
import { setStatus, WorkflowError } from '@/modules/sessions/services/session.workflow';
import skillMeta from '../../../../skill/skill-meta.json';
import {
  type AgentTask, applyProposal, buildTask, checkProtocol, hrmReportSchema, PROTOCOL, type ProtocolError, proposalSchema, zodErrors,
} from './protocol';

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
    return { ok: true, data: buildTask(s, project, rows, catalog), message: `Phiên ${s.id}: ${STATUS_LABEL[s.status]}` };
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
    if (!['nhap', 'cho_ai', 'cho_duyet'].includes(s.status)) return fail(`Phiên đang "${STATUS_LABEL[s.status]}" — không nhận đề xuất.`);
    const catalog = await catalogsRepo.get(catalogId(s.hrmVersion, s.docType, s.decisionType ?? ''));
    const rows = await rowsRepo.bySession(s.id);
    const r = applyProposal(rows, catalog?.fields ?? [], p);
    await rowsRepo.bulkPut(r.rows);
    if (p.skill_version) await settingsRepo.set('skillVersionReported', p.skill_version);
    await logsRepo.add(s.id, 'ai', 'Gửi đề xuất', `${r.accepted} nhận, ${r.rejected.length} từ chối${p.extra_candidates.length ? ` · AI báo thêm ${p.extra_candidates.length} chỗ có thể bị sót` : ''}`);
    for (const extra of p.extra_candidates) await logsRepo.add(s.id, 'ai', 'Chỗ có thể bị sót', extra.hint);
    if (s.status === 'nhap') await setStatus(s.id, 'cho_ai', 'he_thong');
    if (s.status !== 'cho_duyet') await setStatus(s.id, 'cho_duyet', 'ai');
    return {
      ok: true,
      data: { accepted: r.accepted, rejected: r.rejected },
      message: `Đã nhận ${r.accepted} đề xuất. Phiên chuyển sang Chờ duyệt — dừng lại, mời người dùng duyệt trên Studio.`,
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
    return { ok: true, data: { status: next.status }, message: 'Bắt đầu. Nhớ hỏi người dùng trước khi bấm Lưu.' };
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
      skillVersion: r.skill_version,
    });
    if (r.template_code || r.template_name) {
      const fresh = (await sessionsRepo.get(s.id))!;
      await sessionsRepo.put({ ...fresh, templateCode: r.template_code ?? fresh.templateCode, templateName: r.template_name ?? fresh.templateName });
    }
    const to = r.outcome === 'thanh_cong' ? 'da_tao' : 'dung';
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
}

export function createAgentApi(): TemplateStudioApi {
  return Object.freeze({
    protocol: PROTOCOL,
    skillLatest: skillMeta.version,
    getTask, getStatus, submitProposal, startHrm, submitHrmReport, submitCatalog, reportSkillVersion, listSessions,
  });
}
