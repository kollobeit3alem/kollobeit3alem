import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DashboardData, EnrolledCourseWithProgress } from '@/types';
import { SiteHeader, PageFooter, KbModal, Spinner, EmptyState, StatCard, RoleBadge, ScoreBadge } from '@/components/kb/shared';
import { TabPill, KbTable } from '@/components/kb/shell';

// واجهة بيانات الامتحان
interface QuizAttempt {
  id: number;
  score: number;
  answers_json: string;
  attempted_at: string;
  lesson_title: string;
  course_title: string;
}

// واجهة تفاصيل كل إجابة
interface AnswerDetail {
  question_id: number;
  chosen_option: string | null;
  is_correct: boolean;
  correct_option: string;
}

// التعديل هنا: إضافة نوع للتبويبات
type TabType = 'courses' | 'quizzes';

export default function Profile() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // التعديل هنا: حالة التبويب النشط
  const [activeTab, setActiveTab] = useState<TabType>('courses');

  // حالة نافذة تفاصيل الامتحان
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null);

  // حالة نافذة تأكيد تسجيل الخروج
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // حماية الصفحة وتوجيه المستخدمين بناءً على الصلاحيات
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/login');
    } else if (user.role !== 'student') {
      // توجيه الإدارة والمعلمين للوحات التحكم الخاصة بهم ومنعهم من دخول بروفايل الطالب
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'instructor') {
        navigate('/instructor');
      } else if (user.role === 'assistant') {
        navigate('/assistant');
      } else {
        navigate('/');
      }
    }
  }, [isAuthenticated, user, navigate]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    try {
      const data = (await apiCall('/api/my-dashboard', token)) as DashboardData;
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('فشل تحميل بياناتك');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Fetch quiz attempts history
  const fetchQuizAttempts = useCallback(async () => {
    if (!token) return;
    try {
      const data = (await apiCall('/api/my-quizzes', token)) as QuizAttempt[];
      setQuizAttempts(data || []);
    } catch (error) {
      console.error('Failed to load quiz attempts:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token && user?.role === 'student') {
      fetchDashboardData();
      fetchQuizAttempts();
    }
  }, [token, user, fetchDashboardData, fetchQuizAttempts]);

  // دوال تسجيل الخروج
  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login');
  };

  const getParsedAnswers = (jsonString: string): AnswerDetail[] => {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return [];
    }
  };

  // تأكد من أن المستخدم طالب قبل عرض محتوى الصفحة
  if (!user || user.role !== 'student') return null;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)]" dir="rtl">
      <SiteHeader
        user={user}
        loggedIn={isAuthenticated}
        onLogoutClick={isAuthenticated && user ? handleLogoutClick : undefined}
      />

      {/* ============================================================ */}
      {/* Hero الملف الشخصي                                             */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[var(--primary-color)] to-[var(--primary-dark)] text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto flex max-w-[1400px] flex-col items-center gap-6 px-[5%] py-12 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-right md:py-16">
          <div className="relative">
            <img
              src={user.avatar_url || 'https://via.placeholder.com/150'}
              alt="الصورة الشخصية"
              className="h-[120px] w-[120px] rounded-full border-4 border-white/40 object-cover shadow-[0_15px_40px_rgba(0,0,0,0.35)] md:h-[140px] md:w-[140px]"
            />
            <span className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-[var(--primary-dark)] bg-emerald-400 text-[14px] text-white">
              <i className="fas fa-graduation-cap" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-[30px] leading-tight font-extrabold md:text-[34px]">{user.name}</h2>
            <p className="mt-1.5 break-all text-[15px] text-white/80">{user.email}</p>
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <RoleBadge role={user.role} />
              <span className="kb-chip bg-white/15 text-white border border-white/25">
                <i className="fas fa-fire text-[11px]" /> طالب مجتهد
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* الإحصائيات                                                     */}
      {/* ============================================================ */}
      <section className="mx-auto w-full max-w-[1400px] px-[5%] pt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon="fa-book-open"
            iconClass="bg-sky-100 text-sky-600"
            label="الدورات المشترك بها"
            value={isLoading ? '-' : dashboardData?.stats.totalCourses || 0}
          />
          <StatCard
            icon="fa-check-double"
            iconClass="bg-purple-100 text-purple-600"
            label="المحاضرات المكتملة"
            value={isLoading ? '-' : dashboardData?.stats.completedLessons || 0}
          />
          <StatCard
            icon="fa-spell-check"
            iconClass="bg-amber-100 text-amber-600"
            label="الامتحانات المؤداة"
            value={isLoading ? '-' : quizAttempts.length}
          />
        </div>
      </section>

      {/* ============================================================ */}
      {/* التبويبات                                                     */}
      {/* ============================================================ */}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-[5%] py-10 md:py-12">
        <div className="kb-surface mb-8 inline-flex w-full max-w-[500px] gap-1.5 p-1.5">
          <TabPill
            label="الكورسات والتقدم"
            icon="fa-laptop-code"
            active={activeTab === 'courses'}
            onClick={() => setActiveTab('courses')}
          />
          <TabPill
            label="سجل الامتحانات"
            icon="fa-clipboard-list"
            active={activeTab === 'quizzes'}
            onClick={() => setActiveTab('quizzes')}
          />
        </div>

        {/* تبويب الكورسات */}
        {activeTab === 'courses' && (
          <div className="animate-kb-fade-in">
            {isLoading ? (
              <Spinner size="lg" />
            ) : !dashboardData?.enrolledCourses?.length ? (
              <EmptyState
                icon="fa-folder-open"
                title="لم تشترك في أي دورة حتى الآن"
                description="اكتشف الدورات المتاحة وابدأ رحلة التعلم الآن."
                cta={{ to: '/courses', label: 'تصفح الدورات المتاحة' }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {dashboardData.enrolledCourses.map((course: EnrolledCourseWithProgress) => {
                  const progressPercent =
                    course.total_lessons > 0 ? Math.round((course.completed_lessons / course.total_lessons) * 100) : 0;
                  const isCompleted = progressPercent === 100 && course.total_lessons > 0;

                  return (
                    <article
                      key={course.id}
                      className="kb-surface kb-surface-hover group flex flex-col overflow-hidden"
                    >
                      <div className="relative h-[180px] w-full overflow-hidden bg-slate-200">
                        {isCompleted && (
                          <span className="absolute top-4 right-4 z-10 kb-chip bg-emerald-500 text-white shadow-lg">
                            <i className="fas fa-check-circle" /> مكتملة
                          </span>
                        )}
                        <img
                          src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=دورة'}
                          alt={course.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>

                      <div className="flex flex-1 flex-col p-6">
                        <h3 className="mb-4 text-lg font-extrabold leading-snug text-[var(--primary-color)]">
                          {course.title}
                        </h3>

                        <div className="mb-5 flex-1">
                          <div className="mb-2 flex justify-between text-sm font-bold text-[var(--text-muted)]">
                            <span>مستوى الإنجاز</span>
                            <span style={{ color: isCompleted ? '#10b981' : '#015669' }}>{progressPercent}%</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-md bg-slate-100">
                            <div
                              className="progress-bar-fill h-full rounded-md bg-[var(--success)]"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                            أكملت {course.completed_lessons} من أصل {course.total_lessons} محاضرات
                          </div>
                        </div>

                        <Link
                          to={`/course?id=${course.id}`}
                          className={`no-underline flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-bold transition-all ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                              : 'bg-[var(--primary-light)] text-[var(--primary-color)] hover:bg-[var(--primary-color)] hover:text-white'
                          }`}
                        >
                          {isCompleted ? (
                            <>
                              مراجعة الدورة <i className="fas fa-check-circle"></i>
                            </>
                          ) : (
                            <>
                              متابعة التعلم <i className="fas fa-play-circle"></i>
                            </>
                          )}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* تبويب سجل الامتحانات */}
        {activeTab === 'quizzes' && (
          <div className="animate-kb-fade-in">
            {isLoading ? (
              <Spinner size="lg" />
            ) : quizAttempts.length === 0 ? (
              <EmptyState
                icon="fa-clipboard-check"
                title="لا يوجد امتحانات مسجلة"
                description="لم تقم بأداء أي امتحانات حتى الآن. ستظهر نتائجك هنا فور الانتهاء منها."
              />
            ) : (
              <div className="kb-surface overflow-hidden">
                <KbTable headers={['الدورة', 'المحاضرة', 'تاريخ المحاولة', 'الدرجة', 'إجراءات']}>
                  {quizAttempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-[var(--bg-page)]/60 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-[var(--primary-color)]">{attempt.course_title}</td>
                      <td className="px-4 py-3.5 text-[var(--text-main)]">{attempt.lesson_title}</td>
                      <td className="px-4 py-3.5 text-sm text-[var(--text-muted)]" dir="ltr">
                        {new Date(attempt.attempted_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <ScoreBadge score={attempt.score} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setSelectedAttempt(attempt)}
                          className="kb-table-action bg-[var(--primary-light)] text-[var(--primary-color)] hover:bg-[var(--primary-color)] hover:text-white"
                        >
                          <i className="fas fa-eye"></i> التفاصيل
                        </button>
                      </td>
                    </tr>
                  ))}
                </KbTable>
              </div>
            )}
          </div>
        )}
      </main>

      {/* نافذة عرض تفاصيل الامتحان */}
      <KbModal
        open={selectedAttempt !== null}
        onClose={() => setSelectedAttempt(null)}
        maxWidth="max-w-[620px]"
        accent={selectedAttempt && selectedAttempt.score >= 50 ? 'green' : 'red'}
      >
        {selectedAttempt && (
          <div className="flex max-h-[80vh] flex-col">
            {/* رأس النافذة */}
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-xl font-bold text-[var(--primary-color)]">
                  <i className="fas fa-file-signature"></i> تقرير الامتحان
                </h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {selectedAttempt.lesson_title} - {selectedAttempt.course_title}
                </p>
              </div>
            </div>

            {/* تفاصيل الدرجة */}
            <div className="mb-5 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white shadow-md ${
                  selectedAttempt.score >= 50 ? 'bg-[var(--success)]' : 'bg-red-500'
                }`}
              >
                {selectedAttempt.score}%
              </div>
              <div>
                <h4 className="mb-1 text-lg font-bold text-[var(--text-main)]">
                  {selectedAttempt.score >= 50 ? 'اجتياز بنجاح' : 'لم يتم الاجتياز'}
                </h4>
                <p className="text-sm text-[var(--text-muted)]">
                  تم التقييم في: <span dir="ltr">{new Date(selectedAttempt.attempted_at).toLocaleString('ar-EG')}</span>
                </p>
              </div>
            </div>

            {/* قائمة الإجابات */}
            <div className="flex-1 space-y-3 overflow-y-auto pl-1">
              <h4 className="mb-4 rounded-r-lg border-r-4 border-[var(--primary-color)] pr-2 font-bold text-[var(--text-main)]">
                مراجعة الإجابات:
              </h4>
              {getParsedAnswers(selectedAttempt.answers_json).map((ans, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    ans.is_correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs text-white ${
                      ans.is_correct ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  >
                    <i className={`fas ${ans.is_correct ? 'fa-check' : 'fa-times'}`}></i>
                  </div>
                  <div className="flex-1">
                    <strong className="mb-1 block text-[var(--text-main)]">السؤال رقم {idx + 1}</strong>
                    <div className="flex flex-col gap-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">إجابتك:</span>
                        <span className={`font-bold ${ans.is_correct ? 'text-emerald-700' : 'text-red-600'}`}>
                          {ans.chosen_option ? `الخيار (${ans.chosen_option})` : 'لم يتم اختيار إجابة'}
                        </span>
                      </div>
                      {!ans.is_correct && (
                        <div className="mt-1 flex justify-between border-t border-slate-200/50 pt-1">
                          <span className="text-[var(--text-muted)]">الإجابة الصحيحة:</span>
                          <span className="font-bold text-emerald-600">الخيار ({ans.correct_option})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {getParsedAnswers(selectedAttempt.answers_json).length === 0 && (
                <p className="py-4 text-center text-[var(--text-muted)]">
                  تفاصيل الإجابات غير متوفرة لهذه المحاولة القديمة.
                </p>
              )}
            </div>
          </div>
        )}
      </KbModal>

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
            <button onClick={() => setShowLogoutModal(false)} className="kb-btn-ghost flex-1 cursor-pointer">
              إلغاء
            </button>
            <button onClick={confirmLogout} className="kb-btn-danger flex-1 cursor-pointer">
              خروج
            </button>
          </div>
        </div>
      </KbModal>

      <PageFooter />
    </div>
  );
}