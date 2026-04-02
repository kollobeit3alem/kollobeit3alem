import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DashboardData, EnrolledCourseWithProgress } from '@/types';

export default function Profile() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token, fetchDashboardData]);

  const handleLogout = () => {
    if (confirm('هل تريد تسجيل الخروج حقاً؟')) {
      logout();
      navigate('/');
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
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

      {/* Stats Cards */}
      <div className="flex gap-5 -mt-8 px-[5%] relative z-10 flex-col sm:flex-row">
        <div className="bg-white flex-1 p-6 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-border flex items-center gap-5">
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
        <div className="bg-white flex-1 p-6 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-border flex items-center gap-5">
          <div className="w-[60px] h-[60px] rounded-[15px] flex justify-center items-center text-2xl flex-shrink-0 bg-emerald-100 text-emerald-600">
            <i className="fas fa-check-double"></i>
          </div>
          <div>
            <h4 className="text-text-muted text-sm mb-1">المحاضرات المكتملة</h4>
            <span className="text-[28px] font-bold text-text-main">
              {isLoading ? '-' : dashboardData?.stats.completedLessons || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 py-12 px-[5%]">
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
      </main>

      {/* Footer */}
      <footer className="bg-white text-center py-6 border-t border-border text-text-muted mt-auto">
        جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026
      </footer>
    </div>
  );
}
