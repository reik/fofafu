import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { ReactionBar } from './ReactionBar';
import type { AnnouncementDTO } from '@/api/announcements';

const baseAnnouncement: AnnouncementDTO = {
  id: 'a1',
  authorId: 'u1',
  content: 'hello',
  mediaUrl: null,
  mediaType: null,
  createdAt: '2026-05-17T10:00:00Z',
  updatedAt: '2026-05-17T10:00:00Z',
  reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
  myReaction: null,
  isAuthor: false,
};

describe('ReactionBar', () => {
  it('renders five reaction buttons with their labels', () => {
    renderWithProviders(<ReactionBar announcement={baseAnnouncement} />);
    expect(screen.getByRole('button', { name: /like/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /love/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hug/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /celebrate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /support/i })).toBeInTheDocument();
  });

  it('sends the chosen reaction type when clicked', async () => {
    let receivedType: string | null = null;
    server.use(
      http.post('/api/announcements/a1/reactions', async ({ request }) => {
        const body = (await request.json()) as { type: string };
        receivedType = body.type;
        return HttpResponse.json({ toggled: 'added', reactions: { like: 0, love: 1, hug: 0, celebrate: 0, support: 0 }, myReaction: 'love' });
      }),
    );
    renderWithProviders(<ReactionBar announcement={baseAnnouncement} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /love/i }));
    await screen.findByRole('button', { name: /love/i });
    expect(receivedType).toBe('love');
  });
});
