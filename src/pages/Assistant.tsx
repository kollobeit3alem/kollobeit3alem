import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { User, StudentReport } from '@/types';

export default function Assistant() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Data states
  const [users, setUsers] = useState<User[]>([]);
  
  // Pagination & Search States
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const usersLimit = 50;

  // Modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<any>(null); // تم التعديل إلى any لتجنب أخطاء TypeScript مع الحقول الجديدة
  const [reportUserName, setReportUserName] = useState('');

  // Redirect if not authenticated or not authorized
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    if (user.role !== 'assistant') {
      toast.error('غير مصرح لك بالدخول لهذه الصفحة!');
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  // Load Initial Data (Students Only)
  useEffect(() => {
    if (token && user && user.role === 'assistant') {
      loadUsers(1, '', 'students');
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

  // User handlers
  const handleSearchUsers = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUsersPage(1);
    
    const cleanSearchQuery = searchQuery.trim();
    setSearchQuery(cleanSearchQuery);
    
    loadUsers(1, cleanSearchQuery, 'students');
  };

  const handleViewReport = async (userId: number, userName: string) => {
    if (!token) return;
    
    try {
      const data = await apiCall(`/api/admin/reports/${userId}`, token) as any;
      setReportData(data);
      setReportUserName(userName);
      setShowReportModal(true);
    } catch (error) {
      toast.error('فشل جلب تقرير الطالب، تأكد من صحة قاعدة البيانات.');
    }
  };

  // Export Excel Data
  const handleExportExcel = () => {
    import('xlsx').then(XLSX => {
      const worksheetData = users.map(u => ({
        'الاسم': u.name,
        'البريد الإلكتروني': u.email,
        'رقم الهاتف': u.phone || 'غير مسجل',
        'الرتبة': 'طالب',
        'تاريخ الانضمام': u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : 'غير مسجل'
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      
      XLSX.utils.book_append_sheet(workbook, worksheet, "الطلاب");
      XLSX.writeFile(workbook, "تقرير_الطلاب.xlsx");
    }).catch(() => {
      toast.error("حدث خطأ أثناء تصدير الإكسيل.");
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user || user.role !== 'assistant') return null;

  const inputStyles = "w-full p-4 border-[1.5px] border-[#e2e8f0] rounded-xl text-[15px] text-[#1e293b] bg-[#f4f7f9] focus:bg-white focus:border-[#015669] focus:outline-none transition-colors";
  const navBtnBaseStyles = "bg-transparent border-none text-[#64748b] text-right p-4 rounded-xl cursor-pointer text-base font-bold flex items-center gap-3 transition-all hover:bg-[#f4f7f9] hover:text-[#015669] hover:-translate-x-1.5";
  const navBtnActiveStyles = "bg-[#015669] text-white shadow-[0_10px_20px_rgba(1,86,105,0.1)]";

  return (
    <div className="min-h-screen bg-[#f4f7f9] flex overflow-x-hidden text-[#1e293b]" dir="rtl">
      
      {/* Sidebar */}
      <aside className={`w-[280px] bg-white border-l border-[#e2e8f0] flex flex-col py-[30px] px-5 shadow-[-5px_0_30px_rgba(0,0,0,0.02)] z-[100] transition-all duration-300 lg:relative fixed h-screen overflow-y-auto top-0 right-0 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-4 mb-10 pb-5 border-b border-[#e2e8f0] justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="w-[50px] rounded-xl" />
            <h2 className="text-[#015669] text-[22px] font-bold">لوحة المتابعة</h2>
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
            className={`${navBtnBaseStyles} ${navBtnActiveStyles}`}
          >
            <i className="fas fa-users text-xl w-6 text-center"></i> الطلاب والتقارير
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
            <strong className="text-[#015669]">لوحة المتابعة</strong>
          </div>
          <button 
            onClick={() => setSidebarOpen(true)}
            className="bg-[#015669] text-white border-none py-2.5 px-4 rounded-xl text-xl cursor-pointer"
          >
            <i className="fas fa-bars"></i>
          </button>
        </div>

        {/* Users Tab */}
        <section className="animate-fade-in block">
          <h1 className="text-[28px] text-[#015669] mb-[30px] flex items-center gap-2.5">
            <i className="fas fa-users-cog"></i> متابعة الطلاب والتقارير
          </h1>
          
          <div className="bg-white p-[30px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.02)] overflow-x-auto">
            <h3 className="text-[#015669] mb-[25px] text-[20px] border-r-4 border-[#015669] pr-2.5">
              <i className="fas fa-list"></i> قائمة الطلاب
            </h3>

            {/* شريط البحث وتصدير الإكسيل */}
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
                  <th className="bg-[#f4f7f9] text-[#015669] font-bold p-[15px] border-b border-[#e2e8f0] text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-[15px]">لا يوجد طلاب مسجلين.</td></tr>
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
                        <div className="flex gap-[5px]">
                          {/* المتابع يمكنه رؤية تقارير الطلاب فقط */}
                          {u.role === 'student' && (
                            <button 
                              onClick={() => handleViewReport(u.id, u.name)}
                              className="p-2.5 flex-1 border-none rounded-lg cursor-pointer font-bold transition-all text-center text-[14px] bg-[#e2e8f0] text-[#0f172a] hover:bg-[#cbd5e1]"
                              title="عرض تقرير الطالب"
                            >
                              <i className="fas fa-chart-pie"></i> التقرير
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center mt-5">
              <div className="text-[#64748b] text-[14px] font-bold">
                إجمالي: {usersTotal} طالب
              </div>
              <div className="flex gap-2.5 items-center">
                <button
                  onClick={() => loadUsers(usersPage - 1, searchQuery, 'students')}
                  disabled={usersPage <= 1}
                  className="bg-white border border-[#e2e8f0] text-[#015669] py-2 px-4 rounded-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f4f7f9] transition-all"
                >
                  <i className="fas fa-chevron-right ml-1"></i> السابق
                </button>
                <div className="bg-[#f4f7f9] border border-[#e2e8f0] text-[#1e293b] py-2 px-4 rounded-lg font-bold">
                  صفحة {usersPage} من {Math.ceil(usersTotal / usersLimit) || 1}
                </div>
                <button
                  onClick={() => loadUsers(usersPage + 1, searchQuery, 'students')}
                  disabled={usersPage * usersLimit >= usersTotal}
                  className="bg-white border border-[#e2e8f0] text-[#015669] py-2 px-4 rounded-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f4f7f9] transition-all"
                >
                  التالي <i className="fas fa-chevron-left mr-1"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

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
              
              {/* تبويبة الدورات المشترك بها */}
              <div className="bg-[#f4f7f9] p-[15px] rounded-[10px] mb-5 border border-[#e2e8f0]">
                <h4 className="text-[#015669] mb-2.5 font-bold"><i className="fas fa-book-open ml-2"></i> الدورات المشترك بها ({reportData.enrollments?.length || 0})</h4>
                
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
                  <p className="text-[#64748b]">لم يشترك في أي دورة بعد.</p>
                )}
              </div>

              {/* تبويبة المحاضرات المكتملة */}
              <div className="bg-[#ecfdf5] border border-[#a7f3d0] p-[15px] rounded-[10px] mb-5">
                <h4 className="text-[#10b981] mb-2.5 font-bold"><i className="fas fa-check-circle ml-2"></i> المحاضرات المكتملة ({reportData.progress?.length || 0})</h4>
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
                  <p className="text-[#64748b]">لم يكمل أي محاضرة حتى الآن.</p>
                )}
              </div>

              {/* التعديل هنا: قسم الامتحانات الجديد */}
              <div className="bg-[#fffbeb] border border-[#fde68a] p-[15px] rounded-[10px]">
                <h4 className="text-[#f59e0b] mb-2.5 font-bold"><i className="fas fa-spell-check ml-2"></i> نتائج الامتحانات ({reportData.quizzes?.length || 0})</h4>
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
                ) : ( <p className="text-[#64748b]">لم يؤدِ أي امتحان حتى الآن.</p> )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
