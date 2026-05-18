import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">You're in</h1>
      <p className="mt-2 text-ink-lead">
        {user ? `Welcome, ${user.name}.` : 'Welcome.'}
      </p>

      <nav className="mt-8 grid gap-3">
        <Link
          to="/family/me"
          className="block rounded-lg bg-surface-card px-4 py-3 shadow-lift hover:bg-surface-warm"
        >
          <span className="block font-semibold">Your family page</span>
          <span className="block text-sm text-ink-muted">Edit your bio, name, kid count.</span>
        </Link>
        <Link
          to="/feed"
          className="block rounded-lg bg-surface-card px-4 py-3 shadow-lift hover:bg-surface-warm"
        >
          <span className="block font-semibold">Announcements feed</span>
          <span className="block text-sm text-ink-muted">See what other foster families are sharing.</span>
        </Link>
        <Link
          to="/messages"
          className="block rounded-lg bg-surface-card px-4 py-3 shadow-lift hover:bg-surface-warm"
        >
          <span className="block font-semibold">Messages</span>
          <span className="block text-sm text-ink-muted">Private conversations with other families.</span>
        </Link>
      </nav>

      <button
        type="button"
        onClick={clear}
        className="mt-10 rounded-full border border-ink-muted/30 px-4 py-2 text-sm font-medium hover:bg-surface-card"
      >
        Sign out
      </button>
    </Layout>
  );
}
