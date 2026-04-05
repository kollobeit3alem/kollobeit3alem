import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course, Lesson, QuizQuestion, User } from '@/types';

type TabType = 'courses' | 'lessons' | 'quizzes' | 'users';

export default function Instructor() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('courses');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Data states
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  
  // Pagination & Search States
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const usersLimit = 50;

  // Form handling states
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  
  // UI logic states
  const [isNewCourseFree, setIsNewCourseFree] = useState(true);
  const [isEditCourseFree, setIsEditCourseFree] = useState(true);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingType, setEditingType] = useState<'course' | 'lesson'>('course');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [reportData, setReportData] = useState<any>(null); 
  const [reportUserName, setReportUserName] = useState('');

  // Redirect if not authenticated or not authorized
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    if (user.role !== 'instructor') {
      toast.error('غير مصرح لك بالدخول لهذه الصفحة!');
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  // Load Initial Data
  useEffect(() => {
    if (token && user && user.role === 'instructor') {
      loadCourses();
      loadUsers(1, '');
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

  const loadUsers = async (page: number, search: string) => {
    if (!token) return;
    try {
      const data = await apiCall(`/api/admin/users?page=${page}&limit=${usersLimit}&search=${encodeURIComponent(search)}`, token) as any;
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
      setUsersPage(data.page || 1);
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
      setIsNewCourseFree(true); 
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

  // User handlers
  const handleSearchUsers = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUsersPage(1);
    
    const cleanSearchQuery = searchQuery.trim();
    setSearchQuery(cleanSearchQuery);
    
    loadUsers(1, cleanSearchQuery);
  };

  const handleViewReport = async (userId: number, userName: string) => {
    if (!token) return;
    
    try {
      // التعديل هنا: تم تغيير StudentReport إلى any
      const data = await apiCall(`/api/admin/reports/${userId}`, token) as any;
      setReportData(data);
      setReportUserName(userName);
      setShowReportModal(true);
    } catch (error) {
      toast.error('فشل جلب تقرير الطالب، تأكد من صحة البيانات.');
    }
  };

  // Export Excel Data
  const handleExportExcel = () => {
    import('xlsx').then(XLSX => {
      const worksheetData = users.map(u => ({
        'الاسم': u.name,
        'البريد الإلكتروني': u.email,
        'رقم الهاتف': u.phone || 'غير مسجل',
        'تاريخ الانضمام': u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : 'غير مسجل'
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      
      XLSX.utils.book_append_sheet(workbook, worksheet, "طلابي");
      XLSX.writeFile(workbook, "تقرير_طلابي.xlsx");
    }).catch(() => {
      toast.error("حدث خطأ أثناء تصدير الإكسيل.");
    });
  };

  // Edit modal handlers
  const openEditModal = (type: 'course' | 'lesson', item: any) => {
    setEditingType(type);
    setEditingId(item.id);
    setEditFormData({ ...item });
    
    if (type === 'course') {
      setIsEditCourseFree(item.is_free === 1);
    }
    
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingId) return;
    
    try {
      let payload = {};
      if (editingType === 'course') {
        payload = {
          title: editFormData.title,
          description: editFormData.description,
          image_url: editFormData.image_url,
          is_free: editFormData.is_free,
          price: editFormData.price || 0
        };
        await apiCall(`/api/admin/courses/${editingId}`, token, 'PUT', payload);
        loadCourses();
      } else if (editingType === 'lesson') {
        payload = {
          title: editFormData.title,
          video_url: editFormData.video_url,
          order_num: editFormData.order_num
        };
        await apiCall(`/api/admin/lessons/${editingId}`, token, 'PUT', payload);
        loadLessons(selectedCourseId);
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

  if (!user || user.role !== 'instructor') return null;

  const inputStyles = "w-full p-4 border-[1.5px] border-[#e2e8f0] rounded-xl text-[15px] text-[#1e293b] bg-[#f4f7f9] focus:bg-white focus:border-[#015669] focus:outline-none transition-colors";
  const btnSubmitStyles = "bg-[#015669] text-white border-none py-4 px-8 rounded-xl cursor-pointer font-bold text-base inline-flex items-center justify-center gap-2.5 transition-all shadow-[0_5px_15px_rgba(1,86,105,0.1)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(1,86,105,0.1)]";
  const navBtnBaseStyles = "bg-transparent border-none text-[#64748b] text-right p-4 rounded-xl cursor-pointer text-base font-bold flex items-center gap-3 transition-all hover:bg-[#f4f7f9] hover:text-[#015669] hover:-translate-x-1.5";
  const navBtnActiveStyles = "bg-[#015669] text-white shadow-[0_10px_20px_rgba(1,86,105,0.1)]";

  return (
    <div className="min-h-screen bg-[#f4f7f9] flex overflow-x-hidden text-[#1e293b]" dir="rtl">
      
      {/* Sidebar */}
      <aside className={`w-[280px] bg-white border-l border-[#e2e8f0] flex flex-col py-[30px] px-5 shadow-[-5px_0_30px_rgba(0,0,0,0.02)] z-[100] transition-all duration-300 lg:relative fixed h-screen overflow-y-auto top-0 right-0 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-4 mb-10 pb-5 border-b border-[#e2e8f0] justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="w-[50px] rounded-xl" />
            <h2 className="text-[#015669] text-[22px] font-bold">لوحة المدرس</h2>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="block lg:hidden bg-none border-none text-2xl text-[#ef4444] cursor-pointer"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <nav className="flex flex-col gap-2.5 flex-1">
          <button 
            onClick={() => setActiveTab('courses')}
            className={`${navBtnBaseStyles} ${activeTab === 'courses' ? navBtnActiveStyles : ''}`}
          >
            <i className="fas fa-layer-group text-xl w-6 text-center"></i> دوراتي
          </button>
          <button 
            onClick={() => setActiveTab('lessons')}
            className={`${navBtnBaseStyles} ${activeTab === 'lessons' ? navBtnActiveStyles : ''}`}
          >
            <i className="fas fa-video text-xl w-6 text-center"></i> المحاضرات
          </button>
          <button 
            onClick={() => setActiveTab('quizzes')}
            className={`${navBtnBaseStyles} ${activeTab === 'quizzes' ? navBtnActiveStyles : ''}`}
          >
            <i className="fas fa-spell-check text-xl w-6 text-center"></i> الامتحانات
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`${navBtnBaseStyles} ${activeTab === 'users' ? navBtnActiveStyles : ''}`}
          >
            <i className="fas fa-users text-xl w-6 text-center"></i> طلابي والتقارير
          </button>
          
          <button 
            onClick={handleLogout}
            className={`${navBtnBaseStyles} mt-auto !bg-[#fff1f2] !text-[#ef4444] hover:!bg-[#ef4444] hover:!text-white`}
          >
            <i className="fas fa-sign-out-alt text-xl w-6 text-center"></i> تسجيل الخروج
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-5 lg:p-10 overflow-y-auto w-full">
        {/* Mobile Top Bar */}
        <div className="lg:hidden flex items-center justify-between mb-5 bg-white p-4 rounded-[15px] shadow-[0_5px_15px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="h-10 rounded-lg" />
            <strong className="text-[#015669]">لوحة المدرس</strong>
          </div>
          <button 
            onClick={() => setSidebarOpen(true)}
            className="bg-[#015669] text-white border-none py-2.5 px-4 rounded-xl text-xl cursor-pointer"
          >
            <i className="fas fa-bars"></i>
          </button>
        </div>

        {/* Courses Tab */}
        {activeTab === 'courses' && (
          <section className="animate-fade-in block">
            <h1 className="text-[28px] text-[#015669] mb-[30px] flex items-center gap-2.5">
              <i className="fas fa-layer-group"></i> إدارة دوراتي
            </h1>
            
            <div className="bg-white p-[30px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] mb-[30px] border border-[rgba(0,0,0,0.02)]">
              <h3 className="text-[#015669] mb-[25px] text-[20px] border-r-4 border-[#015669] pr-2.5">
                <i className="fas fa-plus-circle"></i> إضافة دورة جديدة
              </h3>
              <form onSubmit={handleAddCourse} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-[#1e293b]">عنوان الدورة</label>
                  <input type="text" name="title" required className={inputStyles} />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-[#1e293b]">وصف الدورة</label>
                  <textarea name="description" className={`${inputStyles} min-h-[100px] resize-y`} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">رابط صورة الغلاف</label>
                  <input type="url" name="image_url" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">رابط للتواصل معك (اختياري)</label>
                  <input type="url" name="instructor_contact" className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">نوع الدورة</label>
                  <select 
                    name="is_free" 
                    value={isNewCourseFree ? '1' : '0'}
                    className={inputStyles}
                    onChange={(e) => setIsNewCourseFree(e.target.value === '1')}
                  >
                    <option value="1">مجانية</option>
                    <option value="0">مدفوعة</option>
                  </select>
                </div>
                {!isNewCourseFree && (
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">سعر الدورة (بالجنيه)</label>
                    <input type="number" name="price" defaultValue="0" min="0" className={inputStyles} />
                  </div>
                )}
                <div className="md:col-span-2 mt-2">
                  <button type="submit" className={btnSubmitStyles}>
                    <i className="fas fa-save"></i> حفظ ونشر الدورة
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white p-[30px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.02)]">
              <h3 className="text-[#015669] mb-[25px] text-[20px] border-r-4 border-[#015669] pr-2.5">
                <i className="fas fa-list"></i> دوراتي الحالية
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {courses.map((course) => (
                  <div key={course.id} className="bg-[#f4f7f9] p-5 rounded-[16px] border border-[#e2e8f0] flex flex-col gap-[15px] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#015669]">
                    <div className="text-[18px] font-bold text-[#015669] flex justify-between items-center">
                      {course.title}
                      <span className={course.is_free === 1 
                        ? 'px-3 py-1.5 rounded-full text-[13px] font-bold bg-[#ecfdf5] text-[#10b981]' 
                        : 'px-3 py-1.5 rounded-full text-[13px] font-bold bg-[#fffbeb] text-[#f59e0b]'}>
                        {course.is_free === 1 ? 'مجاني' : `مدفوع - ${course.price || 0} ج.م`}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#64748b]">
                      <i className="fas fa-clock ml-1"></i> تم الإنشاء: {new Date(course.created_at || '').toLocaleDateString('ar-EG')}
                    </div>
                    <div className="flex gap-2.5 mt-auto flex-wrap w-full">
                      <button 
                        onClick={() => openEditModal('course', course)}
                        className="flex-1 p-2.5 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#e0f2fe] text-[#0284c7] hover:bg-[#0284c7] hover:text-white"
                      >
                        <i className="fas fa-edit"></i> تعديل
                      </button>
                      <button 
                        onClick={() => handleDeleteCourse(course.id)}
                        className="flex-1 p-2.5 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#fee2e2] text-[#ef4444] hover:bg-[#ef4444] hover:text-white"
                      >
                        <i className="fas fa-trash"></i> حذف
                      </button>
                    </div>
                  </div>
                ))}
                {courses.length === 0 && (
                  <div className="col-span-full text-center text-[#64748b] py-5">
                    لا توجد دورات مضافة حتى الآن.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Lessons Tab */}
        {activeTab === 'lessons' && (
          <section className="animate-fade-in block">
            <h1 className="text-[28px] text-[#015669] mb-[30px] flex items-center gap-2.5">
              <i className="fas fa-video"></i> إدارة المحاضرات
            </h1>
            
            <div className="bg-white p-[30px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.02)]">
              <h3 className="text-[#015669] mb-[25px] text-[20px] border-r-4 border-[#015669] pr-2.5">
                <i className="fas fa-plus-circle"></i> إضافة محاضرة لدورة
              </h3>
              <form onSubmit={handleAddLesson} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block mb-2 font-bold text-[#1e293b]">اختر الدورة</label>
                  <select 
                    name="course_id" 
                    required 
                    className={inputStyles}
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
                  <label className="block mb-2 font-bold text-[#1e293b]">عنوان المحاضرة</label>
                  <input type="text" name="title" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">رابط الفيديو (YouTube)</label>
                  <input type="url" name="video_url" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">ترتيب المحاضرة (رقم)</label>
                  <input type="number" name="order_num" defaultValue="1" required className={inputStyles} />
                </div>
                <div className="md:col-span-2 mt-2">
                  <button type="submit" className={btnSubmitStyles}>
                    <i className="fas fa-upload"></i> رفع المحاضرة
                  </button>
                </div>
              </form>

              {selectedCourseId && (
                <div className="mt-5 pt-5 border-t border-[#e2e8f0]">
                  <h3 className="mb-[15px] text-[#015669] text-[18px] font-bold">محاضرات الدورة المحددة:</h3>
                  {lessons.length === 0 ? (
                    <p className="text-[#64748b]">لا توجد محاضرات في هذه الدورة.</p>
                  ) : (
                    lessons.map((lesson) => (
                      <div key={lesson.id} className={`flex flex-col md:flex-row justify-between md:items-center bg-[#f4f7f9] p-[15px] rounded-[10px] mb-2.5 border ${lesson.is_admin_locked === 1 ? 'border-[#ef4444] bg-[#fef2f2]' : 'border-[#e2e8f0]'}`}>
                        <div className="mb-3 md:mb-0">
                          <strong className={lesson.is_admin_locked === 1 ? 'text-[#ef4444]' : 'text-[#1e293b]'}>
                            {lesson.order_num}. {lesson.title} {lesson.is_admin_locked === 1 && '(مغلق)'}
                          </strong>
                        </div>
                        <div className="flex gap-[10px] w-full md:w-auto">
                          <button 
                            onClick={() => handleToggleLessonLock(lesson.id, lesson.is_admin_locked !== 1)}
                            className="flex-1 md:flex-none py-2.5 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#fef3c7] text-[#d97706] hover:bg-[#d97706] hover:text-white"
                          >
                            <i className={`fas fa-${lesson.is_admin_locked === 1 ? 'unlock' : 'lock'}`}></i> {lesson.is_admin_locked === 1 ? 'فتح' : 'قفل'}
                          </button>
                          <button 
                            onClick={() => openEditModal('lesson', lesson)}
                            className="flex-1 md:flex-none py-2.5 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#e0f2fe] text-[#0284c7] hover:bg-[#0284c7] hover:text-white"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button 
                            onClick={() => handleDeleteLesson(lesson.id)}
                            className="flex-1 md:flex-none py-2.5 px-4 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#fee2e2] text-[#ef4444] hover:bg-[#ef4444] hover:text-white"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Quizzes Tab */}
        {activeTab === 'quizzes' && (
          <section className="animate-fade-in block">
            <h1 className="text-[28px] text-[#015669] mb-[30px] flex items-center gap-2.5">
              <i className="fas fa-spell-check"></i> بناء الامتحانات
            </h1>
            
            <div className="bg-white p-[30px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.02)]">
              <h3 className="text-[#015669] mb-[25px] text-[20px] border-r-4 border-[#015669] pr-2.5">
                <i className="fas fa-list-ol"></i> إضافة سؤال لامتحان المحاضرة
              </h3>
              
              <form onSubmit={handleAddQuestion} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">اختر الدورة</label>
                  <select 
                    className={inputStyles}
                    required
                    onChange={(e) => {
                      const courseId = e.target.value;
                      if (courseId) {
                        loadLessons(courseId);
                        setSelectedLessonId(''); 
                        setQuestions([]);
                      }
                    }}
                  >
                    <option value="">اختر دورة أولاً...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">المحاضرة المرتبطة بالامتحان</label>
                  <select 
                    name="lesson_id" 
                    required
                    className={inputStyles}
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
                  <label className="block mb-2 font-bold text-[#1e293b]">رابط صورة السؤال</label>
                  <input type="url" name="image_url" required placeholder="مثال: https://imgur.com/question1.png" className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">خيار (أ)</label>
                  <input type="text" name="option_a" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">خيار (ب)</label>
                  <input type="text" name="option_b" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">خيار (ج)</label>
                  <input type="text" name="option_c" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">خيار (د)</label>
                  <input type="text" name="option_d" required className={inputStyles} />
                </div>
                <div>
                  <label className="block mb-2 font-bold text-[#1e293b]">الإجابة الصحيحة</label>
                  <select name="correct_option" required className={inputStyles}>
                    <option value="A">أ</option>
                    <option value="B">ب</option>
                    <option value="C">ج</option>
                    <option value="D">د</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex gap-[15px] mt-2">
                  <button type="submit" className={btnSubmitStyles}>
                    <i className="fas fa-plus"></i> إضافة السؤال
                  </button>
                </div>
              </form>

              {selectedLessonId && (
                <div className="mt-5 pt-[15px] border-t border-[#e2e8f0]">
                  <h4 className="mb-[15px] text-[#015669] text-[16px] font-bold">الأسئلة الحالية في هذا الامتحان ({questions.length})</h4>
                  {questions.length === 0 ? (
                    <p className="text-[#64748b]">لم يتم إضافة أي أسئلة حتى الآن.</p>
                  ) : (
                    questions.map((q, index) => (
                      <div key={q.id} className="bg-[#f4f7f9] border border-[#e2e8f0] rounded-[10px] p-[15px] mb-2.5 flex justify-between items-center">
                        <div className="flex items-center">
                          <strong className="ml-[10px]">س {index + 1}:</strong>
                          <img src={q.image_url} alt="سؤال" className="h-[50px] rounded-[5px] border border-[#ccc] ml-[10px]" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/50?text=خطأ'; }} />
                          <span className="text-[#10b981] font-bold mr-[15px]">(الإجابة: {q.correct_option})</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="py-2.5 px-[15px] flex-none w-auto border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#fee2e2] text-[#ef4444] hover:bg-[#ef4444] hover:text-white"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <section className="animate-fade-in block">
            <h1 className="text-[28px] text-[#015669] mb-[30px] flex items-center gap-2.5">
              <i className="fas fa-users"></i> طلابي والتقارير
            </h1>
            
            <div className="bg-white p-[30px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.02)] overflow-x-auto">
              <h3 className="text-[#015669] mb-[25px] text-[20px] border-r-4 border-[#015669] pr-2.5">
                <i className="fas fa-list"></i> قائمة الطلاب المشتركين بدوراتي
              </h3>

              <div className="flex flex-col md:flex-row justify-between items-center mb-5 gap-4">
                <form onSubmit={handleSearchUsers} className="flex gap-2 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="ابحث بالاسم، الإيميل، أو التليفون..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${inputStyles} !py-2.5 !mb-0 w-full md:w-[300px]`}
                  />
                  <button type="submit" className="bg-[#015669] text-white px-5 rounded-xl font-bold cursor-pointer transition-all hover:bg-[#014150]">
                    <i className="fas fa-search"></i> بحث
                  </button>
                </form>
                <button onClick={handleExportExcel} className="bg-[#10b981] text-white py-2.5 px-5 rounded-xl font-bold cursor-pointer flex items-center gap-2 hover:bg-[#059669] transition-all w-full md:w-auto justify-center">
                  <i className="fas fa-file-excel"></i> تصدير إكسيل
                </button>
              </div>

              <table className="w-full border-collapse mt-2.5">
                <thead>
                  <tr>
                    <th className="bg-[#f4f7f9] text-[#015669] font-bold p-[15px] border-b border-[#e2e8f0] text-right">الاسم</th>
                    <th className="bg-[#f4f7f9] text-[#015669] font-bold p-[15px] border-b border-[#e2e8f0] text-right">البريد الإلكتروني</th>
                    <th className="bg-[#f4f7f9] text-[#015669] font-bold p-[15px] border-b border-[#e2e8f0] text-right">رقم الهاتف</th>
                    <th className="bg-[#f4f7f9] text-[#015669] font-bold p-[15px] border-b border-[#e2e8f0] text-right">التقارير</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={4} className="text-center p-[15px]">لا يوجد طلاب مسجلين في دوراتك حتى الآن.</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="p-[15px] border-b border-[#e2e8f0]"><strong>{u.name}</strong></td>
                        <td className="p-[15px] border-b border-[#e2e8f0] text-[#64748b]">{u.email}</td>
                        <td className="p-[15px] border-b border-[#e2e8f0]">
                          <span className="font-mono text-[#015669] bg-[#f4f7f9] px-2 py-1 rounded-md text-[14px]">
                            {u.phone || 'غير مسجل'}
                          </span>
                        </td>
                        <td className="p-[15px] border-b border-[#e2e8f0]">
                          <button 
                            onClick={() => handleViewReport(u.id, u.name)}
                            className="p-2.5 px-5 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#e2e8f0] text-[#0f172a] hover:bg-[#cbd5e1]"
                            title="عرض تقرير الطالب في دوراتي"
                          >
                            <i className="fas fa-chart-pie"></i> التقرير
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="flex justify-between items-center mt-5">
                <div className="text-[#64748b] text-[14px] font-bold">
                  إجمالي طلابي: {usersTotal}
                </div>
                <div className="flex gap-2.5 items-center">
                  <button
                    onClick={() => loadUsers(usersPage - 1, searchQuery)}
                    disabled={usersPage <= 1}
                    className="bg-white border border-[#e2e8f0] text-[#015669] py-2 px-4 rounded-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f4f7f9] transition-all"
                  >
                    <i className="fas fa-chevron-right ml-1"></i> السابق
                  </button>
                  <div className="bg-[#f4f7f9] border border-[#e2e8f0] text-[#1e293b] py-2 px-4 rounded-lg font-bold">
                    صفحة {usersPage} من {Math.ceil(usersTotal / usersLimit) || 1}
                  </div>
                  <button
                    onClick={() => loadUsers(usersPage + 1, searchQuery)}
                    disabled={usersPage * usersLimit >= usersTotal}
                    className="bg-white border border-[#e2e8f0] text-[#015669] py-2 px-4 rounded-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f4f7f9] transition-all"
                  >
                    التالي <i className="fas fa-chevron-left mr-1"></i>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed top-0 left-0 w-full h-full bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-[5px]">
          <div className="bg-white p-[30px] rounded-[20px] w-[90%] max-w-[600px] max-h-[90vh] overflow-y-auto shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
            <div className="flex justify-between items-center mb-5 pb-[15px] border-b border-[#e2e8f0]">
              <h3 className="text-[#015669] text-xl font-bold">
                تعديل {editingType === 'course' ? 'الدورة' : 'المحاضرة'}
              </h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="bg-none border-none text-[24px] text-[#ef4444] cursor-pointer hover:opacity-80"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="grid grid-cols-1 gap-[15px]">
              {editingType === 'course' && (
                <>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">العنوان</label>
                    <input 
                      type="text" 
                      value={(editFormData.title as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                      required 
                      className={inputStyles} 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">الوصف</label>
                    <textarea 
                      value={(editFormData.description as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                      className={`${inputStyles} min-h-[100px]`}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">رابط الغلاف</label>
                    <input 
                      type="url" 
                      value={(editFormData.image_url as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, image_url: e.target.value})}
                      required 
                      className={inputStyles} 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">نوع الدورة</label>
                    <select 
                      value={isEditCourseFree ? '1' : '0'}
                      className={inputStyles}
                      onChange={(e) => {
                        const isFree = e.target.value === '1';
                        setIsEditCourseFree(isFree);
                        setEditFormData({
                          ...editFormData, 
                          is_free: isFree ? 1 : 0,
                          price: isFree ? 0 : editFormData.price
                        });
                      }}
                    >
                      <option value="1">مجانية</option>
                      <option value="0">مدفوعة</option>
                    </select>
                  </div>
                  {!isEditCourseFree && (
                    <div className="mt-[10px]">
                      <label className="block mb-2 font-bold text-[#1e293b]">السعر (بالجنيه)</label>
                      <input 
                        type="number" 
                        value={(editFormData.price as number) || 0} 
                        onChange={(e) => setEditFormData({...editFormData, price: parseFloat(e.target.value)})}
                        min="0"
                        className={inputStyles} 
                      />
                    </div>
                  )}
                </>
              )}
              {editingType === 'lesson' && (
                <>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">العنوان</label>
                    <input 
                      type="text" 
                      value={(editFormData.title as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                      required 
                      className={inputStyles} 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">الرابط</label>
                    <input 
                      type="url" 
                      value={(editFormData.video_url as string) || ''} 
                      onChange={(e) => setEditFormData({...editFormData, video_url: e.target.value})}
                      required 
                      className={inputStyles} 
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-[#1e293b]">الترتيب</label>
                    <input 
                      type="number" 
                      value={(editFormData.order_num as number) || 1} 
                      onChange={(e) => setEditFormData({...editFormData, order_num: parseInt(e.target.value)})}
                      required 
                      className={inputStyles} 
                    />
                  </div>
                </>
              )}
              <div className="mt-2">
                <button type="submit" className={`${btnSubmitStyles} w-full justify-center`}>
                  <i className="fas fa-save"></i> حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && reportData && (
        <div className="fixed top-0 left-0 w-full h-full bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-[5px]">
          <div className="bg-white p-[30px] rounded-[20px] w-[90%] max-w-[700px] max-h-[90vh] overflow-y-auto shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
            <div className="flex justify-between items-center mb-5 pb-[15px] border-b border-[#e2e8f0]">
              <h3 className="text-[#015669] text-xl font-bold">تقرير الطالب: {reportUserName}</h3>
              <button 
                onClick={() => setShowReportModal(false)}
                className="bg-none border-none text-[24px] text-[#ef4444] cursor-pointer hover:opacity-80"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="leading-[1.8]">
              
              <div className="bg-[#f4f7f9] p-[15px] rounded-[10px] mb-5 border border-[#e2e8f0]">
                <h4 className="text-[#015669] mb-2.5 font-bold"><i className="fas fa-book-open ml-2"></i> الدورات المشترك بها (دوراتي فقط)</h4>
                {reportData.enrollments && reportData.enrollments.length > 0 ? (
                  <ul className="list-inside pr-[15px] text-[#1e293b]">
                    {reportData.enrollments.map((e: any, i: number) => (
                      <li key={i}>
                        <strong>{e.title || 'دورة محذوفة أو غير معروفة'}</strong> 
                        <span className="text-[#64748b] text-[13px] mr-2">
                          (انضم في: {e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('ar-EG') : 'غير محدد'})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#64748b]">لم يشترك في أي من دوراتك بعد.</p>
                )}
              </div>

              <div className="bg-[#ecfdf5] border border-[#a7f3d0] p-[15px] rounded-[10px] mb-5">
                <h4 className="text-[#10b981] mb-2.5 font-bold"><i className="fas fa-check-circle ml-2"></i> المحاضرات المكتملة (دوراتي فقط)</h4>
                {reportData.progress && reportData.progress.length > 0 ? (
                  <ul className="list-inside pr-[15px] text-[#1e293b]">
                    {reportData.progress.map((p: any, i: number) => (
                      <li key={i}>
                        محاضرة: <strong>{p.lesson_title || 'غير معروف'}</strong> 
                        <span className="text-[#64748b] text-[13px] mr-2">
                          (من دورة: {p.course_title || 'غير معروف'}) 
                          {p.completed_at && ` - أُنجزت في: ${new Date(p.completed_at).toLocaleDateString('ar-EG')}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#64748b]">لم يكمل أي محاضرة من دوراتك حتى الآن.</p>
                )}
              </div>

              {/* التعديل هنا: قسم الامتحانات الجديد */}
              <div className="bg-[#fffbeb] border border-[#fde68a] p-[15px] rounded-[10px]">
                <h4 className="text-[#f59e0b] mb-2.5 font-bold"><i className="fas fa-spell-check ml-2"></i> نتائج الامتحانات (دوراتي فقط)</h4>
                {reportData.quizzes && reportData.quizzes.length > 0 ? (
                  <ul className="list-inside pr-[15px] text-[#1e293b] flex flex-col gap-2">
                    {reportData.quizzes.map((q: any, i: number) => (
                      <li key={i} className="flex items-center flex-wrap gap-2">
                        <span>امتحان: <strong>{q.lesson_title}</strong></span> 
                        <span className="text-[#64748b] text-[13px]">(من دورة: {q.course_title})</span>
                        <span className={`mr-auto px-3 py-1 rounded-md font-bold text-sm ${q.score >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          الدرجة: {q.score}%
                        </span>
                        <span className="text-[#64748b] text-[12px] w-full mt-1" dir="ltr">{new Date(q.attempted_at).toLocaleString('ar-EG')}</span>
                      </li>
                    ))}
                  </ul>
                ) : ( <p className="text-[#64748b]">لم يؤدِ أي امتحان في دوراتك حتى الآن.</p> )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
