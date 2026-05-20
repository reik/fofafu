import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type { SendMessageInput, ThreadParams } from '../schemas/message.schemas.js';

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: 0 | 1;
  created_at: string;
  from_name: string | null;
  to_name: string | null;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, m.receiver_id, m.content, m.read, m.created_at,
         fs.name AS from_name,
         fr.name AS to_name
  FROM messages m
  LEFT JOIN families fs ON fs.user_id = m.sender_id
  LEFT JOIN families fr ON fr.user_id = m.receiver_id
`;

function toMessageDTO(row: MessageRow, self: string): Record<string, unknown> {
  return {
    id: row.id,
    from: row.sender_id,
    fromName: row.from_name,
    to: row.receiver_id,
    toName: row.to_name,
    content: row.content,
    read: row.read === 1,
    createdAt: row.created_at,
    mine: row.sender_id === self,
  };
}

export function sendMessage(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { to, content } = req.body as SendMessageInput;
  if (to === userId) {
    res.status(400).json({ error: "You can't send a message to yourself." });
    return;
  }
  const recipient = db().prepare('SELECT id FROM users WHERE id = ?').get(to) as { id: string } | undefined;
  if (!recipient) {
    res.status(404).json({ error: "We couldn't find that person." });
    return;
  }
  const id = randomUUID();
  db().prepare(
    'INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)'
  ).run(id, userId, to, content);
  const row = db().prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id) as MessageRow;
  res.status(201).json(toMessageDTO(row, userId));
}

export function listThreads(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const rows = db().prepare(`
    WITH partners AS (
      SELECT DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS partner_id
      FROM messages
      WHERE sender_id = ? OR receiver_id = ?
    )
    SELECT p.partner_id AS partner_id,
           f.name AS partner_name,
           (SELECT content    FROM messages m WHERE (m.sender_id=? AND m.receiver_id=p.partner_id) OR (m.sender_id=p.partner_id AND m.receiver_id=?) ORDER BY m.created_at DESC LIMIT 1) AS last_content,
           (SELECT created_at FROM messages m WHERE (m.sender_id=? AND m.receiver_id=p.partner_id) OR (m.sender_id=p.partner_id AND m.receiver_id=?) ORDER BY m.created_at DESC LIMIT 1) AS last_at,
           (SELECT COUNT(*)   FROM messages m WHERE m.receiver_id=? AND m.sender_id=p.partner_id AND m.read=0) AS unread_count
    FROM partners p
    LEFT JOIN families f ON f.user_id = p.partner_id
    ORDER BY last_at DESC
  `).all(userId, userId, userId, userId, userId, userId, userId, userId) as { partner_id: string; partner_name: string | null; last_content: string; last_at: string; unread_count: number }[];
  res.json(rows.map((r) => ({
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    lastMessage: r.last_content,
    lastAt: r.last_at,
    unreadCount: r.unread_count,
  })));
}

export function getThread(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { userId: partnerId } = req.params as unknown as ThreadParams;
  const rows = db().prepare(
    `${MESSAGE_SELECT}
     WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
     ORDER BY m.created_at ASC`
  ).all(userId, partnerId, partnerId, userId) as MessageRow[];
  res.json(rows.map((r) => toMessageDTO(r, userId)));
}

export function markThreadRead(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { userId: partnerId } = req.params as unknown as ThreadParams;
  const info = db().prepare(
    'UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ? AND read = 0'
  ).run(userId, partnerId);
  res.json({ marked: info.changes });
}

export function unreadCount(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const row = db().prepare('SELECT COUNT(*) AS n FROM messages WHERE receiver_id = ? AND read = 0').get(userId) as { n: number };
  res.json({ count: row.n });
}
