import { catalogsRepo, rowsRepo, sessionsRepo, settingsRepo } from '@/db/repositories';
import { catalogId } from '@/modules/catalog/services/catalog';
import { ensureHandoff } from '@/modules/handoff/services/handoff';
import { ensureAssessed } from '@/modules/sessions/services/assess';

const FLAG = 'backfillV3Done';

/**
 * Dexie v3 back-fill (CR-2026-003), run once after the DB opens (needs catalogs + SHA-256, which a Dexie
 * upgrade transaction cannot await): (1) rows without a conclusion get a Studio assessment,
 * (2) approved sessions get their approved-file package. Never deletes anything.
 */
export async function backfillV3(force = false): Promise<{ rows: number; packages: number }> {
  if (!force && (await settingsRepo.get<boolean>(FLAG))) return { rows: 0, packages: 0 };
  let rowsChanged = 0;
  let packages = 0;
  for (const s of await sessionsRepo.all()) {
    if (['nhap', 'cho_ai', 'cho_duyet'].includes(s.status)) {
      const catalog = await catalogsRepo.get(catalogId(s.hrmVersion, s.docType, s.decisionType ?? ''));
      const r = ensureAssessed(await rowsRepo.bySession(s.id), new Set((catalog?.fields ?? []).map((f) => f.code)));
      if (r.changed) {
        await rowsRepo.bulkPut(r.rows);
        rowsChanged += r.changed;
      }
    } else {
      try {
        if (await ensureHandoff(s.id)) packages++;
      } catch { /* session without output — nothing to freeze */ }
    }
  }
  await settingsRepo.set(FLAG, true);
  return { rows: rowsChanged, packages };
}
