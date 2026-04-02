import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course, Lesson, QuizQuestion, User, ActivationCode, StudentReport } from '@/types';

type TabType = 'courses' | 'lessons' | 'quizzes' | 'users' | 'codes';

export default function Admin() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('courses');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Data states
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  
  // Form handling states
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedCodeCourseId, setSelectedCodeCourseId] = useState('');
  
  // UI logic states (replacing DOM manipulation)
  const [isNewCourseFree, setIsNewCourseFree] = useState(true);
  const [isEditCourseFree, setIsEditCourseFree] = useState(true);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingType, setEditingType] = useState<'course' | 'lesson' | 'user'>('course');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>({});
  const [reportData, setReportData] = useState<StudentReport | null>(null);
  const [reportUserName, setReportUserName] = useState('');

  // Redirect if not authenticated or not admin/instructor
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    if (user.role !== 'admin' && user.role !== 'instructor') {
      toast.error('غير مصرح لك بالدخول!');
      navigate('/courses');
    }
  }, [isAuthenticated, user, navigate]);

  // Load initial data
  useEffect(() => {
    if (token && user) {
      loadCourses();
      // Users are loaded for both admin and instructor (instructor sees their students)
      loadUsers();
    }
  }, [token, user]);

  const loadCourses = async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/courses', token) as Course[];
      setCourses(data);
    } catch (error) {
      console.error('Failed to load courses:', error);
    }
  };

  const loadUsers = async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/admin/users', token) as User[];
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadLessons = async (courseId: string) => {
    if (!token || !courseId) return;
    try {
      const data = await apiCall(`/api/courses/${courseId}/lessons`, token) as Lesson[];
      setLessons(data);
    } catch (error) {
      console.error('Failed to load lessons:', error);
    }
  };

  const loadCodes = async (courseId: string) => {
    if (!token || !courseId) return;
    try {
      const data = await apiCall(`/api/admin/codes/${courseId}`, token) as ActivationCode[];
      setCodes(data);
    } catch (error) {
      console.error('Failed to load codes:', error);
    }
  };

  const loadQuestions = async (lessonId: string) => {
    if (!token || !lessonId) return;
    try {
      const data = await apiCall(`/api/lessons/${lessonId}/quiz`, token) as QuizQuestion[];
      setQuestions(data);
    } catch (error) {
      console.error('Failed to load questions:', error);
    }
  };

  // Course handlers
  const handleAddCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      await apiCall('/api/admin/courses', token, 'POST', {
        title: formData.get('title'),
        description: formData.get('description'),
        image_url: formData.get('image_url'),
        instructor_contact: formData.get('instructor_contact'),
        is_free: parseInt(formData.get('is_free') as string),
        price: parseFloat(formData.get('price') as string) || 0,
      });
      toast.success('تمت إضافة الدورة بنجاح!');
      form.reset();
      setIsNewCourseFree(true); // Reset the toggle
      loadCourses();
    } catch (error) {
      toast.error('فشل إضافة الدورة');
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف الدورة وكل محتوياتها؟')) return;
    if (!token) return;
    
    try {
      await apiCall(`/api/admin/courses/${id}`, token, 'DELETE');
      toast.success('تم حذف الدورة');
      loadCourses();
      if (selectedCourseId === id.toString()) {
        setSelectedCourseId('');
        setLessons([]);
      }
    } catch (error) {
      toast.error('فشل حذف الدورة');
    }
  };

  // Lesson handlers
  const handleAddLesson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      await apiCall('/api/admin/lessons', token, 'POST', {
        course_id: formData.get('course_id'),
        title: formData.get('title'),
        video_url: formData.get('video_url'),
        order_num: parseInt(formData.get('order_num') as string),
      });
      toast.success('تمت إضافة المحاضرة!');
      
      // Reset specific fields
      (form.elements.namedItem('title') as HTMLInputElement).value = '';
      (form.elements.namedItem('video_url') as HTMLInputElement).value = '';
      
      loadLessons(selectedCourseId);
    } catch (error) {
      toast.error('فشل إضافة المحاضرة');
    }
  };

  const handleDeleteLesson = async (id: number) => {
    if (!confirm('حذف المحاضرة؟')) return;
    if (!token) return;
    
    try {
      await apiCall(`/api/admin/lessons/${id}`, token, 'DELETE');
      toast.success('تم حذف المحاضرة');
      loadLessons(selectedCourseId);
    } catch (error) {
      toast.error('فشل حذف المحاضرة');
    }
  };

  const handleToggleLessonLock = async (id: number, isLocked: boolean) => {
    if (!token) return;
    
    try {
      await apiCall(`/api/admin/lessons/${id}/lock`, token, 'PUT', { is_locked: isLocked ? 1 : 0 });
      loadLessons(selectedCourseId);
    } catch (error) {
      toast.error('فشل تغيير القفل');
    }
  };

  // Quiz handlers
  const handleAddQuestion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      await apiCall('/api/admin/quizzes', token, 'POST', {
        lesson_id: parseInt(formData.get('lesson_id') as string),
        image_url: formData.get('image_url'),
        option_a: formData.get('option_a'),
        option_b: formData.get('option_b'),
        option_c: formData.get('option_c'),
        option_d: formData.get('option_d'),
        correct_option: formData.get('correct_option'),
      });
      toast.success('تم إضافة السؤال!');
      
      // Reset input fields
      ['image_url', 'option_a', 'option_b', 'option_c', 'option_d'].forEach(name => {
        (form.elements.namedItem(name) as HTMLInputElement).value = '';
      });

      loadQuestions(selectedLessonId);
    } catch (error) {
      toast.error('فشل إضافة السؤال');
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('هل تريد حذف هذا السؤال؟')) return;
    if (!token) return;
    
    try {
      await apiCall(`/api/admin/quizzes/${id}`, token, 'DELETE');
      toast.success('تم حذف السؤال');
      loadQuestions(selectedLessonId);
    } catch (error) {
      toast.error('فشل حذف السؤال');
    }
  };

  // Code handlers
  const handleGenerateCodes = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      const count = parseInt(formData.get('count') as string);
      const res = await apiCall('/api/admin/codes', token, 'POST', {
        course_id: parseInt(formData.get('course_id') as string),
        count: count,
      });
      toast.success(`تم توليد ${count} كود بنجاح!\nمثال لأحد الأكواد: ${res.codes[0]}`);
      form.reset();
      
      const courseId = formData.get('course_id') as string;
      if (selectedCodeCourseId === courseId) {
        loadCodes(courseId);
      }
    } catch (error) {
      toast.error('فشل توليد الأكواد');
    }
  };

  // User handlers
  const handleDeleteUser = async (id: number) => {
    if (!confirm('تنبيه هام! سيتم حذف هذا المستخدم وكل سجلاته نهائياً. هل أنت متأكد؟')) return;
    if (!token) return;
    
    try {
      await apiCall(`/api/admin/users/${id}`, token, 'DELETE');
      toast.success('تم حذف المستخدم');
      loadUsers();
    } catch (error) {
      toast.error('فشل حذف المستخدم');
    }
  };

  const handleViewReport = async (userId: number, userName: string) => {
    if (!token) return;
    
    try {
      const data = await apiCall(`/api/admin/reports/${userId}`, token) as StudentReport;
      setReportData(data);
      setReportUserName(userName);
      setShowReportModal(true);
    } catch (error) {
      toast.error('فشل جلب تقرير الطالب');
    }
  };

  // Edit modal handlers
  const openEditModal = (type: 'course' | 'lesson' | 'user', item: Course | Lesson | User) => {
    setEditingType(type);
    setEditingId(item.id);
    setEditFormData({ ...item } as unknown as Record<string, unknown>);
    
    if (type === 'course') {
      setIsEditCourseFree((item as Course).is_free === 1);
    }
    
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingId) return;
    
    try {
      if (editingType === 'course') {
        await apiCall(`/api/admin/courses/${editingId}`, token, 'PUT', editFormData);
        loadCourses();
      } else if (editingType === 'lesson') {
        await apiCall(`/api/admin/lessons/${editingId}`, token, 'PUT', editFormData);
        loadLessons(selectedCourseId);
      } else if (editingType === 'user') {
        await apiCall(`/api/admin/users/${editingId}`, token, 'PUT', editFormData);
        loadUsers();
      }
      toast.success('تم التحديث بنجاح!');
      setShowEditModal(false);
    } catch (error) {
      toast.error('فشل التحديث');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'admin';

  if (!user) return null;

  return (
    <div className="min-h-screen bg-page-bg flex overflow-x-hidden">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="flex items-center gap-4 mb-10 pb-5 border-b border-border justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="w-[50px] rounded-xl" />
            <h2 className="text-primary text-[22px] font-bold">الإدارة المركزية</h2>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="hidden bg-none border-none text-2xl text-red-500 cursor-pointer lg:hidden"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <nav className="flex flex-col gap-2.5 flex-1">
          <button 
            onClick={() => setActiveTab('courses')}
            className={`nav-btn ${activeTab === 'courses' ? 'active' : ''}`}
          >
            <i className="fas fa-layer-group"></i> إدارة الدورات
          </button>
          <button 
            onClick={() => setActiveTab('lessons')}
            className={`nav-btn ${activeTab === 'lessons' ? 'active' : ''}`}
          >
            <i className="fas fa-video"></i> إدارة المحاضرات
          </button>
          <button 
            onClick={() => setActiveTab('quizzes')}
            className={`nav-btn ${activeTab === 'quizzes' ? 'active' : ''}`}
          >
            <i className="fas fa-spell-check"></i> الامتحانات
          </button>
          
          <button 
            onClick={() => setActiveTab('users')}
            className={`nav-btn ${activeTab === 'users' ? 'active' : ''}`}
          >
            <i className="fas fa-users-cog"></i> الطلاب والتقارير
          </button>

          {isAdmin && (
            <button 
              onClick={() => setActiveTab('codes')}
              className={`nav-btn ${activeTab === 'codes' ? 'active' : ''}`}
            >
              <i className="fas fa-key"></i> أكواد التفعيل
            </button>
          )}
          
          <button 
            onClick={handleLogout}
            className="nav-btn mt-auto bg-red-50 text-red-500 hover:bg-red-500 hover:text-white"
          >
            <i className="fas fa-sign-out-alt"></i> تسجيل الخروج
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto w-full">
        {/* Mobile Top Bar */}
        <div className="lg:hidden flex items-center justify-between mb-5 bg-white p-4 rounded-2xl shadow-[0_5px_15px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="h-10 rounded-lg" />
            <strong className="text-primary">لوحة التحكم</strong>
          </div>
          <button 
            onClick={() => setSidebarOpen(true)}
            className="bg-primary text-white border-none py-2.5 px-4 rounded-xl text-xl cursor-pointer"
          >
            <i className="fas fa-bars"></i>
          </button>
        </div>

        {/* Courses Tab */}
        {activeTab === 'courses' && (
          <section className="animate-fade-in">
            <h1 className="text-[28px] text-primary mb-8 flex items-center gap-2.5">
              <i className="fas fa-layer-group"></i> إدارة الدورات التدريبية
            </h1>
            
            {/* Add Course Form */}
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] mb-8 border border-black/[0.02]">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-plus-circle ml-2"></i> إضافة دورة جديدة
              </h3>
              <form onSubmit={handleAddCourse} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-text-main">عنوان الدورة</label>
                  <input type="text" name="title" required className="form-input" />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-text-main">وصف الدورة</label>
                  <textarea name="description" className="form-input min-h-[100px] resize-y" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">رابط صورة الغلاف</label>
                  <input type="url" name="image_url" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">رابط تواصل المدرس (اختياري)</label>
                  <input type="url" name="instructor_contact" className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">نوع الدورة</label>
                  <select 
                    name="is_free" 
                    value={isNewCourseFree ? '1' : '0'}
                    className="form-input"
                    onChange={(e) => setIsNewCourseFree(e.target.value === '1')}
                  >
                    <option value="1">مجانية</option>
                    <option value="0">مدفوعة</option>
                  </select>
                </div>
                {!isNewCourseFree && (
                  <div>
                    <label className="block mb-2 font-bold text-text-main">سعر الدورة (بالجنيه)</label>
                    <input type="number" name="price" defaultValue="0" min="0" className="form-input" />
                  </div>
                )}
                <div className="md:col-span-2">
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-save ml-2"></i> حفظ ونشر الدورة
                  </button>
                </div>
              </form>
            </div>

            {/* Courses List */}
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-black/[0.02]">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-list ml-2"></i> الدورات المتاحة حالياً
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {courses.map((course) => (
                  <div key={course.id} className="bg-page-bg p-5 rounded-2xl border border-border flex flex-col gap-4 transition-all hover:-translate-y-1 hover:border-primary">
                    <div className="text-lg font-bold text-primary flex justify-between items-center">
                      {course.title}
                      <span className={`badge-${course.is_free === 1 ? 'free' : 'paid'}`}>
                        {course.is_free === 1 ? 'مجاني' : `مدفوع - ${course.price || 0} ج.م`}
                      </span>
                    </div>
                    {isAdmin && course.instructor_id && (
                      <div className="text-sm text-primary mb-2">
                        <i className="fas fa-chalkboard-teacher ml-1"></i>
                        <strong>بواسطة:</strong> {users.find(u => u.id === course.instructor_id)?.name || 'مدرس غير معروف'}
                      </div>
                    )}
                    <div className="text-sm text-text-muted">
                      <i className="fas fa-clock ml-1"></i> تم الإنشاء: {new Date(course.created_at || '').toLocaleDateString('ar-EG')}
                    </div>
                    <div className="flex gap-2.5 mt-auto flex-wrap">
                      <button 
                        onClick={() => openEditModal('course', course)}
                        className="flex-1 py-2.5 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-sky-100 text-sky-600 hover:bg-sky-500 hover:text-white"
                      >
                        <i className="fas fa-edit"></i> تعديل
                      </button>
                      <button 
                        onClick={() => handleDeleteCourse(course.id)}
                        className="flex-1 py-2.5 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-red-100 text-red-500 hover:bg-red-500 hover:text-white"
                      >
                        <i className="fas fa-trash"></i> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Lessons Tab */}
        {activeTab === 'lessons' && (
          <section className="animate-fade-in">
            <h1 className="text-[28px] text-primary mb-8 flex items-center gap-2.5">
              <i className="fas fa-video"></i> إدارة المحاضرات
            </h1>
            
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-black/[0.02]">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-plus-circle ml-2"></i> إضافة محاضرة لدورة
              </h3>
              <form onSubmit={handleAddLesson} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-text-main">اختر الدورة للرفع أو الإدارة</label>
                  <select 
                    name="course_id" 
                    required 
                    className="form-input"
                    onChange={(e) => {
                      setSelectedCourseId(e.target.value);
                      loadLessons(e.target.value);
                    }}
                  >
                    <option value="">اختر الدورة...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-text-main">عنوان المحاضرة</label>
                  <input type="text" name="title" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">رابط الفيديو (YouTube)</label>
                  <input type="url" name="video_url" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">ترتيب المحاضرة (رقم)</label>
                  <input type="number" name="order_num" defaultValue="1" required className="form-input" />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-upload ml-2"></i> رفع المحاضرة
                  </button>
                </div>
              </form>

              {selectedCourseId && lessons.length > 0 && (
                <div className="mt-5 pt-5 border-t border-border">
                  <h3 className="mb-4 text-primary font-bold">محاضرات الدورة الحالية:</h3>
                  {lessons.map((lesson) => (
                    <div key={lesson.id} className={`flex justify-between items-center bg-page-bg p-4 rounded-xl mb-2.5 border border-border ${lesson.is_admin_locked === 1 ? 'border-red-200 bg-red-50' : ''}`}>
                      <div>
                        <strong className={lesson.is_admin_locked === 1 ? 'text-red-500' : 'text-text-main'}>
                          {lesson.order_num}. {lesson.title} {lesson.is_admin_locked === 1 && '(مغلق)'}
                        </strong>
                      </div>
                      <div className="flex gap-2.5">
                        <button 
                          onClick={() => handleToggleLessonLock(lesson.id, lesson.is_admin_locked !== 1)}
                          className="py-2.5 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-amber-100 text-amber-600 hover:bg-amber-500 hover:text-white"
                        >
                          <i className={`fas fa-${lesson.is_admin_locked === 1 ? 'unlock' : 'lock'}`}></i> {lesson.is_admin_locked === 1 ? 'فتح' : 'قفل'}
                        </button>
                        <button 
                          onClick={() => openEditModal('lesson', lesson)}
                          className="py-2.5 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-sky-100 text-sky-600 hover:bg-sky-500 hover:text-white"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button 
                          onClick={() => handleDeleteLesson(lesson.id)}
                          className="py-2.5 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-red-100 text-red-500 hover:bg-red-500 hover:text-white"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Quizzes Tab */}
        {activeTab === 'quizzes' && (
          <section className="animate-fade-in">
            <h1 className="text-[28px] text-primary mb-8 flex items-center gap-2.5">
              <i className="fas fa-spell-check"></i> بناء الامتحانات
            </h1>
            
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-black/[0.02]">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-list-ol ml-2"></i> إضافة سؤال لامتحان المحاضرة
              </h3>
              <p className="text-text-muted mb-5">يمكنك إضافة أسئلة متعددة لنفس المحاضرة ليتم عرضها للطالب كاختبار شامل.</p>
              
              <form onSubmit={handleAddQuestion} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block mb-2 font-bold text-text-main">اختر الدورة</label>
                  <select 
                    className="form-input"
                    required
                    onChange={(e) => {
                      const courseId = e.target.value;
                      if (courseId) {
                        loadLessons(courseId);
                        setSelectedLessonId(''); // Reset lesson selection
                      }
                    }}
                  >
                    <option value="">اختر دورة أولاً...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">المحاضرة المرتبطة بالامتحان</label>
                  <select 
                    name="lesson_id" 
                    required
                    className="form-input"
                    value={selectedLessonId}
                    onChange={(e) => {
                      setSelectedLessonId(e.target.value);
                      loadQuestions(e.target.value);
                    }}
                  >
                    <option value="">اختر المحاضرة...</option>
                    {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-text-main">رابط صورة السؤال</label>
                  <input type="url" name="image_url" required placeholder="مثال: https://imgur.com/question1.png" className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">خيار (أ)</label>
                  <input type="text" name="option_a" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">خيار (ب)</label>
                  <input type="text" name="option_b" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">خيار (ج)</label>
                  <input type="text" name="option_c" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">خيار (د)</label>
                  <input type="text" name="option_d" required className="form-input" />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">الإجابة الصحيحة</label>
                  <select name="correct_option" required className="form-input">
                    <option value="A">أ</option>
                    <option value="B">ب</option>
                    <option value="C">ج</option>
                    <option value="D">د</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex gap-4">
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-plus ml-2"></i> إضافة السؤال للامتحان
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form');
                      if (form) {
                        form.reset();
                        // Optional: you can manually clear React states if they were controlled
                      }
                    }}
                    className="bg-border text-text-main border-none py-4 px-8 rounded-xl font-bold cursor-pointer transition-all hover:bg-slate-300"
                  >
                    <i className="fas fa-eraser ml-2"></i> تفريغ الحقول
                  </button>
                </div>
              </form>

              {selectedLessonId && questions.length > 0 && (
                <div className="mt-5 pt-5 border-t border-border">
                  <h4 className="mb-4 text-primary font-bold">الأسئلة الحالية في هذا الامتحان ({questions.length})</h4>
                  {questions.map((q, index) => (
                    <div key={q.id} className="bg-page-bg border border-border rounded-xl p-4 mb-2.5 flex justify-between items-center">
                      <div className="flex items-center">
                        <strong className="ml-4">س {index + 1}:</strong>
                        <img src={q.image_url} alt="سؤال" className="h-[50px] rounded-md border border-gray-300 ml-4" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/50?text=خطأ'; }} />
                        <span className="text-success font-bold mr-4">(الإجابة: {q.correct_option})</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="py-2 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-red-100 text-red-500 hover:bg-red-500 hover:text-white"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Users Tab (Visible to both Admin and Instructor) */}
        {activeTab === 'users' && (
          <section className="animate-fade-in">
            <h1 className="text-[28px] text-primary mb-8 flex items-center gap-2.5">
              <i className="fas fa-users-cog"></i> الطلاب والتقارير
            </h1>
            
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-black/[0.02] overflow-x-auto">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-users ml-2"></i> قائمة المستخدمين
              </h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">الاسم</th>
                    <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">البريد الإلكتروني</th>
                    <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">الرتبة</th>
                    <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={4} className="text-center p-4">لا يوجد مستخدمين.</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="p-4 border-b border-border"><strong>{u.name}</strong></td>
                        <td className="p-4 border-b border-border text-text-muted">{u.email}</td>
                        <td className="p-4 border-b border-border">
                          {u.role === 'admin' ? (
                            <span className="badge-paid">مدير</span>
                          ) : u.role === 'instructor' ? (
                            <span className="badge-free">مدرس</span>
                          ) : (
                            'طالب'
                          )}
                        </td>
                        <td className="p-4 border-b border-border">
                          <div className="flex gap-1.5">
                            {isAdmin && (
                              <>
                                <button 
                                  onClick={() => openEditModal('user', u)}
                                  className="py-2 px-3 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-sky-100 text-sky-600 hover:bg-sky-500 hover:text-white"
                                  title="تعديل الرتبة والاسم"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="py-2 px-3 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-red-100 text-red-500 hover:bg-red-500 hover:text-white"
                                  title="حذف نهائي"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </>
                            )}
                            <button 
                              onClick={() => handleViewReport(u.id, u.name)}
                              className="py-2 px-3 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-sm bg-slate-200 text-slate-900 hover:bg-slate-300"
                              title="عرض تقرير الطالب"
                            >
                              <i className="fas fa-chart-pie"></i> التقرير
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Codes Tab (Admin Only) */}
        {activeTab === 'codes' && isAdmin && (
          <section className="animate-fade-in">
            <h1 className="text-[28px] text-primary mb-8 flex items-center gap-2.5">
              <i className="fas fa-key"></i> إدارة أكواد التفعيل
            </h1>
            
            {/* Generate Codes Form */}
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] mb-8 border border-black/[0.02]">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-plus-circle ml-2"></i> توليد أكواد تفعيل جديدة
              </h3>
              <form onSubmit={handleGenerateCodes} className="grid grid-cols-1 gap-5">
                <div>
                  <label className="block mb-2 font-bold text-text-main">اختر الدورة (للكورسات المدفوعة)</label>
                  <select name="course_id" required className="form-input">
                    <option value="">اختر الدورة...</option>
                    {courses.filter(c => c.is_free === 0).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 font-bold text-text-main">عدد الأكواد المطلوبة</label>
                  <input type="number" name="count" defaultValue="1" min="1" max="100" required className="form-input" />
                </div>
                <div>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-cogs ml-2"></i> توليد الأكواد
                  </button>
                </div>
              </form>
            </div>

            {/* Codes List */}
            <div className="bg-white p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-black/[0.02]">
              <h3 className="text-primary mb-6 text-xl border-r-4 border-primary pr-3">
                <i className="fas fa-list ml-2"></i> الأكواد الحالية
              </h3>
              <div className="mb-4">
                <label className="block mb-2 font-bold text-text-main">اختر دورة لعرض أكواد التفعيل الخاصة بها</label>
                <select 
                  className="form-input"
                  onChange={(e) => {
                    setSelectedCodeCourseId(e.target.value);
                    loadCodes(e.target.value);
                  }}
                >
                  <option value="">اختر الدورة...</option>
                  {courses.filter(c => c.is_free === 0).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              
              {selectedCodeCourseId && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">كود التفعيل</th>
                        <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">الحالة</th>
                        <th className="bg-page-bg text-primary font-bold p-4 border-b border-border text-right">تاريخ الاستخدام</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.length === 0 ? (
                        <tr><td colSpan={3} className="text-center p-4">لا توجد أكواد لهذه الدورة حالياً.</td></tr>
                      ) : (
                        codes.map((code) => (
                          <tr key={code.id} className="hover:bg-slate-50">
                            <td className="p-4 border-b border-border">
                              <strong className="tracking-wider font-mono text-base">{code.code}</strong>
                            </td>
                            <td className="p-4 border-b border-border">
                              {code.is_used === 1 ? (
                                <span className="badge-paid">مُستخدم بواسطة ({code.used_by})</span>
                              ) : (
                                <span className="badge-free">متاح للاستخدام</span>
                              )}
                            </td>
                            <td className="p-4 border-b border-border text-text-muted">
                              {code.used_at ? new Date(code.used_at).toLocaleDateString('ar-EG') : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay active">
          <div className="bg-white p-8 rounded-[20px] w-[90%] max-w-[600px] max-h-[90vh] overflow-y-auto shadow-modal">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
              <h3 className="text-primary text-xl font-bold">
                تعديل {editingType === 'course' ? 'الدورة' : editingType === 'lesson' ? 'المحاضرة' : 'المستخدم'}
              </h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="bg-none border-none text-2xl text-red-500 cursor-pointer hover:text-red-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="grid grid-cols-1 gap-4">
              {editingType === 'course' && (
                <>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">العنوان</label>
                    <input 
                      type="text" 
                      value={(editFormData.title as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                      required 
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">الوصف</label>
                    <textarea 
                      value={(editFormData.description as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                      className="form-input min-h-[100px]"
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">رابط الغلاف</label>
                    <input 
                      type="url" 
                      value={(editFormData.image_url as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, image_url: e.target.value})}
                      required 
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">نوع الدورة</label>
                    <select 
                      value={isEditCourseFree ? '1' : '0'}
                      className="form-input"
                      onChange={(e) => {
                        const isFree = e.target.value === '1';
                        setIsEditCourseFree(isFree);
                        setEditFormData({
                          ...editFormData, 
                          is_free: isFree ? 1 : 0,
                          price: isFree ? 0 : editFormData.price // reset price if free
                        });
                      }}
                    >
                      <option value="1">مجانية</option>
                      <option value="0">مدفوعة</option>
                    </select>
                  </div>
                  {!isEditCourseFree && (
                    <div>
                      <label className="block mb-2 font-bold text-text-main">السعر (بالجنيه)</label>
                      <input 
                        type="number" 
                        value={(editFormData.price as number) || 0} 
                        onChange={(e) => setEditFormData({...editFormData, price: parseFloat(e.target.value)})}
                        min="0"
                        className="form-input" 
                      />
                    </div>
                  )}
                </>
              )}
              {editingType === 'lesson' && (
                <>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">العنوان</label>
                    <input 
                      type="text" 
                      value={(editFormData.title as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                      required 
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">الرابط</label>
                    <input 
                      type="url" 
                      value={(editFormData.video_url as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, video_url: e.target.value})}
                      required 
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">الترتيب</label>
                    <input 
                      type="number" 
                      value={(editFormData.order_num as number) || 1} 
                      onChange={(e) => setEditFormData({...editFormData, order_num: parseInt(e.target.value)})}
                      required 
                      className="form-input" 
                    />
                  </div>
                </>
              )}
              {editingType === 'user' && (
                <>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">الاسم</label>
                    <input 
                      type="text" 
                      value={(editFormData.name as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                      required 
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-text-main">الرتبة والصلاحية</label>
                    <select 
                      value={(editFormData.role as string) || 'student'} 
                      onChange={(e) => setEditFormData({...editFormData, role: e.target.value})}
                      required 
                      className="form-input"
                    >
                      <option value="student">طالب</option>
                      <option value="instructor">مدرس</option>
                      <option value="admin">مدير</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <button type="submit" className="btn-primary w-full justify-center">
                  <i className="fas fa-save ml-2"></i> حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && reportData && (
        <div className="modal-overlay active">
          <div className="bg-white p-8 rounded-[20px] w-[90%] max-w-[700px] max-h-[90vh] overflow-y-auto shadow-modal">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
              <h3 className="text-primary text-xl font-bold">تقرير الطالب: {reportUserName}</h3>
              <button 
                onClick={() => setShowReportModal(false)}
                className="bg-none border-none text-2xl text-red-500 cursor-pointer hover:text-red-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="leading-relaxed">
              <div className="bg-page-bg p-4 rounded-xl mb-5 border border-border">
                <h4 className="text-primary mb-2.5 font-bold"><i className="fas fa-book-open ml-2"></i> الدورات المشترك بها ({reportData.enrollments.length})</h4>
                {reportData.enrollments.length > 0 ? (
                  <ul className="list-inside pr-4 text-text-main">
                    {reportData.enrollments.map((e, i) => (
                      <li key={i}><strong>{e.title}</strong> <span className="text-text-muted text-sm">(انضم: {new Date(e.enrolled_at).toLocaleDateString('ar-EG')})</span></li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-text-muted">لم يشترك في أي دورة بعد.</p>
                )}
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                <h4 className="text-success mb-2.5 font-bold"><i className="fas fa-check-circle ml-2"></i> المحاضرات المكتملة ({reportData.progress.length})</h4>
                {reportData.progress.length > 0 ? (
                  <ul className="list-inside pr-4 text-text-main">
                    {reportData.progress.map((p, i) => (
                      <li key={i}>محاضرة: <strong>{p.lesson_title}</strong> <span className="text-text-muted text-sm">(من دورة: {p.course_title})</span></li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-text-muted">لم يكمل أي محاضرة حتى الآن.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
