import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/* ============================================================
   مكونات مشتركة — لوحة تصميم "كله بيتعلم"
   اللون: #015669 (مقفول) · الخط: Rubik · RTL
   ============================================================ */

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-6 h-6 border-2', md: 'w-10 h-10 border-[3px]', lg: 'w-14 h-14 border-4' };
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-label="جاري التحميل">
      <span
        className={`${sizes[size]} rounded-full border-[var(--primary-color)]/20 border-t-[var(--primary-color)] animate-kb-spin`}
      />
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      {eyebrow ? <span className="kb-eyebrow">{eyebrow}</span> : null}
      <h2 className="kb-section-title mt-3">{title}</h2>
      {subtitle ? <p className="kb-subtitle mt-2 max-w-3xl">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
}: {
  icon: string;
  title: string;
  description?: string;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="kb-surface px-6 py-14 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--grad-soft)] text-[26px] text-[var(--primary-color)]">
        <i className={`fas ${icon}`} />
      </span>
      <h3 className="mt-4 text-lg font-bold text-[var(--text-main)]">{title}</h3>
      {description ? <p className="mt-1.5 text-sm text-[var(--text-muted)]">{description}</p> : null}
      {cta ? (
        <Link
          to={cta.to}
          className="kb-btn-soft mt-5 inline-flex text-sm"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function KbModal({
  open,
  onClose,
  children,
  maxWidth = 'max-w-[420px]',
  accent = 'teal' as 'teal' | 'red' | 'amber' | 'green',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  accent?: 'teal' | 'red' | 'amber' | 'green';
}) {
  if (!open) return null;
  const accentBar = {
    teal: 'bg-[var(--primary-color)]',
    red: 'bg-[var(--danger)]',
    amber: 'bg-[var(--warning)]',
    green: 'bg-[var(--success)]',
  }[accent];
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-[3px] animate-kb-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${maxWidth} overflow-hidden rounded-[1.5rem] bg-white shadow-[0_30px_70px_-20px_rgba(1,86,105,0.45)] animate-kb-fade-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={accent === 'teal' ? 'h-[3px] w-full bg-[var(--grad-brand)]' : `h-[3px] w-full ${accentBar}`}
        />
        <div className="p-6 md:p-7">{children}</div>
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <h3 className="text-xl font-extrabold text-[#1e293b]">{children}</h3>
    </div>
  );
}

export function StatCard({
  icon,
  iconClass,
  label,
  value,
  unit,
}: {
  icon: string;
  iconClass: string;
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="kb-surface flex items-center gap-4 p-5 kb-surface-hover">
      {iconClass === 'grad' ? (
        <span className="kb-stat-tile">
          <i className={`fas ${icon}`} />
        </span>
      ) : (
        <span className={`kb-stat-icon ${iconClass}`}>
          <i className={`fas ${icon}`} />
        </span>
      )}
      <div>
        <p className="text-[13px] font-bold text-[var(--text-muted)]">{label}</p>
        <p className="kb-stat-value text-[var(--primary-color)]">
          {value}
          {unit ? <span className="mr-1 text-[15px] font-bold text-[var(--text-muted)]">{unit}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const roleStyle: Record<string, string> = {
    admin: 'kb-chip-amber',
    instructor: 'kb-chip-green',
    assistant: 'kb-chip-blue',
    student: 'kb-chip-slate',
  };
  const roleName: Record<string, string> = {
    admin: 'مدير',
    instructor: 'مدرس',
    assistant: 'متابع',
    student: 'طالب',
  };
  return (
    <span className={roleStyle[role] || roleStyle.student}>
      {roleName[role] || role}
    </span>
  );
}

export function ScoreBadge({ score, pass = 50 }: { score: number; pass?: number }) {
  const passed = score >= pass;
  return (
    <span className={passed ? 'kb-chip-green' : 'kb-chip-red'}>
      {score}%
    </span>
  );
}

export function PageFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200/80 bg-white/80 px-5 py-7 text-center text-sm text-[var(--text-muted)] backdrop-blur">
      <span>جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026</span>
      <span className="mx-2 text-slate-300">|</span>
      <Link to="/privacy" className="font-bold text-[var(--primary-color)] hover:underline">
        سياسة الخصوصية
      </Link>
      <span className="mx-2 text-slate-300">|</span>
      <span>تصميم وتطوير أدهم عطية سالم</span>
    </footer>
  );
}

/* ============================================================
   هيدر عام (الصفحات العامة + الطالب)
   ============================================================ */
export function SiteHeader({
  user,
  onLogoutClick,
  loggedIn = false,
}: {
  user?: { name?: string; avatar_url?: string } | null;
  onLogoutClick?: () => void;
  loggedIn?: boolean;
}) {
  return (
    <header className="sticky top-0 z-[100] border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] w-full max-w-[1400px] items-center justify-between px-[5%]">
        <Link to="/courses" className="flex items-center gap-3 no-underline">
          <span className="kb-stat-tile h-[44px] w-[44px] rounded-xl">
            <i className="fas fa-book-open" />
          </span>
          <span className="kb-grad-text text-[22px] font-black">كله بيتعلم</span>
        </Link>

        <div className="flex items-center gap-2.5">
          {loggedIn && user ? (
            <>
              <span className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white py-1.5 pl-3.5 pr-1.5 shadow-sm sm:flex">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || 'المستخدم'}
                    className="h-8 w-8 rounded-full border-2 border-[var(--primary-color)] object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary-color)]">
                    <i className="fas fa-user text-[13px]" />
                  </span>
                )}
                <span className="text-[14px] font-bold text-[var(--text-main)]">{user.name}</span>
              </span>
              <Link to="/profile" className="kb-btn-soft rounded-full px-5 py-2.5 text-[13px]">
                <i className="fas fa-user" /> حسابي
              </Link>
              {onLogoutClick ? (
                <button
                  onClick={onLogoutClick}
                  className="kb-table-action rounded-full bg-red-50 text-red-500 hover:bg-red-100"
                  aria-label="تسجيل الخروج"
                >
                  <i className="fas fa-right-from-bracket" />
                </button>
              ) : null}
            </>
          ) : (
            <Link to="/login" className="kb-btn-grad kb-shine px-6 py-2.5 text-[14px]">
              <i className="fas fa-right-to-bracket" /> سجّل دخولك
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}