import { useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PageFooter } from '@/components/kb/shared';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              type: string;
              shape: string;
              theme: string;
              text: string;
              size: string;
              logo_alignment: string;
            }
          ) => void;
        };
      };
    };
  }
}

export default function Login() {
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else if (user.role === 'assistant') navigate('/assistant');
      else navigate('/courses');
    }
  }, [isAuthenticated, user, navigate]);

  const handleGoogleLogin = useCallback(async (response: { credential: string }) => {
    try {
      await login(response.credential);
    } catch (error) {
      toast.error('فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      console.error('Login error:', error);
    }
  }, [login]);

  useEffect(() => {
    if (initialized.current || !googleButtonRef.current) return;

    const initGoogle = () => {
      if (window.google && googleButtonRef.current) {
        initialized.current = true;

        window.google.accounts.id.initialize({
          client_id: '543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com',
          callback: handleGoogleLogin,
        });

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          text: 'signin_with',
          size: 'large',
          logo_alignment: 'center',
        });
      }
    };

    if (window.google) {
      initGoogle();
    } else {
      const checkInterval = setInterval(() => {
        if (window.google) {
          clearInterval(checkInterval);
          initGoogle();
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 10000);
    }
  }, [handleGoogleLogin]);

  return (
    <>
      {/* SEO: Schema.org structured data لصفحة تسجيل الدخول */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "تسجيل الدخول — منصة كله بيتعلم",
            "description": "سجّل دخولك لمنصة كله بيتعلم وابدأ رحلتك في تعلم المهارات والكورسات الأونلاين",
            "url": "https://kollobeit3alem.pages.dev/login",
            "isPartOf": {
              "@type": "EducationalOrganization",
              "name": "كله بيتعلم",
              "url": "https://kollobeit3alem.pages.dev"
            },
            "breadcrumb": {
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "الكورسات",
                  "item": "https://kollobeit3alem.pages.dev/"
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": "تسجيل الدخول",
                  "item": "https://kollobeit3alem.pages.dev/login"
                }
              ]
            }
          })
        }}
      />

      <div className="flex min-h-screen flex-col bg-[var(--bg-page)]" dir="rtl">
        {/* هيدر بسيط */}
        <header className="z-20 flex h-[72px] items-center justify-between border-b border-slate-200/70 bg-white/80 px-[5%] backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <span className="kb-stat-tile h-10 w-10 rounded-xl">
              <i className="fas fa-book-open" />
            </span>
            <span className="kb-grad-text text-xl font-black">كله بيتعلم</span>
          </Link>
          <Link to="/" className="kb-btn-outline px-5 py-2 text-[13px]">
            <i className="fas fa-arrow-right text-xs" /> تصفح الدورات
          </Link>
        </header>

        <main className="relative flex flex-1 items-stretch justify-center overflow-hidden px-5 py-10" role="main">
          {/* خامة: شبكة نقاط براند + توهجات */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(1,86,105,0.22) 1px, transparent 1px)',
                backgroundSize: '26px 26px',
                maskImage: 'radial-gradient(48rem 30rem at 50% 0%, black 20%, transparent 75%)',
              }}
            />
            <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-[rgba(31,182,191,0.16)] blur-3xl animate-kb-float" />
            <div className="absolute -bottom-24 right-1/4 h-96 w-96 rounded-full bg-[rgba(1,86,105,0.13)] blur-3xl" />
          </div>

          <div className="relative grid w-full max-w-[1040px] items-center gap-6 lg:grid-cols-2 lg:gap-0">
            {/* اللوحة اليمنى: هوية وتشجيع للمذاكرة */}
            <div className="hidden lg:block kb-rise" style={{ '--i': 0 } as CSSProperties}>
              <div className="kb-surface-grad relative overflow-hidden rounded-[2rem] p-10 lg:p-12">
                <span className="kb-grad-text absolute left-10 top-8 text-[64px] font-black opacity-15">
                  <i className="fas fa-quote-right" />
                </span>
                <div className="kb-grid-overlay pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />

                <h1 className="kb-display text-[34px] xl:text-[38px] leading-snug">
                  معلش عليك مراجعة…
                  <br />
                  <span className="text-[#b8f0f3]">دايماً في وقت.</span>
                </h1>
                <p className="mt-4 max-w-[38ch] text-[15px] leading-relaxed text-[#d5edf0]">
                  منصة المذاكرة والكورسات الأونلاين لطلاب مصر — كورسات منظّمة،
                  امتحانات بتتصحح على فور، وتقدم بيتقاس خطوة بخطوة.
                </p>

                <div className="mt-10 grid grid-cols-3 gap-3">
                  {[
                    { value: '٧٥٪+', label: 'نسبة النجاح بالامتحان' },
                    { value: '٢٤/٧', label: 'مذاكرة في أي وقت' },
                    { value: 'SAR', label: 'تقدم واضح' },
                  ].map((s, i) => (
                    <div key={s.label} className="kb-rise" style={{ '--i': i + 1 } as CSSProperties}>
                      <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                        <p className="text-[22px] font-black text-white">{s.value}</p>
                        <p className="mt-1 text-[11px] font-bold text-[#bfe9ec]">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex items-center gap-3 text-[13px] font-bold text-[#d5edf0]">
                  <span className="kb-dot-live" />
                  <span>افتح حسابك وخش مذاكرة دلوقتي — أول خطوة هي الأصعب</span>
                </div>
              </div>
            </div>

            {/* بطاقة الدخول */}
            <div
              className="kb-rise w-full lg:pl-10"
              style={{ '--i': 1 } as CSSProperties}
            >
              <div className="kb-shell">
                <div className="relative overflow-hidden p-8 text-center md:p-10">
                  <div className="flex flex-col items-center gap-3.5">
                    <span className="kb-stat-tile h-16 w-16 rounded-2xl">
                      <i className="fas fa-graduation-cap text-[26px]" />
                    </span>
                    <h1 className="kb-display text-[26px] text-[var(--primary-color)]">
                      أهلاً بيك في <span className="kb-grad-text">كله بيتعلم</span>
                    </h1>
                    <p className="-mt-1 text-[14px] font-bold text-[var(--text-muted)]">
                      سجّل دخولك بمتابعة حساب جوجل عشان نبدأ
                    </p>
                  </div>

                  {/* فاصل */}
                  <div className="relative my-7 h-px bg-slate-200">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-4 text-[13px] font-bold text-[var(--text-muted)]">
                      ابدأ التعلم الآن
                    </span>
                  </div>

                  <ul className="mb-6 grid grid-cols-3 gap-2 text-center">
                    {[
                      { icon: 'fa-book-open', label: 'كورسات منظمة' },
                      { icon: 'fa-clipboard-check', label: 'امتحانات وتصحيح' },
                      { icon: 'fa-certificate', label: 'متابعة التقدم' },
                    ].map((f) => (
                      <li key={f.icon} className="flex flex-col items-center gap-1.5 rounded-2xl bg-[var(--grad-soft)] px-2 py-3">
                        <i className={`fas ${f.icon} text-[15px] text-[var(--primary-color)]`} />
                        <span className="text-[11px] font-bold text-[var(--text-muted)]">{f.label}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Google Sign In Button */}
                  <div
                    ref={googleButtonRef}
                    className="flex w-full justify-center"
                    aria-label="تسجيل الدخول بحساب جوجل"
                  />

                  {/* Privacy */}
                  <p className="mt-5 text-[12px] leading-relaxed text-slate-500">
                    بتسجيل دخولك، أنت توافق على{' '}
                    <Link
                      to="/privacy"
                      className="font-bold text-[var(--primary-color)] hover:underline"
                      title="سياسة الخصوصية — منصة كله بيتعلم"
                    >
                      سياسة الخصوصية
                    </Link>{' '}
                    الخاصة بالمنصة.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <PageFooter />
      </div>
    </>
  );
}