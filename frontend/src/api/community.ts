import { z } from 'zod';
import { edgeRequest } from './edgeClient';
import { FamilyDTO, type FamilyDTO as FamilyDTOType } from './family';

// Backed by supabase/functions/community/index.ts.
const FN = 'community';

export async function getRecentCommunity(limit?: number): Promise<FamilyDTOType[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  const data = await edgeRequest<unknown>(FN, `/recent${qs ? `?${qs}` : ''}`);
  return z.array(FamilyDTO).parse(data);
}

export const communityKeys = {
  recent: (limit: number | undefined) => ['community', 'recent', limit ?? 'default'] as const,
};
