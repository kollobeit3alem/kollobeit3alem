import { SiteHeader, PageFooter } from '@/components/kb/shared';

export default function Privacy() {
  return (
    <>
      {/* ============================================================ */}
      {/* SEO: Schema.org لصفحة الخصوصية                              */}
      {/* ============================================================ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "سياسة الخصوصية — منصة كله بيتعلم",
            "description": "سياسة الخصوصية والاستخدام لمنصة كله بيتعلم للكورسات الأونلاين",
            "url": "https://kollobeit3alem.pages.dev/privacy",
            "dateModified": "2026-04-04",
            "author": {
              "@type": "Person",
              "name": "أدهم عطية سالم",
              "url": "https://adham-protofoilo.vercel.app"
            },
            "publisher": {
              "@type": "Organization",
              "name": "كله بيتعلم",
              "url": "https://kollobeit3alem.pages.dev",
              "logo": "https://kollobeit3alem.pages.dev/logo.png"
            },
            "breadcrumb": {
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "الرئيسية",
                  "item": "https://kollobeit3alem.pages.dev/"
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": "سياسة الخصوصية",
                  "item": "https://kollobeit3alem.pages.dev/privacy"
                }
              ]
            }
          })
        }}
      />

      <div className="flex min-h-screen flex-col bg-[var(--bg-page)] text-[#1e293b]" dir="rtl">
        <SiteHeader />

        <main className="flex-1" itemScope itemType="https://schema.org/WebPage">
          {/* ===== Hero ===== */}
          <section className="relative overflow-hidden border-b border-slate-200 bg-white py-10 sm:py-16 md:py-20">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.5]"
              style={{
                backgroundImage: 'radial-gradient(var(--primary-color) 1.2px, transparent 1.2px)',
                backgroundSize: '28px 28px',
                maskImage: 'radial-gradient(ellipse 70% 90% at 50% 0%, black, transparent)',
                WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 50% 0%, black, transparent)',
              }}
            />
            <div className="relative z-10 mx-auto max-w-4xl px-[5%] text-center">
              <span className="kb-chip kb-chip-teal">
                <i className="far fa-shield-halved" /> خصوصية البيانات
              </span>
              <h1 className="kb-section-title mt-5 text-[22px] sm:text-[26px] md:text-[2.125rem]" itemProp="name">
                سياسة الخصوصية — منصة كله بيتعلم
              </h1>
              <p className="kb-subtitle mx-auto mt-3 max-w-2xl">
                شرح واضح لكيفية جمعنا واستخدامنا لبياناتك عند استخدامك منصة كله بيتعلم لتعلّم الكورسات الأونلاين.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[13px] font-bold text-[var(--text-muted)]">
                <i className="far fa-calendar-alt" />
                <time dateTime="2026-04-04" itemProp="dateModified">آخر تحديث: 4 أبريل 2026</time>
              </span>
            </div>
          </section>

          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-[5%] sm:py-12 md:py-16">
            {/* ===== Breadcrumb ===== */}
            <nav aria-label="مسار التنقل" className="mb-8">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]" itemScope itemType="https://schema.org/BreadcrumbList">
                <li itemScope itemProp="itemListElement" itemType="https://schema.org/ListItem">
                  <a href="/" className="font-bold text-[var(--primary-color)] hover:underline">
                    <span itemProp="name">الرئيسية</span>
                  </a>
                  <meta itemProp="position" content="1" />
                </li>
                <li className="text-slate-300">›</li>
                <li itemScope itemProp="itemListElement" itemType="https://schema.org/ListItem">
                  <span className="font-bold text-[#1e293b]" itemProp="name">سياسة الخصوصية</span>
                  <meta itemProp="position" content="2" />
                </li>
              </ol>
            </nav>

            <div className="space-y-5" itemProp="description">
              {/* المقدمة */}
              <section className="kb-surface p-7 md:p-8" aria-labelledby="intro-heading">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                  <span className="kb-stat-icon kb-icon-teal shrink-0"><i className="fas fa-handshake" /></span>
                  <div>
                    <h2 id="intro-heading" className="text-[20px] font-extrabold text-[var(--primary-color)]">مقدمة والتزام</h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                      أهلاً بك في منصة <strong>كله بيتعلم</strong>. نحن نولي خصوصية بياناتك أهمية قصوى. تهدف هذه الصفحة
                      إلى توضيح كيف نقوم بجمع واستخدام البيانات التي نحصل عليها عند استخدامك للمنصة عبر خدمة
                      "تسجيل الدخول بجوجل".
                    </p>
                  </div>
                </div>
              </section>

              {/* البيانات التي نجمعها */}
              <section className="kb-surface p-7 md:p-8" aria-labelledby="data-heading">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                  <span className="kb-stat-icon kb-icon-green shrink-0"><i className="fas fa-database" /></span>
                  <div className="flex-1">
                    <h2 id="data-heading" className="text-[20px] font-extrabold text-[var(--primary-color)]">البيانات التي نجمعها</h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                      بمجرد تسجيل دخولك عبر حساب جوجل، نقوم بالوصول إلى المعلومات الأساسية التالية فقط:
                    </p>
                    <ul className="mt-3 space-y-2 text-[15px] text-slate-600">
                      <li className="flex items-start gap-2.5">
                        <i className="fas fa-circle-check mt-1 text-emerald-500" />
                        <span><strong>الاسم الشخصي:</strong> لنتمكن من تخصيص تجربتك والترحيب بك داخل المنصة.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <i className="fas fa-circle-check mt-1 text-emerald-500" />
                        <span><strong>البريد الإلكتروني:</strong> لاستخدامه كمعرف فريد لحسابك ولإرسال التحديثات.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <i className="fas fa-circle-check mt-1 text-emerald-500" />
                        <span><strong>صورة الملف الشخصي:</strong> لتظهر في حسابك الشخصي وشهاداتك.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* كيف نستخدم بياناتك */}
              <section className="kb-surface p-7 md:p-8" aria-labelledby="usage-heading">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                  <span className="kb-stat-icon kb-icon-teal shrink-0"><i className="fas fa-shield-alt" /></span>
                  <div>
                    <h2 id="usage-heading" className="text-[20px] font-extrabold text-[var(--primary-color)]">كيف نستخدم بياناتك؟</h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                      نحن نستخدم بياناتك لغرض واحد فقط وهو <strong>توفير الخدمة التعليمية لك</strong>. المنصة لا تقوم
                      ببيع، مشاركة، أو تأجير بياناتك لأي جهات خارجية أو شركات إعلانية. بياناتك محفوظة في خوادم
                      سحابية آمنة ومشفرة تماماً.
                    </p>
                  </div>
                </div>
              </section>

              {/* الملفات */}
              <section className="kb-surface p-7 md:p-8" aria-labelledby="cookies-heading">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                  <span className="kb-stat-icon kb-icon-amber shrink-0"><i className="fas fa-cookie-bite" /></span>
                  <div>
                    <h2 id="cookies-heading" className="text-[20px] font-extrabold text-[var(--primary-color)]">ملفات تعريف الارتباط (Cookies)</h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                      نستخدم ملفات تعريف الارتباط التقنية الضرورية فقط للحفاظ على جلسة تسجيل دخولك نشطة، ولضمان أمان
                      حسابك أثناء التنقل بين الدورات والمحاضرات المختلفة داخل المنصة.
                    </p>
                  </div>
                </div>
              </section>

              {/* التواصل */}
              <section className="mb-2 mt-10 rounded-3xl border border-slate-100 bg-white bg-gradient-to-bl from-white to-emerald-50/40 p-8 text-center" aria-labelledby="contact-heading">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-light)] text-[24px] text-[var(--primary-color)]">
                  <i className="fas fa-headset" />
                </span>
                <h2 id="contact-heading" className="mt-4 text-lg font-extrabold text-[var(--primary-color)]">هل لديك أي استفسار؟</h2>
                <p className="mx-auto mt-2 max-w-md text-[15px] text-slate-600">
                  فريق الدعم الفني متواجد دائماً للرد على أسئلتك بخصوص الخصوصية أو أي أمور أخرى.
                </p>
              </section>
            </div>

            {/* CTA عودة */}
            <div className="mt-8 border-t border-slate-200 pt-8 text-center">
              <a
                href="/"
                title="العودة لمنصة كله بيتعلم"
                className="kb-btn-primary inline-flex px-8"
              >
                <i className="fas fa-home" /> العودة للصفحة الرئيسية
              </a>
              <p className="mt-5 text-[13px] font-bold text-[var(--text-muted)]">
                جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026 —{' '}
                <a
                  href="https://adham-protofoilo.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  itemProp="author"
                  className="text-[var(--primary-color)] hover:underline"
                >
                  أدهم عطية سالم
                </a>
              </p>
            </div>
          </div>
        </main>

        <PageFooter />
      </div>
    </>
  );
}