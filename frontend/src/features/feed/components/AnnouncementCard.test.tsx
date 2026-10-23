import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { AnnouncementCard } from './AnnouncementCard';
import type { AnnouncementDTO } from '@/api/announcements';

const baseAnnouncement = {
  id: 'a1',
  authorId: 'u-author',
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
} as unknown as AnnouncementDTO;

describe('AnnouncementCard author display', () => {
  it('renders the author family name as a link to /family/:authorId when authorName is present', () => {
    renderWithProviders(<AnnouncementCard announcement={baseAnnouncement} />);

    const article = screen.getByRole('article');
    const link = within(article).getByRole('link', { name: /the garcias/i });
    expect(link).toHaveAttribute('href', '/family/u-author');
  });

  it('falls back to a non-link "A former member" label when authorName is null', () => {
    const orphaned = { ...baseAnnouncement, authorName: null } as unknown as AnnouncementDTO;
    renderWithProviders(<AnnouncementCard announcement={orphaned} />);

    const article = screen.getByRole('article');
    expect(within(article).getByText(/a former member/i)).toBeInTheDocument();
    // Must NOT be rendered as a link — no broken /family/<uuid> profile target.
    expect(within(article).queryByRole('link', { name: /a former member/i })).toBeNull();
  });

  it('never renders the raw author UUID in the visible card text', () => {
    renderWithProviders(<AnnouncementCard announcement={baseAnnouncement} />);
    const article = screen.getByRole('article');
    expect(article.textContent ?? '').not.toContain('u-author');
  });
});

describe('AnnouncementCard author avatar', () => {
  it('renders an avatar image next to the author name when authorAvatarUrl is set', () => {
    const withAvatar = {
      ...baseAnnouncement,
      authorAvatarUrl: 'https://example.com/garcia.jpg',
    } as unknown as AnnouncementDTO;
    const { container } = renderWithProviders(<AnnouncementCard announcement={withAvatar} />);

    const article = screen.getByRole('article');
    const img = container.querySelector('img[alt=""]');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/garcia.jpg');
    // Avatar sits in the header next to the author name link.
    expect(within(article).getByRole('link', { name: /the garcias/i })).toBeInTheDocument();
  });

  it('renders the initial-letter circle fallback when authorAvatarUrl is null but authorName is present', () => {
    const { container } = renderWithProviders(<AnnouncementCard announcement={baseAnnouncement} />);

    expect(container.querySelector('img')).toBeNull();
    const article = screen.getByRole('article');
    expect(within(article).getByText('T')).toBeInTheDocument();
  });

  it('renders a neutral placeholder avatar (no crash, no broken image) when the author family is deleted', () => {
    const orphaned = {
      ...baseAnnouncement,
      authorName: null,
      authorAvatarUrl: null,
    } as unknown as AnnouncementDTO;
    const { container } = renderWithProviders(<AnnouncementCard announcement={orphaned} />);

    const article = screen.getByRole('article');
    expect(container.querySelector('img')).toBeNull();
    // Neutral placeholder renders as an inline svg icon, not an initial letter.
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(within(article).getByText(/a former member/i)).toBeInTheDocument();
  });
});

describe('AnnouncementCard moderation menu', () => {
  it('offers a "More actions" trigger for a post authored by another family', () => {
    renderWithProviders(<AnnouncementCard announcement={baseAnnouncement} />);
    expect(within(screen.getByRole('article')).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('does not offer a moderation trigger on the viewer\'s own post', () => {
    const own = { ...baseAnnouncement, isAuthor: true } as unknown as AnnouncementDTO;
    renderWithProviders(<AnnouncementCard announcement={own} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('replaces the whole card with a blocked-content placeholder once its author is blocked from this menu', async () => {
    server.use(
      http.post(`${FUNCTIONS_BASE}/moderation/blocks`, () =>
        HttpResponse.json({ blockerFamilyId: 'f-me', blockedFamilyId: 'f-garcia', createdAt: '2026-09-04T00:00:00Z' }, { status: 201 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AnnouncementCard announcement={baseAnnouncement} />);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: /block the garcias/i }));

    expect(await screen.findByText(/you've blocked the the garcias family — their posts are now hidden/i)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('hello from the Garcias')).not.toBeInTheDocument();
  });
});
