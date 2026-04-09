import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall, publicApiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course } from '@/types';

export default function Courses() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // حالة لحفظ رصيد المحفظة
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Phone Modal States
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // حالة لمنع الضغط المزدوج أثناء التسجيل
  const [isEnrolling, setIsEnrolling] = useState(false);

  // إظهار مودال التليفون إذا كان المستخدم مسجل دخول ولا يملك رقم هاتف
  useEffect(() => {
    if (user && !user.phone) {
      setShowPhoneModal(true);
    }
  }, [user]);

  // جلب رصيد المحفظة — فقط إذا كان المستخدم مسجل دخول
  const fetchWalletData = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-dashboard', token) as any;
      setWalletBalance(data.stats?.walletBalance || 0);
    } catch (error) {
      console.error('Failed to load wallet balance:', error);
    }
  }, [token]);

  // جلب اشتراكات المستخدم — فقط إذا كان مسجل دخول
  const fetchEnrollments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-enrollments', token) as number[];
      setEnrolledCourseIds(data);
    } catch (error) {
      console.error('Failed to load enrollments:', error);
    }
  }, [token]);

  // جلب الكورسات — يعمل للجميع (زوار ومسجلين)
  const fetchCourses = useCallback(async () => {
    try {
      // إذا كان المستخدم مسجل دخول، نستخدم الـ token لجلب بيانات إضافية (مثل كورسات المدرس)
      if (token) {
        const data = await apiCall('/api/courses', token) as Course[];
        setCourses(data);
      } else {
        // الزوار يجلبون الكورسات بدون token
        const data = await publicApiCall('/api/courses') as Course[];
        setCourses(data);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
      toast.error('فشل تحميل الدورات');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      // مستخدم مسجل: جلب المحفظة والاشتراكات والكورسات
      fetchWalletData();
      fetchEnrollments().then(() => fetchCourses());
    } else {
      // زائر: جلب الكورسات فقط
      fetchCourses();
    }
  }, [token, fetchEnrollments, fetchCourses, fetchWalletData]);

  // دالة الاشتراك — تتطلب تسجيل دخول
  const handleEnroll = async (courseId: number, coursePrice: number = 0) => {
    if (!token || !isAuthenticated) {
      // الزائر يتوجه لصفحة تسجيل الدخول
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
    if (!isAuthenticated) {
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

      toast.success('تم حفظ رقم الواتساب بنجاح! شكراً لك.');

      const updatedUser = { ...user, phone: phoneInput };
      localStorage.setItem('user_info', JSON.stringify(updatedUser));

      if (user) {
        user.phone = phoneInput;
      }

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
      navigate('/');
    }
  };

  // دالة تحديد زرار وشارة الكورس بناءً على حالة المستخدم
  const getCourseAction = (course: Course) => {
    const isEnrolled = enrolledCourseIds.includes(course.id);
    const isFree = course.is_free === 1;

    // مستخدم مشترك في الكورس
    if (isAuthenticated && isEnrolled) {
      return {
        badge: <span className="badge-enrolled absolute top-4 right-4 shadow-lg z-10"><i className="fas fa-check-circle ml-1"></i> مشترك</span>,
        button: (
          <button className="bg-primary/10 text-primary px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-primary group-hover:text-white">
            دخول الكورس <i className="fas fa-arrow-left"></i>
          </button>
        ),
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
            {isAuthenticated ? 'اشترك مجاناً' : 'سجّل للاشتراك'} <i className="fas fa-bolt"></i>
          </button>
        ),
        action: () => !isEnrolling && handleEnroll(course.id, 0),
      };
    } else {
      return {
        badge: <span className="badge-paid absolute top-4 right-4 shadow-lg z-10">{course.price || 0} ج.م</span>,
        button: (
          <button className="bg-amber-100 text-amber-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-amber-500 group-hover:text-white">
            {isAuthenticated ? 'شراء الكورس' : 'سجّل للشراء'} <i className="fas fa-shopping-cart"></i>
          </button>
        ),
        action: () => openPaymentModal(course),
      };
    }
  };

  return (
    <div className="min-h-screen bg-page-bg flex flex-col" dir="rtl">
      {/* SEO: Schema.org structured data لصفحة الكورسات */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "كورسات أونلاين — منصة كله بيتعلم",
            "description": "استعرض أفضل كورسات أونلاين في مصر والعالم العربي. برمجة، لغات، مهارات سوق العمل، وتطوير الذات.",
            "url": "https://kollobeit3alem.pages.dev/",
            "isPartOf": {
              "@type": "EducationalOrganization",
              "name": "كله بيتعلم",
              "url": "https://kollobeit3alem.pages.dev"
            }
          })
        }}
      />

      {/* Header */}
      <header className="bg-white py-4 px-[5%] flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.03)] sticky top-0 z-[100] border-b-[3px] border-b-primary">
        <Link to="/" className="flex items-center gap-4 no-underline">
          <img src="/logo.png" alt="شعار منصة كله بيتعلم" className="h-[50px] rounded-xl" />
          <h1 className="text-2xl text-primary font-bold">كله بيتعلم</h1>
        </Link>

        <div className="flex items-center gap-3 md:gap-4">
          {isAuthenticated && user ? (
            <>
              {/* رصيد المحفظة — يظهر فقط للمستخدمين المسجلين */}
              <div
                className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 py-1.5 px-3 md:px-4 rounded-xl font-bold shadow-sm"
                title="رصيد محفظتك"
              >
                <i className="fas fa-wallet text-lg"></i>
                <span className="text-[14px] md:text-base">{walletBalance} ج.م</span>
              </div>

              {/* رابط البروفايل — يظهر فقط للمستخدمين المسجلين */}
              <Link
                to="/profile"
                className="flex items-center gap-2.5 font-bold text-text-main bg-page-bg py-1.5 px-4 pl-1.5 rounded-[30px] border border-border transition-all hover:border-primary hover:shadow-[0_4px_10px_var(--primary-light)] no-underline"
                title="الذهاب للبروفايل"
              >
                <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
                {user.avatar_url && (
                  <img
                    src={user.avatar_url}
                    alt="صورة المستخدم"
                    className="w-10 h-10 rounded-full border-2 border-primary object-cover"
                  />
                )}
              </Link>

              <Link
                to="/profile"
                className="bg-primary/10 text-primary no-underline py-2.5 px-4 rounded-xl font-bold transition-all hover:bg-primary hover:text-white flex items-center gap-2 hidden md:flex"
              >
                <i className="fas fa-user-circle"></i> <span>حسابي</span>
              </Link>

              <button
                onClick={handleLogout}
                className="bg-red-100 text-red-500 border-none py-2.5 px-4 rounded-xl cursor-pointer font-bold transition-all hover:bg-red-500 hover:text-white flex items-center gap-2"
                title="تسجيل خروج"
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </>
          ) : (
            /* زائر: زرار تسجيل الدخول فقط */
            <Link
              to="/login"
              className="bg-primary text-white no-underline py-2.5 px-6 rounded-xl font-bold transition-all hover:bg-primary/90 hover:shadow-[0_5px_15px_var(--primary-light)] flex items-center gap-2"
            >
              <i className="fas fa-sign-in-alt"></i> <span>سجّل دخولك</span>
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
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
            <>
              <h2 className="text-4xl mb-4">أهلاً بك يا {user.name}! مستعد تتعلم حاجة جديدة؟</h2>
              <p className="text-lg opacity-90 max-w-[600px] mx-auto">
                اختر الدورة التي تناسب شغفك وابدأ رحلة التعلم واكتساب المهارات العملية الآن.
              </p>
            </>
          ) : (
            <>
              {/* SEO: محتوى غني للزوار وروبوتات جوجل */}
              <h2 className="text-4xl mb-4">أفضل كورسات أونلاين في مصر والعالم العربي</h2>
              <p className="text-lg opacity-90 max-w-[600px] mx-auto">
                تعلم البرمجة، اللغات، ومهارات سوق العمل مع أفضل المدربين. كورسات مجانية ومدفوعة لكل المستويات.
              </p>
              <div className="mt-6">
                <Link
                  to="/login"
                  className="bg-white text-primary no-underline py-3 px-8 rounded-xl font-bold text-lg transition-all hover:bg-slate-100 hover:shadow-lg inline-flex items-center gap-2"
                >
                  <i className="fas fa-rocket"></i> ابدأ رحلتك مجاناً
                </Link>
              </div>
              {/* نص مخفي للـ SEO */}
              <div className="sr-only" aria-hidden="false">
                <p>منصة كله بيتعلم — كورسات أونلاين في مصر. تعلم البرمجة، اللغة الإنجليزية، مهارات سوق العمل، والتطوير الشخصي. دورات تدريبية مجانية ومدفوعة متاحة لكل المستويات.</p>
                <ul>
                  <li>كورسات برمجة أونلاين</li>
                  <li>تعلم اللغة الإنجليزية</li>
                  <li>مهارات سوق العمل</li>
                  <li>تطوير الذات</li>
                  <li>دورات تدريبية مجانية</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 py-12 px-[5%]">
        <h2 className="text-[28px] text-text-main mb-8 flex items-center gap-2.5">
          <i className="fas fa-compass text-primary"></i> استكشف الدورات المتاحة
        </h2>

        {isLoading ? (
          <div className="text-center py-12 text-text-muted">
            <div className="w-[50px] h-[50px] border-[5px] border-primary/20 border-t-primary rounded-full animate-spin-slow mx-auto mb-4" />
            <h3>جاري تحميل أحدث الدورات...</h3>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-[20px]">
            <i className="fas fa-box-open text-[50px] text-slate-300 mb-5"></i>
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
                <div
                  key={course.id}
                  onClick={action.action}
                  className="group bg-white rounded-[20px] overflow-hidden shadow-card border border-black/[0.03] transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-2.5 hover:shadow-card-hover hover:border-primary"
                >
                  <div className="relative w-full h-[200px] overflow-hidden bg-slate-200">
                    {action.badge}

                    {courseSettings.badge && (
                      <span className="absolute top-4 left-4 shadow-lg z-10 bg-orange-500 text-white px-3 py-1.5 rounded-full text-[13px] font-bold animate-pulse flex items-center gap-1.5">
                        <i className="fas fa-star text-[10px]"></i> {courseSettings.badge}
                      </span>
                    )}

                    <img
                      src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس+جديد'}
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>

                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-xl font-bold text-primary mb-2.5 leading-snug">{course.title}</h3>

                    <p className="text-text-muted text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
                      {course.description || 'دورة تدريبية متميزة لتطوير مهاراتك العملية.'}
                    </p>

                    {(courseSettings.level || courseSettings.language) && (
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        {courseSettings.level && (
                          <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg text-[13px] font-bold flex items-center gap-1.5">
                            <i className="fas fa-layer-group"></i> {courseSettings.level}
                          </span>
                        )}
                        {courseSettings.language && (
                          <span className="bg-purple-50 text-purple-600 border border-purple-100 px-2.5 py-1 rounded-lg text-[13px] font-bold flex items-center gap-1.5">
                            <i className="fas fa-language"></i> {courseSettings.language}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end items-center pt-4 border-t border-border mt-auto">
                      {action.button}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* بنر تسجيل الدخول للزوار — يظهر أسفل الكورسات */}
        {!isAuthenticated && courses.length > 0 && (
          <div className="mt-12 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-[20px] p-8 text-center">
            <i className="fas fa-lock text-primary text-4xl mb-4"></i>
            <h3 className="text-xl font-bold text-primary mb-2">اشترك في أي كورس يبدأ بخطوة واحدة</h3>
            <p className="text-text-muted mb-5">سجّل دخولك بحسابك على جوجل وابدأ رحلتك التعليمية فوراً — مجاناً.</p>
            <Link
              to="/login"
              className="bg-primary text-white no-underline py-3 px-8 rounded-xl font-bold text-base transition-all hover:bg-primary/90 hover:shadow-[0_5px_15px_var(--primary-light)] inline-flex items-center gap-2"
            >
              <i className="fas fa-google"></i> سجّل دخولك الآن
            </Link>
          </div>
        )}
      </main>

      {/* Payment Modal */}
      {showPaymentModal && selectedCourse && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-sm px-4">
          <div className="bg-white p-6 md:p-8 rounded-[20px] w-full max-w-[500px] shadow-modal relative">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
              <h3 className="text-primary text-xl font-bold"><i className="fas fa-shopping-cart ml-2"></i> تأكيد الاشتراك</h3>
              <button
                onClick={closePaymentModal}
                className="bg-none border-none text-2xl text-red-500 cursor-pointer hover:text-red-600"
              >
                <i className="fas fa-times"></i>
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
                  <p className="text-sm text-slate-500 mb-4 text-center">
                    سيتم خصم المبلغ من محفظتك فوراً وتفعيل الكورس على حسابك.
                  </p>
                  <button
                    onClick={() => {
                      handleEnroll(selectedCourse.id, selectedCourse.price || 0);
                      closePaymentModal();
                    }}
                    disabled={isEnrolling}
                    className="bg-primary text-white border-none py-4 rounded-xl font-bold cursor-pointer text-base transition-all hover:shadow-[0_5px_15px_var(--primary-light)] hover:-translate-y-0.5 flex items-center justify-center gap-2 w-full disabled:opacity-50"
                  >
                    {isEnrolling ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                    {isEnrolling ? 'جاري تأكيد الاشتراك...' : 'تأكيد الخصم والاشتراك'}
                  </button>
                </div>
              ) : (
                <div className="animate-fade-in">
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-5 text-sm font-bold flex items-start gap-3 border border-red-100">
                    <i className="fas fa-exclamation-triangle mt-1 text-lg"></i>
                    <p className="m-0 leading-relaxed">
                      عذراً، رصيد محفظتك لا يكفي لإتمام هذا الاشتراك. يرجى شحن المحفظة أولاً من صفحة حسابك الشخصي.
                    </p>
                  </div>
                  <Link
                    to="/profile"
                    className="bg-emerald-500 text-white border-none py-4 rounded-xl font-bold cursor-pointer text-base transition-all hover:bg-emerald-600 hover:-translate-y-0.5 shadow-sm flex items-center justify-center gap-2 w-full no-underline"
                  >
                    <i className="fas fa-wallet"></i> الذهاب لشحن المحفظة
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phone Number Modal */}
      {showPhoneModal && (
        <div className="fixed top-0 left-0 w-full h-full bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[420px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-fade-in border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>

            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5 text-primary text-[32px]">
              <i className="fab fa-whatsapp"></i>
            </div>

            <h2 className="text-[24px] text-slate-800 font-bold mb-3">خطوة أخيرة صغيرة!</h2>
            <p className="text-text-muted mb-8 text-[15px] leading-relaxed px-2">
              عشان نقدر نتواصل معاك ونبعتلك تحديثات الكورسات، يرجى إدخال رقم الواتساب الخاص بك لاستكمال التسجيل.
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
                {isSavingPhone ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                {isSavingPhone ? 'جاري الحفظ...' : 'حفظ والمتابعة'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white text-center py-6 border-t border-border text-text-muted mt-auto">
        جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026
      </footer>
    </div>
  );
}
