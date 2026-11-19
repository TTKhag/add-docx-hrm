import { create } from 'zustand';

export type ToastKind = 'ok' | 'warn' | 'bad' | 'info';
export interface Toast { id: number; kind: ToastKind; title: string; body?: string }

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-1), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === "bad" ? 9000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  ok: (title: string, body?: string) => useToasts.getState().push({ kind: 'ok', title, body }),
  warn: (title: string, body?: string) => useToasts.getState().push({ kind: 'warn', title, body }),
  bad: (title: string, body?: string) => useToasts.getState().push({ kind: 'bad', title, body }),
  info: (title: string, body?: string) => useToasts.getState().push({ kind: 'info', title, body }),
};

/** Turn any thrown value into a friendly Vietnamese message (no stack traces). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Đã có lỗi. Thử lại hoặc tải lại trang.';
}
