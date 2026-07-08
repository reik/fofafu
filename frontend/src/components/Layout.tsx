import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useFocusMainOnRouteChange } from '@/hooks/useFocusMainOnRouteChange';
import { Navbar } from './Navbar';

interface LayoutProps {
  children: ReactNode;
  wide?: boolean;
}

export function Layout({ children, wide = false }: LayoutProps) {
  const token = useAuthStore((s) => s.token);
  useFocusMainOnRouteChange();

  return (
    <div className="min-h-screen bg-surface-warm pb-16 md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-brand-primary-pressed focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lift"
      >
        Skip to main content
      </a>
      {token && <Navbar />}
      <main
        id="main"
        tabIndex={-1}
        className={
          wide
            ? 'mx-auto w-full max-w-[1100px] px-4 py-6 focus:outline-none md:px-6'
            : 'mx-auto w-full max-w-[480px] px-6 py-16 focus:outline-none'
        }
      >
        {children}
      </main>
    </div>
  );
}
