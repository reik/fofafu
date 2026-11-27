import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { MessageBubble } from './MessageBubble';
import type { MessageDTO } from '@/api/messages';
import { formatTimestamp } from '@/utils/formatTimestamp';

function bodyOf(text: string): HTMLElement {
  return screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text);
}

const baseMessage: MessageDTO = {
  id: 'm1',
  from: 'u-partner',
  fromName: 'The Patels',
  to: 'u-me',
  toName: 'Me',
  content: 'hello there',
  read: true,
  createdAt: '2026-09-04T10:00:00Z',
  mine: false,
};

describe('MessageBubble', () => {
  it('renders the message content and timestamp', () => {
    renderWithProviders(<MessageBubble message={baseMessage} />);
    expect(screen.getByText('hello there')).toBeInTheDocument();
  });

  it('offers a "More actions" moderation trigger on a message from someone else', () => {
    renderWithProviders(<MessageBubble message={baseMessage} />);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('does not offer a moderation trigger on my own message', () => {
    renderWithProviders(<MessageBubble message={{ ...baseMessage, mine: true }} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('should_prefix_my_own_message_with_a_visually_hidden_you', () => {
    renderWithProviders(<MessageBubble message={{ ...baseMessage, mine: true }} />);
    expect(bodyOf('You: hello there')).toBeInTheDocument();
    expect(screen.getByText('You:', { exact: false })).toHaveClass('sr-only');
  });

  it('should_prefix_a_received_message_with_the_given_sender_name', () => {
    renderWithProviders(<MessageBubble message={baseMessage} senderName="Kuratars" />);
    expect(bodyOf('Kuratars: hello there')).toBeInTheDocument();
  });

  it('should_fall_back_to_the_message_sender_name_then_a_former_member', () => {
    renderWithProviders(<MessageBubble message={{ ...baseMessage, fromName: null }} />);
    expect(bodyOf('A former member: hello there')).toBeInTheDocument();
  });

  it('should_keep_the_time_for_screen_readers_when_the_visible_time_is_hidden', () => {
    renderWithProviders(<MessageBubble message={baseMessage} showTime={false} />);
    const time = screen.getByText(formatTimestamp(baseMessage.createdAt));
    expect(time).toHaveAttribute('dateTime', baseMessage.createdAt);
    expect(time).toHaveClass('sr-only');
  });

  it('should_fill_my_own_message_with_the_pressed_brand_colour_and_white_text', () => {
    renderWithProviders(<MessageBubble message={{ ...baseMessage, mine: true }} />);
    expect(bodyOf('You: hello there').parentElement).toHaveClass('bg-brand-primary-pressed', 'text-white');
  });
});
