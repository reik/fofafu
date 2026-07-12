import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import FamilyViewPage from './FamilyView';

const VIEWED_FAMILY_ID = '00000000-0000-0000-0000-0000000000aa';
const VIEWED_OWNER_ID = 'u-other';

function setAuthed() {
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'u-me', email: 'me@example.com', name: 'Me', city: 'Phoenix', state: 'AZ' },
  });
}

function renderRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/family/:id" element={<FamilyViewPage />} />
    </Routes>,
    { route: `/family/${VIEWED_FAMILY_ID}` },
  );
}

const otherFamily = {
  id: VIEWED_FAMILY_ID,
  ownerId: VIEWED_OWNER_ID,
  name: 'Lee',
  bio: 'family of four',
  kidCount: null,
  avatarUrl: null,
  isOwner: false,
  updatedAt: '2026-05-17T00:00:00Z',
};

describe('FamilyView — Recent posts integration', () => {
  it('renders the Recent posts section on a non-owner family page (below header + Message CTA)', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/${VIEWED_FAMILY_ID}`, () => HttpResponse.json(otherFamily)),
      http.get(`${FUNCTIONS_BASE}/announcement`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'a-1',
              authorId: VIEWED_OWNER_ID,
              authorName: 'The Lees',
              authorAvatarUrl: null,
              content: 'first post from Lees',
              mediaUrl: null,
              mediaType: null,
              createdAt: '2026-05-17T10:00:00Z',
              updatedAt: '2026-05-17T10:00:00Z',
              reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
              myReaction: null,
              isAuthor: false,
            },
          ],
          nextCursor: null,
        }),
      ),
    );

    renderRoute();

    // Header
    expect(await screen.findByText(/the lee family/i)).toBeInTheDocument();
    // Message CTA (visible because the viewer is not the owner)
    const messageCta = screen.getByRole('link', { name: /message this family/i });
    expect(messageCta).toHaveAttribute('href', `/messages/${VIEWED_OWNER_ID}`);
    // Recent posts section
    const heading = await screen.findByRole('heading', { name: /recent posts/i });
    expect(heading).toBeInTheDocument();
    expect(await screen.findByText('first post from Lees')).toBeInTheDocument();
  });

  it('renders the empty-state copy when the family has no posts', async () => {
    setAuthed();
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/${VIEWED_FAMILY_ID}`, () => HttpResponse.json(otherFamily)),
      http.get(`${FUNCTIONS_BASE}/announcement`, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
    );

    renderRoute();

    expect(await screen.findByRole('heading', { name: /recent posts/i })).toBeInTheDocument();
    expect(await screen.findByText(/no posts from this family yet/i)).toBeInTheDocument();
  });

  it('forwards the viewed familyId on the announcements request', async () => {
    setAuthed();
    let captured: string | null = null;
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/${VIEWED_FAMILY_ID}`, () => HttpResponse.json(otherFamily)),
      http.get(`${FUNCTIONS_BASE}/announcement`, ({ request }) => {
        captured = new URL(request.url).searchParams.get('familyId');
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    renderRoute();

    await screen.findByText(/no posts from this family yet/i);
    expect(captured).toBe(VIEWED_FAMILY_ID);
  });
});
