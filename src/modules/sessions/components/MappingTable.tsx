import { memo, useMemo, useState } from 'react';
import type { CatalogField, GapGroup, MappingRow } from '@/db/types';
import { errorMessage, toast } from '@/shared/components/toast';
import { maskContext } from '../services/mask';
import { EXTRA_PREFIX, GAP_LABEL, isExtraField } from '../services/mapping';
import { updateRow } from '../services/session.workflow';
import { toTenKey, wrapKey } from '../services/tenKey';

const SOURCE_LABEL = { quy_tac: 'Quy tắc', ai: 'AI', nguoi_dung: 'Người dùng' } as const;
const CONF_LABEL = { cao: 'Cao', trung_binh: 'TB', thap: 'Thấp' } as const;
const FORMATS = ['', 'dd/MM/yyyy', 'dd/MM/yyyy (chữ)', '#,##0', '#,##0 (chữ)'];

const OPT_EXTRA = '__extra__';
const OPT_GAP = '__gap__';

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
  const selectValue = isExtraField(row.fieldCode) ? OPT_EXTRA : row.gapGroup ? OPT_GAP : row.fieldCode ?? '';
  const preview = row.key ?? row.fixedKey ?? (field ? toTenKey(field.label) : row.extraLabel ? toTenKey(row.extraLabel) : undefined);

  const patch = async (p: Partial<MappingRow>) => {
    try {
      await updateRow(row, p);
    } catch (e) {
      toast.bad('Không sửa được', errorMessage(e));
    }
  };

  const onField = (v: string) => {
    if (v === OPT_GAP) return patch({ fieldCode: undefined, gapGroup: row.gapGroup ?? 'T2', extraLabel: row.extraLabel ?? '' });
    if (v === OPT_EXTRA) return patch({ fieldCode: `${EXTRA_PREFIX}${toTenKey(row.extraLabel || 'TruongBoSung')}`, gapGroup: undefined, extraLabel: row.extraLabel ?? '' });
    const f = fields.find((x) => x.code === v);
    return patch({ fieldCode: v || undefined, gapGroup: undefined, extraLabel: undefined, format: f?.kind === 'date' ? 'dd/MM/yyyy' : f?.kind === 'number' ? '#,##0' : undefined });
  };

  return (
    <tr data-testid={`row-${row.candidateId}`} data-status={row.status}>
      <td className="whitespace-nowrap font-extrabold tabular-nums">{row.candidateId}</td>
      <td className="min-w-[260px] max-w-[420px]"><ContextCell row={row} /></td>
      <td className="min-w-[230px]">
        <select className="select !py-1.5 text-[13px]" value={selectValue} disabled={locked} onChange={(e) => onField(e.target.value)} aria-label={`Trường cho ${row.candidateId}`} data-testid={`row-field-${row.candidateId}`}>
          <option value="">— Chọn trường —</option>
          {groups.map(([g, fs]) => (
            <optgroup key={g} label={g}>{fs.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</optgroup>
          ))}
          <optgroup label="Khác">
            <option value={OPT_EXTRA}>+ Trường giá trị bổ sung (Claude tự tạo trên EasyHRM)</option>
            <option value={OPT_GAP}>! Tham số EasyHRM chưa có</option>
          </optgroup>
        </select>
        {(selectValue === OPT_EXTRA || selectValue === OPT_GAP) && (
          <input className="input mt-2 !py-1.5 text-[13px]" placeholder="Tên tham số, ví dụ Địa điểm làm việc" defaultValue={row.extraLabel} disabled={locked}
            onBlur={(e) => e.target.value !== (row.extraLabel ?? '') && patch(selectValue === OPT_EXTRA ? { extraLabel: e.target.value, fieldCode: `${EXTRA_PREFIX}${toTenKey(e.target.value || 'TruongBoSung')}` } : { extraLabel: e.target.value })}
            aria-label={`Tên tham số cho ${row.candidateId}`} />
        )}
        {selectValue === OPT_GAP && (
          <select className="select mt-2 !py-1.5 text-[13px]" value={row.gapGroup} disabled={locked} onChange={(e) => patch({ gapGroup: e.target.value as GapGroup })} aria-label={`Nhóm thiếu cho ${row.candidateId}`}>
            {(Object.keys(GAP_LABEL) as GapGroup[]).map((g) => <option key={g} value={g}>{GAP_LABEL[g]}</option>)}
          </select>
        )}
        {field?.kind !== 'text' && field && (
          <select className="select mt-2 !py-1 text-[12px]" value={row.format ?? ''} disabled={locked} onChange={(e) => patch({ format: e.target.value || undefined })} aria-label={`Định dạng cho ${row.candidateId}`}>
            {FORMATS.map((f) => <option key={f} value={f}>{f || 'Định dạng mặc định'}</option>)}
          </select>
        )}
      </td>
      <td className="min-w-[120px] max-w-[180px] break-all font-mono text-[12px]">{preview ? <span className={row.key ? 'font-bold' : 'text-mut'}>{wrapKey(preview)}</span> : <span className="text-mut">—</span>}</td>
      <td className="whitespace-nowrap">
        {row.source && <span className="tag">{SOURCE_LABEL[row.source]}</span>}{' '}
        {row.confidence && <span className={`tag ${row.confidence === 'thap' ? 'tag-warn' : ''}`}>{CONF_LABEL[row.confidence]}</span>}
        {row.proposedSkip && row.status === 'cho' && <span className="tag tag-warn" data-testid={`row-skip-${row.candidateId}`}>Đề xuất Bỏ</span>}
        {row.addedBy === 'ai' && <span className="tag">AI thêm</span>}
        {row.fixedKey && <span className="tag">Key có sẵn</span>}
        {row.reason && <div className="mt-1 max-w-[200px] whitespace-normal text-xs text-mut">{row.reason}</div>}
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

export function MappingTable({ rows, fields, locked }: { rows: MappingRow[]; fields: CatalogField[]; locked: boolean }) {
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, CatalogField[]>();
    for (const f of fields) m.set(f.group, [...(m.get(f.group) ?? []), f]);
    return [...m.entries()];
  }, [fields]);
  const list = rows.filter((r) => (!onlyPending || r.status === 'cho') && (!q || r.context.toLowerCase().includes(q.toLowerCase()) || r.candidateId === q));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-[260px] !py-1.5" placeholder="Lọc theo nội dung hoặc c12" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Lọc dòng" />
        <button className="chip" aria-pressed={onlyPending} onClick={() => setOnlyPending((v) => !v)}>Chỉ dòng chờ ({rows.filter((r) => r.status === 'cho').length})</button>
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
