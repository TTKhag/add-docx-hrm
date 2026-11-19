import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AgentPanel } from '@/modules/agent';
import { catalogId, DOC_TYPE_LABEL, useCatalog } from '@/modules/catalog';
import { useProjects } from '@/modules/projects';
import { Confirm, copyText, download, Empty, Field, Modal, PageHeader, Section, Spinner, Stat } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { formatDateTime } from '@/shared/utils/text';
import { DocPreview } from '../components/DocPreview';
import { MappingTable } from '../components/MappingTable';
import { StatusTag } from '../components/StatusTag';
import { useLogs, useReports, useRows, useSession, useSessionFile } from '../hooks';
import type { VerifyIssue } from '../services/docx';
import { GAP_LABEL, gapReport } from '../services/mapping';
import {
  approveAllWithField, type ApproveResult, approveSession, deleteSession, handToClaude, markActivated, updateTemplateInfo,
} from '../services/session.workflow';

const TABS = [
  { id: 'bang-ghep', label: 'Bảng ghép' },
  { id: 'ai', label: 'Khung cho AI' },
  { id: 'ket-qua', label: 'Kết quả EasyHRM' },
  { id: 'nhat-ky', label: 'Nhật ký' },
] as const;

export default function SessionPage() {
  const { id, tab = 'bang-ghep' } = useParams();
  const nav = useNavigate();
  const session = useSession(id);
  const rows = useRows(id);
  const file = useSessionFile(id);
  const projects = useProjects();
  const catalog = useCatalog(session ? catalogId(session.hrmVersion, session.docType, session.decisionType ?? '') : undefined);
  const [showPreview, setShowPreview] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [acceptWarn, setAcceptWarn] = useState(false);
  const [editInfo, setEditInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmActivated, setConfirmActivated] = useState(false);

  if (session === undefined || rows === undefined) return <Spinner label="Đang tải phiên" />;
  if (session === null) return <Empty>Không tìm thấy phiên. <Link to="/" className="font-bold text-black underline">Về danh sách</Link></Empty>;

  const project = projects?.find((p) => p.id === session.projectId);
  const fields = catalog?.fields ?? [];
  const locked = ['dang_tao', 'da_tao', 'hoan_tat'].includes(session.status);
  const editable = ['nhap', 'cho_ai', 'cho_duyet'].includes(session.status);
  const pending = rows.filter((r) => r.status === 'cho').length;
  const approved = rows.filter((r) => r.status === 'duyet').length;
  const gaps = gapReport(rows);

  const agentUrl = `${location.origin}${location.pathname}#/phien/${session.id}/ai`;
  const prompt = `Dùng skill easyhrm-template-studio. Mở Template Studio tại ${agentUrl} và làm phiên ${session.id}.`;

  const giveToClaude = async () => {
    await handToClaude(session.id);
    const ok = await copyText(prompt);
    if (ok) toast.ok('Đã chép câu lệnh', 'Dán vào Claude (đã cài skill easyhrm-template-studio).');
    else toast.warn('Không chép được tự động', prompt);
  };

  const runApprove = async (accept = false) => {
    setApproving(true);
    try {
      const r = await approveSession(session.id, accept);
      setApproveResult(r);
      setAcceptWarn(false);
      if (r.ok) toast.ok('Đã duyệt phiên', `${r.keys.length} key. Tải .docx hoặc giao Claude tạo mẫu trên EasyHRM.`);
    } catch (e) {
      toast.bad('Không duyệt được', errorMessage(e));
    } finally {
      setApproving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={session.fileName}
        sub={<span className="flex flex-wrap items-center gap-2"><StatusTag status={session.status} /> {DOC_TYPE_LABEL[session.docType]}{session.decisionType ? ` · ${session.decisionType}` : ''} · {project?.name ?? '—'} · EasyHRM {session.hrmVersion}</span>}
        actions={<>
          {editable && <button className="btn btn-ghost" onClick={giveToClaude} data-testid="give-to-claude">Giao cho Claude</button>}
          {editable && <button className="btn" onClick={() => runApprove(false)} disabled={approving} data-testid="approve-session">{approving ? 'Đang kiểm tra' : 'Duyệt phiên'}</button>}
          {file?.output && <button className="btn" onClick={() => download(file.output!, file.outputName ?? 'mau_TenKey.docx')} data-testid="download-output">Tải .docx</button>}
          {session.status === 'da_tao' && <button className="btn" onClick={() => setConfirmActivated(true)}>Đã bật Hiệu lực</button>}
        </>}
      />

      {catalog && !catalog.verified && (
        <div className="panel panel-warn mb-4"><b>Danh mục trường đang là bản mẫu, chưa đối chiếu EasyHRM.</b> Tên trường có thể khác thực tế — đồng bộ ở <Link to="/danh-muc" className="font-bold text-black underline">Danh mục trường</Link> trước khi tạo mẫu thật.</div>
      )}
      {session.status === 'cho_duyet' && <div className="panel mb-4"><b>Đang chờ bạn duyệt.</b> Claude sẽ không sang EasyHRM cho tới khi phiên được duyệt.</div>}
      {session.status === 'da_tao' && <div className="panel panel-ok mb-4"><b>Đã tạo trên EasyHRM.</b> Mở mẫu, bấm Xem trước, rồi tự bật Hiệu lực. Claude không làm bước này.</div>}

      <div className="mb-6 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))' }}>
        <Stat label="Chỗ cần điền" value={rows.length} />
        <Stat label="Chờ quyết định" value={pending} accent={pending ? 'warn' : 'ok'} />
        <Stat label="Đã duyệt" value={approved} />
        <Stat label="Tham số thiếu" value={gaps.length} accent={gaps.length ? 'bad' : undefined} />
      </div>

      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Mẫu trên EasyHRM</div>
          <div className="font-bold">{session.templateCode ? `${session.templateCode} · ` : ''}{session.templateName ?? '—'}</div>
        </div>
        <div className="flex gap-2">
          <button className="chip" onClick={() => setEditInfo(true)}>Sửa mã / tên mẫu</button>
          <button className="chip" onClick={() => setConfirmDelete(true)}>Xóa phiên</button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b-2 border-black" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} to={`/phien/${session.id}/${t.id}`} role="tab" aria-selected={tab === t.id} data-testid={`tab-${t.id}`}
            className={`-mb-[2px] border-2 border-b-0 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[.12em] ${tab === t.id ? 'border-black bg-black text-white' : 'border-transparent hover:border-black'}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'bang-ghep' && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            {editable && <button className="btn btn-ghost btn-sm" onClick={async () => toast.info('Đã duyệt', `${await approveAllWithField(session.id)} dòng đã có trường`)} data-testid="approve-all">Duyệt các dòng đã có trường</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview((v) => !v)} data-testid="toggle-preview">{showPreview ? 'Ẩn xem trước' : 'Hiện xem trước'}</button>
          </div>
          <div className={`grid gap-[22px] ${showPreview ? 'xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}>
            {showPreview && file && <Section title="Xem trước"><DocPreview file={file.original} rows={rows} /></Section>}
            <Section title="Bảng ghép">
              {rows.length ? <MappingTable rows={rows} fields={fields} locked={locked} /> : <Empty>Không dò thấy chỗ cần điền nào. Kiểm tra văn bản có dấu "……", "____", [ ] hoặc giá trị mẫu.</Empty>}
            </Section>
          </div>
          <Section title="Tham số thiếu">
            {gaps.length ? (
              <div className="overflow-x-auto">
                <table className="tbl" data-testid="gap-table">
                  <thead><tr><th>#</th><th>Nhóm</th><th>Tên / key</th><th>Ghi chú</th><th>Đề xuất</th></tr></thead>
                  <tbody>{gaps.map((g) => (
                    <tr key={g.candidateId}><td className="font-bold">{g.candidateId}</td><td><span className="tag tag-bad">{GAP_LABEL[g.group]}</span></td><td>{g.label ?? '—'}{g.key && <div className="font-mono text-xs">{`{{${g.key}}}`}</div>}</td><td className="text-mut">{g.note ?? '—'}</td><td>{g.suggestion}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="panel panel-ok"><b>Không có tham số thiếu.</b></div>}
          </Section>
        </>
      )}

      {tab === 'ai' && <AgentPanel sessionId={session.id} prompt={prompt} />}
      {tab === 'ket-qua' && <ReportsTab sessionId={session.id} />}
      {tab === 'nhat-ky' && <LogsTab sessionId={session.id} />}

      <ApproveDialog result={approveResult} accept={acceptWarn} setAccept={setAcceptWarn} busy={approving}
        onRetry={() => runApprove(true)} onClose={() => setApproveResult(null)} />

      {editInfo && <TemplateInfoDialog open={editInfo} onClose={() => setEditInfo(false)} code={session.templateCode ?? ''} name={session.templateName ?? ''}
        onSave={async (c, n) => { await updateTemplateInfo(session.id, c, n); setEditInfo(false); toast.ok('Đã lưu'); }} />}

      <Confirm open={confirmDelete} title="Xóa phiên" danger confirmLabel="Xóa phiên" onClose={() => setConfirmDelete(false)}
        body={<>Xóa phiên <b>{session.fileName}</b> cùng file gốc, bảng ghép, nhật ký? Mẫu đã tạo trên EasyHRM (nếu có) không bị ảnh hưởng.</>}
        onConfirm={async () => { await deleteSession(session.id); toast.ok('Đã xóa phiên'); nav('/'); }} />
      <Confirm open={confirmActivated} title="Xác nhận" confirmLabel="Đã bật" onClose={() => setConfirmActivated(false)}
        body="Bạn đã tự xem trước và bật Hiệu lực cho mẫu trên EasyHRM?"
        onConfirm={async () => { try { await markActivated(session.id); toast.ok('Phiên hoàn tất'); } catch (e) { toast.bad('Lỗi', errorMessage(e)); } }} />
    </>
  );
}

function ApproveDialog({ result, accept, setAccept, busy, onRetry, onClose }: { result: ApproveResult | null; accept: boolean; setAccept: (v: boolean) => void; busy: boolean; onRetry: () => void; onClose: () => void }) {
  if (!result || result.ok) return null;
  const errors = result.issues.filter((i) => i.level === 'loi');
  const warns = result.issues.filter((i) => i.level === 'canh_bao');
  return (
    <Modal title="Chưa duyệt được" open onClose={onClose} wide footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Đóng</button>
      {!result.problems.length && !errors.length && warns.length > 0 && <button className="btn" disabled={!accept || busy} onClick={onRetry} data-testid="approve-accept">Duyệt dù có cảnh báo</button>}
    </>}>
      {result.problems.length > 0 && (<><div className="label mb-2">Cần xử lý trong bảng ghép</div><ul className="mb-4 list-inside list-disc text-[13px]">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul></>)}
      <IssueList title="Lỗi trong file xuất" items={errors} />
      <IssueList title="Cảnh báo dữ liệu cá nhân" items={warns} />
      {!result.problems.length && !errors.length && warns.length > 0 && (
        <label className="mt-3 flex items-start gap-2 text-[13px]"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 h-4 w-4" data-testid="approve-accept-check" />Tôi đã kiểm tra, các giá trị trên không phải dữ liệu cá nhân thật (hoặc là nội dung cố định của mẫu).</label>
      )}
    </Modal>
  );
}

function IssueList({ title, items }: { title: string; items: VerifyIssue[] }) {
  if (!items.length) return null;
  return (<><div className="label mb-2">{title}</div><ul className="mb-4 list-inside list-disc text-[13px]">{items.map((i, n) => <li key={n}>{i.message}</li>)}</ul></>);
}

function TemplateInfoDialog({ open, onClose, code, name, onSave }: { open: boolean; onClose: () => void; code: string; name: string; onSave: (c: string, n: string) => void }) {
  const [c, setC] = useState(code);
  const [n, setN] = useState(name);
  const codeErr = c.length > 20 ? 'Tối đa 20 ký tự' : undefined;
  const nameErr = n.length > 255 ? 'Tối đa 255 ký tự' : undefined;
  return (
    <Modal title="Mã / tên mẫu" open={open} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Huỷ</button>
      <button className="btn" disabled={!!codeErr || !!nameErr} onClick={() => onSave(c, n)}>Lưu</button>
    </>}>
      <Field label="Mã mẫu" error={codeErr} hint="Để trống: dùng mã EasyHRM gợi ý (HD…, MQD…)."><input className="input" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      <Field label="Tên mẫu" error={nameErr}><input className="input" value={n} onChange={(e) => setN(e.target.value)} /></Field>
    </Modal>
  );
}

function ReportsTab({ sessionId }: { sessionId: string }) {
  const reports = useReports(sessionId);
  if (!reports) return <Spinner />;
  if (!reports.length) return <Empty>Chưa có báo cáo. Claude ghi báo cáo sau khi thao tác trên EasyHRM.</Empty>;
  const OUT = { thanh_cong: ['Thành công', 'tag-ok'], dung_giua_chung: ['Dừng giữa chừng', 'tag-warn'], that_bai: ['Thất bại', 'tag-bad'] } as const;
  return (
    <div className="grid gap-4" data-testid="hrm-reports">
      {reports.map((r) => (
        <div key={r.id} className="card">
          <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`tag ${OUT[r.outcome][1]}`}>{OUT[r.outcome][0]}</span><span className="text-mut">{formatDateTime(r.at)}</span>{r.skillVersion && <span className="tag">skill {r.skillVersion}</span>}{r.templateCode && <span className="font-bold">{r.templateCode}</span>}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <List title="Claude đã làm" items={r.steps} />
            <List title="Người dùng làm thay" items={r.userSteps} />
            <List title="Key đã ghép" items={r.mappedKeys.map((k) => `{{${k}}}`)} />
            <List title="Key chưa ghép" items={r.unmappedKeys.map((k) => `{{${k}}}`)} />
          </div>
          {r.hrmMessages.length > 0 && <div className="panel mt-3"><b>Thông báo EasyHRM:</b> {r.hrmMessages.join(' · ')}</div>}
        </div>
      ))}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (<div><div className="label mb-1">{title}</div>{items.length ? <ul className="list-inside list-disc text-[13px]">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <div className="text-mut">—</div>}</div>);
}

function LogsTab({ sessionId }: { sessionId: string }) {
  const logs = useLogs(sessionId);
  if (!logs) return <Spinner />;
  const ACTOR = { ai: 'AI', nguoi_dung: 'Người dùng', he_thong: 'Hệ thống' } as const;
  return (
    <table className="tbl" data-testid="log-table">
      <thead><tr><th>Thời điểm</th><th>Ai</th><th>Việc</th><th>Chi tiết</th></tr></thead>
      <tbody>{[...logs].reverse().map((l) => (
        <tr key={l.id}><td className="whitespace-nowrap text-mut">{formatDateTime(l.at)}</td><td><span className={`tag ${l.actor === 'ai' ? 'tag-ink' : ''}`}>{ACTOR[l.actor]}</span></td><td className="font-bold">{l.action}</td><td className="text-[13px]">{l.detail}</td></tr>
      ))}</tbody>
    </table>
  );
}
