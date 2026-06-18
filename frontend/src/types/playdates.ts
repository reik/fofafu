import { z } from 'zod';

export const AvailabilitySlotSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  date: z.string(),       // YYYY-MM-DD
  startTime: z.string(),  // HH:MM (24h)
  endTime: z.string(),    // HH:MM (24h)
  status: z.enum(['free', 'busy']),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const PlaydateRequestSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  requesterFamilyId: z.string(),
  ownerFamilyId: z.string(),
  message: z.string().nullable(),
  status: z.enum(['pending', 'accepted', 'declined']),
  createdAt: z.string(),
  updatedAt: z.string(),
  requesterName: z.string().nullable(),
  ownerName: z.string().nullable(),
  slotDate: z.string(),
  slotStartTime: z.string(),
  slotEndTime: z.string(),
});
export type PlaydateRequest = z.infer<typeof PlaydateRequestSchema>;

const AddSlotInputBase = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(['free', 'busy']),
  note: z.string().optional(),
});

export const AddSlotInputSchema = AddSlotInputBase.refine(
  (d) => d.endTime > d.startTime,
  { message: 'End time must be after start time', path: ['endTime'] },
);
export type AddSlotInput = z.infer<typeof AddSlotInputSchema>;

export const UpdateSlotInputSchema = AddSlotInputBase.partial();
export type UpdateSlotInput = z.infer<typeof UpdateSlotInputSchema>;
