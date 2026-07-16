import { Link } from 'react-router-dom';

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

      <div
        className="min-h-screen bg-[#f8fafc] py-12 px-5 md:px-8 text-[#1e293b] font-sans relative overflow-hidden"
        dir="rtl"
        itemScope
        itemType="https://schema.org/WebPage"
      >
        {/* الدوائر التجميلية في الخلفية */}
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-[#015669]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-4xl mx-auto relative z-10">

          {/* Header Section */}
          <header className="bg-gradient-to-br from-[#015669] to-[#013a47] rounded-t-[30px] p-10 text-white text-center relative overflow-hidden shadow-lg border-b-4 border-emerald-400">
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

            <div className="relative z-10 flex flex-col items-center">
              <div className="w-24 h-24 bg-white p-2 rounded-2xl shadow-xl mb-5 transform transition-transform hover:scale-105">
                <img
                  src="/logo.png"
                  alt="شعار منصة كله بيتعلم"
                  title="منصة كله بيتعلم للكورسات الأونلاين"
                  width="88"
                  height="88"
                  loading="lazy"
                  className="w-full h-full object-cover rounded-xl"
                  itemProp="image"
                />
              </div>
              {/* SEO: h1 واضح يحتوي على اسم المنصة والصفحة */}
              <h1 className="text-3xl md:text-4xl font-bold mb-3" itemProp="name">
                سياسة الخصوصية — منصة كله بيتعلم
              </h1>
              <span className="inline-block px-4 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium border border-white/20">
                <i className="far fa-calendar-alt ml-2"></i>
                <time dateTime="2026-04-04" itemProp="dateModified">آخر تحديث: 4 أبريل 2026</time>
              </span>
            </div>
          </header>

          {/* Content Section */}
          <main className="bg-white rounded-b-[30px] p-6 md:p-10 shadow-xl border border-slate-100" role="main" itemProp="mainContentOfPage">

            {/* Breadcrumb — SEO ومساعدة للمستخدم */}
            <nav aria-label="مسار التنقل" className="mb-6">
              <ol className="flex items-center gap-2 text-sm text-slate-400" itemScope itemType="https://schema.org/BreadcrumbList">
                <li itemScope itemProp="itemListElement" itemType="https://schema.org/ListItem">
                  <Link to="/" className="hover:text-[#015669] transition-colors" itemProp="item">
                    <span itemProp="name">الرئيسية</span>
                  </Link>
                  <meta itemProp="position" content="1" />
                </li>
                <li className="text-slate-300">›</li>
                <li itemScope itemProp="itemListElement" itemType="https://schema.org/ListItem">
                  <span className="text-[#015669] font-medium" itemProp="name">سياسة الخصوصية</span>
                  <meta itemProp="position" content="2" />
                </li>
              </ol>
            </nav>

            <div className="space-y-6" itemProp="description">

              {/* Card 1 */}
              <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100 transition-all hover:shadow-md hover:border-[#015669]/30 group" aria-labelledby="intro-heading">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#015669]/10 text-[#015669] flex items-center justify-center text-xl group-hover:scale-110 transition-transform" aria-hidden="true">
                    <i className="fas fa-handshake"></i>
                  </div>
                  <h2 id="intro-heading" className="text-xl font-bold text-[#015669]">مقدمة والتزام</h2>
                </div>
                <p className="text-slate-600 leading-relaxed pr-16 text-[15px]">
                  أهلاً بك في منصة <strong>كله بيتعلم</strong>. نحن نولي خصوصية بياناتك أهمية قصوى. تهدف هذه الصفحة إلى توضيح كيف نقوم بجمع واستخدام البيانات التي نحصل عليها عند استخدامك للمنصة عبر خدمة "تسجيل الدخول بجوجل".
                </p>
              </section>

              {/* Card 2 */}
              <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100 transition-all hover:shadow-md hover:border-[#015669]/30 group" aria-labelledby="data-heading">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xl group-hover:scale-110 transition-transform" aria-hidden="true">
                    <i className="fas fa-database"></i>
                  </div>
                  <h2 id="data-heading" className="text-xl font-bold text-[#015669]">البيانات التي نجمعها</h2>
                </div>
                <div className="pr-16 text-slate-600 text-[15px]">
                  <p className="mb-3">بمجرد تسجيل دخولك عبر حساب جوجل، نقوم بالوصول إلى المعلومات الأساسية التالية فقط:</p>
                  <ul className="list-disc list-inside space-y-2 text-slate-600 marker:text-emerald-500">
                    <li><strong>الاسم الشخصي:</strong> لنتمكن من تخصيص تجربتك والترحيب بك داخل المنصة.</li>
                    <li><strong>البريد الإلكتروني:</strong> لاستخدامه كمعرف فريد لحسابك ولإرسال التحديثات.</li>
                    <li><strong>صورة الملف الشخصي:</strong> لتظهر في حسابك الشخصي وشهاداتك.</li>
                  </ul>
                </div>
              </section>

              {/* Card 3 */}
              <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100 transition-all hover:shadow-md hover:border-[#015669]/30 group" aria-labelledby="usage-heading">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xl group-hover:scale-110 transition-transform" aria-hidden="true">
                    <i className="fas fa-shield-alt"></i>
                  </div>
                  <h2 id="usage-heading" className="text-xl font-bold text-[#015669]">كيف نستخدم بياناتك؟</h2>
                </div>
                <p className="text-slate-600 leading-relaxed pr-16 text-[15px]">
                  نحن نستخدم بياناتك لغرض واحد فقط وهو <strong>توفير الخدمة التعليمية لك</strong>. المنصة لا تقوم ببيع، مشاركة، أو تأجير بياناتك لأي جهات خارجية أو شركات إعلانية. بياناتك محفوظة في خوادم سحابية آمنة ومشفرة تماماً.
                </p>
              </section>

              {/* Card 4 */}
              <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100 transition-all hover:shadow-md hover:border-[#015669]/30 group" aria-labelledby="cookies-heading">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center text-xl group-hover:scale-110 transition-transform" aria-hidden="true">
                    <i className="fas fa-cookie-bite"></i>
                  </div>
                  <h2 id="cookies-heading" className="text-xl font-bold text-[#015669]">ملفات تعريف الارتباط (Cookies)</h2>
                </div>
                <p className="text-slate-600 leading-relaxed pr-16 text-[15px]">
                  نستخدم ملفات تعريف الارتباط التقنية الضرورية فقط للحفاظ على جلسة تسجيل دخولك نشطة، ولضمان أمان حسابك أثناء التنقل بين الدورات والمحاضرات المختلفة داخل المنصة.
                </p>
              </section>

              {/* Contact Section */}
              <section className="mt-10 p-6 bg-[#015669]/5 rounded-2xl border border-[#015669]/10 text-center" aria-labelledby="contact-heading">
                <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center text-[#015669] text-2xl shadow-sm mb-4" aria-hidden="true">
                  <i className="fas fa-headset"></i>
                </div>
                <h2 id="contact-heading" className="text-lg font-bold text-[#015669] mb-2">هل لديك أي استفسار؟</h2>
                <p className="text-slate-600 text-[15px] mb-4">
                  فريق الدعم الفني متواجد دائماً للرد على أسئلتك بخصوص الخصوصية أو أي أمور أخرى.
                </p>
              </section>

            </div>

            {/* Footer Action */}
            <div className="mt-10 pt-8 border-t border-slate-100 text-center flex flex-col items-center">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-3 bg-[#015669] text-white py-3.5 px-8 rounded-xl font-bold transition-all hover:bg-[#014150] hover:shadow-[0_10px_20px_rgba(1,86,105,0.2)] hover:-translate-y-1 w-full md:w-auto"
                title="العودة لمنصة كله بيتعلم"
              >
                <i className="fas fa-home" aria-hidden="true"></i>
                العودة للصفحة الرئيسية
              </Link>

              <div className="mt-6 text-slate-400 text-sm font-medium">
                جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026 —{' '}
                <a
                  href="https://adham-protofoilo.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#015669] hover:underline"
                  title="أدهم عطية سالم — مطور المنصة"
                  itemProp="author"
                >
                  أدهم عطية سالم
                </a>
              </div>
            </div>

          </main>
        </div>
      </div>
    </>
  );
}
