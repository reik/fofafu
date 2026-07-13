import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { AnnouncementComposer } from './AnnouncementComposer';

const samplePost = {
  id: 'a1',
  authorId: 'u1',
  authorName: 'Test Family',
  authorAvatarUrl: null,
  content: 'hello',
  mediaUrl: null,
  mediaType: null,
  createdAt: '2026-05-17T10:00:00Z',
  updatedAt: '2026-05-17T10:00:00Z',
  reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
  myReaction: null,
  isAuthor: true,
};

describe('AnnouncementComposer', () => {
  it('submits the post and clears the textarea', async () => {
    let received: { content: string } | null = null;
    server.use(
      http.post(`${FUNCTIONS_BASE}/announcement`, async ({ request }) => {
        received = (await request.json()) as { content: string };
        return HttpResponse.json({ ...samplePost, content: received.content }, { status: 201 });
      }),
    );

    renderWithProviders(<AnnouncementComposer />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'first post hello');
    await user.click(screen.getByRole('button', { name: /post/i }));

    await screen.findByRole('button', { name: /post/i });
    expect(received).toEqual({ content: 'first post hello' });
    expect(textarea.value).toBe('');
  });

  it('shows a validation error for empty content', async () => {
    renderWithProviders(<AnnouncementComposer />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /post/i }));
    expect(await screen.findByText(/add a few words/i)).toBeInTheDocument();
  });
});
