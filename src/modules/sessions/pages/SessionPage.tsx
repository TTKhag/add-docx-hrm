import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContractClass, DocType, Session } from '@/db/types';
import { AgentPanel, handOffToClaude, promptAnalyze, useDuty } from '@/modules/agent';
import { handoffHistory, mirrorAfterApprove } from '@/modules/handoff';
import { useLiveQuery } from 'dexie-react-hooks';
import { catalogId, DOC_TYPE_LABEL, useCatalog } from '@/modules/catalog';
import { DECISION_TYPES } from '@/modules/catalog/services/catalog';
import { useProjects } from '@/modules/projects';
import { Confirm, download, Empty, Field, Modal, PageHeader, Section, Spinner, Stat } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { formatDateTime } from '@/shared/utils/text';
import { DocPreview } from '../components/DocPreview';
import { MappingTable, needsAttention } from '../components/MappingTable';
import { StatusTag } from '../components/StatusTag';
import { useLogs, useReports, useRows, useSession, useSessionFile } from '../hooks';
import type { VerifyIssue } from '../services/docx';
import { extraFieldRows, GAP_LABEL, gapReport, KIND_LABEL } from '../services/mapping';
import {
  approveAllAndExport, type ApproveResult, approveSession, deleteSession, handToClaude, handToHrm, markActivated,
  updateSessionMeta, updateTemplateInfo,
} from '../services/session.workflow';

const CONTRACT_CLASS: Record<ContractClass, string> = {
  xac_dinh: 'Xác định thời hạn', khong_xac_dinh: 'Không xác định thời hạn', thu_viec: 'Thử việc', cong_tac_vien: 'Cộng tác viên', khac: 'Hợp đồng khác',
};
const META_SOURCE = { quy_tac: 'Studio tự nhận', ai: 'AI đã kiểm', nguoi_dung: 'Bạn đã sửa' } as const;

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
  const [editMeta, setEditMeta] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmActivated, setConfirmActivated] = useState(false);
  const { onDuty } = useDuty();
  const packages = useLiveQuery(() => (id ? handoffHistory(id) : []), [id]);

  if (session === undefined || rows === undefined) return <Spinner label="Đang tải phiên" />;
  if (session === null) return <Empty>Không tìm thấy phiên. <Link to="/" className="font-bold text-black underline">Về danh sách</Link></Empty>;

  const project = projects?.find((p) => p.id === session.projectId);
  const fields = catalog?.fields ?? [];
  const locked = ['dang_tao', 'da_tao', 'hoan_tat'].includes(session.status);
  const editable = ['nhap', 'cho_ai', 'cho_duyet'].includes(session.status);
  const pending = rows.filter((r) => r.status === 'cho').length;
  const approved = rows.filter((r) => r.status === 'duyet').length;
  const gaps = gapReport(rows);
  const extras = extraFieldRows(rows);
  const attention = rows.filter(needsAttention).length;
  const activePkg = packages?.find((h) => h.active === 1);

  const prompt = promptAnalyze([session.id]);
  const canHandHrm = session.status === 'da_duyet' || session.status === 'dung';

  /** CR-2026-003 Y3: queue the job; Claude on duty takes it, otherwise Claude opens with the duty prompt prefilled. */
  const giveToClaude = async () => {
    await handToClaude(session.id);
    await handOffToClaude('phan_tich', [session.id]);
  };
  const giveToHrm = async () => {
    const r = await handToHrm([session.id]);
    if (!r.queued.length) return toast.bad('Chưa giao được', r.refused[0]?.reason);
    await handOffToClaude('tao_hrm', [session.id]);
  };
  /** FR-39: one click — approve every key, write + verify the file, freeze the package (+ handoff folder). */
  const acceptAndApprove = async () => {
    setApproving(true);
    try {
      const r = await approveAllAndExport(session.id, false);
      setApproveResult(r);
      if (r.ok) {
        toast.ok('Đã duyệt phiên', `${r.accepted.approved} duyệt, ${r.accepted.skipped} bỏ · ${r.keys.length} key · đã lưu gói giao việc. Bấm Giao Claude tạo trên EasyHRM.`);
        await mirrorAfterApprove(r.handoff);
      }
    } catch (e) {
      toast.bad('Không duyệt được', errorMessage(e));
    } finally {
      setApproving(false);
    }
  };

  const runApprove = async (accept = false) => {
    setApproving(true);
    try {
      const r = await approveSession(session.id, accept);
      setApproveResult(r);
      setAcceptWarn(false);
      if (r.ok) {
        toast.ok('Đã duyệt phiên', `${r.keys.length} key · đã lưu gói giao việc. Giao Claude tạo mẫu trên EasyHRM.`);
        await mirrorAfterApprove(r.handoff);
      }
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
          {editable && <button className="btn btn-ghost" onClick={giveToClaude} data-testid="give-to-claude">Giao Claude phân tích</button>}
          {editable && <button className="btn" onClick={acceptAndApprove} disabled={approving} data-testid="accept-approve">{approving ? 'Đang kiểm tra' : 'Duyệt toàn bộ & xuất tệp'}</button>}
          {canHandHrm && <button className="btn" onClick={giveToHrm} data-testid="give-to-hrm">{session.handedToHrmAt ? 'Giao lại Claude' : 'Giao Claude tạo trên EasyHRM'}</button>}
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
        <Stat label="Cần bạn để ý" value={attention} accent={attention ? 'warn' : 'ok'} />
        <Stat label="Tham số EasyHRM chưa có" value={gaps.length} accent={gaps.length ? 'bad' : undefined} />
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid flex-1 gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))' }}>
            <div><div className="label">Mẫu trên EasyHRM</div><div className="font-bold">{session.templateCode ? `${session.templateCode} · ` : ''}{session.templateName ?? '—'}</div></div>
            <div><div className="label">Loại</div><div>{DOC_TYPE_LABEL[session.docType]}{session.docType === 'quyet_dinh' && <> · {session.decisionType ?? <span className="tag tag-warn">chưa rõ loại QĐ</span>}</>}</div></div>
            {session.docType !== 'quyet_dinh' && <div><div className="label">Phân loại HĐ</div><div>{session.docMeta?.contractClass ? CONTRACT_CLASS[session.docMeta.contractClass] : '—'}{session.docMeta?.termMonths ? ` · ${session.docMeta.termMonths} tháng` : ''}</div></div>}
            {session.docType !== 'quyet_dinh' && <div><div className="label">Người ký công ty</div><div>{session.signing?.companySignerName ?? session.signing?.companyTitle ?? project?.signerDefaults?.companySignerName ?? '—'}{session.signing?.companyAnchor && <div className="text-xs text-mut">Mốc: {session.signing.companyAnchor}</div>}</div></div>}
            <div><div className="label">Chế độ</div><div>{session.mode === 'da_co_key' ? 'Tệp đã có key' : 'Chèn key'}</div></div>
            <div data-testid="handoff-info"><div className="label">Gói giao việc</div>{activePkg ? <div>Phiên bản {activePkg.version} · {(activePkg.size / 1024).toFixed(0)} KB<div className="text-xs text-mut break-all">{activePkg.mirroredPath ? `Trên máy: ${activePkg.mirroredPath}` : 'Trong trình duyệt (chưa có thư mục giao việc)'}</div></div> : <div className="text-mut">Chưa có — tạo khi Duyệt phiên</div>}</div>
            <div><div className="label">Claude</div><div>{onDuty ? <span className="tag tag-ok">Đang trực</span> : <span className="tag">Chưa trực</span>}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {session.docMeta && <span className="tag">{META_SOURCE[session.docMeta.source]}</span>}
            {editable && <button className="chip" onClick={() => setEditMeta(true)} data-testid="edit-meta">Sửa thông tin mẫu</button>}
            <button className="chip" onClick={() => setEditInfo(true)}>Sửa mã mẫu</button>
            <button className="chip" onClick={() => setConfirmDelete(true)}>Xóa phiên</button>
          </div>
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
            {editable && <button className="btn btn-ghost btn-sm" onClick={() => runApprove(false)} disabled={approving} data-testid="approve-session">Duyệt phiên (theo bảng hiện tại)</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview((v) => !v)} data-testid="toggle-preview">{showPreview ? 'Ẩn xem trước' : 'Hiện xem trước'}</button>
          </div>
          <div className={`grid gap-[22px] ${showPreview ? 'xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}>
            {showPreview && file && <Section title="Xem trước"><DocPreview file={file.original} rows={rows} /></Section>}
            <Section title="Bảng ghép">
              {rows.length ? <MappingTable sessionId={session.id} rows={rows} fields={fields} locked={locked} /> : <Empty>Không dò thấy chỗ cần điền nào. Kiểm tra văn bản có dấu "……", "____", [ ] hoặc giá trị mẫu.</Empty>}
            </Section>
          </div>
          <Section title={`${KIND_LABEL.bo_sung} (${extras.length})`}>
            {extras.length ? (
              <div className="overflow-x-auto">
                <table className="tbl" data-testid="extra-table">
                  <thead><tr><th>#</th><th>Tên trường</th><th>Key</th><th>Do</th><th>Trạng thái</th></tr></thead>
                  <tbody>{extras.map((r) => (
                    <tr key={r.id}><td className="font-bold">{r.candidateId}</td><td>{r.extraLabel}</td><td className="font-mono text-xs">{`{{${r.key ?? r.fixedKey ?? r.fieldCode?.slice(6) ?? ''}}}`}</td><td>{r.assessedBy === 'studio' ? 'Studio đánh giá' : r.assessedBy === 'ai' ? 'AI' : 'Người dùng / quy tắc'}</td><td>{r.status === 'duyet' ? 'Đã duyệt' : 'Chờ'}</td></tr>
                  ))}</tbody>
                </table>
                <p className="mt-2 text-xs text-mut">Claude tạo các trường này ở "Thêm tham số khác → Trường giá trị bổ sung" khi lập mẫu; giá trị được nhập khi lập từng văn bản.</p>
              </div>
            ) : <div className="panel"><b>Không có trường giá trị bổ sung.</b></div>}
          </Section>
          <Section title={`${KIND_LABEL.chua_co} (${gaps.length})`}>
            {gaps.length ? (
              <div className="overflow-x-auto">
                <table className="tbl" data-testid="gap-table">
                  <thead><tr><th>#</th><th>Nhóm</th><th>Tên / key</th><th>Ghi chú</th><th>Đề xuất</th></tr></thead>
                  <tbody>{gaps.map((g) => (
                    <tr key={g.candidateId}><td className="font-bold">{g.candidateId}</td><td><span className="tag tag-bad">{GAP_LABEL[g.group]}</span></td><td>{g.label ?? '—'}{g.key && <div className="font-mono text-xs">{`{{${g.key}}}`}</div>}</td><td className="text-mut">{g.note ?? '—'}</td><td>{g.suggestion}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="panel panel-ok"><b>Không có tham số EasyHRM chưa có.</b></div>}
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

      {editMeta && <MetaDialog session={session} onClose={() => setEditMeta(false)} />}

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
            {!!r.createdExtraFields?.length && <List title="Trường bổ sung Claude đã tạo" items={r.createdExtraFields.map((x) => `{{${x.key}}} · ${x.label}`)} />}
            {r.signer && <List title="Người ký" items={[r.signer]} />}
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

function MetaDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [docType, setDocType] = useState<DocType>(session.docType);
  const [decisionType, setDecisionType] = useState(session.decisionType ?? '');
  const [name, setName] = useState(session.templateName ?? '');
  const [cc, setCc] = useState<ContractClass | ''>(session.docMeta?.contractClass ?? '');
  const [term, setTerm] = useState(session.docMeta?.termMonths ? String(session.docMeta.termMonths) : '');
  const [title, setTitle] = useState(session.signing?.companyTitle ?? '');
  const [signer, setSigner] = useState(session.signing?.companySignerName ?? '');
  const typeChanged = docType !== session.docType || (docType === 'quyet_dinh' && decisionType !== (session.decisionType ?? ''));
  const save = async () => {
    try {
      await updateSessionMeta(session.id, {
        docType, decisionType: docType === 'quyet_dinh' ? decisionType || undefined : undefined, templateName: name,
        contractClass: cc || undefined, termMonths: term ? Number(term) : null,
        signing: docType === 'quyet_dinh' ? undefined : { companyTitle: title || undefined, companySignerName: signer || undefined },
      }, 'nguoi_dung');
      toast.ok('Đã lưu thông tin mẫu');
      onClose();
    } catch (e) {
      toast.bad('Không lưu được', errorMessage(e));
    }
  };
  return (
    <Modal title="Thông tin mẫu" open onClose={onClose} wide footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Huỷ</button>
      <button className="btn" onClick={save} disabled={!name.trim() || (docType === 'quyet_dinh' && !decisionType)} data-testid="meta-save">Lưu</button>
    </>}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Loại văn bản" htmlFor="m-doc">
          <select id="m-doc" className="select" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        {docType === 'quyet_dinh' && (
          <Field label="Loại quyết định" htmlFor="m-dt" hint="Theo danh mục EasyHRM. Đổi loại sẽ bỏ các trường không thuộc loại mới.">
            <select id="m-dt" className="select" value={decisionType} onChange={(e) => setDecisionType(e.target.value)}>
              <option value="">— Chọn —</option>
              {[...new Set([...DECISION_TYPES, ...(session.decisionType ? [session.decisionType] : [])])].map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="Tên mẫu trên EasyHRM" htmlFor="m-name"><input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} /></Field>
      {docType !== 'quyet_dinh' && (<>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Phân loại hợp đồng" htmlFor="m-cc">
            <select id="m-cc" className="select" value={cc} onChange={(e) => setCc(e.target.value as ContractClass | '')}>
              <option value="">— Chưa rõ —</option>
              {(Object.keys(CONTRACT_CLASS) as ContractClass[]).map((c) => <option key={c} value={c}>{CONTRACT_CLASS[c]}</option>)}
            </select>
          </Field>
          <Field label="Thời hạn (tháng)" htmlFor="m-term"><input id="m-term" className="input" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))} disabled={cc === 'khong_xac_dinh'} /></Field>
          <Field label="Chức danh người ký công ty" htmlFor="m-title"><input id="m-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Giám đốc" /></Field>
          <Field label="Tên người ký (nếu cố định)" htmlFor="m-signer" hint="Phải có trong Thiết lập người đại diện ký"><input id="m-signer" className="input" value={signer} onChange={(e) => setSigner(e.target.value)} /></Field>
        </div>
      </>)}
      {typeChanged && <div className="panel panel-warn text-[13px]">Đổi loại sẽ bỏ các trường không thuộc danh mục của loại mới (trường bổ sung giữ nguyên).</div>}
    </Modal>
  );
}
