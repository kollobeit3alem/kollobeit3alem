import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PageFooter } from '@/components/kb/shared';

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (element: HTMLElement, options: { type: string; shape: string; theme: string; text: string; size: string; logo_alignment: string }) => void;
    } } };
  }
}

export default function Login() {
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else if (user.role === 'assistant') navigate('/assistant');
      else navigate('/courses');
    }
  }, [isAuthenticated, user, navigate]);

  const handleGoogleLogin = useCallback(async (response: { credential: string }) => {
    try { await login(response.credential); }
    catch { toast.error('فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.'); }
  }, [login]);

  useEffect(() => {
    if (initialized.current || !googleButtonRef.current) return;
    const initGoogle = () => {
      if (window.google && googleButtonRef.current) {
        initialized.current = true;
        window.google.accounts.id.initialize({ client_id: '543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com', callback: handleGoogleLogin });
        window.google.accounts.id.renderButton(googleButtonRef.current, { type: 'standard', shape: 'pill', theme: 'outline', text: 'signin_with', size: 'large', logo_alignment: 'center' });
      }
    };
    if (window.google) initGoogle();
    else {
      const check = setInterval(() => { if (window.google) { clearInterval(check); initGoogle(); } }, 100);
      setTimeout(() => clearInterval(check), 10000);
    }
  }, [handleGoogleLogin]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "WebPage",
        "name": "تسجيل الدخول — منصة كله بيتعلم",
        "description": "سجّل دخولك لمنصة كله بيتعلم وابدأ رحلتك في تعلم المهارات والكورسات الأونلاين",
        "url": "https://kollobeit3alem.pages.dev/login",
        "isPartOf": { "@type": "EducationalOrganization", "name": "كله بيتعلم", "url": "https://kollobeit3alem.pages.dev" }
      }) }} />

      <div className="flex min-h-screen flex-col" dir="rtl">
        <header className="z-20 flex h-[72px] items-center justify-between border-b border-slate-200/70 bg-white/90 backdrop-blur-xl" style={{ borderBottomColor: 'rgba(1,86,105,0.08)' }}>
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="kb-stat-tile h-10 w-10"><i className="fas fa-book-open" /></span>
            <span className="kb-grad-text text-xl font-black">كله بيتعلم</span>
          </Link>
          <Link to="/" className="kb-btn-outline px-5 py-2 text-[13px]">
            <i className="fas fa-arrow-right text-xs" /> تصفح الدورات
          </Link>
        </header>

        <main className="relative flex flex-1 items-stretch justify-center overflow-hidden px-5 py-10" role="main">
          <div className="pointer-events-none absolute inset-0 opacity-[0.3]" aria-hidden="true">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(1,86,105,0.15) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute -top-20 left-1/4 h-96 w-96 rounded-full blur-3xl animate-kb-float" style={{ background: 'rgba(31,182,191,0.15)' }} />
            <div className="absolute -bottom-20 right-1/4 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(1,86,105,0.1)' }} />
          </div>

          <div className="relative grid w-full max-w-5xl items-center gap-8 lg:grid-cols-2">
            {/* Brand Panel */}
            <div className="hidden lg:flex flex-col justify-center">
              <div className="rounded-3xl p-10 text-white" style={{ background: 'linear-gradient(135deg, #013d4a, #015669)', boxShadow: '0 30px 80px rgba(1,86,105,0.4)' }}>
                <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '40px 40px' }} aria-hidden="true" />
                <div className="relative z-10">
                  <span className="kb-eyebrow mb-6 inline-flex border-white/20 bg-white/10 text-white">
                    <span className="kb-dot-live" /> منصة المذاكرة الأونلاين لطلاب مصر
                  </span>
                  <h1 className="kb-display mt-4 text-[32px] text-white xl:text-[38px]">
                    معلش عليك مراجعة…<br />
                    <span className="opacity-80">دايماً في وقت.</span>
                  </h1>
                  <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/80">
                    منصة كله بيتعلم — كورسات منظّمة، امتحانات بتتصحح على فور، وتقدم بيتقاس خطوة بخطوة.
                  </p>
                  <div className="mt-8 grid grid-cols-3 gap-3">
                    {[
                      { v: '٧٥٪+', l: 'نسبة النجاح' },
                      { v: '٢٤/٧', l: 'مذاكرة متاحة' },
                      { v: 'مجاناً', l: 'أول كورس' },
                    ].map(s => (
                      <div key={s.l} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                        <p className="text-lg font-black text-white">{s.v}</p>
                        <p className="mt-0.5 text-[11px] font-bold text-white/70">{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Auth Card */}
            <div className="w-full lg:pl-6">
              <div className="rounded-3xl border border-slate-200/70 bg-white p-8 text-center shadow-xl md:p-10">
                <div className="flex flex-col items-center gap-3">
                  <span className="kb-stat-tile h-16 w-16 rounded-2xl text-2xl"><i className="fas fa-graduation-cap" /></span>
                  <h1 className="kb-display text-[24px]" style={{ color: 'var(--primary)' }}>
                    أهلاً بيك في <span className="kb-grad-text">كله بيتعلم</span>
                  </h1>
                  <p className="-mt-1 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                    سجّل دخولك بمتابعة حساب جوجل
                  </p>
                </div>

                <div className="relative my-7 h-px bg-slate-200">
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-4 text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    ابدأ التعلم الآن
                  </span>
                </div>

                <div className="mb-6 grid grid-cols-3 gap-2">
                  {[
                    { icon: 'fa-book-open', label: 'كورسات منظمة' },
                    { icon: 'fa-clipboard-check', label: 'امتحانات وتصحيح' },
                    { icon: 'fa-certificate', label: 'متابعة التقدم' },
                  ].map(f => (
                    <li key={f.icon} className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 px-2 py-3 list-none">
                      <i className={`fas ${f.icon} text-sm`} style={{ color: 'var(--primary)' }} />
                      <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                    </li>
                  ))}
                </div>

                <div ref={googleButtonRef} className="flex w-full justify-center" aria-label="تسجيل الدخول بحساب جوجل" />

                <p className="mt-5 text-xs leading-relaxed text-slate-500">
                  بتسجيل دخولك، أنت توافق على{' '}
                  <Link to="/privacy" className="font-bold hover:underline" style={{ color: 'var(--primary)' }}>سياسة الخصوصية</Link>{' '}
                  الخاصة بالمنصة.
                </p>
              </div>
            </div>
          </div>
        </main>

        <PageFooter />
      </div>
    </>
  );
}
