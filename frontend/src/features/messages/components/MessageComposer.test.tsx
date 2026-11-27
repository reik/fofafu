import { describe, it, expect, vi } from 'vitest';
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

  it('should_label_the_field_with_the_recipient_when_known', () => {
    renderWithProviders(<MessageComposer to="partner-id" recipientName="Kuratars" />);
    expect(screen.getByRole('textbox', { name: 'Message to Kuratars' })).toBeInTheDocument();
  });

  it('should_label_the_field_message_when_the_recipient_is_unknown', () => {
    renderWithProviders(<MessageComposer to="partner-id" />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });

  it('should_link_the_empty_message_error_to_the_field', async () => {
    renderWithProviders(<MessageComposer to="partner-id" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /send/i }));
    const textarea = screen.getByRole('textbox', { name: /^Message/ });
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAccessibleDescription('Type a message.');
  });

  it('should_call_on_sent_after_a_successful_send', async () => {
    server.use(
      http.post(`${FUNCTIONS_BASE}/message`, () =>
        HttpResponse.json({
          id: 'm2', from: 'me', fromName: 'Me', to: 'partner-id', toName: 'Partner', content: 'hi',
          read: false, createdAt: '2026-05-17T10:00:00Z', mine: true,
        }, { status: 201 })),
    );
    const onSent = vi.fn();
    renderWithProviders(<MessageComposer to="partner-id" onSent={onSent} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'hi');
    await user.click(screen.getByRole('button', { name: /send/i }));
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });

  it('should_use_a_readable_placeholder_and_a_visible_field_border', () => {
    renderWithProviders(<MessageComposer to="partner-id" />);
    expect(screen.getByRole('textbox')).toHaveClass('placeholder:text-ink-muted', 'border-ink-muted/70');
  });

  it('should_give_send_a_44px_target_and_an_offset_focus_ring', () => {
    renderWithProviders(<MessageComposer to="partner-id" />);
    expect(screen.getByRole('button', { name: /send/i })).toHaveClass('min-h-11', 'focus-visible:ring-offset-2');
  });
});
