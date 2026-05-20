import type { Response } from 'express';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type { RecentCommunityQuery } from '../schemas/community.schemas.js';

interface FamilyRow {
  id: string;
  user_id: string;
  name: string;
  bio: string;
  kid_count: number | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export function getRecent(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { limit } = req.query as unknown as RecentCommunityQuery;
  const pageSize = limit ?? 12;

  const rows = db().prepare(
    `SELECT * FROM families
     WHERE user_id != ?
     ORDER BY updated_at DESC
     LIMIT ?`,
  ).all(userId, pageSize) as FamilyRow[];

  res.json(rows.map((row) => ({
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    bio: row.bio,
    kidCount: null,
    avatarUrl: row.avatar_url,
    isOwner: false,
    updatedAt: row.updated_at,
  })));
}
