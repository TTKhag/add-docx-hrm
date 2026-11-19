import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionStatus } from '@/db/types';
import { DOC_TYPE_LABEL } from '@/modules/catalog/services/catalog';
import { useProjects } from '@/modules/projects';
import { Empty, PageHeader, Section, Spinner, Stat } from '@/shared/components/ui';
import { formatDateTime } from '@/shared/utils/text';
import { StatusTag } from '../components/StatusTag';
import { useSessions } from '../hooks';
import { STATUS_LABEL } from '../services/mapping';

const FILTERS: (SessionStatus | 'all')[] = ['all', 'nhap', 'cho_ai', 'cho_duyet', 'da_duyet', 'dang_tao', 'da_tao', 'dung', 'hoan_tat'];

export default function SessionsPage() {
  const sessions = useSessions();
  const projects = useProjects();
  const [filter, setFilter] = useState<SessionStatus | 'all'>('all');
  const projectName = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects]);
  const list = (sessions ?? []).filter((s) => filter === 'all' || s.status === filter);
  const count = (st: SessionStatus[]) => (sessions ?? []).filter((s) => st.includes(s.status)).length;

  return (
    <>
      <PageHeader
        title="Phiên làm việc"
        sub="Mỗi phiên là một văn bản .docx đang được gắn key {{TenKey}} để làm mẫu trên EasyHRM."
        actions={<Link to="/phien/moi" className="btn" data-testid="session-new">Tải văn bản</Link>}
      />
      <div className="mb-7 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,210px),1fr))' }}>
        <Stat label="Tổng phiên" value={sessions?.length ?? '—'} />
        <Stat label="Chờ duyệt" value={count(['cho_duyet'])} accent={count(['cho_duyet']) ? 'warn' : undefined} />
        <Stat label="Đã duyệt / đang tạo" value={count(['da_duyet', 'dang_tao', 'dung'])} />
        <Stat label="Hoàn tất" value={count(['hoan_tat'])} accent="ok" />
      </div>
      <Section title="Danh sách">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
          {FILTERS.map((f) => (
            <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'Tất cả' : STATUS_LABEL[f]}</button>
          ))}
        </div>
        {sessions === undefined ? <Spinner label="Đang tải" /> : list.length === 0 ? (
          <Empty>{sessions.length ? 'Không có phiên ở trạng thái này.' : <>Chưa có phiên nào. Bấm <b className="text-black">Tải văn bản</b> để bắt đầu.</>}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl" data-testid="session-table">
              <thead><tr><th>Văn bản</th><th>Loại</th><th>Dự án</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/phien/${s.id}`} className="font-bold underline decoration-2 underline-offset-2">{s.fileName}</Link><div className="text-xs text-mut">{s.id}</div></td>
                    <td>{DOC_TYPE_LABEL[s.docType]}{s.decisionType && <div className="text-xs text-mut">{s.decisionType}</div>}</td>
                    <td>{projectName.get(s.projectId) ?? '—'}</td>
                    <td><StatusTag status={s.status} /></td>
                    <td className="whitespace-nowrap text-mut">{formatDateTime(s.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
