import { z } from 'zod';
import { edgeRequest } from './edgeClient';

const FN = 'message';

export const MessageDTO = z.object({
  id: z.string(),
  from: z.string(),
  fromName: z.string().nullable(),
  to: z.string(),
  toName: z.string().nullable(),
  content: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
  mine: z.boolean(),
});
export type MessageDTO = z.infer<typeof MessageDTO>;

export const ThreadDTO = z.object({
  partnerId: z.string(),
  partnerName: z.string().nullable(),
  lastMessage: z.string(),
  lastAt: z.string(),
  unreadCount: z.number(),
});
export type ThreadDTO = z.infer<typeof ThreadDTO>;

export async function listThreads(): Promise<ThreadDTO[]> {
  const data = await edgeRequest<unknown>(FN, '/threads');
  return z.array(ThreadDTO).parse(data);
}

export async function getThread(partnerId: string): Promise<MessageDTO[]> {
  const data = await edgeRequest<unknown>(FN, `/threads/${partnerId}`);
  return z.array(MessageDTO).parse(data);
}

export async function sendMessage(input: { to: string; content: string }): Promise<MessageDTO> {
  const data = await edgeRequest<unknown>(FN, '', { method: 'POST', body: input });
  return MessageDTO.parse(data);
}

export async function markThreadRead(partnerId: string): Promise<{ marked: number }> {
  const data = await edgeRequest<{ marked: number }>(FN, `/threads/${partnerId}/read`, { method: 'POST' });
  return data;
}

export async function unreadCount(): Promise<{ count: number }> {
  return edgeRequest<{ count: number }>(FN, '/unread/count');
}

export const messageKeys = {
  threads: ['messages', 'threads'] as const,
  thread: (partnerId: string) => ['messages', 'thread', partnerId] as const,
  unread: ['messages', 'unread'] as const,
};
