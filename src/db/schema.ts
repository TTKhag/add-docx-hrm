import Dexie, { type Table } from 'dexie';
import type {
  AgentJob, Catalog, Handoff, HrmReport, KeyDictionaryEntry, LogEntry, MappingRow, Project, Session, SessionFile, Setting,
} from './types';

export const DB_NAME = 'add-docx-hrm';
export const DB_VERSION = 3;

export class StudioDB extends Dexie {
  projects!: Table<Project, string>;
  sessions!: Table<Session, string>;
  files!: Table<SessionFile, string>;
  rows!: Table<MappingRow, string>;
  catalogs!: Table<Catalog, string>;
  keyDictionary!: Table<KeyDictionaryEntry, string>;
  logs!: Table<LogEntry, number>;
  hrmReports!: Table<HrmReport, number>;
  settings!: Table<Setting, string>;
  handoffs!: Table<Handoff, string>;
  jobs!: Table<AgentJob, string>;

  constructor(name = DB_NAME) {
    super(name);
    // Never drop user data: each new version only adds indexes and back-fills fields.
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      sessions: 'id, projectId, status, updatedAt',
      files: 'sessionId',
      rows: 'id, sessionId, [sessionId+candidateId]',
      catalogs: 'id, hrmVersion, docType',
      keyDictionary: 'id, projectId',
      logs: '++id, sessionId, at',
      hrmReports: '++id, sessionId, at',
      settings: 'key',
    });
    // v2: work queue (queueOrder) + new optional fields on sessions/rows/projects.
    this.version(2)
      .stores({ sessions: 'id, projectId, status, updatedAt, queueOrder' })
      .upgrade(async (tx) => {
        const all = await tx.table<Session>('sessions').toArray();
        all.sort((a, b) => a.createdAt - b.createdAt);
        let n = 0;
        for (const s of all) {
          n++;
          await tx.table('sessions').update(s.id, { mode: s.mode ?? 'chen_key', queueOrder: s.queueOrder ?? n });
        }
      });
    // v3 (CR-2026-003): approved-file packages + Claude job queue. Row assessment and packages for already
    // approved sessions are back-filled by `upgradeV3` (needs catalogs, sha256 → done after open, see db/upgrade.ts).
    this.version(3).stores({
      handoffs: 'id, sessionId, [sessionId+active], approvedAt',
      jobs: 'id, status, createdAt',
    });
  }
}

export const db = new StudioDB();

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}
