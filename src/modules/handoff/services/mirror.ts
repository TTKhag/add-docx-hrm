import { handoffsRepo, projectsRepo, sessionsRepo, settingsRepo } from '@/db/repositories';
import type { Handoff } from '@/db/types';
import { removeDiacritics } from '@/shared/utils/text';

/**
 * CR-2026-003 FR-47 — "Thư mục giao việc": mirror each approved package to a folder on the user's computer
 * (File System Access API, Chrome/Edge). Gives Claude a second source when its browser does not hold Studio's data,
 * and a real file on disk for the EasyHRM "Chọn tệp tin mẫu" dialog. Never blocks approval (ERR-31/32).
 */

// Minimal typings — the File System Access permission API is not in lib.dom.
type PermState = 'granted' | 'denied' | 'prompt';
interface DirHandle {
  name: string;
  kind: 'directory';
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ getFile(): Promise<File>; createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermState>;
}

export const ROOT_DIR = 'EasyHRM-Studio';
export const QUEUE_FILE = 'hang-doi.json';
const SETTING = 'handoffDir';

export function fsSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export const slug = (s: string) => removeDiacritics(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'du-an';

/** Relative folder of one package: EasyHRM-Studio/<dự án>/<thứ tự>-<mã phiên>. */
export function packageDir(projectName: string, queueOrder: number | undefined, sessionId: string): string[] {
  return [ROOT_DIR, slug(projectName), `${String(queueOrder ?? 0).padStart(3, '0')}-${sessionId}`];
}

export async function getHandoffDir(): Promise<DirHandle | undefined> {
  return settingsRepo.get<DirHandle>(SETTING);
}

/** Ask the user to choose the folder (needs a click). */
export async function pickHandoffDir(): Promise<{ ok: boolean; name?: string; message?: string }> {
  if (!fsSupported()) return { ok: false, message: 'Trình duyệt này không ghi được thư mục (cần Chrome hoặc Edge). Kho tệp trong trình duyệt vẫn dùng được.' };
  try {
    const h = await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ id: 'tstudio-giao-viec', mode: 'readwrite' });
    await settingsRepo.set(SETTING, h);
    return { ok: true, name: h.name };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, message: 'Đã huỷ chọn thư mục.' };
    return { ok: false, message: e instanceof Error ? e.message : 'Không chọn được thư mục.' };
  }
}

export async function clearHandoffDir() {
  await settingsRepo.set(SETTING, null);
}

export async function dirPermission(h: DirHandle, request: boolean): Promise<PermState> {
  if (!h.queryPermission) return 'granted';
  let p = await h.queryPermission({ mode: 'readwrite' });
  if (p === 'prompt' && request && h.requestPermission) p = await h.requestPermission({ mode: 'readwrite' });
  return p;
}

async function dirAt(root: DirHandle, parts: string[]): Promise<DirHandle> {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

async function writeFile(dir: DirHandle, name: string, data: Blob | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

export interface QueueEntry {
  session_id: string;
  project: string;
  queue_order?: number;
  file: string;
  path: string;
  size: number;
  sha256: string;
  version: number;
  approved_at: string;
}

/** Upsert one entry in EasyHRM-Studio/hang-doi.json (one line per session, latest package). */
export function upsertQueue(list: QueueEntry[], e: QueueEntry): QueueEntry[] {
  return [...list.filter((x) => x.session_id !== e.session_id), e].sort((a, b) => (a.queue_order ?? 0) - (b.queue_order ?? 0));
}

export type MirrorResult = { ok: true; path: string } | { ok: false; message: string; skipped?: boolean };

/** Write a package to the chosen folder. `request` = may show the permission prompt (only right after a click). */
export async function mirrorHandoff(h: Handoff, request = true): Promise<MirrorResult> {
  if (!fsSupported()) return { ok: false, skipped: true, message: 'Trình duyệt không hỗ trợ thư mục giao việc.' };
  const root = await getHandoffDir();
  if (!root) return { ok: false, skipped: true, message: 'Chưa chọn thư mục giao việc.' };
  try {
    if ((await dirPermission(root, request)) !== 'granted') {
      return { ok: false, message: 'Chưa ghi được ra thư mục giao việc — bấm "Cấp lại quyền" ở Cài vào Claude. Phiên vẫn đã duyệt.' };
    }
    const s = await sessionsRepo.get(h.sessionId);
    const project = await projectsRepo.get(h.projectId);
    const parts = packageDir(project?.name ?? 'du-an', s?.queueOrder, h.sessionId);
    const dir = await dirAt(root, parts);
    await writeFile(dir, h.fileName, h.blob);
    const path = [...parts, h.fileName].join('/');
    await writeFile(dir, 'job.json', JSON.stringify({
      protocol: 'tstudio/1', session_id: h.sessionId, version: h.version, file: h.fileName, size: h.size, sha256: h.sha256,
      approved_at: new Date(h.approvedAt).toISOString(), hrm_job: h.job,
    }, null, 2));
    const top = await dirAt(root, [ROOT_DIR]);
    let list: QueueEntry[] = [];
    try {
      list = JSON.parse(await (await (await top.getFileHandle(QUEUE_FILE)).getFile()).text()) as QueueEntry[];
      if (!Array.isArray(list)) list = [];
    } catch { /* first write */ }
    list = upsertQueue(list, {
      session_id: h.sessionId, project: project?.name ?? '', queue_order: s?.queueOrder, file: h.fileName, path,
      size: h.size, sha256: h.sha256, version: h.version, approved_at: new Date(h.approvedAt).toISOString(),
    });
    await writeFile(top, QUEUE_FILE, JSON.stringify(list, null, 2));
    await handoffsRepo.update(h.id, { mirroredPath: `${root.name}/${path}`, mirroredAt: Date.now() });
    return { ok: true, path: `${root.name}/${path}` };
  } catch (e) {
    return { ok: false, message: `Chưa ghi được ra thư mục giao việc: ${e instanceof Error ? e.message : 'lỗi không rõ'}. Phiên vẫn đã duyệt.` };
  }
}
