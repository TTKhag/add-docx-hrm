import { useLiveQuery } from 'dexie-react-hooks';
import { projectsRepo, settingsRepo } from '@/db/repositories';

export const useProjects = () => useLiveQuery(() => projectsRepo.all(), [], undefined);
export const useCurrentProjectId = () => useLiveQuery(() => settingsRepo.get<string | null>('currentProjectId'), [], undefined);
export function useCurrentProject() {
  return useLiveQuery(async () => {
    const id = await settingsRepo.get<string | null>('currentProjectId');
    return id ? (await projectsRepo.get(id)) ?? null : null;
  }, [], undefined);
}
