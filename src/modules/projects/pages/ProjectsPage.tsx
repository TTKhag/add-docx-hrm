import { useState } from 'react';
import type { Project } from '@/db/types';
import { HRM_VERSIONS } from '@/modules/catalog/services/catalog';
import { Confirm, download, Empty, Field, Modal, PageHeader, Section, Spinner } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { formatDateTime } from '@/shared/utils/text';
import { useCurrentProjectId, useProjects } from '../hooks';
import { countSessions, deleteProject, projectsToJson, saveProject, setCurrentProject } from '../services/projects.workflow';
import type { FieldErrors, ProjectInput } from '../services/validate';

const EMPTY: ProjectInput = { name: '', url: '', mst: '', username: '', hrmVersion: HRM_VERSIONS[0], note: '' };

export default function ProjectsPage() {
  const projects = useProjects();
  const currentId = useCurrentProjectId();
  const [editing, setEditing] = useState<{ id?: string; input: ProjectInput } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<{ p: Project; sessions: number } | null>(null);

  const open = (p?: Project) => {
    setErrors({});
    setEditing(p
      ? { id: p.id, input: { name: p.name, url: p.url, mst: p.mst ?? '', username: p.username, hrmVersion: p.hrmVersion, note: p.note ?? '' } }
      : { input: { ...EMPTY } });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await saveProject(editing.input, editing.id);
      if (!r.ok) return setErrors(r.errors);
      toast.ok('Đã lưu dự án', r.project.name);
      setEditing(null);
    } catch (e) {
      toast.bad('Không lưu được', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof ProjectInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditing((s) => (s ? { ...s, input: { ...s.input, [k]: e.target.value } } : s));

  return (
    <>
      <PageHeader
        title="Hồ sơ dự án"
        sub={<>Mỗi dự án là một EasyHRM của một khách. Claude dùng <b className="text-black">Link, MST, Tài khoản</b> để tự mở đúng dự án và điền sẵn form đăng nhập.</>}
        actions={<>
          {!!projects?.length && <button className="btn btn-ghost" onClick={() => download(new Blob([projectsToJson(projects)], { type: 'application/json' }), 'du-an-studio.json')}>Xuất JSON</button>}
          <button className="btn" onClick={() => open()} data-testid="project-add">Thêm dự án</button>
        </>}
      />

      <div className="panel mb-6">
        <b>Mật khẩu không lưu ở đây.</b> Claude không gõ mật khẩu vào form đăng nhập. Lần đầu, bấm <b>Mở EasyHRM</b>, đăng nhập tay và cho trình duyệt lưu mật khẩu; các lần sau Claude điền MST + tài khoản, trình duyệt tự điền mật khẩu, bạn chỉ bấm Đăng nhập.
      </div>

      <Section title="Danh sách dự án">
        {projects === undefined ? <Spinner label="Đang tải" /> : projects.length === 0 ? (
          <Empty>Chưa có dự án. Bấm <b className="text-black">Thêm dự án</b> để khai báo EasyHRM đầu tiên.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl" data-testid="project-table">
              <thead><tr><th>Dự án</th><th>Link</th><th>MST</th><th>Tài khoản</th><th>Bản</th><th>Cập nhật</th><th /></tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="font-bold">{p.name} {p.id === currentId && <span className="tag tag-ink ml-1">Hiện tại</span>}</td>
                    <td className="max-w-[240px] truncate"><a className="underline" href={p.url} target="_blank" rel="noreferrer">{p.url.replace('https://', '')}</a></td>
                    <td className="tabular-nums">{p.mst ?? '—'}</td>
                    <td>{p.username}</td>
                    <td>{p.hrmVersion}</td>
                    <td className="whitespace-nowrap text-mut">{formatDateTime(p.updatedAt)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        {p.id !== currentId && <button className="chip" onClick={() => setCurrentProject(p.id)}>Chọn</button>}
                        <a className="chip" href={p.url} target="_blank" rel="noreferrer">Mở EasyHRM</a>
                        <button className="chip" onClick={() => open(p)}>Sửa</button>
                        <button className="chip" onClick={async () => setToDelete({ p, sessions: await countSessions(p.id) })}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal title={editing?.id ? 'Sửa dự án' : 'Thêm dự án'} open={!!editing} onClose={() => setEditing(null)} footer={<>
        <button className="btn btn-ghost" onClick={() => setEditing(null)}>Huỷ</button>
        <button className="btn" onClick={save} disabled={saving} data-testid="project-save">{saving ? 'Đang lưu' : 'Lưu'}</button>
      </>}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            <Field label="Tên dự án *" error={errors.name} htmlFor="pj-name">
              <input id="pj-name" className="input" value={editing.input.name} onChange={set('name')} aria-invalid={!!errors.name} placeholder="Công ty Mẫu A" />
            </Field>
            <Field label="Link dự án *" error={errors.url} hint="Studio chỉ lưu phần domain." htmlFor="pj-url">
              <input id="pj-url" className="input" value={editing.input.url} onChange={set('url')} aria-invalid={!!errors.url} placeholder="https://hrm-mau-a.example.vn" inputMode="url" />
            </Field>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Mã số thuế (MST)" error={errors.mst} hint="Không bắt buộc. 10 số hoặc 10-3 số." htmlFor="pj-mst">
                <input id="pj-mst" className="input" value={editing.input.mst} onChange={set('mst')} aria-invalid={!!errors.mst} placeholder="0101234567" inputMode="numeric" />
              </Field>
              <Field label="Tài khoản *" error={errors.username} htmlFor="pj-user">
                <input id="pj-user" className="input" value={editing.input.username} onChange={set('username')} aria-invalid={!!errors.username} autoComplete="off" placeholder="cauhinh.mau" />
              </Field>
            </div>
            <Field label="Phiên bản EasyHRM *" error={errors.hrmVersion} htmlFor="pj-ver">
              <select id="pj-ver" className="select" value={editing.input.hrmVersion} onChange={set('hrmVersion')}>
                {HRM_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Ghi chú" error={errors.note} htmlFor="pj-note">
              <textarea id="pj-note" className="input" rows={2} value={editing.input.note} onChange={set('note')} />
            </Field>
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      <Confirm
        open={!!toDelete}
        title="Xóa dự án"
        danger
        confirmLabel="Xóa dự án"
        body={toDelete && <>Xóa <b>{toDelete.p.name}</b>{toDelete.sessions ? <> cùng <b>{toDelete.sessions} phiên</b> thuộc dự án (file gốc, bảng ghép, báo cáo)</> : null}? Không hoàn tác được — nên sao lưu trước.</>}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteProject(toDelete.p.id, true);
            toast.ok('Đã xóa dự án');
          } catch (e) {
            toast.bad('Không xóa được', errorMessage(e));
          }
        }}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
