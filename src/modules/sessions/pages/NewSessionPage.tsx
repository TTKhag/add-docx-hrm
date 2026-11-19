import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionMode } from '@/db/types';
import { promptAnalyze } from '@/modules/agent';
import { DOC_TYPE_LABEL } from '@/modules/catalog/services/catalog';
import { useCurrentProject } from '@/modules/projects';
import { copyText, Field, PageHeader, Section, Spinner } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { type BatchItemResult, createSessions } from '../services/session.workflow';

const MODES: { id: SessionMode | 'auto'; label: string; hint: string }[] = [
  { id: 'auto', label: 'Tự nhận', hint: 'Tệp đã có {{key}} → giữ key; chưa có → chèn key' },
  { id: 'chen_key', label: 'Chèn key', hint: 'Tệp gốc có chỗ trống / giá trị mẫu' },
  { id: 'da_co_key', label: 'Tệp đã có key', hint: 'Bạn đã tự chèn {{TenKey}}; chỉ ghép trường rồi lên EasyHRM' },
];

export default function NewSessionPage() {
  const project = useCurrentProject();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<SessionMode | 'auto'>('auto');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [results, setResults] = useState<BatchItemResult[] | null>(null);

  const pick = (list: FileList | null) => {
    if (!list) return;
    const docx = Array.from(list).filter((f) => /\.docx$/i.test(f.name));
    if (docx.length < list.length) toast.warn('Bỏ qua tệp không phải .docx', `${list.length - docx.length} tệp`);
    setFiles((prev) => [...prev, ...docx.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
    setResults(null);
  };

  const submit = async () => {
    setErr(undefined);
    if (!project) return setErr('Chưa chọn dự án hiện tại.');
    if (!files.length) return setErr('Chọn ít nhất một tệp .docx.');
    setBusy(true);
    try {
      const r = await createSessions(files, project.id, { mode });
      setResults(r);
      const ok = r.filter((x) => x.session).length;
      toast.ok(`Đã đọc ${ok}/${r.length} tệp`, ok ? 'Giao Claude phân tích, rồi duyệt.' : undefined);
      setFiles([]);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyAnalyze = async () => {
    const ids = results?.filter((x) => x.session).map((x) => x.session!.id);
    const text = promptAnalyze(ids);
    if (await copyText(text)) toast.ok('Đã chép câu lệnh', 'Dán vào Claude.');
    else toast.warn('Không chép được tự động', text);
  };

  if (project === undefined) return <Spinner label="Đang tải" />;
  return (
    <>
      <PageHeader title="Tải văn bản" sub="Thả một hoặc nhiều tệp. Studio tự nhận loại văn bản, loại quyết định, tên mẫu, phân loại hợp đồng — bạn chỉ đọc lại." />
      {!project ? (
        <div className="panel panel-warn">Cần <b>khai báo và chọn dự án</b> trước. <Link to="/du-an" className="font-bold text-black underline">Đến Hồ sơ dự án</Link></div>
      ) : (
        <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <Section title="Văn bản">
              <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
                <Field label="Tệp Word (.docx) — chọn được nhiều tệp *" htmlFor="ns-file">
                  <label htmlFor="ns-file" className="flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-black bg-soft px-4 py-8 text-center hover:bg-hov"
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
                    <span className="text-[11px] font-extrabold uppercase tracking-[.14em]">{files.length ? `${files.length} tệp đã chọn` : 'Chọn hoặc kéo tệp vào đây'}</span>
                    <span className="mt-1 text-xs text-mut">Thứ tự chọn = thứ tự xử lý</span>
                  </label>
                  <input id="ns-file" type="file" multiple accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" data-testid="session-file"
                    onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
                </Field>
                {files.length > 0 && (
                  <ol className="mb-4 list-inside list-decimal text-[13px]" data-testid="file-queue">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${f.size}`} className="flex items-center gap-2">
                        <span className="w-6 tabular-nums font-bold">{i + 1}.</span><span className="flex-1 truncate">{f.name}</span>
                        <span className="text-mut">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" className="chip !px-2" onClick={() => setFiles((x) => x.filter((_, k) => k !== i))} aria-label={`Bỏ ${f.name}`}>✕</button>
                      </li>
                    ))}
                  </ol>
                )}
                <Field label="Chế độ" htmlFor="ns-mode">
                  <div className="flex flex-wrap gap-2" id="ns-mode" role="radiogroup">
                    {MODES.map((m) => <button type="button" key={m.id} className="chip" aria-pressed={mode === m.id} title={m.hint} onClick={() => setMode(m.id)}>{m.label}</button>)}
                  </div>
                  <div className="mt-1 text-xs text-mut">{MODES.find((m) => m.id === mode)?.hint}</div>
                </Field>
                {err && <div className="panel panel-bad mb-4" role="alert"><b>{err}</b></div>}
                <button className="btn" disabled={busy || !files.length} data-testid="session-create">{busy ? 'Đang đọc tệp' : `Đọc ${files.length || ''} văn bản`}</button>
              </form>
            </Section>

            {results && (
              <Section title="Kết quả" right={results.some((r) => r.session) && <button className="btn btn-sm" onClick={copyAnalyze} data-testid="copy-analyze">Giao Claude phân tích</button>}>
                <div className="overflow-x-auto">
                  <table className="tbl" data-testid="batch-results">
                    <thead><tr><th>#</th><th>Tệp</th><th>Tự nhận</th><th>Tên mẫu</th><th /></tr></thead>
                    <tbody>{results.map((r, i) => (
                      <tr key={i}>
                        <td className="font-bold tabular-nums">{r.session?.queueOrder ?? '—'}</td>
                        <td className="max-w-[220px] truncate">{r.fileName}</td>
                        <td>{r.session ? <>{DOC_TYPE_LABEL[r.session.docType]}{r.session.decisionType ? ` · ${r.session.decisionType}` : r.session.docType === 'quyet_dinh' ? ' · (AI chọn loại)' : ''}{r.session.mode === 'da_co_key' && <span className="tag ml-1">đã có key</span>}</> : <span className="tag tag-bad">Lỗi</span>}</td>
                        <td>{r.session?.templateName ?? <span className="text-[13px]">{r.error}</span>}</td>
                        <td>{r.session && <Link className="chip" to={`/phien/${r.session.id}`}>Mở</Link>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
          <Section title="Dự án">
            <div className="card">
              <div className="label">Dự án hiện tại</div>
              <div className="mt-1 text-lg font-extrabold">{project.name}</div>
              <div className="mt-2 text-[13px] text-mut">EasyHRM {project.hrmVersion}<br />{project.url}</div>
              <Link to="/du-an" className="chip mt-3">Đổi dự án</Link>
            </div>
            <div className="panel mt-4 text-[13px]">
              <b>Quy trình 3 bước:</b><br />1. Đọc văn bản → <b>Giao Claude phân tích</b>.<br />2. Đọc lại, sửa nếu cần → <b>Duyệt toàn bộ đề xuất</b>.<br />3. <b>Giao Claude tạo trên EasyHRM</b> — Claude làm tới khi Lưu xong và báo bạn.
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
