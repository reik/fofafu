import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { CommentList } from './CommentList';
import type { CommentDTO } from '@/api/announcements';

const baseComment = {
  id: 'c1',
  announcementId: 'a1',
  authorId: 'u-commenter',
  authorName: 'The Patels',
  content: 'thinking of you',
  createdAt: '2026-05-17T11:00:00Z',
  updatedAt: '2026-05-17T11:00:00Z',
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

describe('CommentList edit affordance gating', () => {
  it('shows no Edit button for a comment authored by another family', () => {
    renderWithProviders(<CommentList comments={[baseComment]} />);
    const item = screen.getByText('thinking of you').closest('li') as HTMLElement;
    expect(within(item).queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('shows Edit (alongside Delete) when isAuthor is true', () => {
    const own = { ...baseComment, isAuthor: true } as unknown as CommentDTO;
    renderWithProviders(<CommentList comments={[own]} />);
    const item = screen.getByText('thinking of you').closest('li') as HTMLElement;
    expect(within(item).getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });
});

describe('CommentList inline edit flow', () => {
  it('clicking Edit reveals a textbox pre-filled with the current content + Save and Cancel controls', async () => {
    const own = { ...baseComment, isAuthor: true } as unknown as CommentDTO;
    renderWithProviders(<CommentList comments={[own]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textbox.value).toBe('thinking of you');
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('Save submits PATCH /api/comments/:id and the updated content renders in place', async () => {
    const own = { ...baseComment, isAuthor: true } as unknown as CommentDTO;
    let received: { content: string } | null = null;
    server.use(
      http.patch('/api/comments/c1', async ({ request }) => {
        received = (await request.json()) as { content: string };
        return HttpResponse.json({
          ...own,
          content: received.content,
          updatedAt: '2026-05-17T11:05:00Z',
        });
      }),
    );

    renderWithProviders(<CommentList comments={[own]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.clear(textbox);
    await user.type(textbox, 'thinking of you all');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await screen.findByText('thinking of you all');
    expect(received).toEqual({ content: 'thinking of you all' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('Cancel restores the original render and never fires a network call', async () => {
    const own = { ...baseComment, isAuthor: true } as unknown as CommentDTO;
    let calls = 0;
    server.use(
      http.patch('/api/comments/c1', () => {
        calls += 1;
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<CommentList comments={[own]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.clear(textbox);
    await user.type(textbox, 'never sent');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('thinking of you')).toBeInTheDocument();
    expect(screen.queryByText('never sent')).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('CommentList "(edited)" indicator', () => {
  it('renders the (edited) indicator when updatedAt is strictly greater than createdAt', () => {
    const edited = {
      ...baseComment,
      createdAt: '2026-05-17T11:00:00Z',
      updatedAt: '2026-05-17T11:05:00Z',
    } as unknown as CommentDTO;
    renderWithProviders(<CommentList comments={[edited]} />);
    const item = screen.getByText('thinking of you').closest('li') as HTMLElement;
    expect(within(item).getByText(/\(edited\)/i)).toBeInTheDocument();
  });

  it('does NOT render the (edited) indicator when updatedAt equals createdAt', () => {
    // baseComment already has updatedAt === createdAt.
    renderWithProviders(<CommentList comments={[baseComment]} />);
    const item = screen.getByText('thinking of you').closest('li') as HTMLElement;
    expect(within(item).queryByText(/\(edited\)/i)).toBeNull();
  });
});
