import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  city: string;
  state: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** True once the initial `getSession()` bootstrap has resolved. */
  initialized: boolean;
  /** Sync store state from a Supabase session (used by onAuthStateChange). */
  setSession: (session: Session | null) => void;
  /** Manual override, kept for tests that seed auth state directly. */
  setAuth: (payload: { token: string; user: AuthUser }) => void;
  clear: () => void;
}

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? '',
    name: typeof meta.name === 'string' ? meta.name : '',
    city: typeof meta.city === 'string' ? meta.city : '',
    state: typeof meta.state === 'string' ? meta.state : '',
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  initialized: false,
  setSession: (session) =>
    set({
      token: session?.access_token ?? null,
      user: toAuthUser(session?.user),
      initialized: true,
    }),
  setAuth: ({ token, user }) => set({ token, user, initialized: true }),
  clear: () => set({ token: null, user: null }),
}));

// Bootstrap from the session supabase-js already persisted (localStorage),
// then keep the store in sync with sign-in/sign-out/token-refresh events.
void supabase.auth.getSession().then(({ data }) => {
  useAuthStore.getState().setSession(data.session);
});
supabase.auth.onAuthStateChange((_event, session) => {
  useAuthStore.getState().setSession(session);
});
