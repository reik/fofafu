import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import AnnouncementDetailPage from './AnnouncementDetail';

const POST_ID = 'a-1';

function setAuthed() {
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'u1', email: 'a@b.com', name: 'Jane', city: 'Phoenix', state: 'AZ' },
  });
}

const post = {
  id: POST_ID,
  authorId: 'u1',
  authorName: 'Jane',
  authorAvatarUrl: null,
  content: 'a post worth reading',
  mediaUrl: null,
  mediaType: null,
  createdAt: '2026-05-17T10:00:00Z',
  updatedAt: '2026-05-17T10:00:00Z',
  reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
  myReaction: null,
  isAuthor: true,
};

function renderRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/post/:id" element={<AnnouncementDetailPage />} />
    </Routes>,
    { route: `/post/${POST_ID}` },
  );
}

/**
 * Contract this spec locks in ([[features/feed-skeleton-loading]] Open
 * Questions: resolved to include AnnouncementDetail, trivial reuse of the
 * shared component):
 *
 * - While `postQuery.isPending`, a `role="group"` `aria-label="Post"`
 *   container carries `aria-busy="true"` and renders a single
 *   `AnnouncementCardSkeleton` (`aria-hidden="true"`) instead of any real
 *   post markup.
 * - Once the post resolves, the skeleton is gone and the real post content
 *   renders in its place.
 */
describe('AnnouncementDetail skeleton loading', () => {
  it('shows a single aria-hidden skeleton card in an aria-busy group while the post is pending', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/announcement/${POST_ID}`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(post);
      }),
      http.get(`${FUNCTIONS_BASE}/announcement/${POST_ID}/comments`, () => HttpResponse.json([])),
    );

    renderRoute();

    const group = screen.getByRole('group', { name: /post/i });
    expect(group).toHaveAttribute('aria-busy', 'true');

    const skeleton = screen.getByTestId('announcement-card-skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText(post.content)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByTestId('announcement-card-skeleton')).not.toBeInTheDocument(),
    );
  });

  it('replaces the skeleton with the real post once it loads', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/announcement/${POST_ID}`, () => HttpResponse.json(post)),
      http.get(`${FUNCTIONS_BASE}/announcement/${POST_ID}/comments`, () => HttpResponse.json([])),
    );

    renderRoute();

    expect(await screen.findByText(post.content)).toBeInTheDocument();
    expect(screen.queryByTestId('announcement-card-skeleton')).not.toBeInTheDocument();
  });
});
