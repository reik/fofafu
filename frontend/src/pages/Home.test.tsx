import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
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
          },
        ]),
      ),
    );

    renderWithProviders(<HomePage />, { route: '/' });

    const link = await screen.findByRole('link', { name: /garcia/i });
    expect(link).toHaveAttribute('href', '/family/f1');
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
