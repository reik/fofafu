import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">You're in</h1>
      <p className="mt-2 text-ink-lead">
        {user ? `Welcome, ${user.name}. The rest of fofafu comes online in the next features.` : 'Welcome.'}
      </p>
      <button
        type="button"
        onClick={clear}
        className="mt-8 rounded-full border border-ink-muted/30 px-4 py-2 text-sm font-medium hover:bg-surface-card"
      >
        Sign out
      </button>
    </Layout>
  );
}
