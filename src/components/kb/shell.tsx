import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/* ============================================================
   Shell موحّد للوحات التحكم — RTL off-canvas sidebar
   ============================================================ */

export type NavItem = {
  key: string;
  label: string;
  icon: string;
  color?: string;
};

export function DashboardShell({
  brand,
  activeKey,
  navItems,
  extraNav,
  onNavigate,
  onLogout,
  children,
  user,
}: {
  brand: string;
  activeKey: string;
  navItems: NavItem[];
  extraNav?: ReactNode;
  onNavigate: (key: string) => void;
  onLogout: () => void;
  children: ReactNode;
  user?: { name?: string; avatar_url?: string } | null;
}) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  const handleNav = (key: string) => {
    setSidebarOpen(false);
    onNavigate(key);
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[var(--bg-page)] text-[#1e293b]" dir="rtl">
      {/* Sidebar */}
      <aside
        className={`fixed right-0 top-0 z-[100] flex h-screen w-[280px] flex-col overflow-y-auto border-l border-slate-200 bg-white pb-6 px-5 pt-8 transition-all duration-300 lg:sticky lg:h-auto lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        style={{ boxShadow: '-5px 0 30px rgba(0,0,0,0.03)' }}
      >
        <div className="mb-8 flex items-center justify-between pb-5" style={{ borderBottom: '1px solid rgba(1,86,105,0.08)' }}>
          <div className="flex items-center gap-2.5">
            <span className="kb-stat-tile h-11 w-11 rounded-xl">
              <i className="fas fa-book-open" />
            </span>
            <div>
              <h2 className="kb-grad-text text-[18px] font-black leading-none">{brand}</h2>
              <p className="mt-1 text-[11px] font-bold tracking-wide text-[var(--text-muted)]">لوحة التحكم</p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="cursor-pointer border-none bg-transparent text-xl text-[var(--danger)] lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {extraNav}

        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => {
            const active = item.key === activeKey;
            return (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                className={`flex items-center gap-3 rounded-xl border-none py-3 pl-4 pr-4 text-right text-[15px] font-bold cursor-pointer transition-all duration-300 ${
                  active
                    ? 'bg-[var(--grad-brand)] text-white shadow-[0_12px_24px_-8px_rgba(1,86,105,0.5)]'
                    : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--grad-soft)] hover:text-[var(--primary-color)] hover:-translate-x-1'
                }`}
              >
                <i className={`fas ${item.icon} w-5 text-center`} style={item.color ? { color: active ? undefined : item.color } : undefined} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5">
          {user ? (
            <div className="flex items-center gap-2.5 px-2">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name || 'المستخدم'} className="h-9 w-9 rounded-full border-2 border-[var(--primary-color)] object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary-color)]">
                  <i className="fas fa-user text-[13px]" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[var(--text-main)]">{user.name || 'المستخدم'}</p>
              </div>
            </div>
          ) : null}
          <button
            onClick={() => {
              closeSidebar();
              onLogout();
            }}
            className="flex cursor-pointer items-center gap-3 rounded-xl border-none bg-[#fff1f2] px-4 py-3 text-right text-[14px] font-bold text-[var(--danger)] transition-colors hover:bg-red-100"
          >
            <i className="fas fa-right-from-bracket w-5 text-center" /> تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--grad-brand)] text-white">
            <i className="fas fa-book-open text-[14px]" />
          </span>
          <span className="kb-grad-text text-[16px] font-black">{brand}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/courses')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--grad-soft)] text-[var(--primary-color)]"
            aria-label="تصفح الكورسات"
          >
            <i className="fas fa-globe" />
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--grad-brand)] text-white shadow-[0_8px_16px_-6px_rgba(1,86,105,0.5)]"
            aria-label="فتح القائمة"
          >
            <i className="fas fa-bars" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 overflow-x-hidden ${'pt-16 lg:pt-0'}`}>
        <div className="mx-auto max-w-[1400px] p-5 md:p-8">{children}</div>
      </div>
    </div>
  );
}

export type TabType = string;

export function TabPill({
  label,
  icon,
  active,
  onClick,
  color,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border-none px-4 py-3 text-right text-[15px] font-bold transition-all duration-200 cursor-pointer ${
        active
          ? 'bg-[var(--grad-brand)] text-white shadow-[0_10px_22px_-8px_rgba(1,86,105,0.5)]'
          : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--grad-soft)] hover:text-[var(--primary-color)]'
      }`}
    >
      <i className={`fas ${icon} w-5 text-center`} style={color && !active ? { color } : undefined} />
      {label}
    </button>
  );
}

export function DataCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="kb-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'rgba(1,86,105,0.08)' }}>
        <h3 className="text-[17px] font-extrabold text-[var(--text-main)]">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function KbTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-right text-[14px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="bg-[var(--bg-page)] px-4 py-3 text-[12.5px] font-extrabold tracking-wide whitespace-nowrap text-[var(--primary-color)]"
              >
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

export function Pagination({
  page,
  total,
  onPrev,
  onNext,
  totalLabel,
}: {
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  totalLabel?: string;
}) {
  const hasPrev = page > 1;
  const hasNext = page * 50 < total;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[var(--text-muted)]">
      <span>{totalLabel}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="kb-table-action rounded-full bg-slate-50 text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          السابق
        </button>
        <span className="font-bold text-[var(--text-main)]">
          صفحة <span className="kb-grad-text">{page}</span>
        </span>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="kb-table-action rounded-full bg-slate-50 text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          التالي
        </button>
      </div>
    </div>
  );
}