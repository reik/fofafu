import { z } from 'zod';

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const AvailabilitySlotInput = z.object({
  date: z.string().regex(DATE_RE, 'date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(TIME_RE, 'startTime must be in HH:MM format'),
  endTime: z.string().regex(TIME_RE, 'endTime must be in HH:MM format'),
  status: z.enum(['free', 'busy']).optional().default('free'),
  note: z.string().max(500).nullable().optional(),
}).refine((d) => d.endTime > d.startTime, {
  message: 'endTime must be after startTime',
  path: ['endTime'],
});
export type AvailabilitySlotInput = z.infer<typeof AvailabilitySlotInput>;

export const AvailabilitySlotPatch = z.object({
  date: z.string().regex(DATE_RE, 'date must be in YYYY-MM-DD format').optional(),
  startTime: z.string().regex(TIME_RE, 'startTime must be in HH:MM format').optional(),
  endTime: z.string().regex(TIME_RE, 'endTime must be in HH:MM format').optional(),
  status: z.enum(['free', 'busy']).optional(),
  note: z.string().max(500).nullable().optional(),
});
export type AvailabilitySlotPatch = z.infer<typeof AvailabilitySlotPatch>;

export const SlotIdParams = z.object({
  id: z.string().uuid(),
});
export type SlotIdParams = z.infer<typeof SlotIdParams>;

export const FamilyIdParams = z.object({
  id: z.string().uuid(),
});
export type FamilyIdParams = z.infer<typeof FamilyIdParams>;

// Param schema for GET /playdates/availability/:familyId
export const AvailabilityFamilyParams = z.object({
  familyId: z.string().uuid(),
});
export type AvailabilityFamilyParams = z.infer<typeof AvailabilityFamilyParams>;

export const PlaydateRequestInput = z.object({
  slotId: z.string().uuid(),
  message: z.string().max(1000).nullable().optional(),
});
export type PlaydateRequestInput = z.infer<typeof PlaydateRequestInput>;

export const PlaydateRequestRespondInput = z.object({
  status: z.enum(['accepted', 'declined']),
});
export type PlaydateRequestRespondInput = z.infer<typeof PlaydateRequestRespondInput>;

export const PlaydateRequestIdParams = z.object({
  id: z.string().uuid(),
});
export type PlaydateRequestIdParams = z.infer<typeof PlaydateRequestIdParams>;
