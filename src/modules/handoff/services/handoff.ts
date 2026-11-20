import { catalogsRepo, filesRepo, handoffsRepo, logsRepo, projectsRepo, rowsRepo, sessionsRepo } from '@/db/repositories';
import type { Handoff } from '@/db/types';
import { db } from '@/db/schema';
import { buildHrmJob } from '@/modules/agent/services/protocol';
import { catalogId } from '@/modules/catalog/services/catalog';

/**
 * CR-2026-003 Y4 — "Kho tệp đã duyệt". Each approval freezes the output .docx + its EasyHRM job into an immutable
 * package. Reopening a session only marks the package superseded (never deleted), so Claude always finds the file
 * that was approved (BR-25).
 */

export const APPROVED_STATUSES = ['da_duyet', 'dang_tao', 'dung', 'da_tao'] as const;

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const h = await subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Freeze the current output of an approved session as package version n+1 (previous one superseded). */
export async function createHandoff(sessionId: string): Promise<Handoff> {
  const s = await sessionsRepo.get(sessionId);
  if (!s) throw new Error(`Không có phiên "${sessionId}".`);
  if (!(APPROVED_STATUSES as readonly string[]).includes(s.status)) throw new Error('Phiên chưa được duyệt — chưa tạo gói giao việc.');
  const f = await filesRepo.get(sessionId);
  if (!f?.output) throw new Error('Phiên chưa có tệp xuất.');
  const buf = await f.output.arrayBuffer();
  const sha256 = await sha256Hex(buf);
  const [rows, catalog, project, prev] = await Promise.all([
    rowsRepo.bySession(sessionId),
    catalogsRepo.get(catalogId(s.hrmVersion, s.docType, s.decisionType ?? '')),
    projectsRepo.get(s.projectId),
    handoffsRepo.bySession(sessionId),
  ]);
  const fileName = f.outputName ?? `${s.fileName.replace(/\.docx$/i, '')}_TenKey.docx`;
  const version = prev.reduce((m, h) => Math.max(m, h.version), 0) + 1;
  const job = buildHrmJob(s, rows, catalog, { project, file: { name: fileName, size: buf.byteLength, sha256 } });
  const h: Handoff = {
    id: `${sessionId}#${version}`, sessionId, projectId: s.projectId, version, active: 1, fileName,
    blob: new Blob([buf], { type: f.output.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    size: buf.byteLength, sha256, job, approvedAt: s.approvedAt ?? Date.now(),
  };
  await db.transaction('rw', [db.handoffs, db.logs], async () => {
    await handoffsRepo.deactivate(sessionId);
    await handoffsRepo.put(h);
    await logsRepo.add(sessionId, 'he_thong', 'Lưu gói giao việc', `Phiên bản ${version} · ${fileName} · ${(buf.byteLength / 1024).toFixed(0)} KB · SHA-256 ${sha256.slice(0, 12)}…`);
  });
  return h;
}

/**
 * Current package of a session. Sessions approved before v3 (only `files.output`) get one created on the fly,
 * so Claude never hits "không có tệp" for an approved session.
 */
export async function ensureHandoff(sessionId: string): Promise<Handoff | undefined> {
  const act = await handoffsRepo.active(sessionId);
  if (act) return act;
  const s = await sessionsRepo.get(sessionId);
  if (!s || !(APPROVED_STATUSES as readonly string[]).includes(s.status)) return undefined;
  const f = await filesRepo.get(sessionId);
  if (!f?.output) return undefined;
  return createHandoff(sessionId);
}

export const supersedeHandoffs = (sessionId: string) => handoffsRepo.deactivate(sessionId);

export const handoffHistory = (sessionId: string) => handoffsRepo.bySession(sessionId);
