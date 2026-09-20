import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiCall, publicApiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course } from '@/types';
import { SiteHeader, PageFooter, KbModal, Spinner, EmptyState } from '@/components/kb/shared';

export default function Courses() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (user && !user.phone) {
      setShowPhoneModal(true);
    }
  }, [user]);

  const fetchEnrollments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-enrollments', token) as number[];
      setEnrolledCourseIds(data);
    } catch (error) {
      console.error('Failed to load enrollments:', error);
    }
  }, [token]);

  const fetchCourses = useCallback(async () => {
    try {
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
    fetchCourses();
  }, [fetchCourses]);

  useEffect(() => {
    if (token) {
      fetchEnrollments();
    }
  }, [token, fetchEnrollments]);

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

  const handleLogoutClick = () => setShowLogoutModal(true);
  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
  };

  const getCourseAction = (course: Course) => {
    const isEnrolled = isAuthenticated && enrolledCourseIds.includes(course.id);
    const isFree = course.is_free === 1;

    if (isEnrolled) {
      return {
        badge: (
          <span className="absolute top-4 right-4 z-10 kb-chip bg-[var(--primary-color)] text-white shadow-lg">
            <i className="fas fa-check-circle" /> مشترك
          </span>
        ),
        button: (
          <button className="kb-btn-soft px-5 py-2.5 text-sm">
            متابعة التعلم <i className="fas fa-arrow-left" />
          </button>
        ),
        action: () => navigate(`/course?id=${course.id}`),
      };
    } else if (isFree) {
      return {
        badge: (
          <span className="kb-chip-green absolute top-4 right-4 z-10 shadow-lg">
            <i className="fas fa-gift" /> مجاني
          </span>
        ),
        button: (
          <button className="kb-btn-soft px-5 py-2.5 text-sm">
            تصفح الكورس <i className="fas fa-eye" />
          </button>
        ),
        action: () => navigate(`/course?id=${course.id}`),
      };
    } else {
      return {
        badge: (
          <span className="kb-chip-amber absolute top-4 right-4 z-10 shadow-lg">
            <i className="fas fa-tag" /> {course.price || 0} ج.م
          </span>
        ),
        button: (
          <button className="kb-btn-ghost px-5 py-2.5 text-sm text-amber-600 border-amber-200 hover:border-amber-500 hover:text-amber-700">
            تصفح الكورس <i className="fas fa-eye" />
          </button>
        ),
        action: () => navigate(`/course?id=${course.id}`),
      };
    }
  };

  return (
    <>
      {/* SEO structured data */}
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

      <div className="flex min-h-screen flex-col" dir="rtl">
        <SiteHeader
          user={user}
          loggedIn={isAuthenticated}
          onLogoutClick={isAuthenticated && user ? handleLogoutClick : undefined}
        />

        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[var(--primary-color)] to-[var(--primary-dark)] text-white">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto flex max-w-[1400px] flex-col items-center px-[5%] py-16 text-center md:py-20">
            {isAuthenticated && user ? (
              <h2 className="mb-3 text-[32px] leading-tight font-extrabold md:text-[40px]">
                أهلاً بك يا {user.name.split(' ')[0]}! مستعد تذاكر حاجة جديدة؟
              </h2>
            ) : (
              <>
                <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-bold backdrop-blur">
                  <i className="fas fa-graduation-cap" /> منصة المذاكرة الأونلاين لطلاب مصر
                </span>
                <h2 className="mb-3 text-[32px] leading-tight font-extrabold md:text-[40px]">
                  كله يتعلم من غير ما يلاقي حد يقفل عليه الباب
                </h2>
              </>
            )}
            <p className="max-w-[640px] text-[16px] leading-relaxed text-white/85 md:text-lg">
              اختر الكورس اللي يناسبك، شاهد الشرح، اكمل الامتحانات، وتابع تقدمك خطوة بخطوة.
            </p>
            {!isAuthenticated && (
              <button
                onClick={() => navigate('/login')}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-extrabold text-[var(--primary-color)] transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_20px_rgba(0,0,0,0.2)]"
              >
                <i className="fas fa-rocket" /> ابدأ التعلم مجاناً
              </button>
            )}
          </div>
        </section>

        {/* Courses */}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-[5%] py-12">
          <div className="sr-only" aria-hidden="false">
            <h2>قائمة كورسات منصة كله بيتعلم الأونلاين</h2>
            <p>اتعلم مهارات سوق العمل، البرمجة، اللغات، والتطوير الشخصي مع أفضل المدربين في مصر والعالم العربي.</p>
          </div>

          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-light)] text-xl text-[var(--primary-color)]">
              <i className="fas fa-compass" />
            </span>
            <h2 className="text-[26px] font-extrabold text-[#1e293b] md:text-[30px]">
              استكشف الدورات المتاحة
            </h2>
          </div>

          {isLoading ? (
            <Spinner size="lg" />
          ) : courses.length === 0 ? (
            <EmptyState
              icon="fa-box-open"
              title="لا توجد دورات متاحة حالياً"
              description="سيتم إضافة محتوى جديد قريباً، تابعنا!"
            />
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
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
                    className="kb-surface kb-surface-hover group flex cursor-pointer flex-col overflow-hidden"
                    itemScope
                    itemType="https://schema.org/Course"
                  >
                    <div className="relative h-[190px] w-full overflow-hidden bg-slate-200">
                      {action.badge}
                      {courseSettings.badge && (
                        <span className="absolute top-4 left-4 z-10 inline-flex animate-none items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-[13px] font-bold text-white shadow-lg">
                          <i className="fas fa-star text-[10px]" /> {courseSettings.badge}
                        </span>
                      )}
                      <img
                        src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس+جديد'}
                        alt={course.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        itemProp="image"
                      />
                    </div>

                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="mb-2.5 text-xl font-extrabold leading-snug text-[var(--primary-color)]" itemProp="name">
                        {course.title}
                      </h3>
                      <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]" itemProp="description">
                        {course.description || 'دورة تدريبية متميزة لتطوير مهاراتك العملية.'}
                      </p>

                      {(courseSettings.level || courseSettings.language) && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          {courseSettings.level && (
                            <span className="kb-chip-blue">
                              <i className="fas fa-layer-group text-[10px]" /> {courseSettings.level}
                            </span>
                          )}
                          {courseSettings.language && (
                            <span className="kb-chip-purple">
                              <i className="fas fa-language text-[10px]" /> {courseSettings.language}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-end border-t border-slate-100 pt-4">
                        {action.button}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* Logout Modal */}
        <KbModal open={showLogoutModal} onClose={() => setShowLogoutModal(false)} accent="red">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-[26px] text-red-500">
              <i className="fas fa-sign-out-alt" />
            </span>
            <h2 className="mb-2 text-[22px] font-extrabold text-slate-800">تسجيل الخروج</h2>
            <p className="mb-7 text-[15px] leading-relaxed text-[var(--text-muted)]">
              هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟
            </p>
            <div className="flex w-full gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="kb-btn-ghost flex-1 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={confirmLogout}
                className="kb-btn-danger flex-1 cursor-pointer"
              >
                خروج
              </button>
            </div>
          </div>
        </KbModal>

        {/* Phone Modal */}
        <KbModal open={showPhoneModal} onClose={() => setShowPhoneModal(false)} accent="teal">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-light)] text-[28px] text-[var(--primary-color)]">
              <i className="fab fa-whatsapp" />
            </span>
            <h2 className="mb-2 text-[22px] font-extrabold text-slate-800">خطوة أخيرة صغيرة!</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-[var(--text-muted)]">
              عشان نقدر نتواصل معاك ونبعتلك تحديثات الكورسات، يرجى إدخال رقم الواتساب الخاص بك.
            </p>
            <form onSubmit={handleSavePhone} className="flex w-full flex-col gap-4">
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="01012345678"
                required
                pattern="[0-9]{11}"
                title="برجاء إدخال رقم هاتف صحيح مكون من 11 رقم"
                className="kb-field py-4 text-center text-lg font-bold"
                dir="ltr"
                disabled={isSavingPhone}
              />
              <button
                type="submit"
                disabled={isSavingPhone || phoneInput.length < 10}
                className="kb-btn-primary w-full cursor-pointer py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingPhone ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-check-circle" />}
                {isSavingPhone ? 'جاري الحفظ...' : 'حفظ والمتابعة'}
              </button>
            </form>
          </div>
        </KbModal>

        <PageFooter />
      </div>
    </>
  );
}