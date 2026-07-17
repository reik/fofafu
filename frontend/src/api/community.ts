import { z } from 'zod';
import { edgeRequest } from './edgeClient';
import { FamilyDTO } from './family';

// Backed by supabase/functions/community/index.ts.
const FN = 'community';

export const CommunityFamilyDTO = FamilyDTO.extend({
  city: z.string().nullable(),
  state: z.string().nullable(),
  nextFreeSlotId: z.string().nullable(),
});
export type CommunityFamilyDTO = z.infer<typeof CommunityFamilyDTO>;

export async function getRecentCommunity(limit?: number): Promise<CommunityFamilyDTO[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  const data = await edgeRequest<unknown>(FN, `/recent${qs ? `?${qs}` : ''}`);
  return z.array(CommunityFamilyDTO).parse(data);
}

export const communityKeys = {
  recent: (limit: number | undefined) => ['community', 'recent', limit ?? 'default'] as const,
};
