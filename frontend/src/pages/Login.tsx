import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginPage() {
  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-ink-lead">Sign in to your family page.</p>
      <div className="mt-8">
        <LoginForm />
      </div>
      <p className="mt-6 text-sm">
        New here?{' '}
        <Link to="/register" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </Layout>
  );
}
