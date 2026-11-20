import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { jobsRepo, settingsRepo } from '@/db/repositories';
import type { DutyState, JobKind } from '@/db/types';
import { copyText } from '@/shared/components/ui';
import { toast } from '@/shared/components/toast';
import { DUTY_KEY, enqueueJob, getDuty, isOnDuty } from './services/duty';
import { claudeLink, type ClaudeOpenMode, promptDuty } from './services/prompts';

export const OPEN_MODE_KEY = 'claudeOpenMode';

/** Duty state + a 10 s tick so "đang trực" turns off by itself when the heartbeat stops. */
export function useDuty(): { duty: DutyState | undefined; onDuty: boolean } {
  const duty = useLiveQuery(() => settingsRepo.get<DutyState>(DUTY_KEY), []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return { duty, onDuty: isOnDuty(duty, now) };
}

export const useJobs = () => useLiveQuery(async () => (await jobsRepo.all()).reverse().slice(0, 30), [], undefined);
export const useOpenMode = () => useLiveQuery(async () => (await settingsRepo.get<ClaudeOpenMode>(OPEN_MODE_KEY)) ?? 'desktop', [], 'desktop' as ClaudeOpenMode);

/** Open Claude with the duty prompt prefilled (and copy it as a fallback). */
export async function openClaudeForDuty(): Promise<void> {
  const mode = (await settingsRepo.get<ClaudeOpenMode>(OPEN_MODE_KEY)) ?? 'desktop';
  const prompt = promptDuty();
  const copied = await copyText(prompt);
  if (mode === 'copy') {
    toast[copied ? 'ok' : 'warn'](copied ? 'Đã chép câu lệnh trực' : 'Hãy chép câu lệnh trực', copied ? 'Dán vào Claude một lần cho cả ca làm việc.' : prompt);
    return;
  }
  const url = claudeLink(prompt, mode);
  if (mode === 'desktop') window.location.href = url;
  else window.open(url, '_blank', 'noopener');
  toast.info('Đang mở Claude', 'Câu lệnh trực đã điền sẵn — bấm Gửi một lần. Các lần Giao Claude sau không cần làm gì thêm.');
}

/**
 * CR-2026-003 FR-41…44 — what every "Giao Claude" button does: queue the job; if Claude is on duty that's all,
 * otherwise open Claude with the duty prompt prefilled (one Send for the whole shift).
 */
export async function handOffToClaude(kind: JobKind, sessionIds: string[]): Promise<void> {
  if (!sessionIds.length) return;
  await enqueueJob(kind, sessionIds);
  if (isOnDuty(await getDuty())) {
    toast.ok('Claude đã nhận việc', `${sessionIds.length} phiên — Claude đang trực sẽ làm ngay, bạn không cần thao tác gì.`);
    return;
  }
  await openClaudeForDuty();
}
