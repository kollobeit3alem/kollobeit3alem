import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-6 h-6 border-2', md: 'w-10 h-10 border-[3px]', lg: 'w-14 h-14 border-4' };
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-label="جاري التحميل">
      <span className={`${s[size]} rounded-full border-slate-200 border-t-[var(--primary)] animate-kb-spin`} />
    </div>
  );
}

export function SectionHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <span className="kb-eyebrow">{eyebrow}</span>}
      <h2 className="kb-section-title mt-3">{title}</h2>
      {subtitle && <p className="kb-subtitle mt-2 max-w-3xl">{subtitle}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, description, cta }: { icon: string; title: string; description?: string; cta?: { to: string; label: string } }) {
  return (
    <div className="kb-surface p-14 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-2xl text-slate-300">
        <i className={`fas ${icon}`} />
      </span>
      <h3 className="mt-4 text-lg font-bold text-[var(--text-main)]">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-[var(--text-muted)]">{description}</p>}
      {cta && (
        <Link to={cta.to} className="kb-btn-soft mt-5 inline-flex text-sm">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function KbModal({
  open, onClose, children, maxWidth = 'max-w-md', accent = 'teal',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  accent?: 'teal' | 'red' | 'amber' | 'green';
}) {
  if (!open) return null;
  const bar: Record<string, string> = {
    teal: 'var(--primary)', red: 'var(--danger)', amber: 'var(--warning)', green: 'var(--success)',
  };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`w-full ${maxWidth} overflow-hidden rounded-2xl bg-white shadow-xl animate-kb-fade-up`} onClick={e => e.stopPropagation()}>
        <div className="h-1 w-full" style={{ background: bar[accent] }} />
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-4 text-xl font-extrabold text-[var(--text-main)]">{children}</h3>;
}

export function StatCard({ icon, iconClass, label, value, unit }: {
  icon: string; iconClass: string; label: string; value: string | number; unit?: string;
}) {
  return (
    <div className="kb-surface flex items-center gap-4 p-5">
      <span className={`kb-stat-icon ${iconClass}`}>
        <i className={`fas ${icon}`} />
      </span>
      <div>
        <p className="text-[13px] font-bold text-[var(--text-muted)]">{label}</p>
        <p className="kb-stat-value" style={{ color: 'var(--primary)' }}>
          {value}
          {unit && <span className="mr-1 text-[15px] font-bold" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
        </p>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const s: Record<string, string> = { admin: 'kb-chip-amber', instructor: 'kb-chip-green', assistant: 'kb-chip-blue', student: 'kb-chip-slate' };
  const n: Record<string, string> = { admin: 'مدير', instructor: 'مدرس', assistant: 'متابع', student: 'طالب' };
  return <span className={s[role] || s.student}>{n[role] || role}</span>;
}

export function ScoreBadge({ score, pass = 50 }: { score: number; pass?: number }) {
  return <span className={score >= pass ? 'kb-chip-green' : 'kb-chip-red'}>{score}%</span>;
}

export function PageFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white px-5 py-6 text-center text-sm text-[var(--text-muted)]">
      <span>جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026</span>
      <span className="mx-2 text-slate-300">|</span>
      <Link to="/privacy" className="font-bold hover:underline" style={{ color: 'var(--primary)' }}>سياسة الخصوصية</Link>
      <span className="mx-2 text-slate-300">|</span>
      <span>تصميم وتطوير أدهم عطية سالم</span>
    </footer>
  );
}

export function SiteHeader({ user, onLogoutClick, loggedIn = false }: {
  user?: { name?: string; avatar_url?: string } | null;
  onLogoutClick?: () => void;
  loggedIn?: boolean;
}) {
  return (
    <header className="sticky top-0 z-[100] border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-5">
        <Link to="/courses" className="flex items-center gap-3 no-underline">
          <span className="kb-stat-tile h-11 w-11">
            <i className="fas fa-book-open" />
          </span>
          <span className="kb-grad-text text-xl font-black">كله بيتعلم</span>
        </Link>
        <div className="flex items-center gap-2.5">
          {loggedIn && user ? (
            <>
              <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3.5 pr-1.5 shadow-sm sm:flex">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name || 'المستخدم'} className="h-8 w-8 rounded-full object-cover" style={{ border: '2px solid var(--primary)' }} />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                    <i className="fas fa-user text-[13px]" />
                  </span>
                )}
                <span className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>{user.name}</span>
              </span>
              <Link to="/profile" className="kb-btn-soft rounded-full px-4 py-2 text-[13px]">
                <i className="fas fa-user" /> حسابي
              </Link>
              {onLogoutClick && (
                <button onClick={onLogoutClick} className="kb-table-action rounded-full bg-red-50 text-red-500 hover:bg-red-100" aria-label="تسجيل الخروج">
                  <i className="fas fa-right-from-bracket" />
                </button>
              )}
            </>
          ) : (
            <Link to="/login" className="kb-btn-grad px-5 py-2.5 text-sm">
              <i className="fas fa-right-to-bracket" /> سجّل دخولك
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
