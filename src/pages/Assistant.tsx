import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { User } from '@/types';
import { KbModal, EmptyState, ModalTitle } from '@/components/kb/shared';
import { DashboardShell, type NavItem, DataCard, KbTable, Pagination } from '@/components/kb/shell';

export default function Assistant() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const activeTab = 'users';

  // Data states
  const [users, setUsers] = useState<User[]>([]);

  // Pagination & Search States
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const usersLimit = 50;

  // Modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
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
          'الرتبة': 'طالب',
          'تاريخ الانضمام': u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : 'غير مسجل',
        }));
        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'الطلاب');
        XLSX.writeFile(workbook, 'تقرير_الطلاب.xlsx');
      })
      .catch(() => {
        toast.error('حدث خطأ أثناء تصدير الإكسيل.');
      });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user || user.role !== 'assistant') return null;

  const navItems: NavItem[] = [
    { key: 'users', label: 'الطلاب والتقارير', icon: 'fa-users' },
  ];

  return (
    <DashboardShell
      brand="لوحة المتابعة"
      activeKey={activeTab}
      navItems={navItems}
      user={user}
      onNavigate={() => {}}
      onLogout={handleLogout}
      extraNav={
        <Link
          to="/"
          className="mb-6 flex cursor-pointer items-center gap-3 rounded-xl border-none bg-sky-50 p-4 text-right text-[15px] font-bold text-sky-600 no-underline transition-all hover:bg-sky-500 hover:text-white"
        >
          <i className="fas fa-globe w-6 text-center text-xl"></i> تصفح الكورسات (كطالب)
        </Link>
      }
    >
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-light)] text-[22px] text-[var(--primary-color)]">
          <i className="fas fa-users-cog" />
        </span>
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--primary-color)] md:text-[30px]">متابعة الطلاب والتقارير</h1>
          <p className="text-sm text-[var(--text-muted)]">لوحة المتابعة على منصة كله بيتعلم</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form onSubmit={handleSearchUsers} className="flex w-full items-center gap-2 md:max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم، الإيميل، أو التليفون..."
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

        <DataCard title={`قائمة الطلاب (${usersTotal})`}>
          {users.length === 0 ? (
            <EmptyState icon="fa-users" title="لا يوجد طلاب" description="لم يتم العثور على طلاب مطابقين للبحث" />
          ) : (
            <>
              <KbTable headers={['الطالب', 'البريد الإلكتروني', 'رقم الهاتف', 'إجراءات']}>
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
                      <span className="kb-chip kb-chip-slate">{u.phone || 'غير مسجل'}</span>
                    </td>
                    <td>
                      {u.role === 'student' ? (
                        <button onClick={() => handleViewReport(u.id, u.name)} className="kb-table-action bg-amber-50 text-amber-600 hover:bg-amber-100" title="عرض تقرير الطالب">
                          <i className="fas fa-chart-pie" /> التقرير
                        </button>
                      ) : (
                        <span className="text-[12px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </KbTable>
              <Pagination
                page={usersPage}
                total={usersTotal}
                totalLabel={`إجمالي: ${usersTotal} طالب`}
                onPrev={() => loadUsers(usersPage - 1, searchQuery, 'students')}
                onNext={() => loadUsers(usersPage + 1, searchQuery, 'students')}
              />
            </>
          )}
        </DataCard>
      </div>

      {/* Report Modal */}
      <KbModal open={showReportModal} onClose={() => setShowReportModal(false)} maxWidth="max-w-[720px]" accent="green">
        <ModalTitle>
          <span>
            <i className="fas fa-chart-pie" /> تقرير الطالب: {reportUserName}
          </span>
        </ModalTitle>
        {reportData ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
              <h4 className="mb-3 text-[15px] font-extrabold text-[var(--primary-color)]">
                <i className="fas fa-book-open ml-1" /> الدورات المشترك بها ({reportData.enrollments?.length || 0})
              </h4>
              {reportData.enrollments && reportData.enrollments.length > 0 ? (
                <ul className="space-y-1.5 text-[14px] text-[#1e293b]">
                  {reportData.enrollments.map((e: any, i: number) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <i className="fas fa-check-circle text-emerald-500" />
                      <strong>{e.title || 'دورة محذوفة أو غير معروفة'}</strong>
                      <span className="text-[12px] text-[var(--text-muted)]">
                        (انضم في: {e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('ar-EG') : 'غير محدد'})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">لم يشترك في أي دورة بعد.</p>
              )}
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
              <h4 className="mb-3 text-[15px] font-extrabold text-emerald-700">
                <i className="fas fa-check-circle ml-1" /> المحاضرات المكتملة ({reportData.progress?.length || 0})
              </h4>
              {reportData.progress && reportData.progress.length > 0 ? (
                <ul className="space-y-1.5 text-[14px] text-[#1e293b]">
                  {reportData.progress.map((p: any, i: number) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <i className="fas fa-circle-check text-emerald-500" />
                      <strong>{p.lesson_title || 'غير معروف'}</strong>
                      <span className="text-[12px] text-[var(--text-muted)]">
                        (من دورة: {p.course_title || 'غير معروف'}
                        {p.completed_at ? ` - أُنجزت في: ${new Date(p.completed_at).toLocaleDateString('ar-EG')}` : ''})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">لم يكمل أي محاضرة حتى الآن.</p>
              )}
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
              <h4 className="mb-3 text-[15px] font-extrabold text-amber-600">
                <i className="fas fa-spell-check ml-1" /> نتائج الامتحانات ({reportData.quizzes?.length || 0})
              </h4>
              {reportData.quizzes && reportData.quizzes.length > 0 ? (
                <ul className="space-y-2">
                  {reportData.quizzes.map((q: any, i: number) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-[14px]">
                      <span className="font-bold text-[#1e293b]">{q.lesson_title}</span>
                      <span className="text-[12px] text-[var(--text-muted)]">(من دورة: {q.course_title})</span>
                      <span className={`kb-chip ${Number(q.score) >= 50 ? 'kb-chip-green' : 'kb-chip-red'}`}>
                        الدرجة: {q.score}%
                      </span>
                      <span className="w-full text-[12px] text-[var(--text-muted)]" dir="ltr">
                        {q.attempted_at ? new Date(q.attempted_at).toLocaleString('ar-EG') : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">لم يؤدِ أي امتحان حتى الآن.</p>
              )}
            </div>

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