import { useLiveQuery } from 'dexie-react-hooks';
import { filesRepo, logsRepo, reportsRepo, rowsRepo, sessionsRepo } from '@/db/repositories';

export const useSessions = () => useLiveQuery(() => sessionsRepo.all(), [], undefined);
export const useSession = (id: string | undefined) => useLiveQuery(async () => (id ? (await sessionsRepo.get(id)) ?? null : null), [id], undefined);
export const useRows = (id: string | undefined) => useLiveQuery(() => (id ? rowsRepo.bySession(id) : []), [id], undefined);
export const useLogs = (id: string | undefined) => useLiveQuery(() => (id ? logsRepo.bySession(id) : []), [id], undefined);
export const useReports = (id: string | undefined) => useLiveQuery(() => (id ? reportsRepo.bySession(id) : []), [id], undefined);
export const useSessionFile = (id: string | undefined) => useLiveQuery(async () => (id ? (await filesRepo.get(id)) ?? null : null), [id], undefined);
