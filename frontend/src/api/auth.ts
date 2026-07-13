import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';

export const RegisterPayload = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  name: z.string().min(1, 'Tell us your name.').max(80),
  city: z.string().min(1).max(80),
  state: z.string().min(2).max(80),
});
export type RegisterPayload = z.infer<typeof RegisterPayload>;

export const LoginPayload = z.object({
  email: z.string().email('That does not look like an email.').max(254),
  password: z.string().min(1, 'Type your password.').max(200),
});
export type LoginPayload = z.infer<typeof LoginPayload>;

/**
 * We cannot tell "wrong password" apart from "pre-existing (pre-migration)
 * account with no Supabase Auth record" from the client — Supabase returns
 * the same invalid-credentials error for both. Old sqlite `users` rows and
 * their password hashes no longer exist (dropped by the Postgres migration
 * in favor of `auth.users`), so there is nothing to auto-migrate. We surface
 * one message covering both cases and point people at password reset.
 */
export const INVALID_CREDENTIALS_MESSAGE =
  "We couldn't sign you in with that email and password. If you had an account before our recent update, use \"Forgot password\" to set a new one.";

export class AuthError extends Error {}

export async function register(payload: RegisterPayload): Promise<{ message: string }> {
  const { email, password, name, city, state } = RegisterPayload.parse(payload);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, city, state } },
  });
  if (error) throw new AuthError(error.message);
  return { message: 'Check your email to confirm your account.' };
}

export async function login(payload: LoginPayload): Promise<void> {
  const { email, password } = LoginPayload.parse(payload);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 400 || /invalid/i.test(error.message)) {
      throw new AuthError(INVALID_CREDENTIALS_MESSAGE);
    }
    throw new AuthError(error.message);
  }
  // No return value: useAuthStore is kept in sync via supabase.auth.onAuthStateChange.
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new AuthError(error.message);
  return { message: 'If an account exists for that email, a reset link is on its way.' };
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new AuthError(error.message);
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthError(error.message);
}
