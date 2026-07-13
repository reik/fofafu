import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { server, handlers } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('stores the Supabase session in the auth store on successful login', async () => {
    server.use(handlers.loginOk());
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // The store is synced by supabase.auth.onAuthStateChange, not the
    // mutation's return value — wait for it to settle.
    await screen.findByRole('button', { name: /sign in/i });
    expect(useAuthStore.getState().token).toBe('fake-access-token');
    expect(useAuthStore.getState().user?.email).toBe('jane@example.com');
  });

  it('surfaces a password-reset pointer on invalid credentials (covers pre-migration accounts with no Supabase Auth record)', async () => {
    server.use(handlers.loginInvalidCredentials());
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/forgot password/i);
  });
});
