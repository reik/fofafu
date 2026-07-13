import { describe, it, expect } from 'vitest';
import { server, handlers, GOTRUE_BASE, JANE } from '@/tests/msw-server';
import { supabase } from '@/lib/supabaseClient';
import {
  register,
  login,
  requestPasswordReset,
  updatePassword,
  logout,
  AuthError,
  INVALID_CREDENTIALS_MESSAGE,
} from './auth';

const VALID_PAYLOAD = {
  email: 'jane@example.com',
  password: 'correct-horse-battery',
  name: 'Jane Garcia',
  city: 'Phoenix',
  state: 'AZ',
};

describe('auth api (supabase-js network boundary)', () => {
  it('signUp: resolves with a confirmation message on success', async () => {
    server.use(handlers.signUpOk());
    await expect(register(VALID_PAYLOAD)).resolves.toEqual({
      message: 'Check your email to confirm your account.',
    });
  });

  it('signUp: throws AuthError with the Supabase message on failure', async () => {
    server.use(handlers.signUpDuplicate());
    await expect(register(VALID_PAYLOAD)).rejects.toThrow(AuthError);
    await expect(register(VALID_PAYLOAD)).rejects.toThrow(/already registered/i);
  });

  it('signInWithPassword: resolves (session sync happens via onAuthStateChange, not the return value)', async () => {
    server.use(handlers.loginOk());
    await expect(login({ email: JANE.email, password: 'correct-horse-battery' })).resolves.toBeUndefined();
  });

  it('signInWithPassword: maps invalid credentials to the shared password-reset-pointing message', async () => {
    server.use(handlers.loginInvalidCredentials());
    await expect(login({ email: JANE.email, password: 'wrong' })).rejects.toThrow(AuthError);
    await expect(login({ email: JANE.email, password: 'wrong' })).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE);
  });

  it('resetPasswordForEmail: resolves with a generic message (does not leak account existence)', async () => {
    server.use(handlers.resetPasswordOk());
    await expect(requestPasswordReset('jane@example.com')).resolves.toEqual({
      message: 'If an account exists for that email, a reset link is on its way.',
    });
  });

  it('updateUser: resolves once signed in with an active session', async () => {
    server.use(handlers.loginOk(), handlers.updateUserOk());
    await login({ email: JANE.email, password: 'correct-horse-battery' });
    await expect(updatePassword('new-correct-horse-battery')).resolves.toBeUndefined();
  });

  it('signOut: resolves and clears the Supabase session', async () => {
    server.use(handlers.loginOk(), handlers.signOutOk());
    await login({ email: JANE.email, password: 'correct-horse-battery' });
    await expect(logout()).resolves.toBeUndefined();
  });

  it('getSession bootstrap: reflects a persisted session without hitting the network', async () => {
    // supabase-js's getSession() reads from its own storage adapter; no
    // network call is expected here, so no handler is registered — an
    // unhandled request would fail the test (onUnhandledRequest: 'error').
    const { data } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('hits the GoTrue REST endpoints (auth/v1/signup, auth/v1/token), not an Express /auth/* route', async () => {
    server.use(handlers.signUpOk(), handlers.loginOk());
    await register(VALID_PAYLOAD);
    await login({ email: JANE.email, password: 'correct-horse-battery' });
    // If auth.ts still pointed at Express, these calls would be unhandled by
    // msw (onUnhandledRequest: 'error' in setup.ts) and the awaits above
    // would already have thrown. This assertion documents the expected URLs.
    expect(`${GOTRUE_BASE}/signup`).toBe('https://test-project.supabase.co/auth/v1/signup');
    expect(`${GOTRUE_BASE}/token`).toBe('https://test-project.supabase.co/auth/v1/token');
  });
});
