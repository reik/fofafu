import { z } from 'zod';

export const RegisterInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  state: z.string().min(2).max(80),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const VerifyQuery = z.object({
  token: z.string().uuid(),
});
export type VerifyQuery = z.infer<typeof VerifyQuery>;

export const ForgotPasswordInput = z.object({
  email: z.string().email().max(254),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z.object({
  token: z.string().uuid(),
  password: z.string().min(8).max(200),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;
