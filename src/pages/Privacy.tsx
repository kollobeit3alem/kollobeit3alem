import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#f4f7f9] py-12 px-5 md:px-20 text-[#1e293b]" dir="rtl">
      <div className="max-w-4xl mx-auto bg-white rounded-[30px] shadow-[0_15px_40px_rgba(0,0,0,0.05)] overflow-hidden border border-[#e2e8f0]">
        
        {/* Header Section */}
        <div className="bg-[#015669] p-8 text-white text-center relative">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <svg width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
              <pattern id="pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="white" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#pattern)" />
            </svg>
          </div>
          <img src="/logo.png" alt="Logo" className="w-20 h-20 mx-auto rounded-2xl mb-4 shadow-lg border-2 border-white/20" />
          <h1 className="text-3xl font-bold">سياسة الخصوصية</h1>
          <p className="opacity-80 mt-2 text-sm">آخر تحديث: 4 أبريل 2026</p>
        </div>

        {/* Content Section */}
        <div className="p-8 md:p-12 leading-[1.8] text-right">
          
          <section className="mb-10">
            <h2 className="text-xl font-bold text-[#015669] mb-4 flex items-center gap-2">
              <i className="fas fa-info-circle"></i> مقدمة
            </h2>
            <p>
              أهلاً بك في منصة <strong>"كله بيتعلم"</strong>. نحن نولي خصوصية بياناتك أهمية قصوى. تهدف هذه الصفحة إلى توضيح كيف نقوم بجمع واستخدام البيانات التي نحصل عليها عند استخدامك للمنصة عبر خدمة "تسجيل الدخول بجوجل".
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-[#015669] mb-4 flex items-center gap-2">
              <i className="fas fa-database"></i> البيانات التي نجمعها
            </h2>
            <p className="mb-4">بمجرد تسجيل دخولك عبر جوجل، نقوم بالوصول إلى المعلومات الأساسية التالية فقط:</p>
            <ul className="list-disc list-inside space-y-2 pr-4 text-[#475569]">
              <li><strong>الاسم الشخصي:</strong> لنتمكن من تخصيص تجربتك داخل المنصة.</li>
              <li><strong>البريد الإلكتروني:</strong> لاستخدامه كمعرف فريد لحسابك ولإرسال التحديثات الهامة.</li>
              <li><strong>صورة الملف الشخصي:</strong> لتظهر في حسابك الشخصي داخل المنصة.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-[#015669] mb-4 flex items-center gap-2">
              <i className="fas fa-shield-alt"></i> كيف نستخدم بياناتك؟
            </h2>
            <p>نحن نستخدم بياناتك لغرض واحد فقط وهو <strong>توفير الخدمة التعليمية</strong>. نحن لا نقوم ببيع أو مشاركة أو تأجير بياناتك لأي جهات خارجية أو شركات إعلانية. بياناتك محفوظة في خوادم آمنة ومشفرة تماماً.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-[#015669] mb-4 flex items-center gap-2">
              <i className="fas fa-cookie-bite"></i> ملفات تعريف الارتباط (Cookies)
            </h2>
            <p>نستخدم ملفات تعريف الارتباط التقنية فقط للحفاظ على جلسة تسجيل دخولك نشطة ولضمان أمان حسابك أثناء التنقل بين صفحات المنصة.</p>
          </section>

          <section className="mb-10 border-t border-[#e2e8f0] pt-8">
            <h2 className="text-xl font-bold text-[#015669] mb-4 flex items-center gap-2">
              <i className="fas fa-envelope-open-text"></i> تواصل معنا
            </h2>
            <p>إذا كان لديك أي استفسار بخصوص سياسة الخصوصية، يمكنك التواصل معنا مباشرة عبر البريد الإلكتروني أو الواتساب الموضح في صفحة الدعم.</p>
          </section>

          {/* Footer Action */}
          <div className="mt-12 text-center">
            <Link 
              to="/" 
              className="inline-flex items-center gap-2 bg-[#015669] text-white py-3 px-8 rounded-2xl font-bold transition-all hover:shadow-[0_10px_20px_rgba(1,86,105,0.2)] hover:-translate-y-1"
            >
              <i className="fas fa-arrow-right"></i> العودة للرئيسية
            </Link>
          </div>

        </div>
      </div>

      <div className="text-center mt-8 text-[#64748b] text-sm">
        جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026
      </div>
    </div>
  );
}
