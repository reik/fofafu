import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { FamilyRecentPosts } from './FamilyRecentPosts';

const FAMILY_ID = '00000000-0000-0000-0000-000000000001';

const announcement = {
  id: '00000000-0000-0000-0000-000000000010',
  authorId: 'u1',
  authorName: 'The Garcias',
  authorAvatarUrl: null,
  content: 'hello from the Garcias',
  mediaUrl: null,
  mediaType: null,
  createdAt: '2026-05-19T00:00:00Z',
  updatedAt: '2026-05-19T00:00:00Z',
  reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
  myReaction: null,
  isAuthor: false,
};

describe('FamilyRecentPosts', () => {
  it('renders the section heading and a post when the family has posts', async () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/announcement`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('familyId')).toBe(FAMILY_ID);
        return HttpResponse.json({ items: [announcement], nextCursor: null });
      }),
    );

    renderWithProviders(<FamilyRecentPosts familyId={FAMILY_ID} />);

    expect(await screen.findByRole('heading', { name: /recent posts/i })).toBeInTheDocument();
    expect(await screen.findByText(/hello from the garcias/i)).toBeInTheDocument();
  });

  it('renders the warm empty state when the family has no posts', async () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/announcement`, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
    );

    renderWithProviders(<FamilyRecentPosts familyId={FAMILY_ID} />);

    expect(
      await screen.findByText(/no posts from this family yet\./i),
    ).toBeInTheDocument();
  });

  it('renders a readable error when the request fails', async () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/announcement`, () =>
        HttpResponse.json({ error: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<FamilyRecentPosts familyId={FAMILY_ID} />);

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('renders a Load older posts button when nextCursor is present', async () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/announcement`, () =>
        HttpResponse.json({ items: [announcement], nextCursor: 'cursor-2' }),
      ),
    );

    renderWithProviders(<FamilyRecentPosts familyId={FAMILY_ID} />);

    expect(
      await screen.findByRole('button', { name: /load older posts/i }),
    ).toBeInTheDocument();
  });
});
