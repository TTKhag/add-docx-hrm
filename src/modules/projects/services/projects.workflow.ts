import { projectsRepo, sessionsRepo, settingsRepo } from '@/db/repositories';
import type { Project } from '@/db/types';
import { uid } from '@/shared/utils/text';
import { type FieldErrors, type ProjectInput, validateProjectInput } from './validate';

export async function saveProject(input: ProjectInput, id?: string): Promise<{ ok: true; project: Project } | { ok: false; errors: FieldErrors }> {
  const v = validateProjectInput(input);
  if (!v.ok) return v;
  const dup = await projectsRepo.byName(v.value.name);
  if (dup && dup.id !== id) return { ok: false, errors: { name: 'Đã có dự án cùng tên' } };
  const now = Date.now();
  const prev = id ? await projectsRepo.get(id) : undefined;
  const project: Project = {
    id: prev?.id ?? uid('p_'),
    name: v.value.name,
    url: v.value.url,
    mst: v.value.mst || undefined,
    username: v.value.username,
    hrmVersion: v.value.hrmVersion,
    note: v.value.note || undefined,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  await projectsRepo.put(project);
  if (!(await settingsRepo.get<string>('currentProjectId'))) await settingsRepo.set('currentProjectId', project.id);
  return { ok: true, project };
}

export async function deleteProject(id: string, withSessions: boolean) {
  await projectsRepo.remove(id, withSessions);
}

export const setCurrentProject = (id: string | null) => settingsRepo.set('currentProjectId', id);

export async function getCurrentProject(): Promise<Project | undefined> {
  const id = await settingsRepo.get<string>('currentProjectId');
  return id ? projectsRepo.get(id) : undefined;
}

export const countSessions = (projectId: string) => sessionsRepo.countByProject(projectId);

/** Export without any secret (there is none stored, but keep the shape explicit). */
export function projectsToJson(projects: Project[]): string {
  return JSON.stringify({ kind: 'easyhrm-studio-projects', version: 1, projects }, null, 2);
}
