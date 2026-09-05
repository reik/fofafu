import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { ReportModal } from './ReportModal';

describe('ReportModal', () => {
  it('renders a content-type-specific title, all four categories, and the reassurance line', () => {
    renderWithProviders(<ReportModal targetType="announcement" targetId="a1" onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Report this post' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Unkind or judgmental' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Shares private details' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: "Doesn't belong here" })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Something else' })).toBeInTheDocument();
    expect(screen.getByText(/reports go to our team, not to the other family/i)).toBeInTheDocument();
  });

  it('uses the message-specific title for a DM target', () => {
    renderWithProviders(<ReportModal targetType="message" targetId="m1" onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Report this message' })).toBeInTheDocument();
  });

  it('disables Send report until exactly one category is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportModal targetType="comment" targetId="c1" onClose={() => {}} />);

    const submit = screen.getByRole('button', { name: 'Send report' });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Unkind or judgmental' }));
    expect(submit).toBeEnabled();
  });

  it('submits {targetType, targetId, category, note} and shows the confirmation state', async () => {
    let received: unknown = null;
    server.use(
      http.post(`${FUNCTIONS_BASE}/moderation/reports`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          { id: 'r1', reporterId: 'u-me', targetType: 'comment', targetId: 'c1', category: 'unkind', note: 'ouch', createdAt: '2026-09-04T00:00:00Z' },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReportModal targetType="comment" targetId="c1" onClose={() => {}} />);

    await user.click(screen.getByRole('radio', { name: 'Unkind or judgmental' }));
    await user.type(screen.getByLabelText(/add a note/i), 'ouch');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText(/report sent — our team will take a look/i)).toBeInTheDocument();
    expect(received).toEqual({ targetType: 'comment', targetId: 'c1', category: 'unkind', note: 'ouch' });
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('rejects a note over 1000 characters client-side without a round-trip', async () => {
    let calls = 0;
    server.use(
      http.post(`${FUNCTIONS_BASE}/moderation/reports`, () => {
        calls += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReportModal targetType="comment" targetId="c1" onClose={() => {}} />);

    await user.click(screen.getByRole('radio', { name: 'Something else' }));
    const note = screen.getByLabelText(/add a note/i);
    // fireEvent.change bypasses the maxLength UI constraint (which only
    // limits real typing/pasting, not a programmatic value assignment) so
    // this exercises the Zod-side cap as defense-in-depth.
    fireEvent.change(note, { target: { value: 'x'.repeat(1001) } });

    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText(/keep it under 1000 characters/i)).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('surfaces the server\'s own error message via role="alert" and keeps the form populated when the request fails', async () => {
    // Mirrors MessageComposer/RequestPlaydateModal's existing convention:
    // prefer the server's specific EdgeApiError message over generic copy
    // when one is available.
    server.use(http.post(`${FUNCTIONS_BASE}/moderation/reports`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    const user = userEvent.setup();
    renderWithProviders(<ReportModal targetType="announcement" targetId="a1" onClose={() => {}} />);

    await user.click(screen.getByRole('radio', { name: 'Unkind or judgmental' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('radio', { name: 'Unkind or judgmental' })).toBeChecked();
  });

  it('falls back to ux-writer\'s generic copy when the failure carries no server-provided message', async () => {
    server.use(http.post(`${FUNCTIONS_BASE}/moderation/reports`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderWithProviders(<ReportModal targetType="announcement" targetId="a1" onClose={() => {}} />);

    await user.click(screen.getByRole('radio', { name: 'Unkind or judgmental' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send that. Try again?");
  });

  it('closes on Escape and on backdrop click', async () => {
    let closed = 0;
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <ReportModal targetType="announcement" targetId="a1" onClose={() => { closed += 1; }} />,
    );

    await user.keyboard('{Escape}');
    expect(closed).toBe(1);

    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    await user.click(backdrop);
    expect(closed).toBe(2);
  });
});
