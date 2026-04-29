import { ProtectedRoute } from '@/components/ProtectedRoute';
import ProfilePage from '@/pages/Profile';

export default function ProfileRoute() {
  return (
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  );
}
