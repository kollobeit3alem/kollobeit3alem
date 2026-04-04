import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course } from '@/types';

type FilterType = 'all' | 'enrolled' | 'free' | 'paid';

export default function Courses() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  
  // Data States
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Interactive UI States
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activationCode, setActivationCode] = useState('');
  
  // Phone Modal States
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  
  // Enrollment State
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !user) {
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  // Show Phone Modal if needed
  useEffect(() => {
    if (user && !user.phone) {
      setShowPhoneModal(true);
    }
  }, [user]);

  // Fetch enrollments
  const fetchEnrollments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/my-enrollments', token) as number[];
      setEnrolledCourseIds(data);
    } catch (error) {
      console.error('Failed to load enrollments:', error);
    }
  }, [token]);

  // Fetch courses
  const fetchCourses = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/courses', token) as Course[];
      setCourses(data);
    } catch (error) {
      console.error('Failed to load courses:', error);
      toast.error('فشل تحميل الدورات');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchEnrollments().then(() => fetchCourses());
    }
  }, [token, fetchEnrollments, fetchCourses]);

  const handleEnroll = async (courseId: number, code?: string) => {
    if (!token) return;
    
    setIsEnrolling(true);
    try {
      await apiCall('/api/enroll', token, 'POST', { course_id: courseId, code });
      
      setEnrolledCourseIds(prev => [...prev, courseId]);
      
      toast.success('تم الاشتراك بنجاح! نتمنى لك رحلة تعلم ممتعة.');
      navigate(`/course?id=${courseId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل الاشتراك. تأكد من صحة الكود.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const openPaymentModal = (course: Course) => {
    setSelectedCourse(course);
    setActivationCode('');
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedCourse(null);
    setActivationCode('');
  };

  const activateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !activationCode.trim() || isEnrolling) return;
    
    await handleEnroll(selectedCourse.id, activationCode.trim().toUpperCase());
    closePaymentModal();
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    setIsSavingPhone(true);
    try {
      await apiCall('/api/my-profile', token, 'PUT', { phone: phoneInput });
      
      toast.success('تم حفظ رقم الواتساب بنجاح! شكراً لك.');
      setShowPhoneModal(false);
      
      const updatedUser = { ...user, phone: phoneInput };
      localStorage.setItem('user_info', JSON.stringify(updatedUser));
      
      setTimeout(() => window.location.reload(), 1500); 
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

  // Filter and Search Logic
  const filteredCourses = courses.filter(course => {
    // 1. Search Query
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = course.title.toLowerCase().includes(searchLower) || 
                          (course.description && course.description.toLowerCase().includes(searchLower));
    
    if (!matchesSearch) return false;

    // 2. Tab Filter
    if (filter === 'enrolled') return enrolledCourseIds.includes(course.id);
    if (filter === 'free') return course.is_free === 1;
    if (filter === 'paid') return course.is_free === 0;
    
    return true; // 'all'
  });

  const getCourseAction = (course: Course) => {
    const isEnrolled = enrolledCourseIds.includes(course.id);
    const isFree = course.is_free === 1;

    if (isEnrolled) {
      return {
        badge: <span className="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-10 animate-fade-in border border-emerald-400"><i className="fas fa-check-circle ml-1"></i> مشترك</span>,
        button: <button className="w-full bg-primary/10 text-primary px-5 py-3 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-[0_8px_20px_var(--primary-light)]">متابعة التعلم <i className="fas fa-arrow-left"></i></button>,
        action: () => navigate(`/course?id=${course.id}`),
      };
    } else if (isFree) {
      return {
        badge: <span className="absolute top-4 right-4 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-10 border border-primary-light">مجاني</span>,
        button: <button disabled={isEnrolling} className="w-full bg-emerald-100 text-emerald-600 px-5 py-3 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 group-hover:bg-emerald-500 group-hover:text-white group-hover:shadow-[0_8px_20px_rgba(16,185,129,0.3)] disabled:opacity-50">اشترك مجاناً <i className="fas fa-bolt"></i></button>,
        action: () => !isEnrolling && handleEnroll(course.id),
      };
    } else {
      return {
        badge: <span className="absolute top-4 right-4 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-10 border border-amber-400">{course.price || 0} ج.م</span>,
        button: <button className="w-full bg-amber-100 text-amber-600 px-5 py-3 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 group-hover:bg-amber-500 group-hover:text-white group-hover:shadow-[0_8px_20px_rgba(245,158,11,0.3)]">شراء الكورس <i className="fas fa-shopping-cart"></i></button>,
        action: () => openPaymentModal(course),
      };
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Header (Glassmorphism) */}
      <header className="bg-white/80 backdrop-blur-md py-4 px-[5%] flex justify-between items-center shadow-sm sticky top-0 z-[100] border-b-[3px] border-b-primary transition-all">
        <Link to="/courses" className="flex items-center gap-4 no-underline group">
          <img src="/logo.png" alt="شعار المنصة" className="h-[45px] rounded-xl transition-transform group-hover:scale-105" />
          <h1 className="text-xl md:text-2xl text-primary font-bold">كله بيتعلم</h1>
        </Link>
        <div className="flex items-center gap-3 md:gap-4">
          <Link to="/profile" className="flex items-center gap-2.5 font-bold text-slate-700 bg-white py-1.5 px-4 pl-1.5 rounded-[30px] border border-slate-200 transition-all hover:border-primary hover:shadow-md no-underline" title="الذهاب للبروفايل">
            <span className="hidden sm:inline text-sm">{user.name.split(' ')[0]}</span>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="صورة المستخدم" className="w-9 h-9 rounded-full border-2 border-primary object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center border-2 border-primary"><i className="fas fa-user"></i></div>
            )}
          </Link>
          <button 
            onClick={handleLogout}
            className="bg-red-50 text-red-500 border-none w-10 h-10 md:w-auto md:py-2.5 md:px-4 rounded-full md:rounded-xl cursor-pointer font-bold transition-all hover:bg-red-500 hover:text-white flex items-center justify-center gap-2"
            title="تسجيل خروج"
          >
            <i className="fas fa-sign-out-alt"></i> <span className="hidden md:inline text-sm">خروج</span>
          </button>
        </div>
      </header>

      {/* Interactive Hero Section */}
      <section className="bg-gradient-to-br from-primary via-[#014150] to-[#01252e] text-white py-16 px-[5%] relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
        {/* Decorative Circles */}
        <div className="absolute top-[-50px] left-[-50px] w-48 h-48 bg-white/5 rounded-full blur-2xl animate-pulse"></div>
        <div className="absolute bottom-[-50px] right-[-50px] w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        <div className="relative z-10 text-center w-full max-w-3xl mx-auto">
          <span className="inline-block px-4 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm font-bold tracking-wider mb-5 border border-white/20">
            👋 أهلاً بك يا {user.name.split(' ')[0]}
          </span>
          <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">
            ماذا تريد أن <span className="text-emerald-400">تتعلم</span> اليوم؟
          </h2>
          
          {/* Live Search Bar */}
          <div className="relative w-full max-w-xl mx-auto group">
            <input 
              type="text" 
              placeholder="ابحث عن مهارة، تقنية، أو اسم الدورة..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-4 pr-14 pl-6 rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur-md text-white placeholder-white/60 focus:bg-white focus:text-slate-800 focus:placeholder-slate-400 focus:border-emerald-400 transition-all duration-300 outline-none text-lg shadow-lg"
            />
            <i className="fas fa-search absolute right-5 top-1/2 -translate-y-1/2 text-white/60 text-xl group-focus-within:text-emerald-500 transition-colors"></i>
          </div>
        </div>
      </section>

      {/* Main Content & Filters */}
      <main className="flex-1 py-10 px-[5%] max-w-[1400px] mx-auto w-full">
        
        {/* Dynamic Filters */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <button onClick={() => setFilter('all')} className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 shadow-sm ${filter === 'all' ? 'bg-primary text-white shadow-md scale-105' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            <i className="fas fa-layer-group ml-1.5"></i> كل الدورات
          </button>
          <button onClick={() => setFilter('enrolled')} className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 shadow-sm ${filter === 'enrolled' ? 'bg-emerald-500 text-white shadow-md scale-105' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            <i className="fas fa-check-circle ml-1.5"></i> كورساتي ({enrolledCourseIds.length})
          </button>
          <button onClick={() => setFilter('free')} className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 shadow-sm ${filter === 'free' ? 'bg-blue-500 text-white shadow-md scale-105' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            <i className="fas fa-gift ml-1.5"></i> مجانية
          </button>
          <button onClick={() => setFilter('paid')} className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 shadow-sm ${filter === 'paid' ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            <i className="fas fa-crown ml-1.5"></i> مدفوعة (Premium)
          </button>
        </div>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-primary">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <h3 className="font-bold text-lg animate-pulse">جاري تحضير المحتوى...</h3>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[24px] border border-dashed border-slate-200 shadow-sm max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-search text-4xl text-slate-300"></i>
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">لم نجد أي دورات تطابق بحثك</h3>
            <p className="text-slate-500">جرب تغيير كلمات البحث أو اختر تصنيفاً آخر من الأعلى.</p>
            <button onClick={() => {setFilter('all'); setSearchQuery('');}} className="mt-6 text-primary font-bold hover:underline">
              عرض كل الدورات
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {filteredCourses.map((course) => {
              const action = getCourseAction(course);
              return (
                <div 
                  key={course.id}
                  onClick={action.action}
                  className="group bg-white rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-2 hover:shadow-[0_15px_30px_rgba(0,0,0,0.08)] hover:border-primary/30 relative"
                >
                  {/* Image Container with gradient overlay */}
                  <div className="relative w-full h-[220px] overflow-hidden bg-slate-100">
                    {action.badge}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-[5] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <img 
                      src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس+جديد'} 
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  </div>
                  
                  {/* Card Content */}
                  <div className="p-6 flex-1 flex flex-col relative z-10 bg-white">
                    <h3 className="text-[18px] font-bold text-slate-800 mb-3 leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {course.title}
                    </h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-1 line-clamp-2">
                      {course.description || 'اضغط هنا لمعرفة المزيد عن هذه الدورة التدريبية وبدء التعلم فوراً.'}
                    </p>
                    
                    {/* Action Button Area */}
                    <div className="pt-4 border-t border-slate-100 mt-auto">
                      {action.button}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Payment Modal */}
      {showPaymentModal && selectedCourse && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[1000] backdrop-blur-sm px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[500px] shadow-2xl relative animate-fade-in border border-slate-100 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-amber-400"></div>
            
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <h3 className="text-slate-800 text-xl font-bold flex items-center gap-2">
                <i className="fas fa-lock text-amber-500"></i> تفعيل الدورة
              </h3>
              <button 
                onClick={closePaymentModal}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div>
              <div className="bg-amber-50 text-amber-800 p-4 rounded-xl mb-6 border border-amber-200/50 text-sm leading-relaxed">
                <p>
                  دورة <strong className="font-bold">"{selectedCourse.title}"</strong> هي دورة مدفوعة قيمتها <strong className="text-amber-600 text-lg px-1">{selectedCourse.price || 0}</strong> <strong>جنيه</strong>.
                </p>
              </div>
              
              <a 
                href={`https://wa.me/201153786085?text=${encodeURIComponent(`مرحباً، أريد شراء كورس (${selectedCourse.title}) لتفعيل حسابي.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-center items-center gap-2 bg-[#25D366] text-white no-underline py-4 rounded-xl font-bold text-[15px] transition-all hover:bg-[#1ebe57] hover:shadow-lg w-full mb-6"
              >
                <i className="fab fa-whatsapp text-xl"></i> تواصل معنا لشراء الكود
              </a>
              
              <div className="relative flex items-center justify-center mb-6">
                <hr className="w-full border-slate-200" />
                <span className="absolute bg-white px-4 text-slate-400 text-sm font-bold">أو</span>
              </div>
              
              <h4 className="mb-3 text-slate-700 font-bold text-sm">لدي كود تفعيل بالفعل:</h4>
              <form onSubmit={activateCourse} className="flex flex-col gap-3">
                <input 
                  type="text" 
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  placeholder="أدخل الكود هنا (مثال: AB12CD34)" 
                  required
                  disabled={isEnrolling}
                  className="w-full p-4 border-2 border-slate-200 rounded-xl text-center uppercase tracking-widest font-mono text-slate-700 bg-slate-50 focus:border-amber-400 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
                />
                <button 
                  type="submit" 
                  disabled={isEnrolling || !activationCode.trim()}
                  className="bg-slate-800 text-white border-none py-4 rounded-xl font-bold cursor-pointer transition-all hover:bg-black hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
                >
                  {isEnrolling ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-unlock-alt"></i>} 
                  {isEnrolling ? 'جاري التحقق...' : 'تفعيل وبدء التعلم'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Phone Number Modal (Soft Gate) */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[420px] text-center shadow-2xl animate-fade-in border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
            
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5 text-primary text-[32px]">
              <i className="fab fa-whatsapp"></i>
            </div>
            
            <h2 className="text-[22px] text-slate-800 font-bold mb-3">خطوة أخيرة صغيرة!</h2>
            <p className="text-slate-500 mb-8 text-[14px] leading-relaxed px-2">
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
                className="w-full p-4 border-2 border-slate-200 rounded-xl text-center text-lg font-bold tracking-widest text-slate-800 focus:border-primary focus:outline-none transition-colors bg-slate-50 focus:bg-white"
                dir="ltr"
                disabled={isSavingPhone}
              />
              <button
                type="submit"
                disabled={isSavingPhone || phoneInput.length < 10}
                className="bg-primary text-white border-none py-4 px-8 rounded-xl font-bold text-[15px] cursor-pointer w-full hover:bg-primary/90 transition-all shadow-[0_5px_15px_rgba(1,86,105,0.2)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingPhone ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                {isSavingPhone ? 'جاري الحفظ...' : 'حفظ ومتابعة'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white text-center py-8 border-t border-slate-100 text-slate-500 mt-auto text-sm font-medium">
        جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026
      </footer>
    </div>
  );
}
