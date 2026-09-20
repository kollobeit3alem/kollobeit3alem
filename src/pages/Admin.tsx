import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
// استيراد مكتبات الرسم البياني
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Course, Lesson, QuizQuestion, User } from '@/types';
import { KbModal, StatCard, RoleBadge, EmptyState, ModalTitle } from '@/components/kb/shared';
import { DashboardShell, type NavItem, DataCard, KbTable, Pagination } from '@/components/kb/shell';

// تسجيل إضافات الرسم البياني
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// 💡 التعديل: إزالة 'codes' وإضافة 'transactions' للتقارير المالية
type TabType = 'courses' | 'lessons' | 'quizzes' | 'users' | 'staff' | 'transactions' | 'failedExams';

export default function Admin() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('courses');

  // Data states
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  // 💡 التعديل: حالة الإحصائيات المالية المجمعة (بدل العمليات الفردية)
  const [salesStats, setSalesStats] = useState<any[]>([]);
  const [failedExams, setFailedExams] = useState<any[]>([]);

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

  // حالات الإعدادات المتقدمة (Metadata) وأنواع الأسئلة
  const [newCourseMeta, setNewCourseMeta] = useState({ level: '', language: '', badge: '' });
  const [questionType, setQuestionType] = useState<'mcq' | 'tf'>('mcq');

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingType, setEditingType] = useState<'course' | 'lesson' | 'user'>('course');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [editCourseMeta, setEditCourseMeta] = useState({ level: '', language: '', badge: '' });
  const [reportData, setReportData] = useState<any>(null);
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
      const data = (await apiCall(
        `/api/admin/users?page=${page}&limit=${usersLimit}&search=${encodeURIComponent(search)}&type=${typeParam}`,
        token,
      )) as any;
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
      setUsersPage(data.page || 1);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  useEffect(() => {
    if (token && (activeTab === 'users' || activeTab === 'staff')) {
      loadUsers(1, searchQuery.trim(), activeTab === 'staff' ? 'staff' : 'students');
    }
  }, [activeTab, token]);

  // 💡 التعديل: جلب الإحصائيات المجمعة من السيرفر مباشرة
  const loadSalesStats = async () => {
    if (!token) return;
    try {
      const data = (await apiCall('/api/admin/transactions/stats', token)) as any[];
      setSalesStats(data);
    } catch (error) {
      console.error('Failed to load sales stats:', error);
      toast.error('فشل جلب إحصائيات المبيعات');
    }
  };

  useEffect(() => {
    if (token && activeTab === 'transactions') {
      loadSalesStats();
    }
  }, [activeTab, token]);

  // جلب بيانات الامتحانات المعلقة
  useEffect(() => {
    if (token && activeTab === 'failedExams') {
      loadFailedExams();
    }
  }, [activeTab, token]);

  const loadCourses = async () => {
    if (!token) return;
    try {
      const data = (await apiCall('/api/courses', token)) as Course[];
      setCourses(data);
    } catch (error) {
      console.error('Failed to load courses:', error);
    }
  };

  const loadLessons = async (courseId: string) => {
    if (!token || !courseId) return;
    try {
      const data = (await apiCall(`/api/courses/${courseId}/lessons`, token)) as Lesson[];
      setLessons(data);
    } catch (error) {
      console.error('Failed to load lessons:', error);
    }
  };

  const loadQuestions = async (lessonId: string) => {
    if (!token || !lessonId) return;
    try {
      const data = (await apiCall(`/api/lessons/${lessonId}/quiz`, token)) as QuizQuestion[];
      setQuestions(data);
    } catch (error) {
      console.error('Failed to load questions:', error);
    }
  };

  const loadFailedExams = async () => {
    if (!token) return;
    try {
      const data = (await apiCall('/api/admin/failed-exams', token)) as any[];
      setFailedExams(data);
    } catch (error) {
      console.error('Failed to load failed exams:', error);
      toast.error('فشل جلب الامتحانات المعلقة');
    }
  };

  // Course handlers
  const handleAddCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    const form = e.currentTarget;
    const formData = new FormData(form);

    const metadataObj: any = {};
    if (newCourseMeta.level) metadataObj.level = newCourseMeta.level;
    if (newCourseMeta.language) metadataObj.language = newCourseMeta.language;
    if (newCourseMeta.badge) metadataObj.badge = newCourseMeta.badge;

    try {
      await apiCall('/api/admin/courses', token, 'POST', {
        title: formData.get('title'),
        description: formData.get('description'),
        image_url: formData.get('image_url'),
        instructor_contact: formData.get('instructor_contact'),
        is_free: parseInt(formData.get('is_free') as string),
        price: parseFloat(formData.get('price') as string) || 0,
        metadata: Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null,
      });
      toast.success('تمت إضافة الدورة بنجاح!');
      form.reset();
      setIsNewCourseFree(true);
      setNewCourseMeta({ level: '', language: '', badge: '' });
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
      const payload = {
        lesson_id: parseInt(formData.get('lesson_id') as string),
        image_url: formData.get('image_url') || null,
        option_a: questionType === 'tf' ? 'صح' : formData.get('option_a'),
        option_b: questionType === 'tf' ? 'خطأ' : formData.get('option_b'),
        option_c: questionType === 'tf' ? '' : formData.get('option_c'),
        option_d: questionType === 'tf' ? '' : formData.get('option_d'),
        correct_option: formData.get('correct_option'),
        type: questionType === 'tf' ? 'true_false' : 'mcq',
      };

      await apiCall('/api/admin/quizzes', token, 'POST', payload);
      toast.success('تم إضافة السؤال!');

      ['image_url', 'option_a', 'option_b', 'option_c', 'option_d'].forEach(name => {
        const el = form.elements.namedItem(name) as HTMLInputElement;
        if (el) el.value = '';
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
    loadUsers(1, cleanSearchQuery, activeTab === 'staff' ? 'staff' : 'students');
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('تنبيه هام! سيتم حذف هذا المستخدم وكل سجلاته نهائياً. هل أنت متأكد؟')) return;
    if (!token) return;
    try {
      await apiCall(`/api/admin/users/${id}`, token, 'DELETE');
      toast.success('تم حذف المستخدم');
      loadUsers(usersPage, searchQuery, activeTab === 'staff' ? 'staff' : 'students');
    } catch (error) {
      toast.error('فشل حذف المستخدم');
    }
  };

  const handleViewReport = async (userId: number, userName: string) => {
    if (!token) return;
    try {
      const data = (await apiCall(`/api/admin/reports/${userId}`, token)) as any;
      setReportData(data);
      setReportUserName(userName);
      setShowReportModal(true);
    } catch (error) {
      toast.error('فشل جلب تقرير الطالب، تأكد من صحة قاعدة البيانات.');
    }
  };

  const handleExportExcel = () => {
    import('xlsx')
      .then(XLSX => {
        const worksheetData = users.map(u => ({
          'الاسم': u.name,
          'البريد الإلكتروني': u.email,
          'رقم الهاتف': u.phone || 'غير مسجل',
          'الرتبة': u.role === 'admin' ? 'مدير' : u.role === 'instructor' ? 'مدرس' : u.role === 'assistant' ? 'متابع' : 'طالب',
          'تاريخ الانضمام': u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : 'غير مسجل',
        }));
        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        const sheetName = activeTab === 'staff' ? 'فريق العمل' : 'الطلاب';
        const fileName = activeTab === 'staff' ? 'تقرير_فريق_العمل.xlsx' : 'تقرير_الطلاب.xlsx';
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, fileName);
      })
      .catch(() => {
        toast.error('حدث خطأ أثناء تصدير الإكسيل.');
      });
  };

  // Edit modal handlers
  const openEditModal = (type: 'course' | 'lesson' | 'user', item: any) => {
    setEditingType(type);
    setEditingId(item.id);
    setEditFormData({ ...item });

    if (type === 'course') {
      setIsEditCourseFree(item.is_free === 1);
      let parsedMeta = { level: '', language: '', badge: '' };
      try {
        if (item.metadata) parsedMeta = JSON.parse(item.metadata);
      } catch (e) {}
      setEditCourseMeta(parsedMeta);
    }
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingId) return;
    try {
      let payload = {};
      if (editingType === 'course') {
        const metadataObj: any = {};
        if (editCourseMeta.level) metadataObj.level = editCourseMeta.level;
        if (editCourseMeta.language) metadataObj.language = editCourseMeta.language;
        if (editCourseMeta.badge) metadataObj.badge = editCourseMeta.badge;

        payload = {
          title: editFormData.title,
          description: editFormData.description,
          image_url: editFormData.image_url,
          is_free: editFormData.is_free,
          price: editFormData.price || 0,
          metadata: Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null,
        };
        await apiCall(`/api/admin/courses/${editingId}`, token, 'PUT', payload);
        loadCourses();
      } else if (editingType === 'lesson') {
        payload = {
          title: editFormData.title,
          video_url: editFormData.video_url,
          order_num: editFormData.order_num,
        };
        await apiCall(`/api/admin/lessons/${editingId}`, token, 'PUT', payload);
        loadLessons(selectedCourseId);
      } else if (editingType === 'user') {
        payload = {
          name: editFormData.name,
          role: editFormData.role,
          phone: editFormData.phone,
        };
        await apiCall(`/api/admin/users/${editingId}`, token, 'PUT', payload);
        loadUsers(usersPage, searchQuery, activeTab === 'staff' ? 'staff' : 'students');
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

  // تجهيز بيانات المخطط البياني (Chart Data)
  const processChartData = () => {
    const labels = salesStats.map(s => s.course_title);
    const successData = salesStats.map(s => s.successful_sales);
    const pendingData = salesStats.map(s => s.pending_sales);
    const revenues = salesStats.map(s => s.total_revenue);

    return {
      labels,
      revenues,
      datasets: [
        {
          label: 'مبيعات ناجحة',
          data: successData,
          backgroundColor: 'rgba(16, 185, 129, 0.7)', // أخضر
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
        },
        {
          label: 'عمليات معلقة',
          data: pendingData,
          backgroundColor: 'rgba(245, 158, 11, 0.7)', // برتقالي
          borderColor: 'rgb(245, 158, 11)',
          borderWidth: 1,
        },
      ],
    };
  };

  const chartData = activeTab === 'transactions' && salesStats.length > 0 ? processChartData() : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { family: 'inherit', size: 14 },
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          afterBody: function (context: any) {
            // عرض إجمالي الأرباح في الـ Tooltip
            const index = context[0].dataIndex;
            const revenue = chartData?.revenues[index] || 0;
            return `إجمالي الإيرادات: ${revenue} ج.م`;
          },
        },
        titleFont: { family: 'inherit', size: 14 },
        bodyFont: { family: 'inherit', size: 13 },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 },
      },
    },
  };

  if (!user || user.role !== 'admin') return null;

  const navItems: NavItem[] = [
    { key: 'courses', label: 'إدارة الدورات', icon: 'fa-layer-group' },
    { key: 'lessons', label: 'إدارة المحاضرات', icon: 'fa-video' },
    { key: 'quizzes', label: 'الامتحانات', icon: 'fa-spell-check' },
    { key: 'transactions', label: 'مبيعات الدورات', icon: 'fa-chart-simple', color: '#10b981' },
    { key: 'users', label: 'الطلاب والتقارير', icon: 'fa-users' },
    { key: 'staff', label: 'فريق العمل', icon: 'fa-user-tie' },
    { key: 'failedExams', label: 'درج العزل', icon: 'fa-exclamation-triangle', color: '#f59e0b' },
  ];

  const tabTitle: Record<TabType, { icon: string; title: string }> = {
    courses: { icon: 'fa-layer-group', title: 'إدارة الدورات التدريبية' },
    lessons: { icon: 'fa-video', title: 'إدارة المحاضرات' },
    quizzes: { icon: 'fa-spell-check', title: 'بناء الامتحانات' },
    users: { icon: 'fa-users-cog', title: 'الطلاب والتقارير' },
    staff: { icon: 'fa-user-tie', title: 'إدارة فريق العمل' },
    transactions: { icon: 'fa-chart-simple', title: 'مبيعات الدورات' },
    failedExams: { icon: 'fa-exclamation-triangle', title: 'الامتحانات المعلقة (درج العزل)' },
  };

  return (
    <DashboardShell
      brand="الإدارة المركزية"
      activeKey={activeTab}
      navItems={navItems}
      user={user}
      onNavigate={(key) => setActiveTab(key as TabType)}
      onLogout={handleLogout}
      extraNav={
        <Link
          to="/"
          className="mb-6 flex cursor-pointer items-center gap-3 rounded-xl border-none bg-sky-50 p-4 text-right text-[15px] font-bold text-sky-600 no-underline transition-all hover:bg-sky-500 hover:text-white"
        >
          <i className="fas fa-external-link-alt w-6 text-center text-xl"></i> معاينة المنصة (كطالب)
        </Link>
      }
    >
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-light)] text-[22px] text-[var(--primary-color)]">
          <i className={`fas ${tabTitle[activeTab].icon}`} />
        </span>
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--primary-color)] md:text-[30px]">{tabTitle[activeTab].title}</h1>
          <p className="text-sm text-[var(--text-muted)]">لوحة الإدارة المركزية لمنصة كله بيتعلم</p>
        </div>
      </div>{/* ============ [TAB-COURSES] ============ */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          <DataCard title="إضافة دورة جديدة">
            <form onSubmit={handleAddCourse} className="kb-form-grid">
              <div className="kb-field">
                <label>اسم الدورة</label>
                <input type="text" name="title" required placeholder="مثال: أساسيات الرياضيات للثانوية العامة" />
              </div>
              <div className="kb-field">
                <label>رابط صورة الغلاف</label>
                <input type="text" name="image_url" placeholder="https://..." />
              </div>
              <div className="kb-field">
                <label>تواصل المدرس</label>
                <input type="text" name="instructor_contact" placeholder="واتساب أو بريد المدرب" />
              </div>
              <div className="kb-field">
                <label>السعر (ج.م)</label>
                <input type="number" name="price" min="0" step="0.01" disabled={isNewCourseFree} placeholder="0" />
              </div>
              <div className="kb-field">
                <label>نوع الدورة</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewCourseFree(true)}
                    className={`kb-chip ${isNewCourseFree ? 'kb-chip-green' : 'kb-chip-slate'}`}
                  >
                    <i className="fas fa-hand-holding-heart" /> مجانية
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNewCourseFree(false)}
                    className={`kb-chip ${!isNewCourseFree ? 'kb-chip-amber' : 'kb-chip-slate'}`}
                  >
                    <i className="fas fa-coins" /> مدفوعة
                  </button>
                </div>
              </div>
              <input type="hidden" name="is_free" value={isNewCourseFree ? '1' : '0'} />
              <div className="kb-field">
                <label>الوصف</label>
                <textarea name="description" rows={3} placeholder="ماذا سيتعلم الطالب في هذه الدورة؟" />
              </div>
              <div className="kb-form-grid kb-grid-3">
                <div className="kb-field">
                  <label>الصف الدراسي</label>
                  <select
                    value={newCourseMeta.level}
                    onChange={(e) => setNewCourseMeta({ ...newCourseMeta, level: e.target.value })}
                  >
                    <option value="">غير محدد</option>
                    <option value="أولى ثانوي">أولى ثانوي</option>
                    <option value="تانية ثانوي">تانية ثانوي</option>
                    <option value="تالتة ثانوي">تالتة ثانوي</option>
                    <option value="إعدادي">إعدادي</option>
                  </select>
                </div>
                <div className="kb-field">
                  <label>لغة الشرح</label>
                  <select
                    value={newCourseMeta.language}
                    onChange={(e) => setNewCourseMeta({ ...newCourseMeta, language: e.target.value })}
                  >
                    <option value="">غير محدد</option>
                    <option value="العربية">العربية</option>
                    <option value="English">English</option>
                    <option value="العربية + English">عربي + إنجليزي</option>
                  </select>
                </div>
                <div className="kb-field">
                  <label>شارة مميزة</label>
                  <input
                    type="text"
                    value={newCourseMeta.badge}
                    onChange={(e) => setNewCourseMeta({ ...newCourseMeta, badge: e.target.value })}
                    placeholder="مثال: الأقوى للمراجعة النهائية"
                  />
                </div>
              </div>
              <div className="kb-form-actions">
                <button type="submit" className="kb-btn-primary">
                  <i className="fas fa-plus" /> إضافة الدورة
                </button>
              </div>
            </form>
          </DataCard>

          <DataCard
            title={`الدورات الحالية (${courses.length})`}
            action={
              <span className="kb-chip kb-chip-slate">
                <i className="fas fa-layer-group" /> {courses.length} دورة
              </span>
            }
          >
            {courses.length === 0 ? (
              <EmptyState icon="fa-layer-group" title="لا توجد دورات بعد" description="أضف أول دورة من النموذج أعلاه" />
            ) : (
              <KbTable headers={['الدورة', 'السعر', 'تاريخ الإنشاء', 'إجراءات']}>
                {courses.map((course, index) => (
                  <tr key={course.id} className="hover:bg-slate-50/60 transition-colors">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-slate-400">
                          {index + 1}
                        </span>
                        {course.image_url ? (
                          <img src={course.image_url} alt={course.title} className="h-11 w-16 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-11 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                            <i className="fas fa-book-open" />
                          </span>
                        )}
                        <div>
                          <p className="font-bold text-[#1e293b]">{course.title}</p>
                          <span className="text-[12px] text-[var(--text-muted)]">{course.description?.slice(0, 40) || 'بدون وصف'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {course.is_free === 1 ? (
                        <span className="kb-chip kb-chip-green">
                          <i className="fas fa-hand-holding-heart" /> مجانية
                        </span>
                      ) : (
                        <span className="kb-chip kb-chip-amber">
                          <i className="fas fa-coins" /> {course.price} ج.م
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">
                      {course.created_at ? new Date(course.created_at).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditModal('course', course)} className="kb-table-action bg-sky-50 text-sky-600 hover:bg-sky-100" title="تعديل">
                          <i className="fas fa-pen" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCourseId(course.id.toString());
                            loadLessons(course.id.toString());
                            setActiveTab('lessons');
                          }}
                          className="kb-table-action bg-[var(--primary-light)] text-[var(--primary-color)] hover:bg-[var(--primary-color)] hover:text-white"
                          title="إدارة محاضرات الدورة"
                        >
                          <i className="fas fa-video" />
                        </button>
                        <button onClick={() => handleDeleteCourse(course.id)} className="kb-table-action bg-red-50 text-red-500 hover:bg-red-100" title="حذف">
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </KbTable>
            )}
          </DataCard>
        </div>
      )}

      {/* ============ [TAB-LESSONS] ============ */}
      {activeTab === 'lessons' && (
        <div className="space-y-6">
          <DataCard title="اختيار الدورة">
            <select
              value={selectedCourseId}
              onChange={(e) => {
                setSelectedCourseId(e.target.value);
                loadLessons(e.target.value);
              }}
              className="kb-input w-full md:max-w-sm"
            >
              <option value="">— اختر دورة لإدارة محاضراتها —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </DataCard>

          {selectedCourseId ? (
            <>
              <DataCard title="إضافة محاضرة جديدة">
                <form onSubmit={handleAddLesson} className="kb-form-grid">
                  <input type="hidden" name="course_id" value={selectedCourseId} />
                  <div className="kb-field">
                    <label>عنوان المحاضرة</label>
                    <input type="text" name="title" required placeholder="مثال: الدرس الأول — المعادلات" />
                  </div>
                  <div className="kb-field">
                    <label>رابط الفيديو (YouTube)</label>
                    <input type="text" name="video_url" required placeholder="https://www.youtube.com/watch?v=..." />
                  </div>
                  <div className="kb-field">
                    <label>الترتيب</label>
                    <input type="number" name="order_num" min="1" required placeholder="1" />
                  </div>
                  <div className="kb-form-actions">
                    <button type="submit" className="kb-btn-primary">
                      <i className="fas fa-plus" /> إضافة المحاضرة
                    </button>
                  </div>
                </form>
              </DataCard>

              <DataCard title={`محاضرات الدورة (${lessons.length})`}>
                {lessons.length === 0 ? (
                  <EmptyState icon="fa-video" title="لا توجد محاضرات بعد" description="ابدأ بإضافة أول محاضرة لهذه الدورة" />
                ) : (
                  <KbTable headers={['#', 'العنوان', 'الترتيب', 'الحالة', 'إجراءات']}>
                    {lessons.map((lesson) => (
                      <tr key={lesson.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="text-[13px] text-[var(--text-muted)]">{lesson.id}</td>
                        <td className="font-bold text-[#1e293b]">{lesson.title}</td>
                        <td>
                          <span className="kb-chip kb-chip-slate">#{lesson.order_num}</span>
                        </td>
                        <td>
                          {lesson.is_admin_locked === 1 ? (
                            <span className="kb-chip kb-chip-red">
                              <i className="fas fa-lock" /> مقفولة
                            </span>
                          ) : (
                            <span className="kb-chip kb-chip-green">
                              <i className="fas fa-unlock" /> مفتوحة
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditModal('lesson', lesson)} className="kb-table-action bg-sky-50 text-sky-600 hover:bg-sky-100" title="تعديل">
                              <i className="fas fa-pen" />
                            </button>
                            <button
                              onClick={() => handleToggleLessonLock(lesson.id, lesson.is_admin_locked !== 1)}
                              className="kb-table-action bg-[var(--primary-light)] text-[var(--primary-color)] hover:bg-[var(--primary-color)] hover:text-white"
                              title={lesson.is_admin_locked === 1 ? 'فتح المحاضرة' : 'قفل المحاضرة'}
                            >
                              <i className={`fas ${lesson.is_admin_locked === 1 ? 'fa-unlock' : 'fa-lock'}`} />
                            </button>
                            <button onClick={() => handleDeleteLesson(lesson.id)} className="kb-table-action bg-red-50 text-red-500 hover:bg-red-100" title="حذف">
                              <i className="fas fa-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </KbTable>
                )}
              </DataCard>
            </>
          ) : (
            <EmptyState icon="fa-hand-pointer" title="اختر دورة أولاً" description="اختر الدورة التي تريد إدارة محاضراتها من القائمة أعلاه" />
          )}
        </div>
      )}

      {/* ============ [TAB-QUIZZES] ============ */}
      {activeTab === 'quizzes' && (
        <div className="space-y-6">
          <DataCard title="اختيار المحاضرة">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <select
                value={selectedLessonId}
                onChange={(e) => {
                  setSelectedLessonId(e.target.value);
                  loadQuestions(e.target.value);
                }}
                className="kb-input w-full md:max-w-xl"
              >
                <option value="">— اختر محاضرة لبناء امتحانها —</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setActiveTab('lessons');
                }}
                className="kb-btn-soft text-sm"
              >
                <i className="fas fa-arrow-right" /> إدارة المحاضرات
              </button>
            </div>
          </DataCard>

          {selectedLessonId ? (
            <>
              <DataCard title="إضافة سؤال جديد">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-[var(--text-muted)]">نوع السؤال:</span>
                  <button
                    type="button"
                    onClick={() => setQuestionType('mcq')}
                    className={`kb-chip ${questionType === 'mcq' ? 'kb-chip-blue' : 'kb-chip-slate'}`}
                  >
                    <i className="fas fa-list-ul" /> اختيار من متعدد
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionType('tf')}
                    className={`kb-chip ${questionType === 'tf' ? 'kb-chip-green' : 'kb-chip-slate'}`}
                  >
                    <i className="fas fa-check" /> صح / خطأ
                  </button>
                </div>

                <form onSubmit={handleAddQuestion} className="kb-form-grid">
                  <input type="hidden" name="lesson_id" value={selectedLessonId} />
                  <div className="kb-field">
                    <label>رابط صورة السؤال <span className="text-[var(--danger)]">*</span></label>
                    <input type="text" name="image_url" required placeholder="https://imgur.com/question.png — السؤال يُعرض كصورة" />
                  </div>
                  {questionType === 'mcq' ? (
                    <>
                      <div className="kb-field">
                        <label>الخيار أ</label>
                        <input type="text" name="option_a" required placeholder="الخيار الأول" />
                      </div>
                      <div className="kb-field">
                        <label>الخيار ب</label>
                        <input type="text" name="option_b" required placeholder="الخيار الثاني" />
                      </div>
                      <div className="kb-field">
                        <label>الخيار ج</label>
                        <input type="text" name="option_c" required placeholder="الخيار الثالث" />
                      </div>
                      <div className="kb-field">
                        <label>الخيار د</label>
                        <input type="text" name="option_d" required placeholder="الخيار الرابع" />
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="kb-chip kb-chip-green"><i className="fas fa-check" /> أ: صح</span>
                      <span className="kb-chip kb-chip-red"><i className="fas fa-xmark" /> ب: خطأ</span>
                    </>
                  )}
                  <div className="kb-field">
                    <label>الإجابة الصحيحة</label>
                    <select name="correct_option" required>
                      {questionType === 'tf' ? (
                        <>
                          <option value="A">صح</option>
                          <option value="B">خطأ</option>
                        </>
                      ) : (
                        <>
                          <option value="A">أ</option>
                          <option value="B">ب</option>
                          <option value="C">ج</option>
                          <option value="D">د</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="kb-form-actions">
                    <button type="submit" className="kb-btn-primary">
                      <i className="fas fa-plus" /> إضافة السؤال
                    </button>
                  </div>
                </form>
              </DataCard>

              <DataCard title={`أسئلة الامتحان (${questions.length})`}>
                {questions.length === 0 ? (
                  <EmptyState icon="fa-spell-check" title="لا توجد أسئلة بعد" description="أضف أسئلة لبناء امتحان هذه المحاضرة" />
                ) : (
                  <KbTable headers={['#', 'السؤال (صورة)', 'الخيارات', 'الإجابة', 'إجراءات']}>
                    {questions.map((q, index) => {
                      const isTF = (q as any).type === 'true_false' || (!q.option_c && !q.option_d);
                      return (
                      <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="text-[13px] text-[var(--text-muted)]">{index + 1}</td>
                        <td>
                          <div className="flex items-center gap-3">
                            {q.image_url ? (
                              <img
                                src={q.image_url}
                                alt={`سؤال ${index + 1}`}
                                className="h-12 w-20 rounded-lg border border-slate-200 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                              />
                            ) : (
                              <span className="flex h-12 w-20 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                <i className="fas fa-image" />
                              </span>
                            )}
                            {isTF ? <span className="kb-chip kb-chip-purple">صح/خطأ</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {isTF ? (
                              <>
                                <span className="kb-chip kb-chip-green">أ: {q.option_a}</span>
                                <span className="kb-chip kb-chip-red">ب: {q.option_b}</span>
                              </>
                            ) : (
                              ['A', 'B', 'C', 'D'].map((opt) =>
                                q[`option_${opt.toLowerCase()}` as keyof QuizQuestion] ? (
                                  <span key={opt} className="kb-chip kb-chip-slate">
                                    {opt}: {q[`option_${opt.toLowerCase()}` as keyof QuizQuestion] as string}
                                  </span>
                                ) : null,
                              )
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="kb-chip kb-chip-amber">{q.correct_option}</span>
                        </td>
                        <td>
                          <button onClick={() => handleDeleteQuestion(q.id)} className="kb-table-action bg-red-50 text-red-500 hover:bg-red-100" title="حذف">
                            <i className="fas fa-trash" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </KbTable>
                )}
              </DataCard>
            </>
          ) : (
            <EmptyState icon="fa-hand-pointer" title="اختر محاضرة أولاً" description="اختر المحاضرة المطلوبة لبناء امتحانها من القائمة أعلاه" />
          )}
        </div>
      )}

      {/* ============ [TAB-ADMIN-REST] ============ */}{/* ============ [TAB-USERS] ============ */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <form onSubmit={handleSearchUsers} className="flex w-full items-center gap-2 md:max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                className="kb-input flex-1"
              />
              <button type="submit" className="kb-btn-primary px-4">
                <i className="fas fa-search" />
              </button>
            </form>
            <button onClick={handleExportExcel} className="kb-btn-soft">
              <i className="fas fa-file-excel" style={{ color: '#22c55e' }} /> تصدير إكسل
            </button>
          </div>

          <DataCard title={`الطلاب (${usersTotal})`}>
            {users.length === 0 ? (
              <EmptyState icon="fa-users" title="لا يوجد طلاب" description="لم يتم العثور على طلاب مطابقين للبحث" />
            ) : (
              <>
                <KbTable headers={['الطالب', 'البريد الإلكتروني', 'الهاتف', 'تاريخ الانضمام', 'إجراءات']}>
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full border-2 border-[var(--primary-color)] object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary-color)]">
                              <i className="fas fa-user text-[13px]" />
                            </span>
                          )}
                          <span className="font-bold text-[#1e293b]">{u.name}</span>
                        </div>
                      </td>
                      <td dir="ltr" className="text-right text-[13px] text-[var(--text-muted)]">{u.email}</td>
                      <td className="text-[13px] text-[var(--text-muted)]">{u.phone || 'غير مسجل'}</td>
                      <td className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal('user', u)} className="kb-table-action bg-sky-50 text-sky-600 hover:bg-sky-100" title="تعديل">
                            <i className="fas fa-pen" />
                          </button>
                          <button
                            onClick={() => handleViewReport(u.id, u.name)}
                            className="kb-table-action bg-amber-50 text-amber-600 hover:bg-amber-100"
                            title="عرض تقرير الطالب"
                          >
                            <i className="fas fa-chart-pie" />
                          </button>
                          <button onClick={() => handleDeleteUser(u.id)} className="kb-table-action bg-red-50 text-red-500 hover:bg-red-100" title="حذف">
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </KbTable>
                <Pagination
                  page={usersPage}
                  total={usersTotal}
                  totalLabel={`عرض ${users.length} من ${usersTotal} طالب`}
                  onPrev={() => loadUsers(usersPage - 1, searchQuery, 'students')}
                  onNext={() => loadUsers(usersPage + 1, searchQuery, 'students')}
                />
              </>
            )}
          </DataCard>
        </div>
      )}

      {/* ============ [TAB-STAFF] ============ */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <form onSubmit={handleSearchUsers} className="flex w-full items-center gap-2 md:max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن عضو في الفريق..."
                className="kb-input flex-1"
              />
              <button type="submit" className="kb-btn-primary px-4">
                <i className="fas fa-search" />
              </button>
            </form>
            <button onClick={handleExportExcel} className="kb-btn-soft">
              <i className="fas fa-file-excel" style={{ color: '#22c55e' }} /> تصدير إكسل
            </button>
          </div>

          <DataCard title={`فريق العمل (${usersTotal})`}>
            {users.length === 0 ? (
              <EmptyState icon="fa-user-tie" title="لا يوجد أعضاء" description="لم يتم العثور على أعضاء مطابقين للبحث" />
            ) : (
              <>
                <KbTable headers={['العضو', 'البريد الإلكتروني', 'الرتبة', 'تاريخ الانضمام', 'إجراءات']}>
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full border-2 border-[var(--primary-color)] object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary-color)]">
                              <i className="fas fa-user text-[13px]" />
                            </span>
                          )}
                          <span className="font-bold text-[#1e293b]">{u.name}</span>
                        </div>
                      </td>
                      <td dir="ltr" className="text-right text-[13px] text-[var(--text-muted)]">{u.email}</td>
                      <td>
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal('user', u)} className="kb-table-action bg-sky-50 text-sky-600 hover:bg-sky-100" title="تعديل">
                            <i className="fas fa-pen" />
                          </button>
                          <button onClick={() => handleDeleteUser(u.id)} className="kb-table-action bg-red-50 text-red-500 hover:bg-red-100" title="حذف">
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </KbTable>
                <Pagination
                  page={usersPage}
                  total={usersTotal}
                  totalLabel={`عرض ${users.length} من ${usersTotal} عضو`}
                  onPrev={() => loadUsers(usersPage - 1, searchQuery, 'staff')}
                  onNext={() => loadUsers(usersPage + 1, searchQuery, 'staff')}
                />
              </>
            )}
          </DataCard>
        </div>
      )}

      {/* ============ [TAB-TRANSACTIONS] ============ */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          {(() => {
            const successful = salesStats.reduce((acc, s) => acc + (Number(s.successful_sales) || 0), 0);
            const pending = salesStats.reduce((acc, s) => acc + (Number(s.pending_sales) || 0), 0);
            const revenue = salesStats.reduce((acc, s) => acc + (Number(s.total_revenue) || 0), 0);
            return (
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard icon="fa-coins" iconClass="kb-icon-green" label="إجمالي الإيرادات" value={revenue.toLocaleString('ar-EG')} unit="ج.م" />
                <StatCard icon="fa-circle-check" iconClass="kb-icon-green" label="عمليات مكتملة" value={successful} />
                <StatCard icon="fa-hourglass-half" iconClass="kb-icon-amber" label="عمليات معلقة" value={pending} />
              </div>
            );
          })()}

          <DataCard title="مبيعات الدورات">
            {chartData ? (
              <div className="h-[340px]">
                <Bar data={chartData} options={chartOptions} />
              </div>
            ) : (
              <EmptyState icon="fa-chart-simple" title="لا توجد بيانات مبيعات" description="ستظهر الإحصائيات هنا عند توفر عمليات دفع مسجلة" />
            )}
          </DataCard>

          <DataCard title="تفاصيل الدورات">
            {salesStats.length === 0 ? (
              <EmptyState icon="fa-chart-column" title="لا توجد بيانات" />
            ) : (
              <KbTable headers={['الدورة', 'مبيعات ناجحة', 'عمليات معلقة', 'إجمالي الإيرادات']}>
                {salesStats.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="font-bold text-[#1e293b]">{s.course_title}</td>
                    <td>
                      <span className="kb-chip kb-chip-green">
                        <i className="fas fa-circle-check" /> {s.successful_sales || 0}
                      </span>
                    </td>
                    <td>
                      <span className="kb-chip kb-chip-amber">
                        <i className="fas fa-hourglass-half" /> {s.pending_sales || 0}
                      </span>
                    </td>
                    <td className="font-bold text-[var(--primary-color)]">
                      <i className="fas fa-coins" /> {Number(s.total_revenue || 0).toLocaleString('ar-EG')} ج.م
                    </td>
                  </tr>
                ))}
              </KbTable>
            )}
          </DataCard>
        </div>
      )}

      {/* ============ [TAB-FAILED-EXAMS] ============ */}
      {activeTab === 'failedExams' && (
        <div className="space-y-6">
          <DataCard
            title="درج العزل — امتحانات معلقة للمراجعة"
            action={
              <span className="kb-chip kb-chip-amber">
                <i className="fas fa-exclamation-triangle" /> {failedExams.length} طالب
              </span>
            }
          >
            <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-700">
              <i className="fas fa-info-circle" /> هذه الامتحانات ناجحة في السيرفر لكنها معلقة في سجل الطالب (بلد وزارة لا يطبق
              الـ DB Transaction). يُفضّل متابعة حالة الطالب أولاً ثم تحديث سجله يدوياً.
            </p>
            {failedExams.length === 0 ? (
              <EmptyState icon="fa-check-double" title="لا توجد امتحانات معلقة" description="نظام السيرفر يعمل بشكل سليم، تهانينا!" />
            ) : (
              <KbTable headers={['الطالب', 'البريد الإلكتروني', 'الكورس', 'المحاضرة', 'النتيجة', 'تاريخ التسليم']}>
                {failedExams.map((exam, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="font-bold text-[#1e293b]">{exam.student_name || exam.user_name || exam.name || 'طالب'}</td>
                    <td dir="ltr" className="text-right text-[13px] text-[var(--text-muted)]">{exam.user_email || exam.email || '—'}</td>
                    <td>{exam.course_title || '—'}</td>
                    <td>{exam.lesson_title || '—'}</td>
                    <td>
                      <span className="kb-chip kb-chip-green">{exam.score || exam.score_percentage || 0}%</span>
                    </td>
                    <td className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">
                      {exam.submitted_at || exam.completed_at ? new Date(exam.submitted_at || exam.completed_at).toLocaleString('ar-EG') : '—'}
                    </td>
                  </tr>
                ))}
              </KbTable>
            )}
          </DataCard>
        </div>
      )}

      {/* ============ [EDIT MODAL] ============ */}
      <KbModal open={showEditModal} onClose={() => setShowEditModal(false)} maxWidth="max-w-[600px]" accent="teal">
        <ModalTitle>
          {editingType === 'course' ? <span><i className="fas fa-pen-nib" /> تعديل الدورة</span> : editingType === 'lesson' ? <span><i className="fas fa-pen" /> تعديل المحاضرة</span> : <span><i className="fas fa-user-gear" /> تعديل المستخدم</span>}
        </ModalTitle>
        {editingType === 'course' ? (
          <form onSubmit={handleEditSubmit} className="kb-form-grid">
            <div className="kb-field">
              <label>اسم الدورة</label>
              <input
                type="text"
                value={editFormData.title || ''}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                required
              />
            </div>
            <div className="kb-field">
              <label>رابط صورة الغلاف</label>
              <input
                type="text"
                value={editFormData.image_url || ''}
                onChange={(e) => setEditFormData({ ...editFormData, image_url: e.target.value })}
              />
            </div>
            <div className="kb-field">
              <label>الوصف</label>
              <textarea
                rows={3}
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>
            <div className="kb-field">
              <label>نوع الدورة</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditCourseFree(true);
                    setEditFormData({ ...editFormData, is_free: 1 });
                  }}
                  className={`kb-chip ${isEditCourseFree ? 'kb-chip-green' : 'kb-chip-slate'}`}
                >
                  مجانية
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditCourseFree(false);
                    setEditFormData({ ...editFormData, is_free: 0 });
                  }}
                  className={`kb-chip ${!isEditCourseFree ? 'kb-chip-amber' : 'kb-chip-slate'}`}
                >
                  مدفوعة
                </button>
              </div>
            </div>
            <div className="kb-field">
              <label>السعر (ج.م)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={isEditCourseFree}
                value={editFormData.price || 0}
                onChange={(e) => setEditFormData({ ...editFormData, price: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="kb-form-grid kb-grid-3">
              <div className="kb-field">
                <label>الصف الدراسي</label>
                <select value={editCourseMeta.level} onChange={(e) => setEditCourseMeta({ ...editCourseMeta, level: e.target.value })}>
                  <option value="">غير محدد</option>
                  <option value="أولى ثانوي">أولى ثانوي</option>
                  <option value="تانية ثانوي">تانية ثانوي</option>
                  <option value="تالتة ثانوي">تالتة ثانوي</option>
                  <option value="إعدادي">إعدادي</option>
                </select>
              </div>
              <div className="kb-field">
                <label>لغة الشرح</label>
                <select value={editCourseMeta.language} onChange={(e) => setEditCourseMeta({ ...editCourseMeta, language: e.target.value })}>
                  <option value="">غير محدد</option>
                  <option value="العربية">العربية</option>
                  <option value="English">English</option>
                </select>
              </div>
              <div className="kb-field">
                <label>شارة مميزة</label>
                <input
                  type="text"
                  value={editCourseMeta.badge}
                  onChange={(e) => setEditCourseMeta({ ...editCourseMeta, badge: e.target.value })}
                />
              </div>
            </div>
            <div className="kb-form-actions">
              <button type="submit" className="kb-btn-primary">
                <i className="fas fa-check" /> حفظ التعديلات
              </button>
              <button type="button" onClick={() => setShowEditModal(false)} className="kb-btn-ghost">
                إلغاء
              </button>
            </div>
          </form>
        ) : editingType === 'lesson' ? (
          <form onSubmit={handleEditSubmit} className="kb-form-grid">
            <div className="kb-field">
              <label>عنوان المحاضرة</label>
              <input
                type="text"
                value={editFormData.title || ''}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                required
              />
            </div>
            <div className="kb-field">
              <label>رابط الفيديو</label>
              <input
                type="text"
                value={editFormData.video_url || ''}
                onChange={(e) => setEditFormData({ ...editFormData, video_url: e.target.value })}
                required
              />
            </div>
            <div className="kb-field">
              <label>الترتيب</label>
              <input
                type="number"
                min="1"
                value={editFormData.order_num || 1}
                onChange={(e) => setEditFormData({ ...editFormData, order_num: parseInt(e.target.value) || 1 })}
                required
              />
            </div>
            <div className="kb-form-actions">
              <button type="submit" className="kb-btn-primary">
                <i className="fas fa-check" /> حفظ التعديلات
              </button>
              <button type="button" onClick={() => setShowEditModal(false)} className="kb-btn-ghost">
                إلغاء
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleEditSubmit} className="kb-form-grid">
            <div className="kb-field">
              <label>اسم المستخدم</label>
              <input
                type="text"
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
              />
            </div>
            <div className="kb-field">
              <label>رقم الهاتف</label>
              <input
                type="text"
                value={editFormData.phone || ''}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div className="kb-field">
              <label>الرتبة / الصلاحية</label>
              <select
                value={editFormData.role || 'student'}
                onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
              >
                <option value="admin">مدير</option>
                <option value="instructor">مدرس</option>
                <option value="assistant">متابع</option>
                <option value="student">طالب</option>
              </select>
            </div>
            <div className="kb-form-actions">
              <button type="submit" className="kb-btn-primary">
                <i className="fas fa-check" /> حفظ التعديلات
              </button>
              <button type="button" onClick={() => setShowEditModal(false)} className="kb-btn-ghost">
                إلغاء
              </button>
            </div>
          </form>
        )}
      </KbModal>

      {/* ============ [REPORT MODAL] ============ */}
      <KbModal open={showReportModal} onClose={() => setShowReportModal(false)} maxWidth="max-w-[720px]" accent="green">
        <ModalTitle>
          <span>
            <i className="fas fa-chart-pie" /> تقرير الطالب: {reportUserName}
          </span>
        </ModalTitle>
        {reportData ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                icon="fa-book-open"
                iconClass="kb-icon-teal"
                label="دروس مكتملة"
                value={`${reportData.lessons_completed || 0} / ${reportData.lessons_total || 0}`}
              />
              <StatCard
                icon="fa-circle-check"
                iconClass="kb-icon-green"
                label="امتحانات ناجحة"
                value={reportData.quizzes_passed || 0}
              />
              <StatCard
                icon="fa-rocket"
                iconClass="kb-icon-amber"
                label="نسبة التقدم"
                value={`${reportData.progress_percentage || 0}%`}
              />
            </div>

            {Array.isArray(reportData.lessons_progress) && reportData.lessons_progress.length > 0 ? (
              <div>
                <h4 className="mb-3 text-[15px] font-extrabold text-[#1e293b]">
                  <i className="fas fa-book-open" /> إنجاز الدروس
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-right text-[13px]">
                    <thead>
                      <tr className="bg-[var(--bg-page)]">
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">الكورس</th>
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">المحاضرة</th>
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">الحالة</th>
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData.lessons_progress.map((p: any, i: number) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{p.course_title || '—'}</td>
                          <td className="px-3 py-2">{p.lesson_title || '—'}</td>
                          <td className="px-3 py-2">
                            <span className="kb-chip kb-chip-green">{p.completed ? 'مكتملة' : 'غير مكتملة'}</span>
                          </td>
                          <td className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
                            {p.completed_at ? new Date(p.completed_at).toLocaleDateString('ar-EG') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {Array.isArray(reportData.quiz_attempts) && reportData.quiz_attempts.length > 0 ? (
              <div>
                <h4 className="mb-3 text-[15px] font-extrabold text-[#1e293b]">
                  <i className="fas fa-spell-check" /> محاولات الامتحانات
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-right text-[13px]">
                    <thead>
                      <tr className="bg-[var(--bg-page)]">
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">المحاضرة</th>
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">النتيجة</th>
                        <th className="px-3 py-2 text-[12px] font-extrabold text-[var(--primary-color)]">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData.quiz_attempts.map((q: any, i: number) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{q.lesson_title || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`kb-chip ${Number(q.score_percent || q.score) >= 50 ? 'kb-chip-green' : 'kb-chip-red'}`}>
                              {q.score_percent || q.score || 0}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
                            {q.completed_at ? new Date(q.completed_at).toLocaleString('ar-EG') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <button onClick={() => setShowReportModal(false)} className="kb-btn-primary">
                إغلاق التقرير
              </button>
            </div>
          </div>
        ) : (
          <EmptyState icon="fa-file-circle-question" title="لا توجد بيانات تقرير" />
        )}
      </KbModal>
    </DashboardShell>
  );
}