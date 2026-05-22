import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { CommentForm } from './CommentForm';

describe('CommentForm', () => {
  it('submits the comment and clears the textarea', async () => {
    let body: { content: string } | null = null;
    server.use(
      http.post('/api/announcements/a1/comments', async ({ request }) => {
        body = (await request.json()) as { content: string };
        return HttpResponse.json({
          id: 'c1', announcementId: 'a1', authorId: 'u1', authorName: 'Test Family',
          content: body.content, createdAt: '2026-05-17T10:00:00Z',
          updatedAt: '2026-05-17T10:00:00Z', isAuthor: true,
        }, { status: 201 });
      }),
    );

    renderWithProviders(<CommentForm announcementId="a1" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'kind thought');
    await user.click(screen.getByRole('button', { name: /comment/i }));

    await screen.findByRole('button', { name: /comment/i });
    expect(body).toEqual({ content: 'kind thought' });
    expect(textarea.value).toBe('');
  });
});
