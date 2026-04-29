import { ProtectedRoute } from '@/components/ProtectedRoute';
import InstructorPage from '@/pages/Instructor';

export default function InstructorRoute() {
  return (
    <ProtectedRoute allowedRoles={['instructor']}>
      <InstructorPage />
    </ProtectedRoute>
  );
}
