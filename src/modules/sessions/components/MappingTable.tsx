import { memo, useMemo, useState } from 'react';
import type { CatalogField, GapGroup, MappingRow } from '@/db/types';
import { errorMessage, toast } from '@/shared/components/toast';
import { maskContext } from '../services/mask';
import { rowKind, switchKind } from '../services/assess';
import { EXTRA_PREFIX, KIND_LABEL } from '../services/mapping';
import { approveAll, updateRow } from '../services/session.workflow';
import { toTenKey, wrapKey } from '../services/tenKey';

const SOURCE_LABEL = { quy_tac: 'Quy tắc', ai: 'AI', nguoi_dung: 'Người dùng' } as const;
const CONF_LABEL = { cao: 'Cao', trung_binh: 'TB', thap: 'Thấp' } as const;
const FORMATS = ['', 'dd/MM/yyyy', 'dd/MM/yyyy (chữ)', '#,##0', '#,##0 (chữ)'];

const OPT_EXTRA = '__extra__';
const OPT_GAP = '__gap__';

/** FR-34: a row whose key has no EasyHRM catalog field and the user has not decided yet. */
export const needsAttention = (r: MappingRow) => r.status === 'cho' && !r.proposedSkip && (rowKind(r) === 'bo_sung' || rowKind(r) === 'chua_co');

function ContextCell({ row }: { row: MappingRow }) {
  const masked = maskContext(row.context, row.ruleHint);
  const [before, rest] = masked.split('⟦');
  const [mark, after] = (rest ?? '').split('⟧');
  return (
    <span className="text-[13px]">
      {before}<span className={row.status === 'bo' ? 'hl-skip' : row.status === 'duyet' ? 'hl' : 'hl-pending'}>{mark}</span>{after}
    </span>
  );
}

interface RowProps {
  row: MappingRow;
  fields: CatalogField[];
  groups: [string, CatalogField[]][];
  locked: boolean;
}

const Row = memo(function Row({ row, fields, groups, locked }: RowProps) {
  const field = fields.find((f) => f.code === row.fieldCode);
  const kind = rowKind(row);
  // No empty choice any more (BR-17): a row is a catalog field, an extra field, or a missing EasyHRM parameter.
  const selectValue = kind === 'chua_co' ? OPT_GAP : kind === 'bo_sung' ? OPT_EXTRA : field ? field.code : OPT_EXTRA;
  const preview = row.key ?? row.fixedKey ?? (field ? toTenKey(field.label) : row.extraLabel ? toTenKey(row.extraLabel) : undefined);
  const attention = needsAttention(row);

  const patch = async (p: Partial<MappingRow>) => {
    try {
      await updateRow(row, p);
    } catch (e) {
      toast.bad('Không sửa được', errorMessage(e));
    }
  };

  const onField = (v: string) => {
    if (v === OPT_GAP) return patch(switchKind(row, 'chua_co', row.gapGroup === 'T3' ? 'T3' : 'T1'));
    if (v === OPT_EXTRA) return patch(switchKind(row, 'bo_sung'));
    const f = fields.find((x) => x.code === v);
    if (!f) return undefined;
    return patch({ fieldCode: v, gapGroup: undefined, extraLabel: undefined, gapNote: undefined, format: f.kind === 'date' ? 'dd/MM/yyyy' : f.kind === 'number' ? '#,##0' : undefined });
  };

  const onLabel = (label: string) => {
    const l = label.trim();
    if (!l || l === (row.extraLabel ?? '')) return;
    void patch({ extraLabel: l, fieldCode: `${EXTRA_PREFIX}${toTenKey(l)}` });
  };

  return (
    <tr data-testid={`row-${row.candidateId}`} data-status={row.status} data-kind={kind} className={attention ? 'row-assess' : undefined}>
      <td className="whitespace-nowrap font-extrabold tabular-nums">{row.candidateId}</td>
      <td className="min-w-[260px] max-w-[420px]"><ContextCell row={row} /></td>
      <td className="min-w-[240px]">
        <select className="select !py-1.5 text-[13px]" value={selectValue} disabled={locked} onChange={(e) => onField(e.target.value)} aria-label={`Trường cho ${row.candidateId}`} data-testid={`row-field-${row.candidateId}`}>
          <optgroup label="Không có trường EasyHRM">
            <option value={OPT_EXTRA}>+ {KIND_LABEL.bo_sung} (Claude tạo trên EasyHRM)</option>
            <option value={OPT_GAP}>! {KIND_LABEL.chua_co} (báo đội sản phẩm)</option>
          </optgroup>
          {groups.map(([g, fs]) => (
            <optgroup key={g} label={g}>{fs.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</optgroup>
          ))}
        </select>
        {(kind === 'bo_sung' || kind === 'chua_co') && (
          <input key={row.extraLabel} className="input mt-2 !py-1.5 text-[13px]" placeholder="Tên tham số, ví dụ Địa điểm làm việc" defaultValue={row.extraLabel} disabled={locked}
            onBlur={(e) => onLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label={`Tên tham số cho ${row.candidateId}`} data-testid={`row-label-${row.candidateId}`} />
        )}
        {kind === 'chua_co' && (
          <select className="select mt-2 !py-1.5 text-[13px]" value={row.gapGroup} disabled={locked} onChange={(e) => patch({ gapGroup: e.target.value as GapGroup })} aria-label={`Nhóm thiếu cho ${row.candidateId}`}>
            <option value="T1">T1 · Có dữ liệu hồ sơ, danh mục thiếu trường</option>
            <option value="T3">T3 · Cần tính / ghép</option>
          </select>
        )}
        {field && field.kind !== 'text' && (
          <select className="select mt-2 !py-1 text-[12px]" value={row.format ?? ''} disabled={locked} onChange={(e) => patch({ format: e.target.value || undefined })} aria-label={`Định dạng cho ${row.candidateId}`}>
            {FORMATS.map((f) => <option key={f} value={f}>{f || 'Định dạng mặc định'}</option>)}
          </select>
        )}
      </td>
      <td className="min-w-[120px] max-w-[180px] break-all font-mono text-[12px]">{preview ? <span className={row.key ? 'font-bold' : 'text-mut'}>{wrapKey(preview)}</span> : <span className="text-mut">—</span>}</td>
      <td className="whitespace-nowrap">
        {attention && <div className="mb-1"><span className="tag tag-assess" data-testid={`row-assess-${row.candidateId}`}>{row.assessedBy === 'ai' ? 'AI' : row.assessedBy === 'studio' ? 'Studio' : 'Cần xem'} · {kind === 'chua_co' ? 'Chưa có tham số' : 'Trường bổ sung'}</span></div>}
        {row.source && <span className="tag">{SOURCE_LABEL[row.source]}</span>}{' '}
        {row.confidence && <span className={`tag ${row.confidence === 'thap' ? 'tag-warn' : ''}`}>{CONF_LABEL[row.confidence]}</span>}
        {row.proposedSkip && row.status === 'cho' && <span className="tag tag-warn" data-testid={`row-skip-${row.candidateId}`}>Đề xuất Bỏ</span>}
        {row.addedBy === 'ai' && <span className="tag">AI thêm</span>}
        {row.fixedKey && <span className="tag">Key có sẵn</span>}
        {row.reason && <div className="mt-1 max-w-[230px] whitespace-normal text-xs text-mut">{row.reason}</div>}
      </td>
      <td>
        <div className="flex gap-1">
          <button className="chip !px-2" aria-pressed={row.status === 'duyet'} disabled={locked} onClick={() => patch({ status: 'duyet' })} data-testid={`row-approve-${row.candidateId}`}>Duyệt</button>
          <button className="chip !px-2" aria-pressed={row.status === 'bo'} disabled={locked} onClick={() => patch({ status: 'bo' })} title="Không phải tham số — giữ nguyên chữ">Bỏ</button>
          {row.status !== 'cho' && <button className="chip !px-2" disabled={locked} onClick={() => patch({ status: 'cho' })} title="Đưa về chờ">↺</button>}
        </div>
      </td>
    </tr>
  );
});

export function MappingTable({ sessionId, rows, fields, locked }: { sessionId: string; rows: MappingRow[]; fields: CatalogField[]; locked: boolean }) {
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, CatalogField[]>();
    for (const f of fields) m.set(f.group, [...(m.get(f.group) ?? []), f]);
    return [...m.entries()];
  }, [fields]);
  const attentionCount = rows.filter(needsAttention).length;
  const pendingCount = rows.filter((r) => r.status === 'cho').length;
  const list = rows.filter((r) =>
    (!onlyPending || r.status === 'cho') && (!onlyAttention || needsAttention(r))
    && (!q || r.context.toLowerCase().includes(q.toLowerCase()) || r.candidateId === q || (r.extraLabel ?? '').toLowerCase().includes(q.toLowerCase())));

  /** FR-38: approve every pending key in one click. */
  const approveEverything = async () => {
    setBusy(true);
    try {
      const r = await approveAll(sessionId);
      toast.ok('Đã duyệt toàn bộ', `${r.approved} duyệt${r.skipped ? `, ${r.skipped} bỏ (theo đề xuất)` : ''}.`);
    } catch (e) {
      toast.bad('Không duyệt được', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {attentionCount > 0 && (
        <div className="panel panel-warn mb-3 text-[13px]" data-testid="assess-banner">
          <b>{attentionCount} key không có trường EasyHRM</b> — Studio/AI đã tự kết luận là <b>{KIND_LABEL.bo_sung}</b> hoặc <b>{KIND_LABEL.chua_co}</b> (dòng tô sọc cam). Xem tên tham số; đúng rồi thì chỉ cần Duyệt.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!locked && <button className="btn btn-sm" disabled={busy || !pendingCount} onClick={approveEverything} data-testid="approve-all-rows">Duyệt toàn bộ ({pendingCount})</button>}
        <input className="input max-w-[240px] !py-1.5" placeholder="Lọc theo nội dung hoặc c12" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Lọc dòng" />
        <button className="chip" aria-pressed={onlyPending} onClick={() => setOnlyPending((v) => !v)}>Chỉ dòng chờ ({pendingCount})</button>
        <button className="chip" aria-pressed={onlyAttention} onClick={() => setOnlyAttention((v) => !v)} data-testid="filter-attention">Chỉ dòng tự đánh giá ({attentionCount})</button>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl" data-testid="mapping-table">
          <thead><tr><th>#</th><th>Đoạn gốc (đã che)</th><th>Trường EasyHRM</th><th>Key</th><th>Nguồn</th><th>Quyết định</th></tr></thead>
          <tbody>{list.map((r) => <Row key={r.id} row={r} fields={fields} groups={groups} locked={locked} />)}</tbody>
        </table>
      </div>
      {!list.length && <div className="empty">Không có dòng phù hợp.</div>}
    </>
  );
}
