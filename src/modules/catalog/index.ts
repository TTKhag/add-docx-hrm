import { lazy } from 'react';
export { useCatalog, useCatalogs } from './hooks';
export { catalogId, DECISION_TYPES, DOC_TYPE_LABEL, HRM_VERSIONS } from './services/catalog';
export const CatalogPage = lazy(() => import('./pages/CatalogPage'));
