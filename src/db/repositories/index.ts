import { db } from '../schema';
import type {
  Catalog, HrmReport, KeyDictionaryEntry, LogActor, LogEntry, MappingRow, Project, Session, SessionFile,
} from '../types';

// Thin data-access layer. Components never import this directly — they go through module services/hooks.

export const projectsRepo = {
  all: () => db.projects.orderBy('updatedAt').reverse().toArray(),
  get: (id: string) => db.projects.get(id),
  put: (p: Project) => db.projects.put(p),
  byName: (name: string) => db.projects.filter((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()).first(),
  async remove(id: string, withSessions: boolean) {
    await db.transaction('rw', [db.projects, db.sessions, db.files, db.rows, db.logs, db.hrmReports, db.keyDictionary, db.settings], async () => {
      if (withSessions) {
        const ids = (await db.sessions.where('projectId').equals(id).toArray()).map((s) => s.id);
        for (const sid of ids) await sessionsRepo.removeCascade(sid);
      }
      await db.keyDictionary.where('projectId').equals(id).delete();
      await db.projects.delete(id);
      const cur = await settingsRepo.get<string>('currentProjectId');
      if (cur === id) await settingsRepo.set('currentProjectId', null);
    });
  },
};

export const sessionsRepo = {
  all: () => db.sessions.orderBy('updatedAt').reverse().toArray(),
  get: (id: string) => db.sessions.get(id),
  put: (s: Session) => db.sessions.put(s),
  countByProject: (projectId: string) => db.sessions.where('projectId').equals(projectId).count(),
  async removeCascade(id: string) {
    await db.transaction('rw', [db.sessions, db.files, db.rows, db.logs, db.hrmReports], async () => {
      await db.rows.where('sessionId').equals(id).delete();
      await db.logs.where('sessionId').equals(id).delete();
      await db.hrmReports.where('sessionId').equals(id).delete();
      await db.files.delete(id);
      await db.sessions.delete(id);
    });
  },
};

export const filesRepo = {
  get: (sessionId: string) => db.files.get(sessionId),
  put: (f: SessionFile) => db.files.put(f),
};

export const rowsRepo = {
  bySession: async (sessionId: string) =>
    (await db.rows.where('sessionId').equals(sessionId).toArray()).sort(
      (a, b) => Number(a.candidateId.slice(1)) - Number(b.candidateId.slice(1)),
    ),
  put: (r: MappingRow) => db.rows.put(r),
  bulkPut: (rs: MappingRow[]) => db.rows.bulkPut(rs),
};

export const catalogsRepo = {
  all: () => db.catalogs.toArray(),
  get: (id: string) => db.catalogs.get(id),
  put: (c: Catalog) => db.catalogs.put(c),
  remove: (id: string) => db.catalogs.delete(id),
};

export const dictionaryRepo = {
  byProject: (projectId: string) => db.keyDictionary.where('projectId').equals(projectId).toArray(),
  async record(projectId: string, pairs: { fieldCode: string; key: string }[]) {
    const now = Date.now();
    await db.transaction('rw', db.keyDictionary, async () => {
      for (const { fieldCode, key } of pairs) {
        const id = `${projectId}|${fieldCode}`;
        const prev = await db.keyDictionary.get(id);
        const entry: KeyDictionaryEntry = { id, projectId, fieldCode, key, uses: (prev?.uses ?? 0) + 1, updatedAt: now };
        await db.keyDictionary.put(entry);
      }
    });
  },
};

export const logsRepo = {
  bySession: (sessionId: string) => db.logs.where('sessionId').equals(sessionId).sortBy('at'),
  add: (sessionId: string, actor: LogActor, action: string, detail?: string) =>
    db.logs.add({ sessionId, at: Date.now(), actor, action, detail } satisfies LogEntry),
};

export const reportsRepo = {
  bySession: (sessionId: string) => db.hrmReports.where('sessionId').equals(sessionId).reverse().sortBy('at'),
  add: (r: HrmReport) => db.hrmReports.add(r),
};

export const settingsRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await db.settings.get(key))?.value as T | undefined;
  },
  set: (key: string, value: unknown) => db.settings.put({ key, value }),
};
