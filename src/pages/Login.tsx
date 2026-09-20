import { useEffect, useRef, useCallback } from 'react';
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
        <header className="flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/80 px-[5%] backdrop-blur">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <img src="/logo.png" alt="شعار منصة كله بيتعلم" className="h-10 w-10 rounded-lg" />
            <span className="text-xl font-extrabold text-[var(--primary-color)]">كله بيتعلم</span>
          </Link>
          <Link to="/" className="kb-btn-ghost px-4 py-2 text-[13px]">
            <i className="fas fa-arrow-right text-xs" /> تصفح الدورات
          </Link>
        </header>

        <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-10" role="main">
          {/* خامة تراثية: شبكة نقاط براند */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(1,86,105,0.18) 1px, transparent 1px)',
                backgroundSize: '26px 26px',
              }}
            />
            <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[var(--primary-light)] blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-emerald-100/50 blur-3xl" />
          </div>

          <div className="relative w-full max-w-[440px] animate-kb-fade-up rounded-3xl border border-slate-200/70 bg-white p-8 md:p-10 text-center shadow-[0_25px_60px_rgba(2,8,23,0.08)]">
            {/* هوية المنصة */}
            <div className="flex flex-col items-center gap-3.5">
              <img
                src="/logo.png"
                alt="شعار منصة كله بيتعلم — أفضل منصة كورسات أونلاين في مصر"
                title="منصة كله بيتعلم"
                width="120"
                height="120"
                loading="eager"
                className="h-auto max-w-[120px] rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.08)]"
              />
              <h1 className="text-[26px] font-extrabold text-[var(--primary-color)]">
                كله بيتعلم
              </h1>
              <p className="-mt-1 text-[15px] font-bold text-[#334155]">
                منصة المذاكرة والكورسات الأونلاين لطلاب مصر
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
                <li key={f.icon} className="flex flex-col items-center gap-1.5 rounded-xl bg-[var(--bg-page)] px-2 py-3">
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
        </main>

        <PageFooter />
      </div>
    </>
  );
}