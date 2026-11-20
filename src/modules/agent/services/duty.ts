import { jobsRepo, logsRepo, settingsRepo } from '@/db/repositories';
import type { AgentJob, DutyState, JobKind } from '@/db/types';
import { uid } from '@/shared/utils/text';

/**
 * CR-2026-003 Y3 — "Claude trực". The user sends ONE duty prompt per work shift (it carries the consent, BR-21);
 * then every "Giao Claude" click only drops {kind, sessionIds} into `jobs`, which Claude polls with waitForJob.
 * Jobs carry no instruction; Claude re-checks each session with getTask.
 */

export const DUTY_KEY = 'claudeDuty';
export const HEARTBEAT_FRESH_MS = 60_000;
export const IDLE_STOP_MS = 30 * 60_000;
export const STALE_JOB_MS = 30 * 60_000;
export const WAIT_MAX_MS = 25_000;
export const DUTY_DEFAULT_HOURS = 4;
export const DUTY_MAX_HOURS = 8;

export const JOB_LABEL: Record<JobKind, string> = { phan_tich: 'Phân tích', tao_hrm: 'Tạo trên EasyHRM' };

/** Pure: is Claude on duty right now? */
export function isOnDuty(d: DutyState | undefined | null, now = Date.now()): boolean {
  return !!d && !d.stoppedAt && now < d.until && now - d.heartbeatAt <= HEARTBEAT_FRESH_MS;
}

export const getDuty = () => settingsRepo.get<DutyState>(DUTY_KEY);

/** Studio side: the user handed work to Claude. Same kind + same sessions still waiting → not duplicated. */
export async function enqueueJob(kind: JobKind, sessionIds: string[]): Promise<AgentJob> {
  const waiting = await jobsRepo.byStatus('cho');
  const key = [...sessionIds].sort().join(',');
  const dup = waiting.find((j) => j.kind === kind && [...j.sessionIds].sort().join(',') === key);
  if (dup) return dup;
  const job: AgentJob = { id: uid('j_'), kind, sessionIds, status: 'cho', createdAt: Date.now() };
  await jobsRepo.put(job);
  for (const id of sessionIds) await logsRepo.add(id, 'nguoi_dung', `Giao Claude: ${JOB_LABEL[kind]}`, `Việc ${job.id}`);
  return job;
}

export async function cancelJob(id: string): Promise<void> {
  const j = await jobsRepo.get(id);
  if (j && (j.status === 'cho' || j.status === 'dang_lam')) await jobsRepo.put({ ...j, status: 'huy', doneAt: Date.now(), note: 'Người dùng huỷ' });
}

export async function startDuty(opts: { hours?: number; consentSave?: boolean; skillVersion?: string } = {}): Promise<DutyState> {
  const now = Date.now();
  const hours = Math.min(Math.max(opts.hours ?? DUTY_DEFAULT_HOURS, 0.25), DUTY_MAX_HOURS);
  const d: DutyState = { startedAt: now, until: now + hours * 3_600_000, heartbeatAt: now, consentSave: !!opts.consentSave, skillVersion: opts.skillVersion };
  await settingsRepo.set(DUTY_KEY, d);
  return d;
}

export async function stopDuty(): Promise<DutyState | undefined> {
  const d = await getDuty();
  if (!d) return undefined;
  const next = { ...d, stoppedAt: Date.now() };
  await settingsRepo.set(DUTY_KEY, next);
  return next;
}

async function beat(d: DutyState, patch: Partial<DutyState> = {}): Promise<DutyState> {
  const next = { ...d, heartbeatAt: Date.now(), ...patch };
  await settingsRepo.set(DUTY_KEY, next);
  return next;
}

/** BR-24: a job "Đang làm" for too long was abandoned (Claude lost the browser) → back to "Chờ". */
export async function requeueStale(now = Date.now()): Promise<number> {
  const running = await jobsRepo.byStatus('dang_lam');
  let n = 0;
  for (const j of running) {
    if (now - (j.takenAt ?? j.createdAt) > STALE_JOB_MS) {
      await jobsRepo.put({ ...j, status: 'cho', takenAt: undefined, note: 'Trả lại hàng việc: quá 30 phút không hoàn tất' });
      n++;
    }
  }
  return n;
}

export type WaitOutcome =
  | { kind: 'job'; job: AgentJob }
  | { kind: 'idle' }
  | { kind: 'stop'; reason: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Claude side: wait up to `timeoutMs` for the oldest waiting job; takes it ("Đang làm"). */
export async function waitForJob(timeoutMs = WAIT_MAX_MS, pollMs = 1000): Promise<WaitOutcome> {
  let d = await getDuty();
  if (!d || d.stoppedAt) throw new DutyError('Chưa bắt đầu trực — gọi startDuty trước.');
  const end = Date.now() + Math.max(0, Math.min(timeoutMs, WAIT_MAX_MS));
  await requeueStale();
  for (;;) {
    const now = Date.now();
    if (now >= d.until) {
      await stopDuty();
      return { kind: 'stop', reason: 'Hết thời hạn trực người dùng đã cho.' };
    }
    const next = (await jobsRepo.byStatus('cho'))[0];
    if (next) {
      const taken: AgentJob = { ...next, status: 'dang_lam', takenAt: now };
      await jobsRepo.put(taken);
      await beat(d, { lastJobAt: now });
      return { kind: 'job', job: taken };
    }
    if (now - Math.max(d.startedAt, d.lastJobAt ?? 0) > IDLE_STOP_MS && !(await jobsRepo.byStatus('dang_lam')).length) {
      await stopDuty();
      return { kind: 'stop', reason: '30 phút liên tục không có việc — tự dừng trực.' };
    }
    d = await beat(d);
    if (Date.now() + pollMs > end) return { kind: 'idle' };
    await sleep(pollMs);
  }
}

export class DutyError extends Error {}

export async function completeJob(id: string, note?: string): Promise<AgentJob> {
  const j = await jobsRepo.get(id);
  if (!j || j.status !== 'dang_lam') throw new DutyError(`Việc ${id} không ở trạng thái Đang làm.`);
  const done: AgentJob = { ...j, status: 'xong', doneAt: Date.now(), note: note?.slice(0, 500) };
  await jobsRepo.put(done);
  const d = await getDuty();
  if (d && !d.stoppedAt) await beat(d, { lastJobAt: Date.now() });
  return done;
}
