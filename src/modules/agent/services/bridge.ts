import { projectsRepo, sessionsRepo } from '@/db/repositories';
import { ensureHandoff } from '@/modules/handoff/services/handoff';

/**
 * File hand-off to an EasyHRM tab (FR-11, path A). The EasyHRM page (driven by Claude) opens
 * `#/cau-noi/<sessionId>` with window.open; this page posts the approved .docx back to its opener.
 * Target origin is pinned to the project's EasyHRM URL, so the file never goes to another site.
 */
export const BRIDGE_MESSAGE = 'tstudio-file';

export interface BridgeMessage {
  type: typeof BRIDGE_MESSAGE;
  sessionId: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
}

export type BridgeOutcome = { ok: true; name: string; size: number; origin: string } | { ok: false; message: string };

export async function prepareBridge(sessionId: string): Promise<{ ok: true; msg: BridgeMessage; origin: string } | { ok: false; message: string }> {
  const s = await sessionsRepo.get(sessionId);
  if (!s) return { ok: false, message: `Không có phiên "${sessionId}".` };
  if (!['da_duyet', 'dang_tao', 'dung'].includes(s.status)) return { ok: false, message: 'Phiên chưa được duyệt — không gửi tệp.' };
  const project = await projectsRepo.get(s.projectId);
  if (!project) return { ok: false, message: 'Phiên không gắn dự án.' };
  const h = await ensureHandoff(sessionId);
  if (!h) return { ok: false, message: 'Chưa có gói giao việc (tệp đã duyệt).' };
  const buffer = await h.blob.arrayBuffer();
  return {
    ok: true,
    origin: new URL(project.url).origin,
    msg: { type: BRIDGE_MESSAGE, sessionId, name: h.fileName, size: buffer.byteLength, buffer },
  };
}

export async function sendToOpener(sessionId: string, opener: Window | null): Promise<BridgeOutcome> {
  if (!opener) return { ok: false, message: 'Trang này không được mở từ EasyHRM (không có opener).' };
  const prep = await prepareBridge(sessionId);
  if (!prep.ok) return prep;
  opener.postMessage(prep.msg, prep.origin);
  return { ok: true, name: prep.msg.name, size: prep.msg.size, origin: prep.origin };
}
