import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall, publicApiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course } from '@/types';

// ============================================================================
// الصفحة الرئيسية — Courses (عامة للجميع)
// ============================================================================
export default function Courses() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Payment Modal (للمستخدمين المسجلين فقط لتأكيد الدفع)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Phone Modal
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const [isEnrolling, setIsEnrolling] = useState(false);

  // إظهار مودال التليفون إذا كان المستخدم مسجل دخول ولا يملك رقم هاتف
  useEffect(() => {
    if (user && !user.phone) {
      setShowPhoneModal(true);
    }
  }, [user]);

  // جلب رصيد المحفظة (فقط لو مسجل دخول)
  const fetchWalletData = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-dashboard', token) as any;
      setWalletBalance(data.stats?.walletBalance || 0);
    } catch (error) {
      console.error('Failed to load wallet balance:', error);
    }
  }, [token]);

  // جلب الاشتراكات (فقط لو مسجل دخول)
  const fetchEnrollments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-enrollments', token) as number[];
      setEnrolledCourseIds(data);
    } catch (error) {
      console.error('Failed to load enrollments:', error);
    }
  }, [token]);

  // جلب الكورسات — عام بدون توكن
  const fetchCourses = useCallback(async () => {
    try {
      // نستخدم publicApiCall عشان الكورسات عامة
      const data = await publicApiCall('/api/courses') as Course[];
      setCourses(data);
    } catch (error) {
      console.error('Failed to load courses:', error);
      toast.error('فشل تحميل الدورات');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // نجلب الكورسات دايماً (حتى بدون لوجن)
    fetchCourses();
  }, [fetchCourses]);

  useEffect(() => {
    // نجلب الاشتراكات والمحفظة فقط لو في توكن
    if (token) {
      fetchWalletData();
      fetchEnrollments();
    }
  }, [token, fetchEnrollments, fetchWalletData]);

  // دالة الاشتراك
  const handleEnroll = async (courseId: number, coursePrice: number = 0) => {
    // لو مش مسجل دخول → يتم توجيهه لصفحة تسجيل الدخول
    if (!isAuthenticated || !token) {
      navigate('/login');
      return;
    }

    setIsEnrolling(true);
    try {
      await apiCall('/api/enroll', token, 'POST', { course_id: courseId });
      setEnrolledCourseIds(prev => [...prev, courseId]);
      if (coursePrice > 0) {
        setWalletBalance(prev => prev - coursePrice);
      }
      toast.success('تم الاشتراك بنجاح!');
      navigate(`/course?id=${courseId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل الاشتراك. تأكد من رصيد محفظتك.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const openPaymentModal = (course: Course) => {
    // لو مش مسجل دخول → يتم توجيهه لصفحة تسجيل الدخول بدلاً من المودال
    if (!isAuthenticated || !token) {
      navigate('/login');
      return;
    }
    setSelectedCourse(course);
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedCourse(null);
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingPhone(true);
    try {
      await apiCall('/api/my-profile', token, 'PUT', { phone: phoneInput });
      toast.success('تم حفظ رقم الواتساب بنجاح!');
      const updatedUser = { ...user, phone: phoneInput };
      localStorage.setItem('user_info', JSON.stringify(updatedUser));
      if (user) user.phone = phoneInput;
      setShowPhoneModal(false);
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ، يرجى المحاولة لاحقاً.');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleLogout = () => {
    if (confirm('هل تريد تسجيل الخروج حقاً ؟')) {
      logout();
    }
  };

  // تحديد زر الكورس بناءً على حالة الاشتراك
  const getCourseAction = (course: Course) => {
    const isEnrolled = isAuthenticated && enrolledCourseIds.includes(course.id);
    const isFree = course.is_free === 1;

    if (isEnrolled) {
      return {
        badge: <span className="badge-enrolled absolute top-4 right-4 shadow-lg z-10"><i className="fas fa-check-circle ml-1" /> مشترك</span>,
        button: <button className="bg-primary/10 text-primary px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-primary group-hover:text-white">دخول الكورس <i className="fas fa-arrow-left" /></button>,
        action: () => navigate(`/course?id=${course.id}`),
      };
    } else if (isFree) {
      return {
        badge: <span className="badge-free absolute top-4 right-4 shadow-lg z-10">مجاني</span>,
        button: (
          <button
            disabled={isEnrolling}
            className="bg-emerald-100 text-emerald-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-emerald-500 group-hover:text-white disabled:opacity-50"
          >
            {!isAuthenticated ? <><i className="fas fa-lock ml-1" />اشترك مجاناً</> : <>اشترك مجاناً <i className="fas fa-bolt" /></>}
          </button>
        ),
        action: () => !isEnrolling && handleEnroll(course.id, 0),
      };
    } else {
      return {
        badge: <span className="badge-paid absolute top-4 right-4 shadow-lg z-10">{course.price || 0} ج.م</span>,
        button: (
          <button className="bg-amber-100 text-amber-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-amber-500 group-hover:text-white">
            {!isAuthenticated ? <><i className="fas fa-lock ml-1" />شراء الكورس</> : <>شراء الكورس <i className="fas fa-shopping-cart" /></>}
          </button>
        ),
        action: () => openPaymentModal(course),
      };
    }
  };

  return (
    <>
      {/* SEO: structured data للصفحة الرئيسية */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "كورسات منصة كله بيتعلم",
            "description": "قائمة الكورسات الأونلاين المتاحة في منصة كله بيتعلم",
            "url": "https://kollobeit3alem.pages.dev/",
            "numberOfItems": courses.length,
            "itemListElement": courses.slice(0, 10).map((c, i) => ({
              "@type": "ListItem",
              "position": i + 1,
              "name": c.title,
              "description": c.description || "كورس تدريبي متميز",
            }))
          })
        }}
      />

      <div className="min-h-screen bg-page-bg flex flex-col" dir="rtl">

        {/* ============================================================ */}
        {/* Header                                                       */}
        {/* ============================================================ */}
        <header className="bg-white py-4 px-[5%] flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.03)] sticky top-0 z-[100] border-b-[3px] border-b-primary">
          <Link to="/" className="flex items-center gap-4 no-underline">
            <img src="/logo.png" alt="شعار منصة كله بيتعلم" className="h-[50px] rounded-xl" />
            <h1 className="text-2xl text-primary font-bold">كله بيتعلم</h1>
          </Link>

          <div className="flex items-center gap-3 md:gap-4">
            {isAuthenticated && user ? (
              /* مسجل دخول → يظهر المحفظة والبروفايل وزر الخروج */
              <>
                <div
                  className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 py-1.5 px-3 md:px-4 rounded-xl font-bold shadow-sm"
                  title="رصيد محفظتك"
                >
                  <i className="fas fa-wallet text-lg" />
                  <span className="text-[14px] md:text-base">{walletBalance} ج.م</span>
                </div>

                <Link
                  to="/profile"
                  className="flex items-center gap-2.5 font-bold text-text-main bg-page-bg py-1.5 px-4 pl-1.5 rounded-[30px] border border-border transition-all hover:border-primary hover:shadow-[0_4px_10px_var(--primary-light)] no-underline"
                  title="الذهاب للبروفايل"
                >
                  <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
                  {user.avatar_url && (
                    <img src={user.avatar_url} alt="صورة المستخدم" className="w-10 h-10 rounded-full border-2 border-primary object-cover" />
                  )}
                </Link>

                <Link
                  to="/profile"
                  className="bg-primary/10 text-primary no-underline py-2.5 px-4 rounded-xl font-bold transition-all hover:bg-primary hover:text-white flex items-center gap-2 hidden md:flex"
                >
                  <i className="fas fa-user-circle" /> <span>حسابي</span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="bg-red-100 text-red-500 border-none py-2.5 px-4 rounded-xl cursor-pointer font-bold transition-all hover:bg-red-500 hover:text-white flex items-center gap-2"
                  title="تسجيل خروج"
                >
                  <i className="fas fa-sign-out-alt" />
                </button>
              </>
            ) : (
              /* غير مسجل دخول → يتم التوجيه لصفحة تسجيل الدخول */
              <button
                onClick={() => navigate('/login')}
                className="bg-primary text-white py-2.5 px-6 rounded-xl font-bold transition-all hover:bg-primary/90 hover:shadow-[0_4px_12px_rgba(1,86,105,0.3)] flex items-center gap-2"
              >
                <i className="fas fa-sign-in-alt" /> سجّل دخولك
              </button>
            )}
          </div>
        </header>

        {/* ============================================================ */}
        {/* Hero Section                                                 */}
        {/* ============================================================ */}
        <section className="bg-gradient-to-br from-primary to-[#013d4a] text-white py-16 px-[5%] text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg opacity='0.05' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='white'/%3E%3C/svg%3E")`,
              backgroundSize: '200px',
            }}
          />
          <div className="relative z-[1]">
            {isAuthenticated && user ? (
              <h2 className="text-4xl mb-4">أهلاً بك يا {user.name}! مستعد تتعلم حاجة جديدة؟</h2>
            ) : (
              <h2 className="text-4xl mb-4">مرحباً بك في منصة كله بيتعلم 🎓</h2>
            )}
            <p className="text-lg opacity-90 max-w-[600px] mx-auto">
              اختر الدورة التي تناسب شغفك وابدأ رحلة التعلم واكتساب المهارات العملية الآن.
            </p>
            {!isAuthenticated && (
              <button
                onClick={() => navigate('/login')}
                className="mt-6 bg-white text-primary py-3 px-8 rounded-xl font-bold text-base transition-all hover:shadow-[0_5px_20px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 inline-flex items-center gap-2"
              >
                <i className="fas fa-rocket" /> ابدأ التعلم مجاناً
              </button>
            )}
          </div>
        </section>

        {/* ============================================================ */}
        {/* Main Content — قائمة الكورسات                                */}
        {/* ============================================================ */}
        <main className="flex-1 py-12 px-[5%]">
          {/* SEO: نص مخفي للروبوتات يوصف محتوى الصفحة */}
          <div className="sr-only" aria-hidden="false">
            <h2>قائمة كورسات منصة كله بيتعلم الأونلاين</h2>
            <p>اتعلم مهارات سوق العمل، البرمجة، اللغات، والتطوير الشخصي مع أفضل المدربين في مصر والعالم العربي.</p>
          </div>

          <h2 className="text-[28px] text-text-main mb-8 flex items-center gap-2.5">
            <i className="fas fa-compass text-primary" /> استكشف الدورات المتاحة
          </h2>

          {isLoading ? (
            <div className="text-center py-12 text-text-muted">
              <div className="w-[50px] h-[50px] border-[5px] border-primary/20 border-t-primary rounded-full animate-spin-slow mx-auto mb-4" />
              <h3>جاري تحميل أحدث الدورات...</h3>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-[20px]">
              <i className="fas fa-box-open text-[50px] text-slate-300 mb-5" />
              <h3 className="text-text-muted">لا توجد دورات متاحة حالياً. سيتم إضافة محتوى قريباً!</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course) => {
                const action = getCourseAction(course);

                let courseSettings: any = {};
                try {
                  if ((course as any).metadata) {
                    courseSettings = JSON.parse((course as any).metadata);
                  }
                } catch (e) {}

                return (
                  <article
                    key={course.id}
                    onClick={action.action}
                    className="group bg-white rounded-[20px] overflow-hidden shadow-card border border-black/[0.03] transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-2.5 hover:shadow-card-hover hover:border-primary"
                    itemScope
                    itemType="https://schema.org/Course"
                  >
                    <div className="relative w-full h-[200px] overflow-hidden bg-slate-200">
                      {action.badge}
                      {courseSettings.badge && (
                        <span className="absolute top-4 left-4 shadow-lg z-10 bg-orange-500 text-white px-3 py-1.5 rounded-full text-[13px] font-bold animate-pulse flex items-center gap-1.5">
                          <i className="fas fa-star text-[10px]" /> {courseSettings.badge}
                        </span>
                      )}
                      <img
                        src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس+جديد'}
                        alt={course.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        itemProp="image"
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col">
                      <h3 className="text-xl font-bold text-primary mb-2.5 leading-snug" itemProp="name">{course.title}</h3>
                      <p className="text-text-muted text-sm leading-relaxed mb-4 flex-1 line-clamp-3" itemProp="description">
                        {course.description || 'دورة تدريبية متميزة لتطوير مهاراتك العملية.'}
                      </p>
                      {(courseSettings.level || courseSettings.language) && (
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          {courseSettings.level && (
                            <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg text-[13px] font-bold flex items-center gap-1.5">
                              <i className="fas fa-layer-group" /> {courseSettings.level}
                            </span>
                          )}
                          {courseSettings.language && (
                            <span className="bg-purple-50 text-purple-600 border border-purple-100 px-2.5 py-1 rounded-lg text-[13px] font-bold flex items-center gap-1.5">
                              <i className="fas fa-language" /> {courseSettings.language}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-end items-center pt-4 border-t border-border mt-auto">
                        {action.button}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* ============================================================ */}
        {/* Payment Modal                                                */}
        {/* ============================================================ */}
        {showPaymentModal && selectedCourse && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-sm px-4">
            <div className="bg-white p-6 md:p-8 rounded-[20px] w-full max-w-[500px] shadow-modal relative">
              <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
                <h3 className="text-primary text-xl font-bold"><i className="fas fa-shopping-cart ml-2" /> تأكيد الاشتراك</h3>
                <button onClick={closePaymentModal} className="bg-none border-none text-2xl text-red-500 cursor-pointer hover:text-red-600">
                  <i className="fas fa-times" />
                </button>
              </div>
              <div>
                <div className="bg-slate-50 p-5 rounded-xl mb-6 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-600 font-bold">اسم الدورة:</span>
                    <span className="text-primary font-bold text-left">{selectedCourse.title}</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-600 font-bold">تكلفة الدورة:</span>
                    <span className="text-amber-600 font-bold text-lg">{selectedCourse.price || 0} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-200 pt-3 mt-3">
                    <span className="text-slate-600 font-bold">رصيد محفظتك الحالي:</span>
                    <span className={`${walletBalance >= (selectedCourse.price || 0) ? 'text-emerald-600' : 'text-red-500'} font-bold text-lg`}>
                      {walletBalance} ج.م
                    </span>
                  </div>
                </div>
                {walletBalance >= (selectedCourse.price || 0) ? (
                  <div>
                    <p className="text-sm text-slate-500 mb-4 text-center">سيتم خصم المبلغ من محفظتك فوراً وتفعيل الكورس على حسابك.</p>
                    <button
                      onClick={() => { handleEnroll(selectedCourse.id, selectedCourse.price || 0); closePaymentModal(); }}
                      disabled={isEnrolling}
                      className="bg-primary text-white border-none py-4 rounded-xl font-bold cursor-pointer text-base transition-all hover:shadow-[0_5px_15px_var(--primary-light)] hover:-translate-y-0.5 flex items-center justify-center gap-2 w-full disabled:opacity-50"
                    >
                      {isEnrolling ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-check-circle" />}
                      {isEnrolling ? 'جاري تأكيد الاشتراك...' : 'تأكيد الخصم والاشتراك'}
                    </button>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-5 text-sm font-bold flex items-start gap-3 border border-red-100">
                      <i className="fas fa-exclamation-triangle mt-1 text-lg" />
                      <p className="m-0 leading-relaxed">عذراً، رصيد محفظتك لا يكفي. يرجى شحن المحفظة أولاً من صفحة حسابك.</p>
                    </div>
                    <Link
                      to="/profile"
                      className="bg-emerald-500 text-white border-none py-4 rounded-xl font-bold cursor-pointer text-base transition-all hover:bg-emerald-600 hover:-translate-y-0.5 shadow-sm flex items-center justify-center gap-2 w-full no-underline"
                    >
                      <i className="fas fa-wallet" /> الذهاب لشحن المحفظة
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Phone Modal                                                  */}
        {/* ============================================================ */}
        {showPhoneModal && (
          <div className="fixed top-0 left-0 w-full h-full bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm px-4">
            <div className="bg-white p-8 rounded-[24px] w-full max-w-[420px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-fade-in border border-border relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5 text-primary text-[32px]">
                <i className="fab fa-whatsapp" />
              </div>
              <h2 className="text-[24px] text-slate-800 font-bold mb-3">خطوة أخيرة صغيرة!</h2>
              <p className="text-text-muted mb-8 text-[15px] leading-relaxed px-2">
                عشان نقدر نتواصل معاك ونبعتلك تحديثات الكورسات، يرجى إدخال رقم الواتساب الخاص بك.
              </p>
              <form onSubmit={handleSavePhone} className="flex flex-col gap-4">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="مثال: 01012345678"
                  required
                  pattern="[0-9]{11}"
                  title="برجاء إدخال رقم هاتف صحيح مكون من 11 رقم"
                  className="w-full p-4 border-2 border-slate-200 rounded-xl text-center text-lg font-bold text-slate-800 focus:border-primary focus:outline-none transition-colors"
                  dir="ltr"
                  disabled={isSavingPhone}
                />
                <button
                  type="submit"
                  disabled={isSavingPhone || phoneInput.length < 10}
                  className="bg-primary text-white border-none py-4 px-8 rounded-xl font-bold text-lg cursor-pointer w-full hover:bg-primary/90 transition-all shadow-[0_5px_15px_rgba(1,86,105,0.2)] hover:-translate-y-0.5 mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSavingPhone ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-check-circle" />}
                  {isSavingPhone ? 'جاري الحفظ...' : 'حفظ والمتابعة'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="bg-white text-center py-6 border-t border-border text-text-muted mt-auto">
          جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026
          <span className="mx-2">|</span>
          <a
            href="https://adham-protofoilo.vercel.app"
            className="text-primary font-bold hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            أدهم عطية سالم
          </a>
        </footer>
      </div>
    </>
  );
}
