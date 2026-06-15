import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import FeedPage from './Feed';
import type { AnnouncementDTO, FeedPage as FeedPageDTO } from '@/api/announcements';

/**
 * Virtualized lists (react-virtualized / react-virtuoso / @tanstack/react-virtual)
 * rely on browser layout APIs that jsdom does not implement:
 *  - ResizeObserver (used to measure the scroll container + items)
 *  - Element.getBoundingClientRect / clientHeight / clientWidth (used to compute
 *    the visible window)
 *
 * Without these, most virtualizers either throw, or fall back to rendering
 * nothing (because the measured viewport is 0x0). We polyfill a generously
 * sized viewport so the virtualizer's "visible + overscan" window covers all
 * items in these tests — this lets us assert on rendered content while still
 * exercising the real virtualized component (not a mock of it).
 */
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: 1000,
      height: 1000,
      top: 0,
      left: 0,
      bottom: 1000,
      right: 1000,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeAnnouncement(overrides: Partial<AnnouncementDTO> & { id: string; createdAt: string }): AnnouncementDTO {
  return {
    authorId: 'u1',
    authorName: 'The Garcias',
    authorAvatarUrl: null,
    content: 'hello from the Garcias',
    mediaUrl: null,
    mediaType: null,
    updatedAt: overrides.createdAt,
    reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
    myReaction: null,
    isAuthor: false,
    ...overrides,
  } as AnnouncementDTO;
}

const PAGE_1: FeedPageDTO = {
  items: [
    makeAnnouncement({ id: 'a3', createdAt: '2026-06-14T12:00:00Z', content: 'Newest post' }),
    makeAnnouncement({
      id: 'a2',
      createdAt: '2026-06-13T12:00:00Z',
      content:
        'A much longer post with lots of content. '.repeat(20) +
        '\nIt also has multiple lines\nto force a tall card.',
    }),
    makeAnnouncement({ id: 'a1', createdAt: '2026-06-12T12:00:00Z', content: 'Oldest post on page 1' }),
  ],
  nextCursor: 'cursor-page-2',
};

const PAGE_2: FeedPageDTO = {
  items: [
    makeAnnouncement({ id: 'a0', createdAt: '2026-06-11T12:00:00Z', content: 'Older post from page 2' }),
  ],
  nextCursor: null,
};

function mockFeed({ delayMs = 0 }: { delayMs?: number } = {}) {
  server.use(
    http.get('/api/announcements', async ({ request }) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const url = new URL(request.url);
      const cursor = url.searchParams.get('cursor');
      return HttpResponse.json(cursor === 'cursor-page-2' ? PAGE_2 : PAGE_1);
    }),
  );
}

describe('FeedPage', () => {
  it('shows a loading state while the first page is fetching', async () => {
    mockFeed({ delayMs: 50 });
    renderWithProviders(<FeedPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
  });

  it('shows an error state when the feed request fails', async () => {
    server.use(
      http.get('/api/announcements', () =>
        HttpResponse.json({ error: 'Could not load the feed.' }, { status: 500 }),
      ),
    );
    renderWithProviders(<FeedPage />);

    expect(await screen.findByText(/could not load the feed/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no posts', async () => {
    server.use(
      http.get('/api/announcements', () =>
        HttpResponse.json({ items: [], nextCursor: null } satisfies FeedPageDTO),
      ),
    );
    renderWithProviders(<FeedPage />);

    expect(await screen.findByText(/no posts yet/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('renders the composer above the feed', async () => {
    mockFeed();
    renderWithProviders(<FeedPage />);

    // The composer's textarea is the "What's going on?" field.
    expect(await screen.findByLabelText(/what's going on/i)).toBeInTheDocument();
    // Exact match: the feed also renders a "Load older posts" button, which
    // would also match a loose /post/i name pattern.
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('renders posts newest-first', async () => {
    mockFeed();
    renderWithProviders(<FeedPage />);

    const articles = await screen.findAllByRole('article');
    expect(articles.length).toBeGreaterThanOrEqual(3);

    const [first] = articles;
    const last = articles[articles.length - 1];
    if (!first || !last) throw new Error('expected at least one article');

    // First rendered card should be the newest post (a3), last the oldest of page 1 (a1).
    expect(within(first).getByText('Newest post')).toBeInTheDocument();
    expect(within(last).getByText(/oldest post on page 1/i)).toBeInTheDocument();
  });

  it('renders variable-height cards (long content) alongside short ones without losing content', async () => {
    mockFeed();
    renderWithProviders(<FeedPage />);

    const articles = await screen.findAllByRole('article');
    const longCard = articles.find((a) => /a much longer post/i.test(a.textContent ?? ''));
    expect(longCard).toBeTruthy();
    expect(longCard?.textContent).toContain('It also has multiple lines');

    // Presence/no-data-loss check only: with the fixed 1000x1000
    // getBoundingClientRect polyfill (see beforeEach above), jsdom cannot
    // verify pixel-level layout, so this does not assert "no overlap or
    // clipping" (AC #3) — that is covered by the real-browser Playwright
    // suite (### E2E coverage). This just confirms a long, multi-line post
    // and short posts are all simultaneously present in the DOM with their
    // full text intact (no item dropped by measureElement/estimateSize reflow).
    expect(screen.getByText('Newest post')).toBeInTheDocument();
    expect(screen.getByText(/oldest post on page 1/i)).toBeInTheDocument();
  });

  it('loads older posts when "Load older posts" is clicked, preserving newest-first order', async () => {
    mockFeed();
    renderWithProviders(<FeedPage />);

    await screen.findByText('Newest post');

    const loadMore = screen.getByRole('button', { name: /load older posts/i });
    const user = userEvent.setup();
    await user.click(loadMore);

    await screen.findByText(/older post from page 2/i);

    const articles = await screen.findAllByRole('article');
    const [first] = articles;
    const last = articles[articles.length - 1];
    if (!first || !last) throw new Error('expected at least one article');

    // Page 2's item is older than everything in page 1, so it should be last.
    expect(within(last).getByText(/older post from page 2/i)).toBeInTheDocument();
    // Newest post from page 1 should still be first.
    expect(within(first).getByText('Newest post')).toBeInTheDocument();

    // No further pages: the button should be gone once nextCursor is null.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /load older posts/i })).toBeNull(),
    );
  });
});
