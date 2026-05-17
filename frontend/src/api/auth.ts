import { z } from 'zod';
import { apiRequest } from './client';
import type { AuthUser } from '@/stores/auth';

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

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export function register(payload: RegisterPayload): Promise<{ message: string }> {
  return apiRequest('/auth/register', { method: 'POST', body: payload });
}

export function verifyEmail(token: string): Promise<{ message: string }> {
  return apiRequest(`/auth/verify?token=${encodeURIComponent(token)}`);
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiRequest('/auth/login', { method: 'POST', body: payload });
}
