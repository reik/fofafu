import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { server, handlers } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('stores the JWT in the auth store on successful login', async () => {
    server.use(handlers.loginOk());
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Wait for the mutation to resolve.
    await screen.findByRole('button', { name: /sign in/i });
    expect(useAuthStore.getState().token).toBe('fake-jwt');
    expect(useAuthStore.getState().user?.email).toBe('jane@example.com');
  });

  it('shows verify-first message on 403', async () => {
    server.use(handlers.loginUnverified());
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/verify your email/i);
  });
});
