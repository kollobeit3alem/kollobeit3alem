import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminPage from '@/pages/Admin';

export default function AdminRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminPage />
    </ProtectedRoute>
  );
}
