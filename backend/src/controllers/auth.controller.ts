import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type {
  RegisterInput,
  LoginInput,
  VerifyQuery,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from '../schemas/auth.schemas.js';

const TOKEN_EXPIRY_HOURS = 24;

interface UserRow {
  id: string;
  email: string;
  password: string;
  name: string;
  city: string;
  state: string;
  verified: boolean;
}

function signJwt(userId: string): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as NonNullable<jwt.SignOptions['expiresIn']>;
  return jwt.sign({ userId }, process.env.JWT_SECRET ?? 'change-me', { expiresIn });
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, name, city, state } = req.body as RegisterInput;
  const normalised = email.toLowerCase();

  const existing = (await db().prepare('SELECT id FROM users WHERE email = ?').get(normalised)) as
    | { id: string }
    | undefined;
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3600 * 1000).toISOString();

  const familyId = randomUUID();
  await db().transaction(async () => {
    await db()
      .prepare('INSERT INTO users (id, email, password, name, city, state) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, normalised, hashed, name, city, state);
    await db()
      .prepare('INSERT INTO email_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), userId, token, expiresAt);
    await db()
      .prepare("INSERT INTO families (id, user_id, name, bio) VALUES (?, ?, ?, '')")
      .run(familyId, userId, name);
  })();

  try {
    await sendVerificationEmail({ to: normalised, name, token });
  } catch (err) {
    console.error('[register] failed to send verification email', err);
    res.status(500).json({ error: 'Registration succeeded but the verification email could not be sent. Please try again later.' });
    return;
  }

  res.status(201).json({
    message: 'Registration successful. Please check your email to verify your account.',
  });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.query as unknown as VerifyQuery;

  const row = (await db()
    .prepare(
      `SELECT id, user_id FROM email_tokens
       WHERE token = ? AND used = FALSE AND expires_at > now()`
    )
    .get(token)) as { id: string; user_id: string } | undefined;

  if (!row) {
    res.status(400).json({ error: 'Invalid or expired verification link' });
    return;
  }

  await db().transaction(async () => {
    await db().prepare('UPDATE users SET verified = TRUE WHERE id = ?').run(row.user_id);
    await db().prepare('UPDATE email_tokens SET used = TRUE WHERE id = ?').run(row.id);
  })();

  res.json({ message: 'Email verified successfully' });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const normalised = email.toLowerCase();

  const user = (await db().prepare('SELECT * FROM users WHERE email = ?').get(normalised)) as UserRow | undefined;
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.verified) {
    res.status(403).json({ error: 'Please verify your email before logging in' });
    return;
  }

  const token = signJwt(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      city: user.city,
      state: user.state,
    },
  });
}

const RESET_TOKEN_EXPIRY_HOURS = 1;

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as ForgotPasswordInput;
  const normalised = email.toLowerCase();
  const genericResponse = { message: 'If that email exists, a reset link has been sent.' };

  const user = (await db().prepare('SELECT id, email, name FROM users WHERE email = ?').get(normalised)) as
    | { id: string; email: string; name: string }
    | undefined;
  if (!user) {
    res.json(genericResponse);
    return;
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 3600 * 1000).toISOString();
  await db()
    .prepare('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), user.id, token, expiresAt);

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, token });
  } catch (err) {
    console.error('[forgotPassword] failed to send reset email', err);
  }
  res.json(genericResponse);
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as ResetPasswordInput;

  const row = (await db()
    .prepare(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token = ? AND used = FALSE AND expires_at > now()`
    )
    .get(token)) as { id: string; user_id: string } | undefined;

  if (!row) {
    res.status(400).json({ error: 'Invalid or expired reset link' });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await db().transaction(async () => {
    await db().prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, row.user_id);
    await db().prepare('UPDATE password_reset_tokens SET used = TRUE WHERE id = ?').run(row.id);
  })();

  res.json({ message: 'Password reset successfully' });
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  const user = (await db().prepare('SELECT password FROM users WHERE id = ?').get(userId)) as
    | { password: string }
    | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await db().prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, userId);
  res.json({ message: 'Password changed successfully' });
}
