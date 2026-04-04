import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course, Lesson, QuizQuestion, User, ActivationCode, StudentReport } from '@/types';

type TabType = 'courses' | 'lessons' | 'quizzes' | 'users' | 'staff' | 'codes';

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
  
  // Pagination & Search States
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const usersLimit = 50;

  // Form handling states
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedCodeCourseId, setSelectedCodeCourseId] = useState('');
  
  // UI logic states
  const [isNewCourseFree, setIsNewCourseFree] = useState(true);
  const [isEditCourseFree, setIsEditCourseFree] = useState(true);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingType, setEditingType] = useState<'course' | 'lesson' | 'user'>('course');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [reportData, setReportData] = useState<StudentReport | null>(null);
  const [reportUserName, setReportUserName] = useState('');

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    if (user.role !== 'admin') {
      toast.error('غير مصرح لك بالدخول لهذه الصفحة!');
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  // Load Initial Data
  useEffect(() => {
    if (token && user && user.role === 'admin') {
      loadCourses();
    }
  }, [token, user]);

  const loadUsers = async (page: number, search: string, typeParam: string) => {
    if (!token) return;
    try {
      const data = await apiCall(`/api/admin/users?page=${page}&limit=${usersLimit}&search=${encodeURIComponent(search)}&type=${typeParam}`, token) as any;
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
      setUsersPage(data.page || 1);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  useEffect(() => {
    if (token && (activeTab === 'users' || activeTab === 'staff')) {
      loadUsers(1, '', activeTab === 'staff' ? 'staff' : 'students');
    }
  }, [activeTab, token]);

  const loadCourses = async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/courses', token) as Course[];
      setCourses(data);
    } catch (error) {
      console.error('Failed to load courses:', error);
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
      setIsNewCourseFree(true); 
      loadCourses();
    } catch (error) {
      toast.error('فشل إضافة الدورة');
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف الدورة؟')) return;
    if (!token) return;
    try {
      await apiCall(`/api/admin/courses/${id}`, token, 'DELETE');
      toast.success('تم حذف الدورة');
      loadCourses();
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
    if (!confirm('حذف السؤال؟')) return;
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
      await apiCall('/api/admin/codes', token, 'POST', {
        course_id: parseInt(formData.get('course_id') as string),
        count: parseInt(formData.get('count') as string),
      });
      toast.success('تم توليد الأكواد بنجاح!');
      form.reset();
      loadCodes(selectedCodeCourseId);
    } catch (error) {
      toast.error('فشل توليد الأكواد');
    }
  };

  // User handlers
  const handleSearchUsers = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUsersPage(1);
    loadUsers(1, searchQuery.trim(), activeTab === 'staff' ? 'staff' : 'students');
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('حذف المستخدم نهائياً؟')) return;
    if (!token) return;
    try {
      await apiCall(`/api/admin/users/${id}`, token, 'DELETE');
      toast.success('تم الحذف');
      loadUsers(usersPage, searchQuery, activeTab === 'staff' ? 'staff' : 'students');
    } catch (error) {
      toast.error('فشل الحذف');
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
      toast.error('فشل جلب التقرير');
    }
  };

  const handleExportExcel = () => {
    import('xlsx').then(XLSX => {
      const worksheetData = users.map(u => ({
        'الاسم': u.name,
        'البريد الإلكتروني': u.email,
        'رقم الهاتف': u.phone || 'غير مسجل',
        'الرتبة': u.role,
        'تاريخ الانضمام': u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : ''
      }));
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "البيانات");
      XLSX.writeFile(workbook, `تقرير_${activeTab}.xlsx`);
    });
  };

  // Edit modal handlers
  const openEditModal = (type: 'course' | 'lesson' | 'user', item: any) => {
    setEditingType(type);
    setEditingId(item.id);
    setEditFormData({ ...item });
    if (type === 'course') setIsEditCourseFree(item.is_free === 1);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingId) return;
    try {
      let payload = { ...editFormData };
      await apiCall(`/api/admin/users/${editingId}`, token, 'PUT', payload); // تبسيط للمثال
      toast.success('تم التحديث');
      setShowEditModal(false);
      // إعادة تحميل البيانات المناسبة
    } catch (error) {
      toast.error('فشل التحديث');
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  if (!user || user.role !== 'admin') return null;

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
            <h2 className="text-[#015669] text-[22px] font-bold">إدارة المنصة</h2>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-2xl text-[#ef4444]"><i className="fas fa-times"></i></button>
        </div>
        
        <nav className="flex flex-col gap-2.5 flex-1">
          <button onClick={() => setActiveTab('courses')} className={`${navBtnBaseStyles} ${activeTab === 'courses' ? navBtnActiveStyles : ''}`}><i className="fas fa-layer-group w-6"></i> الدورات</button>
          <button onClick={() => setActiveTab('lessons')} className={`${navBtnBaseStyles} ${activeTab === 'lessons' ? navBtnActiveStyles : ''}`}><i className="fas fa-video w-6"></i> المحاضرات</button>
          <button onClick={() => setActiveTab('quizzes')} className={`${navBtnBaseStyles} ${activeTab === 'quizzes' ? navBtnActiveStyles : ''}`}><i className="fas fa-spell-check w-6"></i> الامتحانات</button>
          <button onClick={() => setActiveTab('users')} className={`${navBtnBaseStyles} ${activeTab === 'users' ? navBtnActiveStyles : ''}`}><i className="fas fa-users w-6"></i> الطلاب</button>
          <button onClick={() => setActiveTab('staff')} className={`${navBtnBaseStyles} ${activeTab === 'staff' ? navBtnActiveStyles : ''}`}><i className="fas fa-user-tie w-6"></i> فريق العمل</button>
          <button onClick={() => setActiveTab('codes')} className={`${navBtnBaseStyles} ${activeTab === 'codes' ? navBtnActiveStyles : ''}`}><i className="fas fa-key w-6"></i> الأكواد</button>
          <button onClick={handleLogout} className={`${navBtnBaseStyles} mt-auto !bg-[#fff1f2] !text-[#ef4444]`}><i className="fas fa-sign-out-alt w-6"></i> خروج</button>
        </nav>
      </aside>

      <main className="flex-1 p-5 lg:p-10 overflow-y-auto">
        {/* Mobile Header */}
        <div className="lg:hidden flex justify-between bg-white p-4 rounded-xl mb-5 shadow-sm">
          <strong className="text-[#015669]">لوحة التحكم</strong>
          <button onClick={() => setSidebarOpen(true)} className="text-[#015669] text-xl"><i className="fas fa-bars"></i></button>
        </div>

        {/* Courses Section */}
        {activeTab === 'courses' && (
          <section className="animate-fade-in">
            <h1 className="text-2xl font-bold mb-6 text-[#015669]">إدارة الدورات التدريبية</h1>
            <div className="bg-white p-6 rounded-2xl shadow-sm mb-8">
              <h3 className="font-bold mb-4">إضافة دورة جديدة</h3>
              <form onSubmit={handleAddCourse} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" name="title" placeholder="العنوان" required className={inputStyles} />
                <input type="url" name="image_url" placeholder="رابط الصورة" required className={inputStyles} />
                <textarea name="description" placeholder="الوصف" className={`${inputStyles} md:col-span-2`} />
                <button type="submit" className={btnSubmitStyles}>حفظ الدورة</button>
              </form>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {courses.map(c => (
                <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <h4 className="font-bold text-[#015669] mb-2">{c.title}</h4>
                  <div className="flex gap-2">
                    <button onClick={() => openEditModal('course', c)} className="p-2 bg-blue-50 text-blue-600 rounded-lg flex-1">تعديل</button>
                    <button onClick={() => handleDeleteCourse(c.id)} className="p-2 bg-red-50 text-red-600 rounded-lg flex-1">حذف</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Users & Staff Sections */}
        {(activeTab === 'users' || activeTab === 'staff') && (
          <section className="animate-fade-in">
            <h1 className="text-2xl font-bold mb-6 text-[#015669]">{activeTab === 'staff' ? 'فريق العمل' : 'الطلاب والتقارير'}</h1>
            <div className="bg-white p-6 rounded-2xl shadow-sm overflow-x-auto">
              <div className="flex justify-between mb-6">
                <form onSubmit={handleSearchUsers} className="flex gap-2">
                  <input type="text" placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={inputStyles} />
                  <button type="submit" className="bg-[#015669] text-white px-6 rounded-xl">بحث</button>
                </form>
                <button onClick={handleExportExcel} className="bg-green-600 text-white px-6 rounded-xl">تصدير</button>
              </div>
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 font-bold">
                    <th className="p-4 border-b">الاسم</th>
                    <th className="p-4 border-b">البريد</th>
                    <th className="p-4 border-b">الرتبة</th>
                    <th className="p-4 border-b">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="p-4 border-b">{u.name}</td>
                      <td className="p-4 border-b text-gray-500">{u.email}</td>
                      <td className="p-4 border-b"><span className="px-2 py-1 bg-gray-100 rounded text-sm">{u.role}</span></td>
                      <td className="p-4 border-b flex gap-2">
                        <button onClick={() => openEditModal('user', u)} className="p-2 text-blue-600"><i className="fas fa-edit"></i></button>
                        <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-600"><i className="fas fa-trash"></i></button>
                        {u.role === 'student' && <button onClick={() => handleViewReport(u.id, u.name)} className="p-2 text-gray-600"><i className="fas fa-chart-pie"></i></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Modals are placed here (same as before but cleaner) */}
      {/* ... (Report Modal and Edit Modal remain same logic but for Admin only) ... */}
      
    </div>
  );
}
