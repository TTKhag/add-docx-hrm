import { lazy } from 'react';
export { useProjects, useCurrentProject, useCurrentProjectId } from './hooks';
export { setCurrentProject } from './services/projects.workflow';
export const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
