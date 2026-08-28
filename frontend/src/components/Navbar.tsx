import { useEffect, useRef, useState, type SVGProps } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { logout } from '@/api/auth';
import { unreadCount, messageKeys } from '@/api/messages';
import { cn } from '@/utils/cn';
import {
  BrandMark,
  CalendarIcon,
  CommunityIcon,
  FamilyIcon,
  HomeIcon,
  LogOutIcon,
  MessageIcon,
  ShieldIcon,
} from '@/components/icons';

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
  { to: '/playdates', label: 'Playdates', Icon: CalendarIcon, match: (p) => p.startsWith('/playdates') },
];

/** Single uppercase initial for the avatar chip — "Jane Doe" -> "J". */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useIsAdmin();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: unread } = useQuery({
    queryKey: messageKeys.unread,
    queryFn: unreadCount,
    refetchInterval: 30_000,
    enabled: !!token,
  });
  const unreadN = unread?.count ?? 0;

  // Nav-link visibility is UX only — the real admin gate is server-side
  // (is_admin() enforced by RLS + every /admin/* function route).
  const links = isAdmin
    ? [...NAV_LINKS, { to: '/admin', label: 'Admin', Icon: ShieldIcon, match: (p: string) => p.startsWith('/admin') }]
    : NAV_LINKS;

  const signOutMutation = useMutation({ mutationFn: logout });

  // Clears local state and redirects immediately for a snappy UI, but also
  // fires the real Supabase signOut so the persisted session is actually
  // invalidated — otherwise it survives in localStorage and silently
  // resumes on the next reload or token-refresh via onAuthStateChange.
  const handleSignOut = () => {
    setAccountMenuOpen(false);
    clear();
    navigate('/login');
    signOutMutation.mutate();
  };

  // Lightweight disclosure (not a full ARIA menu widget — see the "Frontend"
  // notes in fofafu_vault/features/header-nav-redesign.md for the rationale).
  // Closes on outside click, Escape, or route change.
  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        // Blocking a11y requirement: Escape must return focus to the chip
        // that opened the disclosure, not drop it.
        accountTriggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="sticky top-0 z-40 border-b-2 border-brand-primary bg-surface-card shadow-sm"
      >
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-2 px-5">
          <Link
            to="/"
            aria-label="fofafu home"
            className="flex items-center -space-x-0.5 text-lg font-bold tracking-tight text-brand-primary"
          >
            <BrandMark className="h-12 w-12 shrink-0" />
            fofafu
          </Link>

          <div className="hidden items-center gap-0.5 rounded-full bg-surface-warm p-1 md:flex">
            {links.map((link) => {
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
                    'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-brand-primary',
                    active ? 'bg-brand-primary-pressed text-white' : 'text-ink-lead hover:bg-surface-subtle',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {badge > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-feedback-error px-1 text-[0.6rem] font-bold leading-none text-white"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {/* Sighted hover/focus affordance only — the link's own
                      aria-label already supplies the accessible name, so this
                      same-text bubble is aria-hidden to avoid double-announcing
                      it to screen readers. Nunito (body register, not
                      JetBrains Mono) per ui-designer's ### Visual: a tooltip
                      repeating an aria-label reads as a functional status
                      string, not a taxonomy/eyebrow label. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink-lead px-2 py-1 font-sans text-[11px] font-semibold text-white opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div ref={accountMenuRef} className="relative">
                <button
                  ref={accountTriggerRef}
                  type="button"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  aria-expanded={accountMenuOpen}
                  aria-controls="account-menu"
                  aria-label={`${user.name} account menu`}
                  className="flex items-center gap-2 rounded-full px-2 py-1 outline-none transition-colors hover:bg-surface-warm focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary-pressed text-sm font-semibold leading-none text-white"
                  >
                    {initialOf(user.name)}
                  </span>
                  {/* Full user.name, not a "first name" extraction — this app's
                      user.name is a household display name ("The Anderson
                      Family"), not a personal name, so there's no first-name
                      token to safely take. Truncated past 24 chars with an
                      ellipsis, matching the precedent in
                      fofafu_vault/features/community-playdate-badge.md. */}
                  <span
                    aria-hidden="true"
                    className="hidden max-w-[24ch] truncate text-sm font-semibold leading-tight text-ink-lead md:block"
                  >
                    {user.name}
                  </span>
                </button>
                <div
                  id="account-menu"
                  hidden={!accountMenuOpen}
                  className="absolute right-0 top-full z-10 mt-2 min-w-[9rem] rounded-lg border border-ink-muted/10 bg-surface-card p-1 shadow-lift"
                >
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium text-ink-lead hover:bg-surface-warm"
                  >
                    <LogOutIcon className="h-4 w-4 shrink-0" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-muted/20 bg-surface-card shadow-[0_-2px_12px_rgba(0,0,0,.08)] md:hidden"
      >
        {links.map((link) => {
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
