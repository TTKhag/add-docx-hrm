import { useEffect, useRef, useState } from 'react';
import type { MappingRow } from '@/db/types';
import { buildPreviewDocx, PREVIEW_MARK_RE } from '../services/docx';
import { wrapKey } from '../services/tenKey';

/**
 * Word-like preview (FR-10): the original .docx rendered with docx-preview (tables, bold, alignment kept),
 * candidates coloured by status. Hidden while Claude works (SEC-05): it shows unmasked values.
 */
export function DocPreview({ file, rows }: { file: Blob; rows: MappingRow[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const sig = rows.map((r) => `${r.id}:${r.status}:${r.key ?? ''}:${r.fieldCode ?? ''}`).join('|');

  useEffect(() => {
    let alive = true;
    const el = host.current;
    if (!el) return;
    setState('loading');
    (async () => {
      const { renderAsync } = await import('docx-preview');
      const blob = await buildPreviewDocx(file, rows.map((r) => ({
        location: r.location,
        expected: r.text,
        id: r.candidateId,
        display: r.key ? wrapKey(r.key) : r.fixedKey ? wrapKey(r.fixedKey) : r.text,
      })));
      if (!alive) return;
      el.innerHTML = '';
      await renderAsync(blob, el, undefined, { inWrapper: true, ignoreWidth: false, breakPages: true, renderHeaders: true, renderFooters: true, className: 'docx' });
      if (!alive) return;
      decorate(el, rows);
      setState('ok');
    })().catch(() => alive && setState('error'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, sig]);

  return (
    <div className="relative">
      {state === 'loading' && <div className="mb-2 text-mut">Đang dựng xem trước…</div>}
      {state === 'error' && <div className="panel panel-warn mb-2">Không dựng được bản xem trước dạng Word cho tệp này.</div>}
      <div ref={host} className="docx-host max-h-[75vh] overflow-auto border-2 border-black bg-[#e9e9e9]" data-testid="doc-preview" />
      <div className="mt-2 flex flex-wrap gap-3 text-xs"><span className="hl-pending px-1">Chờ duyệt</span><span className="hl px-1">Đã duyệt</span><span className="hl-skip px-1">Bỏ</span></div>
    </div>
  );
}

/** Replace ⟦c7|text⟧ markers in rendered text nodes by coloured spans. */
function decorate(root: HTMLElement, rows: MappingRow[]) {
  const status = new Map(rows.map((r) => [r.candidateId, r.status]));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) if ((walker.currentNode as Text).data.includes('⟦')) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let pos = 0;
    const text = node.data;
    for (const m of text.matchAll(PREVIEW_MARK_RE)) {
      const i = m.index ?? 0;
      frag.append(text.slice(pos, i));
      const st = status.get(m[1]);
      const span = document.createElement('span');
      span.className = st === 'bo' ? 'hl-skip' : st === 'duyet' ? 'hl' : 'hl-pending';
      span.title = m[1];
      span.textContent = m[2];
      const sup = document.createElement('sup');
      sup.textContent = m[1];
      sup.style.cssText = 'font-size:8px;font-weight:700;margin-left:1px';
      span.append(sup);
      frag.append(span);
      pos = i + m[0].length;
    }
    frag.append(text.slice(pos));
    node.replaceWith(frag);
  }
}
