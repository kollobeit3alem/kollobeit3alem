import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
      {/* ============================================================ */}
      {/* SEO: Schema.org structured data لصفحة تسجيل الدخول           */}
      {/* يساعد جوجل على فهم المنصة ويحسن ظهورها في نتائج البحث       */}
      {/* ============================================================ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "تسجيل الدخول — منصة كله بيتعلم",
            "description": "سجّل دخولك لمنصة كله بيتعلم وابدأ رحلتك في تعلم المهارات والكورسات الأونلاين",
            "url": "https://kollobeit3alem.pages.dev/",
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
                  "name": "الرئيسية",
                  "item": "https://kollobeit3alem.pages.dev/"
                }
              ]
            }
          })
        }}
      />

      <div
        className="min-h-screen bg-gradient-to-br from-[#fdfbfb] to-[#ebedee] flex flex-col justify-between items-center"
        dir="rtl"
      >
        {/* ============================================================ */}
        {/* SEO: Main content wrapper — semantic HTML                     */}
        {/* ============================================================ */}
        <main className="flex-1 flex justify-center items-center w-full p-5" role="main">

          {/* ============================================================ */}
          {/* SEO: hidden text للروبوتات — يُحسن الفهرسة                  */}
          {/* ============================================================ */}
          <div className="sr-only" aria-hidden="false">
            <h1>منصة كله بيتعلم — كورسات أونلاين في مصر والعالم العربي</h1>
            <p>
              كله بيتعلم هي منصة التعليم الأونلاين الأولى في مصر. تعلم البرمجة، اللغات،
              مهارات سوق العمل، والتطوير الشخصي مع أفضل المدربين. كورسات مجانية ومدفوعة
              متاحة لكل المستويات. ابدأ رحلتك التعليمية الآن مع منصة كلو بيتعلم.
            </p>
            <ul>
              <li>كورسات برمجة أونلاين</li>
              <li>تعلم اللغة الإنجليزية</li>
              <li>مهارات سوق العمل</li>
              <li>تطوير الذات</li>
              <li>دورات تدريبية مجانية</li>
            </ul>
          </div>

          <div className="bg-white rounded-[28px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.08)] w-full max-w-[450px] p-12 px-10 text-center flex flex-col items-center gap-5 border border-black/[0.03] border-t-[6px] border-t-primary relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-[60px] left-1/2 -translate-x-1/2 w-[180px] h-[180px] bg-primary/10 blur-[45px] rounded-full z-0" />

            {/* Platform Identity */}
            <div className="flex flex-col items-center gap-4 z-[1]">
              <img
                src="/logo.png"
                alt="شعار منصة كله بيتعلم — أفضل منصة كورسات أونلاين في مصر"
                title="منصة كله بيتعلم"
                width="150"
                height="150"
                loading="eager"
                className="max-w-[150px] h-auto rounded-[20px] shadow-[0_10px_20px_rgba(0,0,0,0.05)] transition-transform duration-300 hover:scale-[1.03]"
              />
              {/* SEO: h2 لأن h1 موجود في sr-only — هيكل semantic صح */}
              <h2 className="text-[28px] font-bold text-primary mb-[-5px]">
                كله بيتعلم لتعلم المهارات
              </h2>
            </div>

            <p className="text-[15px] text-text-muted z-[1] leading-relaxed mb-2">
              منصتك الشبابية المتكاملة لإتقان المهارات العملية بيسر.
            </p>

            {/* Separator */}
            <div className="w-full h-px bg-slate-200 my-4 relative z-[1]">
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-primary text-[13px] font-bold">
                ابدأ التعلم الآن
              </span>
            </div>

            {/* Google Sign In Button */}
            <div
              ref={googleButtonRef}
              className="w-full flex justify-center z-[1] mt-2"
              aria-label="تسجيل الدخول بحساب جوجل"
            />

            {/* Privacy Link */}
            <div className="mt-4 text-center z-[1] w-full">
              <p className="text-[13px] text-slate-500">
                بتسجيل دخولك، أنت توافق على{' '}
                <Link
                  to="/privacy"
                  className="text-primary font-bold hover:underline"
                  title="سياسة الخصوصية — منصة كله بيتعلم"
                >
                  سياسة الخصوصية
                </Link>{' '}
                الخاصة بالمنصة.
              </p>
            </div>

          </div>
        </main>

        {/* ============================================================ */}
        {/* SEO: Footer مع بيانات المؤلف — أدهم عطية يالم               */}
        {/* ============================================================ */}
        <footer
          className="w-full p-6 text-center text-text-muted text-sm bg-white/60 backdrop-blur-md border-t border-black/[0.04]"
          role="contentinfo"
          itemScope
          itemType="https://schema.org/WPFooter"
        >
          <span>جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026</span>
          <span className="mx-2">|</span>
          <span>
            تصميم وتطوير{' '}
            <a
              href="https://adham-protofoilo.vercel.app"
              className="text-primary font-bold mx-1 hover:underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              title="أدهم عطية يالم — مطور المنصة"
              itemProp="creator"
            >
              أدهم عطية يالم
            </a>
          </span>
          <span className="mx-2">|</span>
          <Link
            to="/privacy"
            className="text-primary hover:underline"
            title="سياسة الخصوصية"
          >
            سياسة الخصوصية
          </Link>
        </footer>
      </div>
    </>
  );
}
