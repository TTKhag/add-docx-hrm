import { useEffect, useState } from 'react';
import type { MappingRow } from '@/db/types';
import { readDocx, type ParsedParagraph } from '../services/docx';

/** Plain-text preview of the original file with candidates highlighted. Hidden while Claude works (SEC-05). */
export function DocPreview({ file, rows }: { file: Blob; rows: MappingRow[] }) {
  const [paras, setParas] = useState<ParsedParagraph[] | null>(null);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    let alive = true;
    readDocx(file).then((d) => alive && setParas(d.paragraphs)).catch(() => alive && setErr('Không hiển thị được xem trước.'));
    return () => { alive = false; };
  }, [file]);
  if (err) return <div className="panel panel-warn">{err}</div>;
  if (!paras) return <div className="text-mut">Đang dựng xem trước…</div>;
  return (
    <div className="max-h-[70vh] overflow-y-auto border-2 border-black bg-white p-4 text-[13px] leading-relaxed" data-testid="doc-preview">
      {paras.filter((p) => p.text.trim()).map((p) => {
        const marks = rows.filter((r) => r.location.part === p.part && r.location.paragraph === p.index).sort((a, b) => a.location.start - b.location.start);
        const out: React.ReactNode[] = [];
        let pos = 0;
        for (const r of marks) {
          out.push(p.text.slice(pos, r.location.start));
          const cls = r.status === 'bo' ? 'hl-skip' : r.status === 'duyet' ? 'hl' : 'hl-pending';
          out.push(<span key={r.id} className={cls} title={r.candidateId}>{r.key ? `{{${r.key}}}` : p.text.slice(r.location.start, r.location.end)}<sup className="ml-0.5 text-[9px] font-bold">{r.candidateId}</sup></span>);
          pos = r.location.end;
        }
        out.push(p.text.slice(pos));
        return <p key={`${p.part}-${p.index}`} className={`my-1.5 ${p.part !== 'word/document.xml' ? 'text-mut' : ''}`}>{out}</p>;
      })}
    </div>
  );
}
