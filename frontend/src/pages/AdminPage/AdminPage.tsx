import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { UsersView } from './UsersView';
import { ContentView } from './ContentView';
import { MessagesView } from './MessagesView';
import { cn } from '@/utils/cn';

type Tab = 'users' | 'content' | 'messages';
const TABS: { id: Tab; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'content', label: 'Content' },
  { id: 'messages', label: 'Messages' },
];

export default function AdminPage() {
  const { isAdmin, isPending } = useIsAdmin();
  const [tab, setTab] = useState<Tab>('users');

  if (isPending) {
    return (
      <Layout wide>
        <p className="text-ink-muted">Loading…</p>
      </Layout>
    );
  }

  // UX-only redirect — the actual gate is the server-side is_admin() check
  // on every /admin/* function route and RLS policy. This just keeps a
  // non-admin from staring at an empty/erroring page.
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout wide>
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Full read/write access to every user's data, including private messages. Every action here is logged.
      </p>

      <div role="tablist" aria-label="Admin sections" className="mt-6 flex gap-1 border-b border-ink-muted/20">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-t-md px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id ? 'border-b-2 border-brand-primary text-brand-primary' : 'text-ink-muted hover:text-ink-lead',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'users' && <UsersView />}
        {tab === 'content' && <ContentView />}
        {tab === 'messages' && <MessagesView />}
      </div>
    </Layout>
  );
}
