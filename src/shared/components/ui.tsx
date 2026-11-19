import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from 'react';
import { useToasts } from './toast';

const ACCENT: Record<string, string> = { ok: '#1b7f3a', warn: '#c77700', bad: '#ff6b6b', info: '#fff' };

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex w-[min(380px,calc(100vw-32px))] flex-col gap-3" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="rise border-2 border-black bg-white shadow-dlg">
          <div className="slash-bg relative flex items-center justify-between bg-black px-3 py-2 text-white" style={{ boxShadow: `inset 0 -4px 0 ${ACCENT[t.kind]}` }}>
            <span className="text-[11px] font-extrabold uppercase tracking-[.14em]">{t.title}</span>
            <button className="px-2 text-xs font-bold text-white" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">✕</button>
          </div>
          {t.body && <div className="px-3 py-2 text-[13px]">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="rise mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-[clamp(22px,3vw,32px)] font-extrabold uppercase leading-none tracking-[-.01em]">{title}</h1>
        {sub && <div className="mt-2 max-w-3xl text-mut">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rise mb-7">
      <div className="flex items-center gap-3">
        <h2 className="h2 flex-1">{title}</h2>
        {right && <div className="mb-3">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="label mb-1 block">{label}</label>
      {children}
      {hint && !error && <div className="mt-1 text-xs text-mut">{hint}</div>}
      {error && <div className="field-err" role="alert">{error}</div>}
    </div>
  );
}

export function Modal({ title, open, onClose, children, footer, wide }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the focus effect: parents pass a new arrow function on every render,
  // and re-focusing on each keystroke used to throw the caret out of the input (bug "chỉ gõ được 1 ký tự").
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const first = bodyRef.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]),select,textarea')
      ?? ref.current?.querySelector<HTMLElement>('[data-autofocus],button');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} border-2 border-black bg-white shadow-dlg`} style={{ animation: 'dlg .3s cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="slash-bg flex items-center justify-between bg-black px-5 py-3 text-white">
          <h3 className="m-0 text-[13px] font-extrabold uppercase tracking-[.14em]">{title}</h3>
          <button className="text-white" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <div ref={bodyRef} className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t-2 border-black px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel = 'Đồng ý', danger, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} open={open} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Huỷ</button>
      <button className={`btn ${danger ? 'btn-danger' : ''}`} onClick={() => { onConfirm(); onClose(); }} data-testid="confirm-ok">{confirmLabel}</button>
    </>}>
      <div className="text-[14px]">{body}</div>
    </Modal>
  );
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: 'ok' | 'warn' | 'bad' }) {
  const color = accent === 'ok' ? '#1b7f3a' : accent === 'warn' ? '#c77700' : accent === 'bad' ? '#c00' : '#000';
  return (
    <div className="card card-hover">
      <div className="label">{label}</div>
      <div className="mt-1 text-[clamp(22px,3vw,32px)] font-extrabold tabular-nums tracking-[-.02em]" style={{ color }}>{value}</div>
    </div>
  );
}

interface EBState { error: Error | null }
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[${this.props.name}]`, error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel panel-bad">
        <b>Phần "{this.props.name}" gặp lỗi.</b> Các phần khác vẫn dùng được. Tải lại trang để thử lại.
        <div className="mt-3"><button className="btn btn-sm" onClick={() => this.setState({ error: null })}>Thử lại</button></div>
      </div>
    );
  }
}

export function Spinner({ label = 'Đang xử lý' }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.12em]"><span className="inline-block h-3 w-3 animate-spin border-2 border-black border-r-transparent" />{label}</span>;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
