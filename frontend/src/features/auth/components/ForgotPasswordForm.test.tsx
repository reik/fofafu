import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { server, handlers, GOTRUE_BASE } from '@/tests/msw-server';
import { ForgotPasswordForm } from './ForgotPasswordForm';

async function submitEmail(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), email);
  await user.click(screen.getByRole('button', { name: /send reset link/i }));
}

describe('ForgotPasswordForm', () => {
  it('should_show_the_generic_confirmation_after_a_successful_request', async () => {
    server.use(handlers.resetPasswordOk());
    renderWithProviders(<ForgotPasswordForm />);
    await submitEmail('jane@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(
      /if an account exists for that email, a reset link is on its way/i,
    );
  });

  it('should_hide_the_form_once_the_confirmation_is_shown', async () => {
    server.use(handlers.resetPasswordOk());
    renderWithProviders(<ForgotPasswordForm />);
    await submitEmail('jane@example.com');
    await screen.findByRole('status');
    expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument();
  });

  it('should_show_a_field_error_when_the_email_is_invalid', async () => {
    renderWithProviders(<ForgotPasswordForm />);
    await submitEmail('not-an-email');
    expect(await screen.findByText(/does not look like an email/i)).toBeInTheDocument();
  });

  it('should_show_an_alert_when_the_request_fails', async () => {
    server.use(
      http.post(`${GOTRUE_BASE}/recover`, () =>
        HttpResponse.json({ error_code: 'over_email_send_rate_limit', msg: 'rate limited' }, { status: 429 }),
      ),
    );
    renderWithProviders(<ForgotPasswordForm />);
    await submitEmail('jane@example.com');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('should_offer_a_link_back_to_login', () => {
    renderWithProviders(<ForgotPasswordForm />);
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login');
  });
});
