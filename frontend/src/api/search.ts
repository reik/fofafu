import { z } from 'zod';
import { edgeRequest } from './edgeClient';
import { FamilyDTO, type FamilyDTO as FamilyDTOType } from './family';

// Backed by supabase/functions/search/index.ts.
const FN = 'search';

export async function searchFamilies(q: string, limit?: number): Promise<FamilyDTOType[]> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (limit !== undefined) params.set('limit', String(limit));
  const data = await edgeRequest<unknown>(FN, `/families?${params.toString()}`);
  return z.array(FamilyDTO).parse(data);
}

export const searchKeys = {
  families: (q: string, limit: number | undefined) => ['search', 'families', q, limit ?? 'default'] as const,
};
