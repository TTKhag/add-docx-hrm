import type { SessionStatus } from '@/db/types';
import { STATUS_LABEL } from '../services/mapping';

const CLS: Record<SessionStatus, string> = {
  nhap: 'tag', cho_ai: 'tag', cho_duyet: 'tag tag-warn', da_duyet: 'tag tag-ink', dang_tao: 'tag tag-warn',
  da_tao: 'tag tag-ink', hoan_tat: 'tag tag-ok', dung: 'tag tag-bad',
};

export function StatusTag({ status }: { status: SessionStatus }) {
  return <span className={CLS[status]} data-testid="session-status" data-status={status}>{STATUS_LABEL[status]}</span>;
}
