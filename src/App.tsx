import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import Courses from '@/pages/Courses';
import Course from '@/pages/Course';
import Profile from '@/pages/Profile';
import Admin from '@/pages/Admin';
import Instructor from '@/pages/Instructor';
import Assistant from '@/pages/Assistant';
import Privacy from '@/pages/Privacy';

// ============================================================================
// ProtectedRoute — للصفحات التي تتطلب تسجيل دخول (profile, admin...)
// ============================================================================
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page-bg">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // المستخدم غير مسجل → نرجعه للصفحة الرئيسية (Courses العامة)
    return <Navigate to="/" replace />;
  }

  // إذا كانت الصفحة محددة لرتب معينة والمستخدم ليس منهم
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'instructor') return <Navigate to="/instructor" replace />;
    if (user.role === 'assistant') return <Navigate to="/assistant" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ================================================================ */}
      {/* الصفحة الرئيسية = Courses (عامة للجميع بدون طرد إجباري للمدرسين) */}
      {/* ================================================================ */}
      <Route
        path="/"
        element={<Courses />}
      />

      {/* ================================================================ */}
      {/* /courses = نفس الصفحة الرئيسية (للتوافق مع الروابط القديمة)      */}
      {/* ================================================================ */}
      <Route
        path="/courses"
        element={<Courses />}
      />

      {/* ================================================================ */}
      {/* صفحة الخصوصية — عامة للجميع وللروبوتات                           */}
      {/* ================================================================ */}
      <Route path="/privacy" element={<Privacy />} />

      {/* ================================================================ */}
      {/* صفحة تسجيل الدخول — يصلها من يريد تسجيل الدخول يدوياً          */}
      {/* ================================================================ */}
      <Route path="/login" element={<Login />} />

      {/* ================================================================ */}
      {/* صفحة الكورس — 💡 عامة للجميع للمعاينة، والمحتوى الداخلي محمي     */}
      {/* ================================================================ */}
      <Route
        path="/course"
        element={<Course />}
      />

      {/* ================================================================ */}
      {/* صفحة البروفايل — تتطلب تسجيل دخول                                */}
      {/* ================================================================ */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      {/* مسار المدير العام فقط */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Admin />
          </ProtectedRoute>
        }
      />

      {/* مسار المدرس فقط */}
      <Route
        path="/instructor"
        element={
          <ProtectedRoute allowedRoles={['instructor']}>
            <Instructor />
          </ProtectedRoute>
        }
      />

      {/* مسار المتابع فقط */}
      <Route
        path="/assistant"
        element={
          <ProtectedRoute allowedRoles={['assistant']}>
            <Assistant />
          </ProtectedRoute>
        }
      />

      {/* Catch all → الصفحة الرئيسية (Courses) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: 'AbdoLogo, sans-serif',
            },
          }}
        />
      </Router>
    </AuthProvider>
  );
}

export default App;
