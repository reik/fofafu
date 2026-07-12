import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';

// Supabase Auth's confirmation link redirects straight back to the app and
// signs the user in itself (supabase-js's detectSessionInUrl picks up the
// token from the URL) — there's no separate /auth/verify call to make
// client-side anymore, so this page just reflects current session state.
export default function VerifyEmailPage() {
  const token = useAuthStore((s) => s.token);

  if (token) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">You're verified</h1>
        <p className="mt-2 text-ink-lead">Thanks for confirming your email — you're signed in.</p>
        <p className="mt-6 text-sm">
          <Link to="/" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
            Go to your feed
          </Link>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Check your inbox</h1>
      <p className="mt-2 text-ink-lead">
        Tap the confirmation link we emailed you — it signs you in automatically. If it doesn't, sign in below.
      </p>
      <p className="mt-6 text-sm">
        <Link to="/login" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Layout>
  );
}
