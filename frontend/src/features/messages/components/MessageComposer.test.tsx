import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { MessageComposer } from './MessageComposer';

describe('MessageComposer', () => {
  it('sends the message with the to + content payload and clears the textarea', async () => {
    let received: { to: string; content: string } | null = null;
    server.use(
      http.post(`${FUNCTIONS_BASE}/message`, async ({ request }) => {
        received = (await request.json()) as { to: string; content: string };
        return HttpResponse.json({
          id: 'm1',
          from: 'sender',
          fromName: 'Sender Family',
          to: received.to,
          toName: 'Partner Family',
          content: received.content,
          read: false,
          createdAt: '2026-05-17T10:00:00Z',
          mine: true,
        }, { status: 201 });
      }),
    );

    renderWithProviders(<MessageComposer to="partner-id" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'hello partner');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await screen.findByRole('button', { name: /send/i });
    expect(received).toEqual({ to: 'partner-id', content: 'hello partner' });
    expect(textarea.value).toBe('');
  });
});
