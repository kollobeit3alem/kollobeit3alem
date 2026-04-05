import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DashboardData, EnrolledCourseWithProgress } from '@/types';

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

export default function Profile() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // حالة نافذة تفاصيل الامتحان
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null);

  // حالات شحن المحفظة
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeCode, setRechargeCode] = useState('');
  const [isRecharging, setIsRecharging] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !user) {
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-dashboard', token) as DashboardData;
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
      const data = await apiCall('/api/my-quizzes', token) as QuizAttempt[];
      setQuizAttempts(data || []);
    } catch (error) {
      console.error('Failed to load quiz attempts:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDashboardData();
      fetchQuizAttempts();
    }
  }, [token, fetchDashboardData, fetchQuizAttempts]);

  // دالة شحن المحفظة بالكود
  const handleRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !rechargeCode.trim()) return;
    
    setIsRecharging(true);
    try {
      const res = await apiCall('/api/wallet/charge', token, 'POST', { code: rechargeCode.trim().toUpperCase() }) as any;
      
      // تحديث الرصيد محلياً فوراً
      if (dashboardData) {
        setDashboardData({
          ...dashboardData,
          stats: {
            ...dashboardData.stats,
            walletBalance: res.newBalance
          } as any
        });
      }
      
      toast.success(`تم شحن المحفظة بنجاح! أُضيف ${res.addedAmount} ج.م إلى رصيدك.`);
      setShowRechargeModal(false);
      setRechargeCode('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'كود الشحن غير صحيح أو تم استخدامه مسبقاً.');
    } finally {
      setIsRecharging(false);
    }
  };

  const handleLogout = () => {
    if (confirm('هل تريد تسجيل الخروج حقاً؟')) {
      logout();
      navigate('/');
    }
  };

  const getParsedAnswers = (jsonString: string): AnswerDetail[] => {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return [];
    }
  };

  if (!user) return null;

  // استخراج رصيد المحفظة بأمان
  const walletBalance = (dashboardData?.stats as any)?.walletBalance || 0;

  return (
    <div className="min-h-screen bg-page-bg flex flex-col relative" dir="rtl">
      {/* Header */}
      <header className="bg-white py-4 px-[5%] flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.03)] sticky top-0 z-[100] border-b-[3px] border-b-primary">
        <Link to="/courses" className="flex items-center gap-4 no-underline">
          <img src="/logo.png" alt="شعار المنصة" className="h-[50px] rounded-xl" />
          <h1 className="text-2xl text-primary font-bold">كله بيتعلم</h1>
        </Link>
        <div className="flex items-center gap-5">
          <Link to="/courses" className="bg-primary/10 text-primary no-underline py-2.5 px-5 rounded-xl font-bold transition-all hover:bg-primary hover:text-white flex items-center gap-2">
            <i className="fas fa-compass"></i> <span className="hidden sm:inline">تصفح الدورات</span>
          </Link>
          <button 
            onClick={handleLogout}
            className="bg-red-100 text-red-500 border-none py-2.5 px-4 rounded-xl cursor-pointer font-bold transition-all hover:bg-red-500 hover:text-white flex items-center gap-2"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </header>

      {/* Profile Hero */}
      <section className="bg-gradient-to-br from-primary to-[#013d4a] py-10 px-[5%] flex items-center gap-8 text-white relative overflow-hidden flex-col sm:flex-row text-center sm:text-right">
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg opacity='0.05' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='white'/%3E%3C/svg%3E")`,
            backgroundSize: '200px',
          }}
        />
        <img 
          src={user.avatar_url || 'https://via.placeholder.com/150'} 
          alt="الصورة الشخصية"
          className="w-[120px] h-[120px] rounded-full border-4 border-white/30 object-cover z-[1] relative shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
        />
        <div className="z-[1] relative">
          <h2 className="text-[32px] mb-1">{user.name}</h2>
          <p className="text-base opacity-80 mb-4">{user.email}</p>
          <span className="bg-white/20 py-1.5 px-4 rounded-[20px] text-sm inline-flex items-center gap-2">
            <i className="fas fa-graduation-cap"></i> طالب مجتهد
          </span>
        </div>
      </section>

      {/* Stats Cards - التعديل الجذري هنا لإضافة بطاقة المحفظة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 -mt-8 px-[5%] relative z-10">
        
        {/* بطاقة المحفظة */}
        <div className="bg-white p-6 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-emerald-100 flex flex-col justify-center gap-3 relative overflow-hidden transition-all hover:-translate-y-1">
          <div className="absolute -left-4 -top-4 w-20 h-20 bg-emerald-50 rounded-full z-0"></div>
          <div className="flex items-center gap-3 z-10 w-full">
            <div className="w-[60px] h-[60px] rounded-[15px] flex justify-center items-center text-2xl flex-shrink-0 bg-emerald-100 text-emerald-600 shadow-sm">
              <i className="fas fa-wallet"></i>
            </div>
            <div className="flex-1">
              <h4 className="text-text-muted text-sm mb-1 font-bold">رصيد المحفظة</h4>
              <span className="text-[28px] font-bold text-emerald-600">
                {isLoading ? '-' : walletBalance} <span className="text-sm text-emerald-600/70">ج.م</span>
              </span>
            </div>
          </div>
          <button 
            onClick={() => setShowRechargeModal(true)} 
            className="w-full mt-1 bg-emerald-50 text-emerald-600 border border-emerald-200 py-2.5 rounded-xl font-bold hover:bg-emerald-500 hover:text-white transition-all z-10 flex items-center justify-center gap-2"
          >
            <i className="fas fa-plus-circle"></i> شحن الرصيد
          </button>
        </div>

        {/* باقي البطاقات */}
        <div className="bg-white p-6 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-border flex items-center gap-5">
          <div className="w-[60px] h-[60px] rounded-[15px] flex justify-center items-center text-2xl flex-shrink-0 bg-sky-100 text-sky-600">
            <i className="fas fa-book-open"></i>
          </div>
          <div>
            <h4 className="text-text-muted text-sm mb-1">الدورات المشترك بها</h4>
            <span className="text-[28px] font-bold text-text-main">
              {isLoading ? '-' : dashboardData?.stats.totalCourses || 0}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-border flex items-center gap-5">
          <div className="w-[60px] h-[60px] rounded-[15px] flex justify-center items-center text-2xl flex-shrink-0 bg-purple-100 text-purple-600">
            <i className="fas fa-check-double"></i>
          </div>
          <div>
            <h4 className="text-text-muted text-sm mb-1">المحاضرات المكتملة</h4>
            <span className="text-[28px] font-bold text-text-main">
              {isLoading ? '-' : dashboardData?.stats.completedLessons || 0}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-border flex items-center gap-5">
          <div className="w-[60px] h-[60px] rounded-[15px] flex justify-center items-center text-2xl flex-shrink-0 bg-amber-100 text-amber-600">
            <i className="fas fa-spell-check"></i>
          </div>
          <div>
            <h4 className="text-text-muted text-sm mb-1">الامتحانات المؤداة</h4>
            <span className="text-[28px] font-bold text-text-main">
              {isLoading ? '-' : quizAttempts.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 py-12 px-[5%]">
        
        {/* مساحة التعلم (الكورسات) */}
        <div className="mb-14">
          <h2 className="text-[26px] text-text-main mb-8 flex items-center gap-2.5">
            <i className="fas fa-laptop-code text-primary"></i> مساحة التعلم الخاصة بي
          </h2>
          
          {isLoading ? (
            <div className="text-center py-12 text-text-muted">
              <div className="w-[50px] h-[50px] border-[5px] border-primary/20 border-t-primary rounded-full animate-spin-slow mx-auto mb-4" />
              <h3>جاري تحميل دوراتك...</h3>
            </div>
          ) : !dashboardData?.enrolledCourses?.length ? (
            <div className="text-center py-12 bg-white rounded-[20px] border border-border">
              <i className="fas fa-folder-open text-[50px] text-slate-300 mb-5"></i>
              <h3 className="text-text-muted mb-4">لم تشترك في أي دورة حتى الآن.</h3>
              <Link to="/courses" className="bg-primary/10 text-primary no-underline py-2.5 px-8 rounded-xl font-bold transition-all hover:bg-primary hover:text-white inline-flex items-center gap-2">
                تصفح الدورات المتاحة
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {dashboardData.enrolledCourses.map((course: EnrolledCourseWithProgress) => {
                const progressPercent = course.total_lessons > 0 
                  ? Math.round((course.completed_lessons / course.total_lessons) * 100) 
                  : 0;
                const isCompleted = progressPercent === 100 && course.total_lessons > 0;
                
                return (
                  <div 
                    key={course.id}
                    className="bg-white rounded-[20px] overflow-hidden shadow-card border border-black/[0.03] transition-all duration-300 flex flex-col hover:-translate-y-2.5 hover:shadow-card-hover hover:border-primary"
                  >
                    <div className="relative w-full h-[180px] bg-slate-200">
                      <img 
                        src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=دورة'} 
                        alt={course.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col">
                      <h3 className="text-lg font-bold text-primary mb-4 leading-snug">{course.title}</h3>
                      
                      <div className="mb-5 flex-1">
                        <div className="flex justify-between text-sm text-text-muted mb-2 font-bold">
                          <span>مستوى الإنجاز</span>
                          <span style={{ color: isCompleted ? '#10b981' : '#015669' }}>{progressPercent}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-border rounded-md overflow-hidden">
                          <div 
                            className="h-full bg-success rounded-md transition-all duration-1000"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <div className="text-xs text-text-muted mt-1.5">
                          أكملت {course.completed_lessons} من أصل {course.total_lessons} محاضرات
                        </div>
                      </div>

                      <Link 
                        to={`/course?id=${course.id}`}
                        className={`py-3 rounded-xl font-bold text-[15px] transition-all flex justify-center items-center gap-2 no-underline ${
                          isCompleted 
                            ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white' 
                            : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                        }`}
                      >
                        {isCompleted ? (
                          <>مراجعة الدورة <i className="fas fa-check-circle"></i></>
                        ) : (
                          <>متابعة التعلم <i className="fas fa-play-circle"></i></>
                        )}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* سجل الامتحانات */}
        <div>
          <h2 className="text-[26px] text-text-main mb-6 flex items-center gap-2.5">
            <i className="fas fa-clipboard-list text-primary"></i> سجل الامتحانات
          </h2>

          {isLoading ? (
            <div className="text-center py-8 text-text-muted">
              <i className="fas fa-circle-notch fa-spin text-3xl mb-3 block text-primary/50"></i>
              <p>جاري تحميل السجل...</p>
            </div>
          ) : quizAttempts.length === 0 ? (
            <div className="bg-white p-8 rounded-[20px] border border-border text-center text-text-muted shadow-sm">
              <i className="fas fa-folder-open text-4xl mb-3 text-slate-300"></i>
              <p>لم تقم بأداء أي امتحانات حتى الآن.</p>
            </div>
          ) : (
            <div className="bg-white rounded-[20px] border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border text-text-main">
                      <th className="p-4 font-bold">الدورة</th>
                      <th className="p-4 font-bold">المحاضرة</th>
                      <th className="p-4 font-bold">تاريخ المحاولة</th>
                      <th className="p-4 font-bold text-center">الدرجة</th>
                      <th className="p-4 font-bold text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizAttempts.map((attempt) => (
                      <tr key={attempt.id} className="border-b border-border hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-primary">{attempt.course_title}</td>
                        <td className="p-4 text-text-main">{attempt.lesson_title}</td>
                        <td className="p-4 text-text-muted text-sm" dir="ltr">
                          {new Date(attempt.attempted_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-block px-3 py-1 rounded-lg font-bold text-sm ${attempt.score >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {attempt.score}%
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={() => setSelectedAttempt(attempt)}
                            className="bg-primary/10 text-primary border-none py-2 px-4 rounded-lg font-bold text-sm cursor-pointer hover:bg-primary hover:text-white transition-all"
                          >
                            <i className="fas fa-eye"></i> التفاصيل
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* نافذة شحن المحفظة */}
      {showRechargeModal && (
        <div className="fixed top-0 left-0 w-full h-full bg-slate-900/60 flex justify-center items-center z-[1000] backdrop-blur-sm px-4">
          <div className="bg-white p-6 md:p-8 rounded-[24px] w-full max-w-[450px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] animate-fade-in relative">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <h3 className="text-emerald-600 text-xl font-bold flex items-center gap-2">
                <i className="fas fa-wallet"></i> شحن المحفظة
              </h3>
              <button
                onClick={() => setShowRechargeModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer hover:bg-red-100 hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <p className="mb-5 text-slate-600 text-sm leading-relaxed text-center font-bold">
              أدخل كود كارت الشحن لإضافة الرصيد إلى محفظتك واستخدامه في شراء الكورسات.
            </p>

            <form onSubmit={handleRecharge} className="flex flex-col gap-4 mb-6">
              <input
                type="text"
                value={rechargeCode}
                onChange={(e) => setRechargeCode(e.target.value)}
                placeholder="أدخل الكود هنا"
                required
                disabled={isRecharging}
                className="w-full p-4 border-2 border-slate-200 rounded-xl text-center text-lg uppercase font-bold tracking-widest text-slate-800 focus:border-emerald-500 focus:outline-none transition-colors"
                dir="ltr"
              />
              <button
                type="submit"
                disabled={isRecharging || !rechargeCode.trim()}
                className="bg-emerald-500 text-white border-none py-4 px-8 rounded-xl font-bold text-lg cursor-pointer w-full hover:bg-emerald-600 transition-all shadow-[0_5px_15px_rgba(16,185,129,0.2)] hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRecharging ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                {isRecharging ? 'جاري الشحن...' : 'تأكيد الشحن'}
              </button>
            </form>

            <div className="bg-slate-50 p-4 rounded-xl border border-border text-center">
              <p className="text-sm text-text-muted mb-3 font-bold">ليس لديك كود شحن؟</p>
              <a
                href={`https://wa.me/201153786085?text=${encodeURIComponent('مرحباً، أريد شراء كارت شحن لمحفظتي على منصة كله بيتعلم.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-center items-center gap-2 bg-[#25D366] text-white no-underline py-3 px-4 rounded-xl font-bold text-sm transition-all hover:bg-[#1ebe57] hover:-translate-y-0.5"
              >
                <i className="fab fa-whatsapp text-lg"></i> تواصل معنا لشراء كارت شحن
              </a>
            </div>
          </div>
        </div>
      )}

      {/* نافذة عرض تفاصيل الامتحان */}
      {selectedAttempt && (
        <div className="fixed top-0 left-0 w-full h-full bg-slate-900/60 flex justify-center items-center z-[1000] backdrop-blur-sm px-4">
          <div className="bg-white p-6 md:p-8 rounded-[24px] w-full max-w-[600px] max-h-[90vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.15)] animate-fade-in relative">
            
            {/* رأس النافذة */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-primary text-xl font-bold flex items-center gap-2">
                  <i className="fas fa-file-signature"></i> تقرير الامتحان
                </h3>
                <p className="text-text-muted text-sm mt-1">{selectedAttempt.lesson_title} - {selectedAttempt.course_title}</p>
              </div>
              <button 
                onClick={() => setSelectedAttempt(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer hover:bg-red-100 hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* تفاصيل الدرجة */}
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl border border-border bg-slate-50">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-md ${selectedAttempt.score >= 50 ? 'bg-success' : 'bg-red-500'}`}>
                {selectedAttempt.score}%
              </div>
              <div>
                <h4 className="font-bold text-lg text-text-main mb-1">
                  {selectedAttempt.score >= 50 ? 'اجتياز بنجاح' : 'لم يتم الاجتياز'}
                </h4>
                <p className="text-text-muted text-sm">
                  تم التقييم في: <span dir="ltr">{new Date(selectedAttempt.attempted_at).toLocaleString('ar-EG')}</span>
                </p>
              </div>
            </div>

            {/* قائمة الإجابات */}
            <div className="flex-1 overflow-y-auto pr-2">
              <h4 className="font-bold text-text-main mb-4 border-r-4 border-primary pr-2">مراجعة الإجابات:</h4>
              <div className="flex flex-col gap-3">
                {getParsedAnswers(selectedAttempt.answers_json).map((ans, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border ${ans.is_correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} flex items-start gap-3`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs ${ans.is_correct ? 'bg-emerald-500' : 'bg-red-500'}`}>
                      <i className={`fas ${ans.is_correct ? 'fa-check' : 'fa-times'}`}></i>
                    </div>
                    <div className="flex-1">
                      <strong className="text-text-main block mb-1">السؤال رقم {idx + 1}</strong>
                      <div className="flex flex-col gap-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-muted">إجابتك:</span>
                          <span className={`font-bold ${ans.is_correct ? 'text-emerald-700' : 'text-red-600'}`}>
                            {ans.chosen_option ? `الخيار (${ans.chosen_option})` : 'لم يتم اختيار إجابة'}
                          </span>
                        </div>
                        {!ans.is_correct && (
                          <div className="flex justify-between mt-1 pt-1 border-t border-slate-200/50">
                            <span className="text-text-muted">الإجابة الصحيحة:</span>
                            <span className="font-bold text-emerald-600">الخيار ({ans.correct_option})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {getParsedAnswers(selectedAttempt.answers_json).length === 0 && (
                  <p className="text-center text-text-muted py-4">تفاصيل الإجابات غير متوفرة لهذه المحاولة القديمة.</p>
                )}
              </div>
            </div>

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
