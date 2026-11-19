import { useLiveQuery } from 'dexie-react-hooks';
import { catalogsRepo } from '@/db/repositories';

export const useCatalogs = () => useLiveQuery(() => catalogsRepo.all(), [], undefined);
export const useCatalog = (id: string | undefined) => useLiveQuery(() => (id ? catalogsRepo.get(id) : undefined), [id], undefined);
