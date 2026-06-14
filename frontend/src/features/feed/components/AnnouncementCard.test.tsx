import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { AnnouncementCard } from './AnnouncementCard';
import type { AnnouncementDTO } from '@/api/announcements';

const baseAnnouncement = {
  id: 'a1',
  authorId: 'u-author',
  authorName: 'The Garcias',
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
  it('renders the author avatar image inside the family link when authorAvatarUrl is set', () => {
    const withAvatar = { ...baseAnnouncement, authorAvatarUrl: 'https://example.com/garcia.png' } as unknown as AnnouncementDTO;
    const { container } = renderWithProviders(<AnnouncementCard announcement={withAvatar} />);

    const article = screen.getByRole('article');
    const avatar = container.querySelector('img');
    expect(avatar).toHaveAttribute('src', 'https://example.com/garcia.png');

    const link = within(article).getByRole('link', { name: /the garcias/i });
    expect(link.contains(avatar)).toBe(true);
  });

  it('renders an initial-letter placeholder inside the family link when authorAvatarUrl is missing', () => {
    const noAvatar = { ...baseAnnouncement, authorAvatarUrl: null } as unknown as AnnouncementDTO;
    const { container } = renderWithProviders(<AnnouncementCard announcement={noAvatar} />);

    const article = screen.getByRole('article');
    expect(container.querySelector('img')).toBeNull();

    const link = within(article).getByRole('link', { name: /the garcias/i });
    expect(within(link).getByText('T')).toBeInTheDocument();
  });
});
