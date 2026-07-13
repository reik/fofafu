import { z } from 'zod';
import { edgeRequest } from './edgeClient';
import {
  AvailabilitySlotSchema,
  PlaydateRequestSchema,
  type AvailabilitySlot,
  type PlaydateRequest,
  type AddSlotInput,
  type UpdateSlotInput,
} from '@/types/playdates';

const FN = 'playdates';

// ── Query keys ────────────────────────────────────────────────────

export const playdateKeys = {
  availability: (userId: string) => ['playdates', 'availability', userId] as const,
  requests: () => ['playdates', 'requests'] as const,
} as const;

// ── API wrappers ──────────────────────────────────────────────────

export async function getAvailability(userId: string): Promise<AvailabilitySlot[]> {
  const data = await edgeRequest<unknown>(FN, `/availability/${userId}`);
  return z.array(AvailabilitySlotSchema).parse(data);
}

export async function addSlot(input: AddSlotInput): Promise<AvailabilitySlot> {
  const data = await edgeRequest<unknown>(FN, '/availability', {
    method: 'POST',
    body: input,
  });
  return AvailabilitySlotSchema.parse(data);
}

export async function updateSlot(id: string, input: UpdateSlotInput): Promise<AvailabilitySlot> {
  const data = await edgeRequest<unknown>(FN, `/availability/${id}`, {
    method: 'PUT',
    body: input,
  });
  return AvailabilitySlotSchema.parse(data);
}

export async function deleteSlot(id: string): Promise<void> {
  await edgeRequest<unknown>(FN, `/availability/${id}`, { method: 'DELETE' });
}

export async function getRequests(): Promise<PlaydateRequest[]> {
  const data = await edgeRequest<unknown>(FN, '/requests');
  return z.array(PlaydateRequestSchema).parse(data);
}

export async function createRequest(slotId: string, message?: string): Promise<PlaydateRequest> {
  const data = await edgeRequest<unknown>(FN, '/requests', {
    method: 'POST',
    body: { slotId, message },
  });
  return PlaydateRequestSchema.parse(data);
}

export async function respondToRequest(
  id: string,
  status: 'accepted' | 'declined',
): Promise<PlaydateRequest> {
  const data = await edgeRequest<unknown>(FN, `/requests/${id}/respond`, {
    method: 'PUT',
    body: { status },
  });
  return PlaydateRequestSchema.parse(data);
}
