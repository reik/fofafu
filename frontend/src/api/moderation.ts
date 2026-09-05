import { z } from 'zod';
import { edgeRequest } from './edgeClient';

// Backed by supabase/functions/moderation/index.ts.
const FN = 'moderation';

// Matches supabase/functions/moderation/index.ts's REPORT_CATEGORIES and
// fofafu_vault/features/moderation-report-block.md's ### Microcopy "Stored
// values" line exactly: unkind | privacy | unrelated | other.
export const REPORT_CATEGORIES = ['unkind', 'privacy', 'unrelated', 'other'] as const;
export const ReportCategory = z.enum(REPORT_CATEGORIES);
export type ReportCategory = z.infer<typeof ReportCategory>;

export const REPORT_TARGET_TYPES = ['announcement', 'comment', 'message'] as const;
export const ReportTargetType = z.enum(REPORT_TARGET_TYPES);
export type ReportTargetType = z.infer<typeof ReportTargetType>;

// Mirrors the backend's own 1000-character cap on `note`
// (supabase/functions/moderation/index.ts's validNote) so a client-side
// error surfaces before a round-trip, not after.
export const REPORT_NOTE_MAX_LENGTH = 1000;

export const ReportDTO = z.object({
  id: z.string(),
  reporterId: z.string(),
  targetType: ReportTargetType,
  targetId: z.string(),
  category: ReportCategory,
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ReportDTO = z.infer<typeof ReportDTO>;

export const CreateReportInput = z.object({
  targetType: ReportTargetType,
  targetId: z.string(),
  category: ReportCategory,
  note: z.string().max(REPORT_NOTE_MAX_LENGTH, 'Keep it under 1000 characters.').optional(),
});
export type CreateReportInput = z.infer<typeof CreateReportInput>;

export const BlockDTO = z.object({
  blockerFamilyId: z.string(),
  blockedFamilyId: z.string(),
  createdAt: z.string(),
});
export type BlockDTO = z.infer<typeof BlockDTO>;

export async function createReport(input: CreateReportInput): Promise<ReportDTO> {
  const data = await edgeRequest<unknown>(FN, '/reports', { method: 'POST', body: input });
  return ReportDTO.parse(data);
}

/**
 * `blockedFamilyId` accepts either a `families.id` or the family owner's
 * `auth.users.id` — the Edge Function dual-resolves it (see
 * supabase/functions/moderation/index.ts's `resolveFamily`). The DTO
 * returned here always carries the canonical `families.id`, which callers
 * should hold onto for any later unblock call — `DELETE
 * /moderation/blocks/:blockedFamilyId` does NOT dual-resolve, it matches
 * `blocked_family_id` literally (see deleteBlock below).
 */
export async function createBlock(blockedFamilyId: string): Promise<BlockDTO> {
  const data = await edgeRequest<unknown>(FN, '/blocks', { method: 'POST', body: { blockedFamilyId } });
  return BlockDTO.parse(data);
}

export async function listBlocks(): Promise<BlockDTO[]> {
  const data = await edgeRequest<unknown>(FN, '/blocks');
  return z.array(BlockDTO).parse(data);
}

/**
 * Unblock. `blockedFamilyId` MUST be the canonical `families.id` (e.g. the
 * value returned as `blockedFamilyId` on a prior `createBlock` response) —
 * unlike `createBlock`, this route does not fall back to resolving an
 * owner's `auth.users.id`, so passing a user id here silently unblocks
 * nothing (204 either way, per the route's own idempotency).
 */
export async function deleteBlock(blockedFamilyId: string): Promise<void> {
  await edgeRequest<unknown>(FN, `/blocks/${blockedFamilyId}`, { method: 'DELETE' });
}

export const moderationKeys = {
  blocks: ['moderation', 'blocks'] as const,
};
