import type { Response } from 'express';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type { SearchFamiliesQuery } from '../schemas/search.schemas.js';

interface FamilyJoinRow {
  id: string;
  user_id: string;
  name: string;
  bio: string;
  kid_count: number | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export function searchFamilies(req: AuthRequest, res: Response): void {
  const { q, limit } = req.query as unknown as SearchFamiliesQuery;
  const pageSize = limit ?? 20;
  const needle = `%${q.toLowerCase()}%`;
  const rows = db().prepare(
    `SELECT families.*
       FROM families
       JOIN users ON users.id = families.user_id
      WHERE LOWER(families.name) LIKE ?
         OR LOWER(families.bio)  LIKE ?
         OR LOWER(users.city)    LIKE ?
         OR LOWER(users.state)   LIKE ?
      LIMIT ?`,
  ).all(needle, needle, needle, needle, pageSize) as FamilyJoinRow[];

  const viewer = req.userId;
  res.json(rows.map((row) => {
    const isOwner = viewer === row.user_id;
    return {
      id: row.id,
      ownerId: row.user_id,
      name: row.name,
      bio: row.bio,
      kidCount: isOwner ? row.kid_count : null,
      avatarUrl: row.avatar_url,
      isOwner,
      updatedAt: row.updated_at,
    };
  }));
}
