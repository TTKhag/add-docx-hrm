import { useState } from 'react';
import type { Catalog } from '@/db/types';
import { Confirm, download, Empty, Modal, PageHeader, Section, Spinner } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { formatDateTime } from '@/shared/utils/text';
import { useCatalogs } from '../hooks';
import { DECISION_TYPES, DOC_TYPE_LABEL, HRM_VERSIONS } from '../services/catalog';
import { type CatalogPreview, ensureCatalog, previewCatalogImport, removeCatalog, saveCatalog } from '../services/catalog.workflow';

const SAMPLE_IMPORT = JSON.stringify({
  protocol: 'tstudio/1', hrm_version: '2.5.39', doc_type: 'hop_dong', decision_type: '', source: 'dong_bo',
  fields: [{ code: 'nv.ho_va_ten', label: 'Họ và tên', group: 'Nhân viên', kind: 'text' }],
}, null, 2);

export default function CatalogPage() {
  const catalogs = useCatalogs();
  const [selected, setSelected] = useState<Catalog | null>(null);
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [toDelete, setToDelete] = useState<Catalog | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const runPreview = async () => {
    try {
      setPreview(await previewCatalogImport(JSON.parse(importText)));
    } catch {
      setPreview({ ok: false, errors: [{ path: '(gốc)', message: 'Không phải JSON hợp lệ' }] });
    }
  };

  return (
    <>
      <PageHeader
        title="Danh mục trường"
        sub={<>Danh sách "Trường lấy giá trị" của EasyHRM theo phiên bản và loại mẫu. Claude chỉ được chọn trường có trong danh mục.</>}
        actions={<button className="btn btn-ghost" onClick={() => setNewOpen(true)}>Tạo danh mục mẫu</button>}
      />
      <div className="panel panel-warn mb-6"><b>Danh mục mẫu chỉ để thử.</b> Tên trường thật lấy từ màn Loại hợp đồng / Mẫu quyết định trên EasyHRM: nhờ Claude đọc danh sách "Trường lấy giá trị" và gửi qua <b>window.TemplateStudio.submitCatalog</b>, hoặc dán JSON bên dưới.</div>

      <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Đang có">
          {catalogs === undefined ? <Spinner /> : catalogs.length === 0 ? <Empty>Chưa có danh mục. Danh mục mẫu tự tạo khi bạn tải văn bản đầu tiên.</Empty> : (
            <table className="tbl" data-testid="catalog-table">
              <thead><tr><th>Loại mẫu</th><th>Bản</th><th className="num">Trường</th><th>Nguồn</th><th /></tr></thead>
              <tbody>{catalogs.map((c) => (
                <tr key={c.id}>
                  <td className="font-bold">{DOC_TYPE_LABEL[c.docType]}{c.decisionType && <div className="text-xs font-normal text-mut">{c.decisionType}</div>}</td>
                  <td>{c.hrmVersion}</td>
                  <td className="num">{c.fields.length}</td>
                  <td>{c.verified ? <span className="tag tag-ok">Đã đồng bộ</span> : <span className="tag tag-warn">Mẫu</span>}<div className="text-xs text-mut">{formatDateTime(c.updatedAt)}</div></td>
                  <td><div className="flex justify-end gap-2"><button className="chip" onClick={() => setSelected(c)}>Xem</button><button className="chip" onClick={() => setToDelete(c)}>Xóa</button></div></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Section>
        <Section title="Nhập / đồng bộ JSON">
          <textarea className="textarea h-[260px]" value={importText} onChange={(e) => { setImportText(e.target.value); setPreview(null); }} placeholder={SAMPLE_IMPORT} aria-label="JSON danh mục trường" data-testid="catalog-import" />
          <div className="mt-3 flex gap-3">
            <button className="btn btn-ghost" onClick={runPreview} disabled={!importText.trim()}>Kiểm tra</button>
            <button className="btn" disabled={!preview?.ok} onClick={async () => {
              if (!preview?.ok) return;
              try { await saveCatalog(preview.next); toast.ok('Đã lưu danh mục'); setImportText(''); setPreview(null); } catch (e) { toast.bad('Lỗi', errorMessage(e)); }
            }}>Lưu</button>
          </div>
          {preview && !preview.ok && <div className="panel panel-bad mt-3"><ul className="list-inside list-disc text-[13px]">{preview.errors.map((e, i) => <li key={i}><code>{e.path}</code>: {e.message}</li>)}</ul></div>}
          {preview?.ok && (
            <div className="panel mt-3 text-[13px]">
              <b>{preview.isNew ? 'Danh mục mới' : 'Thay danh mục hiện có'}:</b> +{preview.diff.added.length} trường, −{preview.diff.removed.length}, đổi {preview.diff.changed.length}.
              {preview.diff.removed.length > 0 && <div className="mt-1">Bị bỏ: {preview.diff.removed.map((f) => f.label).join(', ')}</div>}
            </div>
          )}
        </Section>
      </div>

      <Modal title={selected ? `${DOC_TYPE_LABEL[selected.docType]} ${selected.decisionType}` : ''} open={!!selected} onClose={() => setSelected(null)} wide
        footer={selected && <button className="btn btn-ghost" onClick={() => download(new Blob([JSON.stringify({ protocol: 'tstudio/1', hrm_version: selected.hrmVersion, doc_type: selected.docType, decision_type: selected.decisionType, source: selected.verified ? 'dong_bo' : 'nhap_tay', fields: selected.fields }, null, 2)], { type: 'application/json' }), `danh-muc-${selected.docType}.json`)}>Xuất JSON</button>}>
        {selected && (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="tbl"><thead><tr><th>Nhóm</th><th>Tên trường</th><th>Mã</th><th>Kiểu</th></tr></thead>
              <tbody>{selected.fields.map((f) => <tr key={f.code}><td className="text-mut">{f.group}</td><td className="font-bold">{f.label}</td><td className="font-mono text-xs">{f.code}</td><td>{f.kind}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Modal>

      <NewCatalogDialog open={newOpen} onClose={() => setNewOpen(false)} />

      <Confirm open={!!toDelete} title="Xóa danh mục" danger confirmLabel="Xóa" onClose={() => setToDelete(null)}
        body={<>Xóa danh mục <b>{toDelete && DOC_TYPE_LABEL[toDelete.docType]} {toDelete?.decisionType}</b>? Phiên đang dùng sẽ không chọn được trường cho tới khi có danh mục mới.</>}
        onConfirm={async () => { if (toDelete) { await removeCatalog(toDelete.id); toast.ok('Đã xóa danh mục'); } }} />
    </>
  );
}

function NewCatalogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [docType, setDocType] = useState<Catalog['docType']>('hop_dong');
  const [decisionType, setDecisionType] = useState(DECISION_TYPES[0]);
  return (
    <Modal title="Tạo danh mục mẫu" open={open} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Huỷ</button>
      <button className="btn" onClick={async () => { await ensureCatalog(HRM_VERSIONS[0], docType, docType === 'quyet_dinh' ? decisionType : ''); toast.ok('Đã tạo (nếu chưa có)'); onClose(); }}>Tạo</button>
    </>}>
      <label className="label mb-1 block">Loại mẫu</label>
      <select className="select mb-4" value={docType} onChange={(e) => setDocType(e.target.value as Catalog['docType'])}>
        {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {docType === 'quyet_dinh' && (<><label className="label mb-1 block">Loại quyết định</label>
        <select className="select" value={decisionType} onChange={(e) => setDecisionType(e.target.value)}>{DECISION_TYPES.map((d) => <option key={d}>{d}</option>)}</select></>)}
    </Modal>
  );
}
