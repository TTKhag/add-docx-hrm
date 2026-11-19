import Dexie, { type Table } from 'dexie';
import type {
  Catalog, HrmReport, KeyDictionaryEntry, LogEntry, MappingRow, Project, Session, SessionFile, Setting,
} from './types';

export const DB_NAME = 'add-docx-hrm';
export const DB_VERSION = 2;

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
