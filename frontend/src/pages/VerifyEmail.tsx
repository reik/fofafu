import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { verifyEmail } from '@/api/auth';
import { Layout } from '@/components/Layout';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const { data, error, isPending, isError } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => verifyEmail(token!),
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">Missing token</h1>
        <p className="mt-2 text-ink-lead">This link is incomplete. Tap the button in your email again.</p>
      </Layout>
    );
  }

  if (isPending) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">Verifying…</h1>
        <p className="mt-2 text-ink-lead">One second.</p>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">This link doesn't work</h1>
        <p className="mt-2 text-ink-lead">It may have expired. {error instanceof Error ? error.message : ''}</p>
        <p className="mt-6 text-sm">
          <Link to="/register" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
            Sign up again
          </Link>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">You're verified</h1>
      <p className="mt-2 text-ink-lead">{data?.message ?? 'Sign in to keep going.'}</p>
      <p className="mt-6 text-sm">
        <Link to="/login" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Layout>
  );
}
