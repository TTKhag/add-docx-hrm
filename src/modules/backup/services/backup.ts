import { z } from 'zod';
import { db, DB_VERSION } from '@/db/schema';

/** Full JSON backup of every table. Blobs (original/exported .docx) are base64 encoded. */

const BACKUP_KIND = 'easyhrm-template-studio-backup';

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(s: string, type: string): Blob {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function exportBackup(): Promise<string> {
  const files = await db.files.toArray();
  const data = {
    kind: BACKUP_KIND,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      projects: await db.projects.toArray(),
      sessions: await db.sessions.toArray(),
      rows: await db.rows.toArray(),
      catalogs: await db.catalogs.toArray(),
      keyDictionary: await db.keyDictionary.toArray(),
      logs: await db.logs.toArray(),
      hrmReports: await db.hrmReports.toArray(),
      settings: await db.settings.toArray(),
      files: await Promise.all(
        files.map(async (f) => ({
          sessionId: f.sessionId,
          original: await blobToBase64(f.original),
          output: f.output ? await blobToBase64(f.output) : undefined,
          outputName: f.outputName,
        })),
      ),
    },
  };
  return JSON.stringify(data);
}

const anyRows = z.array(z.record(z.string(), z.unknown()));

export const backupSchema = z.object({
  kind: z.literal(BACKUP_KIND),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  tables: z.object({
    projects: anyRows,
    sessions: anyRows,
    rows: anyRows,
    catalogs: anyRows,
    keyDictionary: anyRows,
    logs: anyRows,
    hrmReports: anyRows,
    settings: anyRows,
    files: z.array(z.object({ sessionId: z.string(), original: z.string(), output: z.string().optional(), outputName: z.string().optional() })),
  }),
});

export type BackupSummary = { projects: number; sessions: number; catalogs: number };

/** v1 → v2: sessions get mode + queueOrder (same back-fill as the Dexie upgrade). */
export function migrateBackupTables(schemaVersion: number, t: z.infer<typeof backupSchema>['tables']): z.infer<typeof backupSchema>['tables'] {
  if (schemaVersion >= 2) return t;
  const sessions = [...t.sessions].sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
  return { ...t, sessions: sessions.map((s, i) => ({ ...s, mode: s.mode ?? 'chen_key', queueOrder: s.queueOrder ?? i + 1 })) };
}

/** Validate and migrate a backup to the current schema. */
export function parseBackup(text: string): { ok: true; data: z.infer<typeof backupSchema>; summary: BackupSummary } | { ok: false; message: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Tệp sao lưu không phải JSON hợp lệ.' };
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) return { ok: false, message: 'Tệp không đúng định dạng sao lưu của Studio.' };
  if (r.data.schemaVersion > DB_VERSION) return { ok: false, message: 'Tệp sao lưu từ phiên bản Studio mới hơn — hãy cập nhật Studio.' };
  const t = migrateBackupTables(r.data.schemaVersion, r.data.tables);
  return { ok: true, data: { ...r.data, schemaVersion: DB_VERSION, tables: t }, summary: { projects: t.projects.length, sessions: t.sessions.length, catalogs: t.catalogs.length } };
}

/** Replace all data with the backup (single transaction). */
export async function restoreBackup(data: z.infer<typeof backupSchema>): Promise<void> {
  const t = data.tables;
  await db.transaction('rw', [db.projects, db.sessions, db.files, db.rows, db.catalogs, db.keyDictionary, db.logs, db.hrmReports, db.settings], async () => {
    await Promise.all([db.projects.clear(), db.sessions.clear(), db.files.clear(), db.rows.clear(), db.catalogs.clear(), db.keyDictionary.clear(), db.logs.clear(), db.hrmReports.clear(), db.settings.clear()]);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await db.projects.bulkPut(t.projects as any);
    await db.sessions.bulkPut(t.sessions as any);
    await db.rows.bulkPut(t.rows as any);
    await db.catalogs.bulkPut(t.catalogs as any);
    await db.keyDictionary.bulkPut(t.keyDictionary as any);
    await db.logs.bulkPut(t.logs as any);
    await db.hrmReports.bulkPut(t.hrmReports as any);
    await db.settings.bulkPut(t.settings as any);
    await db.files.bulkPut(
      t.files.map((f) => ({
        sessionId: f.sessionId,
        original: base64ToBlob(f.original, DOCX),
        output: f.output ? base64ToBlob(f.output, DOCX) : undefined,
        outputName: f.outputName,
      })),
    );
  });
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', [db.projects, db.sessions, db.files, db.rows, db.catalogs, db.keyDictionary, db.logs, db.hrmReports, db.settings], async () => {
    await Promise.all([db.projects.clear(), db.sessions.clear(), db.files.clear(), db.rows.clear(), db.catalogs.clear(), db.keyDictionary.clear(), db.logs.clear(), db.hrmReports.clear(), db.settings.clear()]);
  });
}
