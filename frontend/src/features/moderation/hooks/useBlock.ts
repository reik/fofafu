import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBlock, deleteBlock, listBlocks, moderationKeys, type BlockDTO } from '@/api/moderation';
import { feedKeys } from '@/api/announcements';

/**
 * Invalidates every query whose response shape changes once the caller's
 * block list changes. Per fofafu_vault/features/moderation-report-block.md
 * ### Backend, blocked-family exclusion for announcements/comments is
 * enforced by RLS and for community/search by query-level filtering — in
 * both cases the *client* never filters anything itself, it just needs to
 * refetch so the server-applied exclusion takes effect. DM threads are
 * deliberately NOT invalidated here: the resolved Open Question keeps
 * thread + history visible to the blocker regardless of block state, so
 * nothing about `messages` queries changes as a direct effect of a block.
 */
function invalidateBlockAffectedQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: moderationKeys.blocks });
  qc.invalidateQueries({ queryKey: feedKeys.all });
  qc.invalidateQueries({ queryKey: ['community'] });
  qc.invalidateQueries({ queryKey: ['search'] });
}

export function useBlockedFamilies() {
  return useQuery({ queryKey: moderationKeys.blocks, queryFn: listBlocks });
}

/** `familyId` must be a canonical `families.id` (not an owner user id). */
export function useIsFamilyBlocked(familyId: string | null | undefined): boolean {
  const { data } = useBlockedFamilies();
  if (!familyId || !data) return false;
  return data.some((b) => b.blockedFamilyId === familyId);
}

/**
 * `mutate(idOrUserId)` accepts either a `families.id` or the family owner's
 * `auth.users.id` — the Edge Function dual-resolves it (see
 * supabase/functions/moderation/index.ts). The success callback's `BlockDTO`
 * always carries the canonical `blockedFamilyId`; callers that only had a
 * user id on hand (e.g. an announcement/comment DTO's `authorId`) should
 * capture that resolved id for any later unblock call, since `deleteBlock`
 * does not dual-resolve.
 */
export function useBlockFamilyMutation() {
  const qc = useQueryClient();
  return useMutation<BlockDTO, unknown, string>({
    mutationFn: (idOrUserId: string) => createBlock(idOrUserId),
    onSuccess: () => invalidateBlockAffectedQueries(qc),
  });
}

/** `familyId` must be the canonical `families.id` — see deleteBlock's own doc comment. */
export function useUnblockFamilyMutation() {
  const qc = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (familyId: string) => deleteBlock(familyId),
    onSuccess: () => invalidateBlockAffectedQueries(qc),
  });
}
