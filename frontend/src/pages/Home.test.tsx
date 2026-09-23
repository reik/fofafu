import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import HomePage from './Home';

function setAuthed() {
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'u1', email: 'a@b.com', name: 'Jane', city: 'Phoenix', state: 'AZ' },
  });
}

const baseHandlers = [
  http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })),
  http.get(`${FUNCTIONS_BASE}/announcement`, () =>
    HttpResponse.json({ items: [], nextCursor: null }),
  ),
];

describe('HomePage dashboard', () => {
  it('renders the user family card and empty community rail with View all link', async () => {
    setAuthed();
    server.use(
      ...baseHandlers,
      http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json([])),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const familyCard = await screen.findByLabelText(/your family/i);
    expect(familyCard).toBeInTheDocument();
    expect(familyCard).toHaveTextContent(/Jane/);
    expect(familyCard).toHaveTextContent(/Phoenix, AZ/);
    expect(screen.getByRole('link', { name: /edit family page/i })).toHaveAttribute('href', '/family/me');

    expect(await screen.findByText(/no other families yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/search');
  });

  it('renders community families when the API returns them', async () => {
    setAuthed();
    server.use(
      ...baseHandlers,
      http.get(`${FUNCTIONS_BASE}/community/recent`, () =>
        HttpResponse.json([
          {
            id: 'f1',
            ownerId: 'u2',
            name: 'Garcia',
            bio: '',
            kidCount: null,
            avatarUrl: null,
            isOwner: false,
            updatedAt: '2026-05-18',
            city: 'Denver',
            state: 'CO',
            nextFreeSlotId: null,
          },
        ]),
      ),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const link = await screen.findByRole('link', { name: /garcia/i });
    expect(link).toHaveAttribute('href', '/family/f1');
    expect(screen.getByText('Denver, CO')).toBeInTheDocument();
    expect(screen.queryByTitle(/open playdate slot/i)).not.toBeInTheDocument();
  });

  it('renders a Playdate badge that links to the request flow when a family has a future free slot', async () => {
    setAuthed();
    server.use(
      ...baseHandlers,
      http.get(`${FUNCTIONS_BASE}/community/recent`, () =>
        HttpResponse.json([
          {
            id: 'f2',
            ownerId: 'u3',
            name: 'Nguyen',
            bio: '',
            kidCount: null,
            avatarUrl: null,
            isOwner: false,
            updatedAt: '2026-05-18',
            city: 'Portland',
            state: 'OR',
            nextFreeSlotId: 'slot-123',
          },
        ]),
      ),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const badge = await screen.findByTitle(/open playdate slot/i);
    expect(badge).toHaveAttribute('href', '/family/f2?requestSlot=slot-123');
  });

  it('truncates family names longer than 24 characters only', async () => {
    setAuthed();
    server.use(
      ...baseHandlers,
      http.get(`${FUNCTIONS_BASE}/community/recent`, () =>
        HttpResponse.json([
          {
            id: 'f3',
            ownerId: 'u4',
            name: 'Nguyen Family Foster Home Society',
            bio: '',
            kidCount: null,
            avatarUrl: null,
            isOwner: false,
            updatedAt: '2026-05-18',
            city: 'Seattle',
            state: 'WA',
            nextFreeSlotId: null,
          },
        ]),
      ),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const name = await screen.findByText('Nguyen Family Foster Home Society');
    expect(name).toHaveClass('max-w-[24ch]', 'truncate');
  });

  it('renders the announcement composer region', async () => {
    setAuthed();
    server.use(
      ...baseHandlers,
      http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json([])),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    expect(await screen.findByLabelText(/announcements/i)).toBeInTheDocument();
  });
});

/**
 * Contract these specs lock in (frontend-dev: implement to match, or coordinate
 * a change via ### Frontend / ### Test plan — written ahead of the
 * implementation per this repo's TDD rule; see
 * [[features/feed-skeleton-loading]]):
 *
 * - While `feed.isPending`, the `aria-label="Announcements"` `<section>` carries
 *   `aria-busy="true"` (string, not boolean — React serializes aria-* as
 *   strings) and renders 2-3 `AnnouncementCardSkeleton` instances
 *   (`data-testid="announcement-card-skeleton"`, `aria-hidden="true"`) instead
 *   of the bare "Loading…" line. At least one carries a media placeholder
 *   (`data-testid="announcement-card-skeleton-media"`).
 * - Once `feed.data` resolves, `aria-busy` flips to `"false"` and every
 *   skeleton is gone — replaced by real `<article>` content, reachable with no
 *   extra tab stops introduced by the now-removed skeleton.
 * - While `community.isPending`, the Community rail renders skeleton rows
 *   (`data-testid="community-skeleton-row"`, `aria-hidden="true"`) instead of
 *   "Loading…".
 */
describe('HomePage skeleton loading', () => {
  it('shows 2-3 aria-hidden skeleton cards (with at least one media block) and marks the section aria-busy while the feed is pending', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })),
      http.get(`${FUNCTIONS_BASE}/announcement`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json([])),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const section = screen.getByLabelText(/announcements/i);
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument();

    const skeletons = screen.getAllByTestId('announcement-card-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
    expect(skeletons.length).toBeLessThanOrEqual(3);
    skeletons.forEach((s) => expect(s).toHaveAttribute('aria-hidden', 'true'));
    expect(
      skeletons.some((s) => within(s).queryByTestId('announcement-card-skeleton-media')),
    ).toBe(true);

    await waitFor(() =>
      expect(screen.queryAllByTestId('announcement-card-skeleton')).toHaveLength(0),
    );
    expect(section).toHaveAttribute('aria-busy', 'false');
  });

  it('replaces the skeleton with real content once the feed resolves, with no extra tab stops', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })),
      http.get(`${FUNCTIONS_BASE}/announcement`, async () => {
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({
          items: [
            {
              id: 'a1',
              authorId: 'u9',
              authorName: 'The Ortegas',
              authorAvatarUrl: null,
              content: 'hi there',
              mediaUrl: null,
              mediaType: null,
              createdAt: '2026-06-01T00:00:00Z',
              updatedAt: '2026-06-01T00:00:00Z',
              reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
              myReaction: null,
              isAuthor: false,
            },
          ],
          nextCursor: null,
        });
      }),
      http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json([])),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    // While pending, aria-hidden skeletons must not surface as accessible
    // "article" roles — nothing focusable should be introduced by the loading
    // state.
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    const realCard = await screen.findByRole('article');
    expect(within(realCard).getByText('hi there')).toBeInTheDocument();
    expect(screen.queryAllByTestId('announcement-card-skeleton')).toHaveLength(0);
  });

  it('shows aria-hidden skeleton rows (not Loading…) while the Community rail is pending', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })),
      http.get(`${FUNCTIONS_BASE}/announcement`, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
      http.get(`${FUNCTIONS_BASE}/community/recent`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const rows = screen.getAllByTestId('community-skeleton-row');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r).toHaveAttribute('aria-hidden', 'true'));
    expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryAllByTestId('community-skeleton-row')).toHaveLength(0),
    );
    expect(await screen.findByText(/no other families yet/i)).toBeInTheDocument();
  });
});
