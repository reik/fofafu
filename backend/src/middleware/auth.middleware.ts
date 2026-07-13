import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Accepts either the legacy Express-issued JWT (local dev/test, and any
 * caller not yet migrated) or a Supabase session token (the frontend, post
 * Phase-5 auth swap). Legacy verification is tried first since it's a cheap
 * local check; Supabase verification is a network call, only attempted when
 * the token isn't a legacy JWT.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'change-me') as { userId: string };
    req.userId = payload.userId;
    next();
    return;
  } catch {
    // Not a legacy Express token — fall through to Supabase verification.
  }

  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.userId = data.user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
