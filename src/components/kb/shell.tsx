import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export type NavItem = { key: string; label: string; icon: string; color?: string };

export function DashboardShell({
  brand, activeKey, navItems, extraNav, onNavigate, onLogout, children, user,
}: {
  brand: string; activeKey: string; navItems: NavItem[]; extraNav?: ReactNode;
  onNavigate: (key: string) => void; onLogout: () => void; children: ReactNode;
  user?: { name?: string; avatar_url?: string } | null;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const handleNav = (k: string) => { setOpen(false); onNavigate(k); };

  return (
    <div className="flex min-h-screen" dir="rtl">
      {/* Sidebar */}
      <aside className={`fixed right-0 top-0 z-[100] flex h-screen w-[280px] flex-col overflow-y-auto border-l border-slate-200 bg-white px-5 pt-8 pb-6 transition-transform duration-300 lg:sticky lg:h-auto lg:translate-x-0 ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="mb-8 flex items-center gap-2.5 pb-5" style={{ borderBottom: '1px solid rgba(1,86,105,0.08)' }}>
          <span className="kb-stat-tile h-11 w-11">
            <i className="fas fa-book-open" />
          </span>
          <div>
            <h2 className="kb-grad-text text-lg font-black leading-none">{brand}</h2>
            <p className="mt-1 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>لوحة التحكم</p>
          </div>
          <button onClick={() => setOpen(false)} className="mr-auto cursor-pointer border-none bg-transparent text-lg text-red-500 lg:hidden" aria-label="إغلاق">
            <i className="fas fa-times" />
          </button>
        </div>

        {extraNav}

        <nav className="flex flex-1 flex-col gap-1.5">
          {navItems.map(item => (
            <button key={item.key} onClick={() => handleNav(item.key)}
              className={`flex items-center gap-3 rounded-xl border-none py-3 px-4 text-right text-[15px] font-bold cursor-pointer transition-all ${
                item.key === activeKey
                  ? 'text-white shadow-lg'
                  : 'bg-transparent hover:bg-slate-50'
              }`}
              style={item.key === activeKey
                ? { background: 'linear-gradient(135deg, #015669, #0e8ba1)', boxShadow: '0 8px 20px rgba(1,86,105,0.25)' }
                : { color: 'var(--text-muted)' }
              }
            >
              <i className={`fas ${item.icon} w-5 text-center`} style={item.color && item.key !== activeKey ? { color: item.color } : undefined} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5">
          {user && (
            <div className="flex items-center gap-2.5 px-2">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name || 'المستخدم'} className="h-9 w-9 rounded-full object-cover" style={{ border: '2px solid var(--primary)' }} />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <i className="fas fa-user text-[13px]" />
                </span>
              )}
              <p className="min-w-0 truncate text-[13px] font-bold" style={{ color: 'var(--text-main)' }}>{user.name || 'المستخدم'}</p>
            </div>
          )}
          <button onClick={() => { setOpen(false); onLogout(); }}
            className="flex cursor-pointer items-center gap-3 rounded-xl border-none bg-red-50 px-4 py-3 text-right text-[14px] font-bold text-red-500 transition-colors hover:bg-red-100">
            <i className="fas fa-right-from-bracket w-5 text-center" /> تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: 'linear-gradient(135deg, #015669, #0e8ba1)' }}>
            <i className="fas fa-book-open text-[14px]" />
          </span>
          <span className="kb-grad-text text-base font-black">{brand}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/courses')} className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }} aria-label="الكورسات">
            <i className="fas fa-globe" />
          </button>
          <button onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg, #015669, #0e8ba1)' }} aria-label="فتح القائمة">
            <i className="fas fa-bars" />
          </button>
        </div>
      </div>

      <div className="flex-1 pt-16 lg:pt-0">
        <div className="mx-auto max-w-7xl p-5 md:p-8">{children}</div>
      </div>
    </div>
  );
}

export type TabType = string;

export function TabPill({ label, icon, active, onClick, color }: {
  label: string; icon: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border-none px-4 py-3 text-right text-[15px] font-bold transition-all cursor-pointer ${
        active ? 'text-white shadow-lg' : 'bg-transparent hover:bg-slate-50'
      }`}
      style={active
        ? { background: 'linear-gradient(135deg, #015669, #0e8ba1)', boxShadow: '0 6px 18px rgba(1,86,105,0.25)' }
        : { color: 'var(--text-muted)' }
      }
    >
      <i className={`fas ${icon} w-5 text-center`} style={color && !active ? { color } : undefined} />
      {label}
    </button>
  );
}

export function DataCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="kb-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(1,86,105,0.06)' }}>
        <h3 className="text-[17px] font-extrabold" style={{ color: 'var(--text-main)' }}>{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function KbTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-right text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-[12px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ background: 'var(--bg-page)', color: 'var(--primary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, total, onPrev, onNext, totalLabel }: {
  page: number; total: number; onPrev: () => void; onNext: () => void; totalLabel?: string;
}) {
  const hasPrev = page > 1;
  const hasNext = page * 50 < total;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
      <span>{totalLabel}</span>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} disabled={!hasPrev} className="kb-table-action bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
        <span className="font-bold kb-grad-text">صفحة {page}</span>
        <button onClick={onNext} disabled={!hasNext} className="kb-table-action bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
      </div>
    </div>
  );
}
