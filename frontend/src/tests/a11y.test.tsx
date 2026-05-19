/**
 * Consolidated a11y audit. One test per top-level surface.
 *
 * Renders the component in a real-ish provider tree (QueryClient + MemoryRouter
 * + msw stubs) and runs axe-core against the rendered DOM.
 *
 * Color-contrast is disabled in the helper because jsdom has no real layout
 * engine; we audit contrast manually in vault/features/a11y-audit.md.
 */
import { describe, it, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { expectNoA11yViolations } from '@/tests/a11y';
import { useAuthStore } from '@/stores/auth';

import LoginPage from '@/pages/Login';
import RegisterPage from '@/pages/Register';
import VerifyEmailPage from '@/pages/VerifyEmail';
import HomePage from '@/pages/Home';
import FamilyMePage from '@/pages/FamilyMe';
import FamilyViewPage from '@/pages/FamilyView';
import FeedPage from '@/pages/Feed';
import AnnouncementDetailPage from '@/pages/AnnouncementDetail';
import MessagesPage from '@/pages/Messages';
import MessageThreadPage from '@/pages/MessageThread';
import SearchPage from '@/pages/Search';

const family = {
  id: '00000000-0000-0000-0000-000000000001',
  ownerId: 'u1',
  name: 'Garcia',
  bio: 'caring for three teens',
  kidCount: 3,
  avatarUrl: null,
  isOwner: true,
  updatedAt: '2026-05-19T00:00:00Z',
};

const announcement = {
  id: '00000000-0000-0000-0000-000000000010',
  authorId: 'u1',
  content: 'hello',
  mediaUrl: null,
  mediaType: null,
  createdAt: '2026-05-19T00:00:00Z',
  updatedAt: '2026-05-19T00:00:00Z',
  reactions: { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 },
  myReaction: null,
  isAuthor: true,
};

function withAuth(): void {
  useAuthStore.getState().setAuth({
    token: 't',
    user: { id: 'u1', email: 'a@b.com', name: 'A', city: 'X', state: 'Y' },
  });
}

beforeEach(() => {
  server.use(
    http.get('/api/family/me', () => HttpResponse.json(family)),
    http.get('/api/family/:id', () => HttpResponse.json({ ...family, isOwner: false, ownerId: 'u-other', kidCount: null })),
    http.get('/api/announcements', () => HttpResponse.json({ items: [announcement], nextCursor: null })),
    http.get('/api/announcements/:id', () => HttpResponse.json(announcement)),
    http.get('/api/announcements/:id/comments', () => HttpResponse.json([])),
    http.get('/api/messages/threads', () => HttpResponse.json([])),
    http.get('/api/messages/threads/:userId', () => HttpResponse.json([])),
    http.get('/api/messages/unread/count', () => HttpResponse.json({ count: 0 })),
    http.get('/api/auth/verify', () => HttpResponse.json({ message: 'Email verified successfully' })),
  );
});

afterEach(() => {
  useAuthStore.getState().clear();
  cleanup();
});

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
}

describe('a11y — pages have no axe-core violations', () => {
  it('Login', async () => {
    const { container } = renderWithProviders(<LoginPage />, { route: '/login' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('Register', async () => {
    const { container } = renderWithProviders(<RegisterPage />, { route: '/register' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('VerifyEmail (with token)', async () => {
    const { container } = renderWithProviders(<VerifyEmailPage />, { route: '/verify-email?token=00000000-0000-0000-0000-000000000099' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('Home (authed)', async () => {
    withAuth();
    const { container } = renderWithProviders(<HomePage />, { route: '/' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('FamilyMe', async () => {
    withAuth();
    const { container } = renderWithProviders(<FamilyMePage />, { route: '/family/me' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('FamilyView', async () => {
    withAuth();
    const { container } = renderWithProviders(<FamilyViewPage />, { route: '/family/00000000-0000-0000-0000-000000000001' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('Feed', async () => {
    withAuth();
    const { container } = renderWithProviders(<FeedPage />, { route: '/feed' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('AnnouncementDetail', async () => {
    withAuth();
    const { container } = renderWithProviders(<AnnouncementDetailPage />, { route: '/post/00000000-0000-0000-0000-000000000010' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('Messages (threads list)', async () => {
    withAuth();
    const { container } = renderWithProviders(<MessagesPage />, { route: '/messages' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('MessageThread', async () => {
    withAuth();
    const { container } = renderWithProviders(<MessageThreadPage />, { route: '/messages/00000000-0000-0000-0000-000000000002' });
    await settle();
    await expectNoA11yViolations(container);
  });

  it('Search', async () => {
    withAuth();
    const { container } = renderWithProviders(<SearchPage />, { route: '/search' });
    await settle();
    await expectNoA11yViolations(container);
  });
});
