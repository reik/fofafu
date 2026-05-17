import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { server, handlers } from '@/tests/msw-server';
import { RegisterForm } from './RegisterForm';

describe('RegisterForm', () => {
  it('renders all fields and submits valid input', async () => {
    server.use(handlers.registerSuccess());
    const submissions: string[] = [];
    renderWithProviders(<RegisterForm onSuccess={(email) => submissions.push(email)} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), 'Jane Garcia');
    await user.type(screen.getByLabelText(/^email$/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await user.type(screen.getByLabelText(/city/i), 'Phoenix');
    await user.type(screen.getByLabelText(/state/i), 'AZ');
    await user.click(screen.getByRole('button', { name: /create my account/i }));

    await screen.findByRole('button', { name: /create my account/i });
    expect(submissions).toEqual(['jane@example.com']);
  });

  it('shows a friendly error on duplicate email (409)', async () => {
    server.use(handlers.registerDuplicate());
    renderWithProviders(<RegisterForm onSuccess={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), 'Jane');
    await user.type(screen.getByLabelText(/^email$/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await user.type(screen.getByLabelText(/city/i), 'Phoenix');
    await user.type(screen.getByLabelText(/state/i), 'AZ');
    await user.click(screen.getByRole('button', { name: /create my account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i);
  });
});
