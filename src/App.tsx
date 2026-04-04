import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import Courses from '@/pages/Courses';
import Course from '@/pages/Course';
import Profile from '@/pages/Profile';
import Admin from '@/pages/Admin';

// Protected Route Component
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page-bg">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // التعديل هنا: السماح للمتابع (assistant) بالدخول لصفحة الإدارة وعدم طرده
  if (requireAdmin && user?.role !== 'admin' && user?.role !== 'instructor' && user?.role !== 'assistant') {
    return <Navigate to="/courses" replace />;
  }

  return <>{children}</>;
}

// Public Route Component (redirects if authenticated)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page-bg">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    // التعديل هنا: توجيه المتابع (assistant) من صفحة اللوجين إلى لوحة الإدارة مباشرة
    if (user.role === 'admin' || user.role === 'instructor' || user.role === 'assistant') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/courses" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      <Route 
        path="/courses" 
        element={
          <ProtectedRoute>
            <Courses />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/course" 
        element={
          <ProtectedRoute>
            <Course />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute requireAdmin>
            <Admin />
          </ProtectedRoute>
        } 
      />
      {/* Catch all - redirect to home */}
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
