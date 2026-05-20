import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import MessagesPage from './Messages';

function setAuthed(): void {
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'u-self', email: 'a@b.com', name: 'Self', city: 'Phoenix', state: 'AZ' },
  });
}

const navHandlers = [
  http.get('/api/messages/unread/count', () => HttpResponse.json({ count: 0 })),
];

describe('MessagesPage author display', () => {
  it('renders each thread row labeled with the partner family name and a link to /messages/:partnerId', async () => {
    setAuthed();
    server.use(
      ...navHandlers,
      http.get('/api/messages/threads', () =>
        HttpResponse.json([
          {
            partnerId: 'u-partner-1',
            partnerName: 'The Garcias',
            lastMessage: 'see you sunday',
            lastAt: '2026-05-17T12:00:00Z',
            unreadCount: 1,
          },
        ]),
      ),
    );

    renderWithProviders(<MessagesPage />, { route: '/messages' });

    const link = await screen.findByRole('link', { name: /the garcias/i });
    expect(link).toHaveAttribute('href', '/messages/u-partner-1');
    // We must NOT show the raw partner UUID.
    expect(link.textContent ?? '').not.toContain('u-partner-1');
  });

  it('falls back to "A former member" when partnerName is null', async () => {
    setAuthed();
    server.use(
      ...navHandlers,
      http.get('/api/messages/threads', () =>
        HttpResponse.json([
          {
            partnerId: 'u-partner-deleted',
            partnerName: null,
            lastMessage: 'last note',
            lastAt: '2026-05-17T12:00:00Z',
            unreadCount: 0,
          },
        ]),
      ),
    );

    renderWithProviders(<MessagesPage />, { route: '/messages' });

    // The row stays a link (the partner record may simply be missing, not the conversation),
    // but the visible label must be the neutral fallback string.
    const link = await screen.findByRole('link', { name: /a former member/i });
    expect(link).toHaveAttribute('href', '/messages/u-partner-deleted');
    expect(link.textContent ?? '').not.toContain('u-partner-deleted');
  });
});
