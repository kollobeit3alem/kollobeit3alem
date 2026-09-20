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

  useEffect(() => { if (user && !user.phone) setShowPhoneModal(true); }, [user]);

  const fetchEnrollments = useCallback(async () => {
    if (!token) return;
    try { const d = await apiCall('/api/my-enrollments', token) as number[]; setEnrolledCourseIds(d); }
    catch (e) { console.error('Failed to load enrollments:', e); }
  }, [token]);

  const fetchCourses = useCallback(async () => {
    try { const d = await publicApiCall('/api/courses') as Course[]; setCourses(d); }
    catch { toast.error('فشل تحميل الدورات'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => { if (token) fetchEnrollments(); }, [token, fetchEnrollments]);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingPhone(true);
    try {
      await apiCall('/api/my-profile', token, 'PUT', { phone: phoneInput });
      toast.success('تم حفظ رقم الواتساب بنجاح');
      if (user) user.phone = phoneInput;
      localStorage.setItem('user_info', JSON.stringify({ ...user, phone: phoneInput }));
      setShowPhoneModal(false);
    } catch { toast.error('حدث خطأ أثناء الحفظ'); }
    finally { setIsSavingPhone(false); }
  };

  const getCourseAction = (c: Course) => {
    const enrolled = isAuthenticated && enrolledCourseIds.includes(c.id);
    const free = c.is_free === 1;
    if (enrolled) return { badge: <span className="absolute top-4 right-4 z-10 kb-chip kb-chip-teal shadow-lg"><i className="fas fa-check-circle" /> مشترك</span>,
      button: <button className="kb-btn-grad px-5 py-2 text-sm">متابعة التعلم <i className="fas fa-play" /></button>,
      action: () => navigate(`/course?id=${c.id}`) };
    if (free) return { badge: <span className="absolute top-4 right-4 z-10 kb-chip kb-chip-green shadow-lg"><i className="fas fa-gift" /> مجاني</span>,
      button: <button className="kb-btn-outline px-5 py-2 text-sm">تصفح الكورس <i className="fas fa-eye" /></button>,
      action: () => navigate(`/course?id=${c.id}`) };
    return { badge: <span className="absolute top-4 right-4 z-10 kb-chip kb-chip-amber shadow-lg"><i className="fas fa-tag" /> {c.price || 0} ج.م</span>,
      button: <button className="kb-btn-outline px-5 py-2 text-sm text-amber-600 border-amber-200 hover:border-amber-500">تصفح الكورس <i className="fas fa-eye" /></button>,
      action: () => navigate(`/course?id=${c.id}`) };
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "ItemList", "name": "كورسات منصة كله بيتعلم",
        "description": "قائمة الكورسات الأونلاين المتاحة في منصة كله بيتعلم",
        "url": "https://kollobeit3alem.pages.dev/", "numberOfItems": courses.length,
        "itemListElement": courses.slice(0, 10).map((c, i) => ({ "@type": "ListItem", "position": i + 1, "name": c.title, "description": c.description || "كورس تدريبي متميز" }))
      }) }} />

      <div className="flex min-h-screen flex-col" dir="rtl">
        <SiteHeader user={user} loggedIn={isAuthenticated} onLogoutClick={isAuthenticated && user ? () => setShowLogoutModal(true) : undefined} />

        {/* Hero */}
        <section className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #013d4a, #015669)' }}>
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)', backgroundSize: '20px 20px' }} aria-hidden="true" />
          <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[50rem] -translate-x-1/2 rounded-full blur-3xl" style={{ background: 'radial-gradient(30rem 18rem, rgba(31,182,191,0.3), transparent 65%)' }} aria-hidden="true" />
          <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 py-12 text-center sm:px-5 sm:py-16 md:py-20">
            {isAuthenticated && user ? (
              <h2 className="kb-display mb-3 text-[24px] text-white sm:text-[30px] md:text-[42px]">
                أهلاً يا <span className="opacity-80">{user.name.split(' ')[0]}</span>!
                <span className="block mt-1">مستعد تذاكر حاجة جديدة؟</span>
              </h2>
            ) : (
              <>
                <span className="kb-eyebrow mb-3 border-white/20 bg-white/10 text-white sm:mb-4">
                  <span className="kb-dot-live" /> منصة المذاكرة الأونلاين لطلاب مصر
                </span>
                <h2 className="kb-display mb-3 max-w-3xl text-[24px] text-white sm:text-[32px] md:mb-4 md:text-[46px]">
                  كله بيتعلم — من غير ما تلاقي حد يقفل عليه الباب
                </h2>
                <p className="mb-6 max-w-xl text-[14px] leading-relaxed text-white/80 sm:mb-8 sm:text-[16px] md:text-lg">
                  اختر الكورس اللي يناسبك، شاهد الشرح، اكمل الامتحانات، وتابع تقدمك خطوة بخطوة.
                </p>
                <button onClick={() => navigate('/login')} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold transition-all hover:-translate-y-0.5 sm:px-8 sm:py-4 sm:text-base" style={{ color: 'var(--primary)', boxShadow: '0 12px 32px rgba(0,0,0,0.2)' }}>
                  <i className="fas fa-rocket" /> ابدأ التعلم مجاناً
                </button>
              </>
            )}
          </div>
        </section>

        {/* Courses */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-5 sm:py-10 md:py-12">
          <div className="sr-only"><h2>قائمة كورسات منصة كله بيتعلم الأونلاين</h2></div>

          <div className="mb-6 flex items-center gap-3 sm:mb-8">
            <span className="kb-stat-tile h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11"><i className="fas fa-compass text-sm sm:text-base" /></span>
            <div>
              <h2 className="kb-display text-[20px] sm:text-[24px] md:text-[28px]" style={{ color: 'var(--text-main)' }}>
                استكشف <span className="kb-grad-text">الدورات المتاحة</span>
              </h2>
              <p className="text-[11px] font-bold sm:text-[13px]" style={{ color: 'var(--text-muted)' }}>{courses.length} دورة متاحة</p>
            </div>
          </div>

          {isLoading ? <Spinner size="lg" /> : courses.length === 0 ? (
            <EmptyState icon="fa-box-open" title="لا توجد دورات متاحة حالياً" description="سيتم إضافة محتوى جديد قريباً" />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {courses.map(course => {
                const action = getCourseAction(course);
                let cs: Record<string, string> = {};
                try { const m = (course as unknown as Record<string, string>).metadata; if (m) cs = JSON.parse(m); } catch {}
                return (
                  <article key={course.id} onClick={action.action}
                    className="kb-surface kb-surface-hover group flex cursor-pointer flex-col overflow-hidden" itemScope itemType="https://schema.org/Course">
                    <div className="relative h-[150px] w-full overflow-hidden bg-slate-200 sm:h-[170px] md:h-[190px]">
                      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(to top, rgba(1,61,74,0.35), transparent)' }} aria-hidden="true" />
                      {action.badge}
                      {cs.badge && (
                        <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-[13px] font-bold text-white shadow-lg">
                          <i className="fas fa-star text-[10px]" /> {cs.badge}
                        </span>
                      )}
                      <img src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس'} alt={course.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" itemProp="image" />
                    </div>
                    <div className="flex flex-1 flex-col p-4 sm:p-5 md:p-6">
                      <h3 className="mb-2 text-lg font-extrabold leading-snug" style={{ color: 'var(--primary)' }} itemProp="name">{course.title}</h3>
                      <p className="mb-4 line-clamp-2 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }} itemProp="description">
                        {course.description || 'دورة تدريبية متميزة لتطوير مهاراتك العملية.'}
                      </p>
                      {(cs.level || cs.language) && (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {cs.level && <span className="kb-chip kb-chip-blue"><i className="fas fa-layer-group text-[10px]" /> {cs.level}</span>}
                          {cs.language && <span className="kb-chip kb-chip-purple"><i className="fas fa-language text-[10px]" /> {cs.language}</span>}
                        </div>
                      )}
                      <div className="mt-auto flex items-center justify-end border-t border-slate-100 pt-4">{action.button}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        <KbModal open={showLogoutModal} onClose={() => setShowLogoutModal(false)} accent="red">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-2xl text-red-500"><i className="fas fa-sign-out-alt" /></span>
            <h2 className="mb-2 text-xl font-extrabold" style={{ color: 'var(--text-main)' }}>تسجيل الخروج</h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟</p>
            <div className="flex w-full gap-3">
              <button onClick={() => setShowLogoutModal(false)} className="kb-btn-ghost flex-1">إلغاء</button>
              <button onClick={() => { setShowLogoutModal(false); logout(); }} className="kb-btn-danger flex-1">خروج</button>
            </div>
          </div>
        </KbModal>

        <KbModal open={showPhoneModal} onClose={() => setShowPhoneModal(false)} accent="teal">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}><i className="fab fa-whatsapp" /></span>
            <h2 className="mb-2 text-xl font-extrabold" style={{ color: 'var(--text-main)' }}>خطوة أخيرة صغيرة</h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>يرجى إدخال رقم الواتساب الخاص بك للمتابعة.</p>
            <form onSubmit={handleSavePhone} className="flex w-full flex-col gap-4">
              <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="01012345678" required pattern="[0-9]{11}" title="رقم هاتف صحيح مكون من 11 رقم" className="kb-field py-4 text-center text-lg font-bold" dir="ltr" disabled={isSavingPhone} />
              <button type="submit" disabled={isSavingPhone || phoneInput.length < 10} className="kb-btn-primary w-full py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50">
                {isSavingPhone ? <><i className="fas fa-circle-notch fa-spin" /> جاري الحفظ...</> : <><i className="fas fa-check-circle" /> حفظ والمتابعة</>}
              </button>
            </form>
          </div>
        </KbModal>

        <PageFooter />
      </div>
    </>
  );
}
