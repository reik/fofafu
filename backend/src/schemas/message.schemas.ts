import { z } from 'zod';

export const SendMessageInput = z.object({
  to: z.string().uuid(),
  content: z.string().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const ThreadParams = z.object({
  userId: z.string().uuid(),
});
export type ThreadParams = z.infer<typeof ThreadParams>;
