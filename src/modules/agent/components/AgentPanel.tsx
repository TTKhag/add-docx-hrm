import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { copyText, Section, Spinner } from '@/shared/components/ui';
import { toast } from '@/shared/components/toast';
import { type AgentResult, getTask, startHrm, submitCatalog, submitHrmReport, submitProposal } from '../services/agent.workflow';

type Kind = 'proposal' | 'report' | 'catalog';

function detectKind(json: unknown): Kind | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if ('outcome' in o) return 'report';
  if ('fields' in o && 'doc_type' in o) return 'catalog';
  if ('proposals' in o || 'gaps' in o) return 'proposal';
  return null;
}

const KIND_LABEL: Record<Kind, string> = { proposal: 'Đề xuất ghép trường', report: 'Báo cáo EasyHRM', catalog: 'Danh mục trường' };

/**
 * SC-04 "Khung cho AI". Fixed labels and test ids so Claude can read/write it reliably.
 * The same operations are available on window.TemplateStudio.
 */
export function AgentPanel({ sessionId, prompt }: { sessionId: string; prompt: string }) {
  const task = useLiveQuery(() => getTask(sessionId), [sessionId]);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      let json: unknown;
      try {
        json = JSON.parse(input);
      } catch {
        setResult({ ok: false, message: 'Không phải JSON hợp lệ — không áp dụng gì.', errors: [] });
        return;
      }
      const kind = detectKind(json);
      if (!kind) {
        setResult({ ok: false, message: 'Không nhận ra loại dữ liệu (cần proposals/gaps, outcome, hoặc fields + doc_type).', errors: [] });
        return;
      }
      const r = kind === 'proposal' ? await submitProposal(json) : kind === 'report' ? await submitHrmReport(json) : await submitCatalog(json);
      setResult(r);
      if (r.ok) { toast.ok(KIND_LABEL[kind], r.message); setInput(''); }
    } finally {
      setBusy(false);
    }
  };

  if (!task) return <Spinner label="Đang dựng phiếu việc" />;
  const json = task.ok ? JSON.stringify(task.data, null, 2) : '';

  return (
    <div className="grid gap-[22px] xl:grid-cols-2" data-testid="agent-panel" aria-label="Khung cho AI">
      <Section title="Phiếu việc cho AI" right={<button className="chip" onClick={async () => (await copyText(json)) && toast.ok('Đã chép phiếu việc')}>Chép</button>}>
        <div className="panel mb-3 text-[13px]" data-testid="agent-status" aria-label="Trạng thái phiên">
          {task.ok ? <><b>Trạng thái: {task.data.status}</b> — {task.data.next_step}</> : <b>{task.message}</b>}
        </div>
        <textarea className="textarea h-[480px]" readOnly value={json} aria-label="Phiếu việc JSON (chỉ đọc)" data-testid="agent-task-json" />
        <p className="mt-2 text-xs text-mut">Giá trị cá nhân đã được thay bằng nhãn kiểu ([tên người], [số giấy tờ]…). Claude chỉ đọc khung này, không đọc vùng xem trước.</p>
      </Section>
      <Section title="Kết quả từ AI">
        <div className="panel mb-3 text-[13px]">Dán JSON <b>đề xuất</b>, <b>báo cáo EasyHRM</b> hoặc <b>danh mục trường</b>. Studio kiểm tra cấu trúc và quy tắc trước khi nhận; AI không tự duyệt.</div>
        <textarea className="textarea h-[300px]" value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"protocol":"tstudio/1","session_id":"…","proposals":[…]}' aria-label="Dán JSON kết quả từ AI" data-testid="agent-input-json" />
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="btn" onClick={apply} disabled={busy || !input.trim()} data-testid="agent-apply">Áp dụng</button>
          {task.ok && ['da_duyet', 'dung'].includes(task.data.status) && (
            <button className="btn btn-ghost" data-testid="agent-start-hrm" onClick={async () => setResult(await startHrm(sessionId))}>Bắt đầu tạo trên EasyHRM</button>
          )}
          <button className="btn btn-ghost" onClick={async () => (await copyText(prompt)) && toast.ok('Đã chép câu lệnh cho Claude')}>Chép câu lệnh cho Claude</button>
        </div>
        {result && (
          <div className={`panel mt-4 ${result.ok ? 'panel-ok' : 'panel-bad'}`} data-testid="agent-result" data-ok={result.ok} role="status">
            <b>{result.message}</b>
            {!result.ok && result.errors.length > 0 && <ul className="mt-2 list-inside list-disc text-[13px]">{result.errors.map((e, i) => <li key={i}><code>{e.path}</code>: {e.message}</li>)}</ul>}
            {result.ok && 'data' in result && (result.data as { rejected?: { path: string; message: string }[] }).rejected?.length ? (
              <ul className="mt-2 list-inside list-disc text-[13px]">{(result.data as { rejected: { path: string; message: string }[] }).rejected.map((e, i) => <li key={i}><code>{e.path}</code>: {e.message}</li>)}</ul>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}
