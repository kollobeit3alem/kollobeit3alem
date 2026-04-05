import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course } from '@/types';

// مصفوفة العبارات التحفيزية
const MOTIVATIONAL_QUOTES = [
  "الاستثمار في المعرفة يحقق دائماً أفضل العوائد.",
  "كل خبير كان يوماً ما مبتدئاً، ابدأ رحلتك الآن!",
  "النجاح هو مجموع مجهودات صغيرة تتكرر يومياً.",
  "التعلم هو الكنز الذي يتبع صاحبه أينما ذهب.",
  "لا تتوقف عندما تتعب، بل توقف عندما تنتهي.",
  "خطوة بخطوة، ستبني مستقبلاً تفخر به.",
  "استثمر في عقلك اليوم، لتحصد النتائج غداً."
];

export default function Courses() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activationCode, setActivationCode] = useState('');
  
  // Phone Modal States
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  
  // حالة لمنع الضغط المزدوج أثناء التسجيل
  const [isEnrolling, setIsEnrolling] = useState(false);

  // حالة العبارات التحفيزية
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [isQuoteFading, setIsQuoteFading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !user) {
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  // إظهار مودال التليفون إذا كان المستخدم لا يملك رقم هاتف
  useEffect(() => {
    if (user && !user.phone) {
      setShowPhoneModal(true);
    }
  }, [user]);

  // تأثير تغيير العبارات التحفيزية كل 5 ثواني
  useEffect(() => {
    const interval = setInterval(() => {
      setIsQuoteFading(true);
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
        setIsQuoteFading(false);
      }, 500); // نصف ثانية للاختفاء قبل تبديل النص
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
      toast.success('تم الاشتراك بنجاح! بداية موفقة يا بطل 🚀');
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
    if (confirm('هل أنت متأكد أنك تريد المغادرة؟ نأمل رؤيتك قريباً!')) {
      logout();
      navigate('/');
    }
  };

  const getCourseAction = (course: Course) => {
    const isEnrolled = enrolledCourseIds.includes(course.id);
    const isFree = course.is_free === 1;

    if (isEnrolled) {
      return {
        badge: <span className="badge-enrolled absolute top-4 right-4 shadow-lg z-10 animate-pulse"><i className="fas fa-check-circle ml-1"></i> مشترك</span>,
        button: <button className="bg-primary/10 text-primary px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all duration-300 hover:bg-primary hover:text-white hover:scale-105 active:scale-95">استكمل التعلم <i className="fas fa-play ml-1"></i></button>,
        action: () => navigate(`/course?id=${course.id}`),
      };
    } else if (isFree) {
      return {
        badge: <span className="badge-free absolute top-4 right-4 shadow-lg z-10">مجاني</span>,
        button: <button disabled={isEnrolling} className="bg-emerald-100 text-emerald-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all duration-300 hover:bg-emerald-500 hover:text-white hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100">اشترك مجاناً <i className="fas fa-bolt text-yellow-400"></i></button>,
        action: () => !isEnrolling && handleEnroll(course.id),
      };
    } else {
      return {
        badge: <span className="badge-paid absolute top-4 right-4 shadow-lg z-10">{course.price || 0} ج.م</span>,
        button: <button className="bg-amber-100 text-amber-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all duration-300 hover:bg-amber-500 hover:text-white hover:scale-105 active:scale-95">شراء الكورس <i className="fas fa-shopping-cart"></i></button>,
        action: () => openPaymentModal(course),
      };
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      {/* إضافة ستايل مخصص للأنيميشنز السلسة مباشرة في الكومبوننت 
        عشان تشتغل بدون تعديل في الـ tailwind.config.js
      */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
          100% { transform: translateY(0px); }
        }
        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .course-card-animate {
          opacity: 0;
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bg-float-animate {
          animation: float 8s ease-in-out infinite;
        }
      `}} />

      {/* Header */}
      <header className="bg-white py-4 px-[5%] flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.03)] sticky top-0 z-[100] border-b-[3px] border-b-primary transition-all duration-500">
        <Link to="/courses" className="flex items-center gap-4 no-underline hover:scale-105 transition-transform duration-300">
          <img src="/logo.png" alt="شعار المنصة" className="h-[50px] rounded-xl shadow-sm" />
          <h1 className="text-2xl text-primary font-bold tracking-tight">كله بيتعلم</h1>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/profile" className="flex items-center gap-2.5 font-bold text-text-main bg-page-bg py-1.5 px-4 pl-1.5 rounded-[30px] border border-border transition-all duration-300 hover:border-primary hover:shadow-[0_4px_15px_var(--primary-light)] hover:-translate-y-1 no-underline" title="الذهاب للبروفايل">
            <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
            {user.avatar_url && (
              <img src={user.avatar_url} alt="صورة المستخدم" className="w-10 h-10 rounded-full border-2 border-primary object-cover" />
            )}
          </Link>
          <Link to="/profile" className="bg-primary/10 text-primary no-underline py-2.5 px-4 rounded-xl font-bold transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-lg hover:-translate-y-1 active:scale-95 flex items-center gap-2">
            <i className="fas fa-user-circle"></i> <span className="hidden sm:inline">حسابي</span>
          </Link>
          <button 
            onClick={handleLogout}
            className="bg-red-50 text-red-500 border-none py-2.5 px-4 rounded-xl cursor-pointer font-bold transition-all duration-300 hover:bg-red-500 hover:text-white hover:shadow-lg hover:-translate-y-1 active:scale-95 flex items-center gap-2"
            title="تسجيل خروج"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary via-[#014d5e] to-[#013d4a] text-white py-20 px-[5%] text-center relative overflow-hidden">
        {/* Animated Background Pattern */}
        <div 
          className="absolute inset-0 opacity-10 bg-float-animate"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg opacity='0.05' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='white'/%3E%3C/svg%3E")`,
            backgroundSize: '150px',
            backgroundPosition: 'center',
          }}
        />
        
        <div className="relative z-[1] max-w-3xl mx-auto flex flex-col items-center">
          <div className="inline-block mb-4 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm font-medium animate-[pulse-soft_3s_infinite]">
            🚀 جاهز لتحدي جديد؟
          </div>
          
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 leading-tight drop-shadow-lg">
            أهلاً بك يا <span className="text-yellow-300">{user.name.split(' ')[0]}</span>!
          </h2>
          
          {/* Dynamic Motivational Quote */}
          <div className={`h-[60px] flex items-center justify-center transition-all duration-500 transform ${isQuoteFading ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100 translate-y-0'}`}>
            <p className="text-lg md:text-xl opacity-90 leading-relaxed font-medium bg-black/20 py-3 px-6 rounded-2xl backdrop-blur-sm border border-white/10 shadow-inner">
              <i className="fas fa-quote-right text-yellow-300/50 ml-2"></i>
              {MOTIVATIONAL_QUOTES[quoteIndex]}
              <i className="fas fa-quote-left text-yellow-300/50 mr-2"></i>
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 py-14 px-[5%] max-w-[1400px] mx-auto w-full">
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-[28px] text-slate-800 font-extrabold flex items-center gap-3 relative">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <i className="fas fa-compass"></i>
            </div>
            استكشف الدورات المتاحة
            {/* خط زخرفي تحت العنوان */}
            <span className="absolute -bottom-2 right-14 w-1/2 h-1 bg-gradient-to-l from-primary to-transparent rounded-full"></span>
          </h2>
        </div>
        
        {isLoading ? (
          <div className="text-center py-20 text-text-muted flex flex-col items-center justify-center">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h3 className="text-lg font-bold text-slate-600 animate-pulse">جاري تجهيز بيئة التعلم...</h3>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[30px] shadow-sm border border-slate-100">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-box-open text-[40px] text-slate-300 hover:text-primary transition-colors duration-300"></i>
            </div>
            <h3 className="text-xl text-slate-600 font-bold mb-2">لا توجد دورات متاحة حالياً</h3>
            <p className="text-slate-400">نعمل على تجهيز محتوى جديد ومميز قريباً!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {courses.map((course, index) => {
              const action = getCourseAction(course);
              return (
                <div 
                  key={course.id}
                  onClick={action.action}
                  // إضافة ستايل الـ Staggered Animation بحيث يظهر كل كارت بتأخير بسيط عن اللي قبله
                  className="course-card-animate group bg-white rounded-[24px] overflow-hidden shadow-sm border border-slate-200/60 transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-3 hover:shadow-[0_20px_40px_-15px_rgba(1,86,105,0.15)] hover:border-primary/30"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="relative w-full h-[220px] overflow-hidden bg-slate-100">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-[5] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    {action.badge}
                    <img 
                      src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس+جديد'} 
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    
                    {/* زر تشغيل يظهر عند الـ Hover */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-50 group-hover:scale-100">
                       <div className="w-14 h-14 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-primary text-xl shadow-lg">
                         <i className="fas fa-play ml-1"></i>
                       </div>
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 flex flex-col relative bg-white z-10">
                    <h3 className="text-[22px] font-bold text-slate-800 mb-3 leading-snug group-hover:text-primary transition-colors duration-300">{course.title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-1 line-clamp-3">
                      {course.description || 'دورة تدريبية متميزة لتطوير مهاراتك العملية والوصول لأهدافك.'}
                    </p>
                    <div className="flex justify-end items-center pt-5 border-t border-slate-100">
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
        <div className="fixed inset-0 bg-slate-900/40 flex justify-center items-center z-[1000] backdrop-blur-md px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.1)] relative animate-[fadeInUp_0.3s_ease-out]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <h3 className="text-slate-800 text-xl font-bold flex items-center gap-2">
                <i className="fas fa-lock text-primary"></i> تفعيل الدورة
              </h3>
              <button 
                onClick={closePaymentModal}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer hover:bg-red-100 hover:text-red-500 transition-colors duration-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
                <p className="text-slate-700 leading-relaxed text-sm">
                  هذا الكورس مدفوع وقيمته <strong className="text-amber-600 text-lg bg-white px-2 py-0.5 rounded shadow-sm">{selectedCourse.price || 0} ج.م</strong>. 
                  <br className="mb-2"/>
                  يرجى التواصل معنا عبر واتساب لإتمام عملية الدفع واستلام كود التفعيل الخاص بك.
                </p>
              </div>
              <a 
                href={`https://wa.me/201153786085?text=${encodeURIComponent(`مرحباً، أريد شراء كورس (${selectedCourse.title}) لتفعيل حسابي.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-center items-center gap-2.5 bg-[#25D366] text-white no-underline py-4 rounded-xl font-bold text-base transition-all duration-300 hover:bg-[#1ebe57] hover:shadow-lg hover:-translate-y-1 active:scale-95 w-full mb-6"
              >
                <i className="fab fa-whatsapp text-xl"></i> تواصل للدفع واستلام الكود
              </a>
              
              <div className="relative flex items-center justify-center mb-6">
                <hr className="w-full border-t border-slate-200" />
                <span className="absolute bg-white px-4 text-slate-400 text-sm font-medium">أو</span>
              </div>
              
              <form onSubmit={activateCourse} className="flex flex-col gap-4">
                <label className="text-slate-700 font-bold text-sm">لدي كود تفعيل بالفعل:</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value)}
                    placeholder="أدخل الكود هنا (مثال: AB12CD34)" 
                    required
                    disabled={isEnrolling}
                    className="w-full p-4 pl-12 border-2 border-slate-200 rounded-xl text-base font-medium text-center uppercase bg-slate-50 focus:border-primary focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
                  />
                  <i className="fas fa-ticket-alt absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                </div>
                <button 
                  type="submit" 
                  disabled={isEnrolling}
                  className="bg-primary text-white border-none py-4 rounded-xl font-bold cursor-pointer text-base transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_10px_20px_var(--primary-light)] hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:transform-none"
                >
                  {isEnrolling ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-unlock-alt"></i>} 
                  {isEnrolling ? 'جاري التفعيل...' : 'تفعيل الدورة وبدء التعلم'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Phone Number Modal (Soft Gate) */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-md px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[420px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-[fadeInUp_0.4s_ease-out] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary to-emerald-400"></div>
            
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6 text-emerald-500 text-[32px] relative">
              <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
              <i className="fab fa-whatsapp relative z-10"></i>
            </div>
            
            <h2 className="text-[24px] text-slate-800 font-extrabold mb-3">خطوة أخيرة صغيرة! 🎉</h2>
            <p className="text-slate-500 mb-8 text-[15px] leading-relaxed px-2">
              عشان نقدر نتواصل معاك ونبعتلك تحديثات الكورسات ونصائح للمذاكرة، يرجى إضافة رقم الواتساب الخاص بك.
            </p>
            
            <form onSubmit={handleSavePhone} className="flex flex-col gap-4">
              <div className="relative">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="رقم الهاتف (مثال: 01012345678)"
                  required
                  pattern="[0-9]{11}"
                  title="برجاء إدخال رقم هاتف صحيح مكون من 11 رقم"
                  className="w-full p-4 border-2 border-slate-200 rounded-xl text-center text-lg font-bold text-slate-800 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 focus:outline-none transition-all duration-300"
                  dir="ltr"
                  disabled={isSavingPhone}
                />
              </div>
              <button
                type="submit"
                disabled={isSavingPhone || phoneInput.length < 10}
                className="bg-slate-800 text-white border-none py-4 px-8 rounded-xl font-bold text-lg cursor-pointer w-full transition-all duration-300 hover:bg-slate-900 hover:shadow-lg hover:-translate-y-1 active:scale-95 mt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none flex items-center justify-center gap-2"
              >
                {isSavingPhone ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                {isSavingPhone ? 'جاري الحفظ...' : 'حفظ ومتابعة التعلم'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white text-center py-6 border-t border-slate-100 text-slate-400 mt-auto">
        <p className="font-medium">جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026</p>
      </footer>
    </div>
  );
}
