import { z } from 'zod';
import { apiRequest } from './client';
import { FamilyDTO, type FamilyDTO as FamilyDTOType } from './family';

export async function getRecentCommunity(limit?: number): Promise<FamilyDTOType[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  const data = await apiRequest<unknown>(`/community/recent${qs ? `?${qs}` : ''}`);
  return z.array(FamilyDTO).parse(data);
}

export const communityKeys = {
  recent: (limit: number | undefined) => ['community', 'recent', limit ?? 'default'] as const,
};
