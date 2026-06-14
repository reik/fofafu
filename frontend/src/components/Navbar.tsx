import type { SVGProps } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { unreadCount, messageKeys } from '@/api/messages';
import { CommunityIcon, FamilyIcon, HomeIcon, LogOutIcon, MessageIcon } from '@/components/icons';

interface NavLink {
  to: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  match: (pathname: string) => boolean;
}

const NAV_LINKS: NavLink[] = [
  { to: '/', label: 'Home', Icon: HomeIcon, match: (p) => p === '/' },
  { to: '/family/me', label: 'Family', Icon: FamilyIcon, match: (p) => p.startsWith('/family') },
  { to: '/messages', label: 'Messages', Icon: MessageIcon, match: (p) => p.startsWith('/messages') },
  { to: '/search', label: 'Community', Icon: CommunityIcon, match: (p) => p.startsWith('/search') },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();

  const { data: unread } = useQuery({
    queryKey: messageKeys.unread,
    queryFn: unreadCount,
    refetchInterval: 30_000,
    enabled: !!token,
  });
  const unreadN = unread?.count ?? 0;

  const handleSignOut = () => {
    clear();
    navigate('/login');
  };

  const renderBadge = (label: string, n: number) =>
    n > 0 ? (
      <span
        aria-label={`${label}, ${n} unread`}
        className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-feedback-error px-1 text-[0.68rem] font-bold leading-none text-white"
      >
        {n > 99 ? '99+' : n}
      </span>
    ) : null;

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="sticky top-0 z-40 border-b-[3px] border-brand-primary bg-surface-card shadow-sm"
      >
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-2 px-5">
          <Link to="/" aria-label="fofafu home" className="text-lg font-bold tracking-tight text-brand-primary">
            fofafu
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active = link.match(location.pathname);
              const badge = link.to === '/messages' ? unreadN : 0;
              const Icon = link.Icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                    active ? 'bg-surface-warm text-brand-primary' : 'text-ink-lead hover:bg-surface-warm',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{link.label}</span>
                  {renderBadge(link.label, badge)}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-right text-sm md:block">
                <span className="block font-semibold leading-tight">{user.name}</span>
                <span className="block text-xs text-ink-muted">{user.city}, {user.state}</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-muted/30 px-3 py-1.5 text-sm font-medium hover:bg-surface-warm"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-muted/20 bg-surface-card shadow-[0_-2px_12px_rgba(0,0,0,.08)] md:hidden"
      >
        {NAV_LINKS.map((link) => {
          const active = link.match(location.pathname);
          const badge = link.to === '/messages' ? unreadN : 0;
          const Icon = link.Icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              aria-current={active ? 'page' : undefined}
              aria-label={badge > 0 ? `${link.label}, ${badge} unread` : link.label}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 pb-3 text-xs font-semibold transition-colors',
                active ? 'bg-surface-warm text-brand-primary' : 'text-ink-lead',
              )}
            >
              <span aria-hidden="true" className="relative">
                <Icon className="h-5 w-5" />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-feedback-error px-1 text-[0.6rem] font-bold leading-none text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
