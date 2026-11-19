import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DocType } from '@/db/types';
import { DECISION_TYPES, DOC_TYPE_LABEL } from '@/modules/catalog/services/catalog';
import { useCurrentProject } from '@/modules/projects';
import { Field, PageHeader, Section, Spinner } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { createSession } from '../services/session.workflow';

export default function NewSessionPage() {
  const project = useCurrentProject();
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>('hop_dong');
  const [decisionType, setDecisionType] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const submit = async () => {
    setErr(undefined);
    if (!project) return setErr('Chưa chọn dự án hiện tại.');
    if (!file) return setErr('Chọn tệp .docx.');
    setBusy(true);
    try {
      const s = await createSession({ file, projectId: project.id, docType, decisionType, templateName });
      toast.ok('Đã đọc văn bản', 'Kiểm tra bảng ghép bên dưới.');
      nav(`/phien/${s.id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (project === undefined) return <Spinner label="Đang tải" />;
  return (
    <>
      <PageHeader title="Tải văn bản" sub="Studio đọc tệp ngay trên máy bạn — không gửi lên server nào." />
      {!project ? (
        <div className="panel panel-warn">Cần <b>khai báo và chọn dự án</b> trước. <Link to="/du-an" className="font-bold text-black underline">Đến Hồ sơ dự án</Link></div>
      ) : (
        <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_320px]">
          <Section title="Văn bản">
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
              <Field label="Tệp Word (.docx) *" htmlFor="ns-file">
                <label htmlFor="ns-file" className="flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-black bg-soft px-4 py-8 text-center hover:bg-hov">
                  <span className="text-[11px] font-extrabold uppercase tracking-[.14em]">{file ? file.name : 'Chọn hoặc kéo tệp vào đây'}</span>
                  <span className="mt-1 text-xs text-mut">{file ? `${(file.size / 1024).toFixed(0)} KB` : 'Chỉ nhận .docx'}</span>
                </label>
                <input id="ns-file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" data-testid="session-file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              <Field label="Loại văn bản *" htmlFor="ns-type">
                <div className="flex flex-wrap gap-2" id="ns-type" role="radiogroup">
                  {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                    <button type="button" key={t} className="chip" aria-pressed={docType === t} onClick={() => setDocType(t)}>{DOC_TYPE_LABEL[t]}</button>
                  ))}
                </div>
              </Field>
              {docType === 'quyet_dinh' && (
                <Field label="Loại quyết định *" hint="Chọn trước khi ghép. Đổi loại sau khi ghép sẽ mất toàn bộ ánh xạ trên EasyHRM." htmlFor="ns-dt">
                  <select id="ns-dt" className="select" value={decisionType} onChange={(e) => setDecisionType(e.target.value)} data-testid="session-decision-type">
                    <option value="">— Chọn —</option>
                    {DECISION_TYPES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Tên mẫu trên EasyHRM" hint="Mặc định là tên tệp. Sửa được sau." htmlFor="ns-name">
                <input id="ns-name" className="input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={255} />
              </Field>
              {err && <div className="panel panel-bad mb-4" role="alert"><b>{err}</b></div>}
              <button className="btn" disabled={busy} data-testid="session-create">{busy ? 'Đang đọc tệp' : 'Đọc văn bản'}</button>
            </form>
          </Section>
          <Section title="Dự án">
            <div className="card">
              <div className="label">Dự án hiện tại</div>
              <div className="mt-1 text-lg font-extrabold">{project.name}</div>
              <div className="mt-2 text-[13px] text-mut">EasyHRM {project.hrmVersion}<br />{project.url}</div>
              <Link to="/du-an" className="chip mt-3">Đổi dự án</Link>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
