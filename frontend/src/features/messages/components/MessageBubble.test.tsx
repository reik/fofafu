import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { MessageBubble } from './MessageBubble';
import type { MessageDTO } from '@/api/messages';

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
});
