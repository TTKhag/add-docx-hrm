import { catalogsRepo } from '@/db/repositories';
import type { Catalog, DocType } from '@/db/types';
import { catalogId, catalogImportSchema, type CatalogDiff, diffCatalog, importToCatalog, sampleCatalog } from './catalog';

export async function ensureCatalog(hrmVersion: string, docType: DocType, decisionType = ''): Promise<Catalog> {
  const id = catalogId(hrmVersion, docType, decisionType);
  const existing = await catalogsRepo.get(id);
  if (existing) return existing;
  const c = sampleCatalog(hrmVersion, docType, decisionType);
  await catalogsRepo.put(c);
  return c;
}

export type CatalogPreview =
  | { ok: true; next: Catalog; diff: CatalogDiff; isNew: boolean }
  | { ok: false; errors: { path: string; message: string }[] };

export async function previewCatalogImport(json: unknown): Promise<CatalogPreview> {
  const r = catalogImportSchema.safeParse(json);
  if (!r.success) return { ok: false, errors: r.error.issues.map((i) => ({ path: i.path.join('.') || '(gốc)', message: i.message })) };
  const next = importToCatalog(r.data);
  const prev = await catalogsRepo.get(next.id);
  return { ok: true, next, diff: diffCatalog(prev?.fields ?? [], next.fields), isNew: !prev };
}

export const saveCatalog = (c: Catalog) => catalogsRepo.put({ ...c, updatedAt: Date.now() });
export const removeCatalog = (id: string) => catalogsRepo.remove(id);
