import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDuty } from '@/modules/agent';
import { useCurrentProject } from '@/modules/projects';
import { Toaster } from '@/shared/components/ui';

const NAV: { group: string; items: { to: string; label: string; testid: string }[] }[] = [
  { group: 'Làm việc', items: [
    { to: '/', label: 'Phiên làm việc', testid: 'nav-sessions' },
    { to: '/phien/moi', label: 'Tải văn bản', testid: 'nav-new' },
  ] },
  { group: 'Thiết lập', items: [
    { to: '/du-an', label: 'Hồ sơ dự án', testid: 'nav-projects' },
    { to: '/danh-muc', label: 'Danh mục trường', testid: 'nav-catalog' },
  ] },
  { group: 'Claude', items: [{ to: '/claude', label: 'Claude trực & cài đặt', testid: 'nav-skill' }] },
  { group: 'Dữ liệu', items: [{ to: '/sao-luu', label: 'Sao lưu', testid: 'nav-backup' }] },
];

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const project = useCurrentProject();
  const { onDuty, duty } = useDuty();
  const [wipeKey, setWipeKey] = useState(0);
  useEffect(() => setWipeKey((k) => k + 1), [loc.pathname]);

  return (
    <div className="min-h-screen md:flex">
      <span key={wipeKey} className="wipe" aria-hidden />
      <aside className="on-ink slash-bg relative flex flex-col bg-black text-white md:sticky md:top-0 md:h-screen md:w-[clamp(200px,19vw,248px)] md:shrink-0">
        <div className="px-5 pb-3 pt-5">
          <div className="text-[15px] font-extrabold uppercase tracking-[.16em]">Template<span className="opacity-45">Studio</span></div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-white/60">EasyHRM · {'{{TenKey}}'}</div>
        </div>
        <NavLink to="/du-an" className="mx-5 mb-4 flex items-center gap-3 border border-white/20 p-2 hover:bg-white/10" data-testid="current-project">
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-white text-[12px] font-extrabold text-black" style={{ clipPath: 'polygon(14% 0,86% 0,100% 14%,100% 86%,86% 100%,14% 100%,0 86%,0 14%)' }}>
            {project ? initials(project.name) : '—'}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[.16em] text-white/60">Dự án hiện tại</span>
            <span className="block truncate text-[13px] font-bold">{project ? project.name : 'Chưa chọn'}</span>
          </span>
        </NavLink>
        <NavLink to="/claude" className="mx-5 mb-4 flex items-center gap-2 border border-white/20 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] hover:bg-white/10" data-testid="claude-duty" data-on={onDuty}>
          <span className="h-2.5 w-2.5 shrink-0" style={{ background: onDuty ? '#3ad16b' : '#ffffff55' }} aria-hidden />
          {onDuty ? `Claude đang trực${duty ? ` · tới ${new Date(duty.until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Claude chưa trực'}
        </NavLink>
        <nav className="flex-1 overflow-y-auto px-5 pb-5" aria-label="Điều hướng chính">
          {NAV.map((g) => (
            <div key={g.group} className="mb-4 max-md:grid max-md:grid-cols-[90px_1fr] max-md:items-center max-md:gap-2">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-white/50 max-md:mb-0">
                <span className="h-[6px] w-3" style={{ background: 'repeating-linear-gradient(115deg,#0000 0 2px,#fff4 2px 4px)' }} />{g.group}
              </div>
              <div className="flex flex-col gap-2 max-md:flex-row max-md:flex-wrap">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === '/'} data-testid={it.testid} className="navlink">
                    <span>{it.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="pointer-events-none hidden h-24 md:block" style={{ background: 'repeating-linear-gradient(115deg,#0000 0 6px,#ffffff14 6px 8px)', maskImage: 'linear-gradient(transparent,#000)' }} aria-hidden />
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1320px] p-[clamp(14px,2.6vw,32px)]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
