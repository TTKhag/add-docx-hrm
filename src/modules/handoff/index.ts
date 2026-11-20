import type { Handoff } from '@/db/types';
import { toast } from '@/shared/components/toast';
import { mirrorHandoff } from './services/mirror';

export { createHandoff, ensureHandoff, handoffHistory } from './services/handoff';
export { clearHandoffDir, dirPermission, fsSupported, getHandoffDir, mirrorHandoff, pickHandoffDir } from './services/mirror';

/** After a successful approval (still inside the user's click): copy the package to the handoff folder if one is set. */
export async function mirrorAfterApprove(h: Handoff | undefined): Promise<void> {
  if (!h) return;
  const r = await mirrorHandoff(h, true);
  if (!r.ok && !r.skipped) toast.warn('Thư mục giao việc', r.message);
}
