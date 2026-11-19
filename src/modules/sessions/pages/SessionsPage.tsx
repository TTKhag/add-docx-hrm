import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session, SessionStatus } from '@/db/types';
import { promptAnalyze, promptCreate } from '@/modules/agent';
import { DOC_TYPE_LABEL } from '@/modules/catalog/services/catalog';
import { useProjects } from '@/modules/projects';
import { copyText, Empty, PageHeader, Section, Spinner, Stat } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { formatDateTime } from '@/shared/utils/text';
import { StatusTag } from '../components/StatusTag';
import { useSessions } from '../hooks';
import { STATUS_LABEL } from '../services/mapping';
import { acceptAllProposals, approveSession, handToHrm } from '../services/session.workflow';

const FILTERS: (SessionStatus | 'all')[] = ['all', 'nhap', 'cho_ai', 'cho_duyet', 'da_duyet', 'dang_tao', 'da_tao', 'dung', 'hoan_tat'];
const byQueue = (a: Session, b: Session) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0) || a.createdAt - b.createdAt;

async function copyPrompt(text: string) {
  if (await copyText(text)) toast.ok('Đã chép câu lệnh', 'Dán vào Claude (skill easyhrm-template-studio).');
  else toast.warn('Không chép được tự động', text);
}

export default function SessionsPage() {
  const sessions = useSessions();
  const projects = useProjects();
  const [filter, setFilter] = useState<SessionStatus | 'all'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const projectName = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects]);
  const sorted = useMemo(() => [...(sessions ?? [])].sort(byQueue), [sessions]);
  const list = sorted.filter((s) => filter === 'all' || s.status === filter);
  const count = (st: SessionStatus[]) => sorted.filter((s) => st.includes(s.status)).length;
  const sel = sorted.filter((s) => picked.has(s.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const forAi = sorted.filter((s) => s.status === 'nhap' || s.status === 'cho_ai');
  const queue = sorted.filter((s) => s.handedToHrmAt && ['da_duyet', 'dung', 'dang_tao'].includes(s.status));

  /** One click for the user: accept every proposal, then write + verify the file. */
  const approveSelected = async () => {
    setBusy(true);
    let ok = 0;
    const fails: string[] = [];
    try {
      for (const s of sel.filter((x) => ['nhap', 'cho_ai', 'cho_duyet'].includes(x.status))) {
        const a = await acceptAllProposals(s.id);
        const r = await approveSession(s.id, false);
        if (r.ok) ok++;
        else fails.push(`${s.fileName}: ${a.left.length ? `${a.left.length} dòng chưa có đề xuất` : r.problems[0] ?? r.issues[0]?.message ?? 'cần xem lại'}`);
      }
      toast.ok(`Đã duyệt ${ok} phiên`, fails.length ? `Cần mở xem: ${fails.join(' · ')}` : 'Giao Claude tạo trên EasyHRM.');
    } catch (e) {
      toast.bad('Lỗi khi duyệt', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handSelected = async () => {
    const ids = sel.filter((s) => s.status === 'da_duyet' || s.status === 'dung').map((s) => s.id);
    if (!ids.length) return toast.warn('Chưa có phiên Đã duyệt trong các phiên chọn');
    const r = await handToHrm(ids);
    const pj = new Set(sel.filter((s) => r.queued.includes(s.id)).map((s) => projectName.get(s.projectId)));
    await copyPrompt(promptCreate(r.queued, pj.size === 1 ? [...pj][0] : undefined));
    if (r.refused.length) toast.warn('Một số phiên chưa giao được', r.refused.map((x) => `${x.id}: ${x.reason}`).join(' · '));
  };

  return (
    <>
      <PageHeader
        title="Phiên làm việc"
        sub="Hàng đợi văn bản. Bạn chỉ đọc lại và duyệt; Claude phân tích và tạo mẫu trên EasyHRM theo thứ tự."
        actions={<>
          {forAi.length > 0 && <button className="btn btn-ghost" onClick={() => copyPrompt(promptAnalyze(forAi.map((s) => s.id)))} data-testid="copy-analyze-all">Giao Claude phân tích ({forAi.length})</button>}
          <Link to="/phien/moi" className="btn" data-testid="session-new">Tải văn bản</Link>
        </>}
      />
      <div className="mb-7 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))' }}>
        <Stat label="Tổng phiên" value={sessions?.length ?? '—'} />
        <Stat label="Chờ AI" value={forAi.length} />
        <Stat label="Chờ duyệt" value={count(['cho_duyet'])} accent={count(['cho_duyet']) ? 'warn' : undefined} />
        <Stat label="Hàng đợi EasyHRM" value={queue.length} />
        <Stat label="Hoàn tất" value={count(['hoan_tat'])} accent="ok" />
      </div>
      <Section title="Danh sách" right={sel.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm" disabled={busy} onClick={approveSelected} data-testid="bulk-approve">Duyệt toàn bộ đề xuất ({sel.length})</button>
          <button className="btn btn-sm" disabled={busy} onClick={handSelected} data-testid="bulk-hand">Giao Claude tạo trên EasyHRM</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
        </div>
      )}>
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
              <thead><tr>
                <th><input type="checkbox" aria-label="Chọn tất cả" className="h-4 w-4" checked={list.length > 0 && list.every((s) => picked.has(s.id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(list.map((s) => s.id)) : new Set())} /></th>
                <th>#</th><th>Văn bản / tên mẫu</th><th>Loại</th><th>Dự án</th><th>Trạng thái</th><th>Cập nhật</th>
              </tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td><input type="checkbox" className="h-4 w-4" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Chọn ${s.fileName}`} /></td>
                    <td className="font-bold tabular-nums">{s.queueOrder ?? '—'}</td>
                    <td><Link to={`/phien/${s.id}`} className="font-bold underline decoration-2 underline-offset-2">{s.templateName ?? s.fileName}</Link><div className="text-xs text-mut">{s.fileName} · {s.id}</div></td>
                    <td>{DOC_TYPE_LABEL[s.docType]}{s.decisionType && <div className="text-xs text-mut">{s.decisionType}</div>}{s.mode === 'da_co_key' && <span className="tag mt-1">đã có key</span>}</td>
                    <td>{projectName.get(s.projectId) ?? '—'}</td>
                    <td><StatusTag status={s.status} />{s.handedToHrmAt && s.status !== 'da_tao' && <div className="mt-1"><span className="tag tag-ink">Đã giao Claude</span></div>}</td>
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
