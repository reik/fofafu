import { z } from 'zod';

export const RecentCommunityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type RecentCommunityQuery = z.infer<typeof RecentCommunityQuery>;
