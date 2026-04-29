import { ProtectedRoute } from '@/components/ProtectedRoute';
import AssistantPage from '@/pages/Assistant';

export default function AssistantRoute() {
  return (
    <ProtectedRoute allowedRoles={['assistant']}>
      <AssistantPage />
    </ProtectedRoute>
  );
}
