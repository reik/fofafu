import { useQuery } from '@tanstack/react-query';
import { getMyFamily, familyKeys } from '@/api/family';
import { useAuthStore } from '@/stores/auth';

/**
 * The signed-in household's display name. The families row is the source of
 * truth — renames (family page, admin panel) only ever write there, never to
 * auth user_metadata — so the metadata copy captured at signup is used only
 * as a fallback while /family/me is loading or if it fails.
 */
export function useFamilyDisplayName(): string | undefined {
  const token = useAuthStore((s) => s.token);
  const signupName = useAuthStore((s) => s.user?.name);
  const { data } = useQuery({
    queryKey: familyKeys.me,
    queryFn: getMyFamily,
    enabled: !!token,
  });
  return data?.name || signupName;
}
