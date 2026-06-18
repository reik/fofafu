import { z } from 'zod';
import { apiRequest } from './client';
import {
  AvailabilitySlotSchema,
  PlaydateRequestSchema,
  type AvailabilitySlot,
  type PlaydateRequest,
  type AddSlotInput,
  type UpdateSlotInput,
} from '@/types/playdates';

// ── Query keys ────────────────────────────────────────────────────

export const playdateKeys = {
  availability: (userId: string) => ['playdates', 'availability', userId] as const,
  requests: () => ['playdates', 'requests'] as const,
} as const;

// ── API wrappers ──────────────────────────────────────────────────

export async function getAvailability(userId: string): Promise<AvailabilitySlot[]> {
  const data = await apiRequest<unknown>(`/playdates/availability/${userId}`);
  return z.array(AvailabilitySlotSchema).parse(data);
}

export async function addSlot(input: AddSlotInput): Promise<AvailabilitySlot> {
  const data = await apiRequest<unknown>('/playdates/availability', {
    method: 'POST',
    body: input,
  });
  return AvailabilitySlotSchema.parse(data);
}

export async function updateSlot(id: string, input: UpdateSlotInput): Promise<AvailabilitySlot> {
  const data = await apiRequest<unknown>(`/playdates/availability/${id}`, {
    method: 'PUT',
    body: input,
  });
  return AvailabilitySlotSchema.parse(data);
}

export async function deleteSlot(id: string): Promise<void> {
  await apiRequest<unknown>(`/playdates/availability/${id}`, { method: 'DELETE' });
}

export async function getRequests(): Promise<PlaydateRequest[]> {
  const data = await apiRequest<unknown>('/playdates/requests');
  return z.array(PlaydateRequestSchema).parse(data);
}

export async function createRequest(slotId: string, message?: string): Promise<PlaydateRequest> {
  const data = await apiRequest<unknown>('/playdates/requests', {
    method: 'POST',
    body: { slotId, message },
  });
  return PlaydateRequestSchema.parse(data);
}

export async function respondToRequest(
  id: string,
  status: 'accepted' | 'declined',
): Promise<PlaydateRequest> {
  const data = await apiRequest<unknown>(`/playdates/requests/${id}/respond`, {
    method: 'PUT',
    body: { status },
  });
  return PlaydateRequestSchema.parse(data);
}
