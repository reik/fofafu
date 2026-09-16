import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import AnnouncementDetailPage from './AnnouncementDetail';
import type { AnnouncementDTO } from '@/api/announcements';

const POST: AnnouncementDTO = {
  id: 'a1',
  authorId: 'u1',
  authorName: 'The Garcias',
  authorAvatarUrl: null,
  content: 'hello from the Garcias',
  mediaUrl: null,
  mediaType: null,
  createdAt: '2026-05-17T10:00:00Z',
  updatedAt: '2026-05-17T10:00:00Z',
  reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
  myReaction: null,
  isAuthor: false,
};

function mockPost({ delayMs = 0 }: { delayMs?: number } = {}) {
  server.use(
    http.get(`${FUNCTIONS_BASE}/announcement/${POST.id}`, async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return HttpResponse.json(POST);
    }),
    http.get(`${FUNCTIONS_BASE}/announcement/${POST.id}/comments`, () => HttpResponse.json([])),
  );
}

function renderRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/post/:id" element={<AnnouncementDetailPage />} />
    </Routes>,
    { route: `/post/${POST.id}` },
  );
}

// feed-skeleton-loading open question, resolved "default to including it if
// the shared component drops in cleanly": AnnouncementDetail's single-post
// isPending state should reuse AnnouncementCardSkeleton rather than the bare
// "Loading…" line. Contract assumed pending frontend-dev's implementation
// landing in the same dispatch wave — if they instead judge the shared
// component doesn't drop in cleanly here and keep "Loading…", this test is a
// documented gap for tech-lead to reconcile at aggregation, not a QA miss.
describe('AnnouncementDetailPage skeleton loading state', () => {
  it('shows a single skeleton announcement card (not a bare loading line) while the post is fetching', async () => {
    mockPost({ delayMs: 50 });
    renderRoute();

    const skeletons = screen.getAllByTestId('announcement-card-skeleton');
    expect(skeletons.length).toBe(1);
    expect(screen.queryByText(/^loading…$/i)).toBeNull();

    expect(await screen.findByText('hello from the Garcias')).toBeInTheDocument();
    expect(screen.queryAllByTestId('announcement-card-skeleton')).toHaveLength(0);
  });
});
