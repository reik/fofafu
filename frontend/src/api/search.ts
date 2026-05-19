import { z } from 'zod';
import { apiRequest } from './client';
import { FamilyDTO, type FamilyDTO as FamilyDTOType } from './family';

export async function searchFamilies(q: string, limit?: number): Promise<FamilyDTOType[]> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (limit !== undefined) params.set('limit', String(limit));
  const data = await apiRequest<unknown>(`/search/families?${params.toString()}`);
  return z.array(FamilyDTO).parse(data);
}

export const searchKeys = {
  families: (q: string, limit: number | undefined) => ['search', 'families', q, limit ?? 'default'] as const,
};
