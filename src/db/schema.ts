import Dexie, { type Table } from 'dexie';
import type {
  Catalog, HrmReport, KeyDictionaryEntry, LogEntry, MappingRow, Project, Session, SessionFile, Setting,
} from './types';

export const DB_NAME = 'add-docx-hrm';
export const DB_VERSION = 1;

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
    // Version 1. On any schema change: add db.version(2).stores({...}).upgrade(...) — never drop user data.
    this.version(DB_VERSION).stores({
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
