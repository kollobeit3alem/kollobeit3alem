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
        <div className="mb-9 flex items-center justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="شعار منصة كله بيتعلم" className="h-11 w-11 rounded-xl" />
            <h2 className="text-[20px] font-extrabold text-[var(--primary-color)]">{brand}</h2>
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
                className={`flex items-center gap-3 rounded-xl border-none py-3 px-4 text-right text-[15px] font-bold cursor-pointer transition-all duration-200 ${
                  active
                    ? 'bg-[var(--primary-color)] text-white shadow-[0_10px_20px_rgba(1,86,105,0.18)]'
                    : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-page)] hover:text-[var(--primary-color)] hover:-translate-x-1'
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
                <p className="truncate text-[13px] font-bold text-[#1e293b]">{user.name || 'المستخدم'}</p>
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
      <div className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between bg-white px-4 py-3 shadow-sm lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="شعار منصة كله بيتعلم" className="h-9 w-9 rounded-lg" />
          <span className="text-[16px] font-extrabold text-[var(--primary-color)]">{brand}</span>
        </div>
        <button
          onClick={() => navigate('/courses')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600"
          aria-label="تصفح الكورسات"
        >
          <i className="fas fa-globe" />
        </button>
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-color)] text-white"
          aria-label="فتح القائمة"
        >
          <i className="fas fa-bars" />
        </button>
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
          ? 'bg-[var(--primary-color)] text-white shadow-[0_8px_18px_rgba(1,86,105,0.18)]'
          : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-page)] hover:text-[var(--primary-color)]'
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h3 className="text-[17px] font-extrabold text-[#1e293b]">{title}</h3>
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
                className="bg-[var(--bg-page)] px-4 py-3 text-[13px] font-extrabold text-[var(--primary-color)] whitespace-nowrap"
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
          className="kb-table-action bg-slate-50 text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          السابق
        </button>
        <span className="font-bold text-[#1e293b]">صفحة {page}</span>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="kb-table-action bg-slate-50 text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          التالي
        </button>
      </div>
    </div>
  );
}