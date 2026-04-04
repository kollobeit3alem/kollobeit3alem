import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course } from '@/types';

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
      // إرسال طلب الاشتراك (سواء مجاني أو بكود مدفوع) ليتم حفظه في التقارير
      await apiCall('/api/enroll', token, 'POST', { course_id: courseId, code });
      
      // تحديث حالة الواجهة محلياً فوراً لضمان المزامنة
      setEnrolledCourseIds(prev => [...prev, courseId]);
      
      toast.success('تم الاشتراك بنجاح!');
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
      // إرسال الرقم للسيرفر
      await apiCall('/api/my-profile', token, 'PUT', { phone: phoneInput });
      
      toast.success('تم حفظ رقم الواتساب بنجاح! شكراً لك.');
      setShowPhoneModal(false);
      
      // تحديث بيانات المستخدم في المتصفح
      const updatedUser = { ...user, phone: phoneInput };
      localStorage.setItem('user_info', JSON.stringify(updatedUser));
      
      // عمل تحديث بسيط للصفحة لتطبيق البيانات الجديدة في الـ Context
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

  const getCourseAction = (course: Course) => {
    const isEnrolled = enrolledCourseIds.includes(course.id);
    const isFree = course.is_free === 1;

    if (isEnrolled) {
      return {
        badge: <span className="badge-enrolled absolute top-4 right-4 shadow-lg z-10"><i className="fas fa-check-circle ml-1"></i> مشترك</span>,
        button: <button className="bg-primary/10 text-primary px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-primary group-hover:text-white">دخول الكورس <i className="fas fa-arrow-left"></i></button>,
        action: () => navigate(`/course?id=${course.id}`),
      };
    } else if (isFree) {
      return {
        badge: <span className="badge-free absolute top-4 right-4 shadow-lg z-10">مجاني</span>,
        button: <button disabled={isEnrolling} className="bg-emerald-100 text-emerald-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-emerald-500 group-hover:text-white disabled:opacity-50">اشترك مجاناً <i className="fas fa-bolt"></i></button>,
        action: () => !isEnrolling && handleEnroll(course.id),
      };
    } else {
      return {
        badge: <span className="badge-paid absolute top-4 right-4 shadow-lg z-10">{course.price || 0} ج.م</span>,
        button: <button className="bg-amber-100 text-amber-600 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all group-hover:bg-amber-500 group-hover:text-white">شراء الكورس <i className="fas fa-shopping-cart"></i></button>,
        action: () => openPaymentModal(course),
      };
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
        <div className="flex items-center gap-4">
          <Link to="/profile" className="flex items-center gap-2.5 font-bold text-text-main bg-page-bg py-1.5 px-4 pl-1.5 rounded-[30px] border border-border transition-all hover:border-primary hover:shadow-[0_4px_10px_var(--primary-light)] no-underline" title="الذهاب للبروفايل">
            <span>{user.name.split(' ')[0]}</span>
            {user.avatar_url && (
              <img src={user.avatar_url} alt="صورة المستخدم" className="w-10 h-10 rounded-full border-2 border-primary object-cover" />
            )}
          </Link>
          <Link to="/profile" className="bg-primary/10 text-primary no-underline py-2.5 px-4 rounded-xl font-bold transition-all hover:bg-primary hover:text-white flex items-center gap-2">
            <i className="fas fa-user-circle"></i> <span className="hidden sm:inline">حسابي</span>
          </Link>
          <button 
            onClick={handleLogout}
            className="bg-red-100 text-red-500 border-none py-2.5 px-4 rounded-xl cursor-pointer font-bold transition-all hover:bg-red-500 hover:text-white flex items-center gap-2"
            title="تسجيل خروج"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
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
          <h2 className="text-4xl mb-4">أهلاً بك يا {user.name}! مستعد تتعلم حاجة جديدة؟</h2>
          <p className="text-lg opacity-90 max-w-[600px] mx-auto">
            اختر الدورة التي تناسب شغفك وابدأ رحلة التعلم واكتساب المهارات العملية الآن.
          </p>
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
              return (
                <div 
                  key={course.id}
                  onClick={action.action}
                  className="group bg-white rounded-[20px] overflow-hidden shadow-card border border-black/[0.03] transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-2.5 hover:shadow-card-hover hover:border-primary"
                >
                  <div className="relative w-full h-[200px] overflow-hidden bg-slate-200">
                    {action.badge}
                    <img 
                      src={course.image_url || 'https://via.placeholder.com/600x400/015669/FFFFFF?text=كورس+جديد'} 
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-xl font-bold text-primary mb-2.5 leading-snug">{course.title}</h3>
                    <p className="text-text-muted text-sm leading-relaxed mb-5 flex-1 line-clamp-3">
                      {course.description || 'دورة تدريبية متميزة لتطوير مهاراتك العملية.'}
                    </p>
                    <div className="flex justify-end items-center pt-4 border-t border-border">
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
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[20px] w-[90%] max-w-[500px] shadow-modal relative">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
              <h3 className="text-primary text-xl font-bold">{selectedCourse.title}</h3>
              <button 
                onClick={closePaymentModal}
                className="bg-none border-none text-2xl text-red-500 cursor-pointer hover:text-red-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div>
              <p className="mb-5 leading-relaxed">
                هذا الكورس مدفوع وقيمته <strong className="text-warning text-lg">{selectedCourse.price || 0}</strong> <strong>جنيه مصري</strong>. 
                يرجى التواصل معنا عبر واتساب لإتمام عملية الدفع واستلام كود التفعيل الخاص بك.
              </p>
              <a 
                href={`https://wa.me/201153786085?text=${encodeURIComponent(`مرحباً، أريد شراء كورس (${selectedCourse.title}) لتفعيل حسابي.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-center items-center gap-2.5 bg-[#25D366] text-white no-underline py-4 rounded-xl font-bold text-base transition-all hover:bg-[#1ebe57] hover:-translate-y-0.5 w-full mb-5"
              >
                <i className="fab fa-whatsapp"></i> ادفع الآن واستلم الكود
              </a>
              
              <hr className="my-6 border-0 border-t border-border" />
              
              <h4 className="mb-2.5 text-primary font-bold">لدي كود تفعيل بالفعل:</h4>
              <form onSubmit={activateCourse} className="flex flex-col gap-4">
                <input 
                  type="text" 
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  placeholder="أدخل الكود هنا (مثال: AB12CD34)" 
                  required
                  disabled={isEnrolling}
                  className="w-full p-4 border-2 border-border rounded-xl text-base text-center uppercase bg-page-bg focus:border-primary focus:outline-none focus:bg-white disabled:opacity-50"
                />
                <button 
                  type="submit" 
                  disabled={isEnrolling}
                  className="bg-primary text-white border-none py-4 rounded-xl font-bold cursor-pointer text-base transition-all hover:shadow-[0_5px_15px_var(--primary-light)] hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isEnrolling ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle"></i>} 
                  {isEnrolling ? 'جاري التفعيل...' : 'تفعيل الدورة وبدء التعلم'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Phone Number Modal (Soft Gate) */}
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
