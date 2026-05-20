import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { CommentList } from './CommentList';
import type { CommentDTO } from '@/api/announcements';

const baseComment = {
  id: 'c1',
  announcementId: 'a1',
  authorId: 'u-commenter',
  authorName: 'The Patels',
  content: 'thinking of you',
  createdAt: '2026-05-17T11:00:00Z',
  isAuthor: false,
} as unknown as CommentDTO;

describe('CommentList author display', () => {
  it('renders the commenter family name as a link to /family/:authorId when authorName is present', () => {
    renderWithProviders(<CommentList comments={[baseComment]} />);
    const link = screen.getByRole('link', { name: /the patels/i });
    expect(link).toHaveAttribute('href', '/family/u-commenter');
  });

  it('falls back to a non-link "A former member" label when authorName is null', () => {
    const orphaned = { ...baseComment, authorName: null } as unknown as CommentDTO;
    renderWithProviders(<CommentList comments={[orphaned]} />);
    expect(screen.getByText(/a former member/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /a former member/i })).toBeNull();
  });

  it('never renders the raw commenter UUID in the visible comment text', () => {
    renderWithProviders(<CommentList comments={[baseComment]} />);
    const item = screen.getByText('thinking of you').closest('li');
    expect(item).not.toBeNull();
    expect(item?.textContent ?? '').not.toContain('u-commenter');
  });
});
