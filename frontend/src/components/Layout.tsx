import type { ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-warm">
      <main className="mx-auto w-full max-w-[480px] px-6 py-16">{children}</main>
    </div>
  );
}
