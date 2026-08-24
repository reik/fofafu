import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/stores/auth';

/**
 * UX-only signal (hide the nav link, redirect off /admin). The real gate is
 * the server-side is_admin() check enforced by RLS and every /admin/*
 * function route — see fofafu_vault/features/admin-access.md.
 */
export function useIsAdmin() {
  const token = useAuthStore((s) => s.token);
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'is-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (error) return false;
      return data === true;
    },
    enabled: !!token,
    staleTime: 60_000,
  });
  return { isAdmin: data ?? false, isPending: !!token && isPending };
}
