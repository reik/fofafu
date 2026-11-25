import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  const token = useAuthStore((s) => s.token);

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </Layout>
  );
}
