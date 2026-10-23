import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { expectNoA11yViolations } from '@/tests/a11y';
import { resetCoachSessionCacheForTests } from './CoachChip/useCoach';
import { CommentForm } from './CommentForm';

describe('CommentForm', () => {
  beforeEach(() => {
    resetCoachSessionCacheForTests();
  });

  it('submits the comment and clears the textarea', async () => {
    let body: { content: string } | null = null;
    server.use(
      http.post(`${FUNCTIONS_BASE}/announcement/a1/comments`, async ({ request }) => {
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

  it('renders no coach chip when the coach responds with verdict=ok', async () => {
    server.use(http.post(`${FUNCTIONS_BASE}/coach`, () => HttpResponse.json({
      verdict: 'ok', categories: [], reasoning: '', rewrite: null,
    })));

    renderWithProviders(<CommentForm announcementId="a1" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'At least you got to keep her for a while.');
    await user.tab();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: 'Suggested rewrite' })).not.toBeInTheDocument();
  });

  it('renders no coach chip and leaves submit enabled when the coach endpoint 404s', async () => {
    server.use(http.post(`${FUNCTIONS_BASE}/coach`, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })));

    renderWithProviders(<CommentForm announcementId="a1" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'At least you got to keep her for a while.');
    await user.tab();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: 'Suggested rewrite' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comment/i })).toBeEnabled();
  });

  it('does not disable submit while a coach request is in flight', async () => {
    server.use(http.post(`${FUNCTIONS_BASE}/coach`, async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return HttpResponse.json({ verdict: 'ok', categories: [], reasoning: '', rewrite: null });
    }));

    renderWithProviders(<CommentForm announcementId="a1" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'At least you got to keep her for a while.');
    await user.tab();

    expect(screen.getByRole('button', { name: /comment/i })).toBeEnabled();
  });

  it('has no accessibility violations with the coach chip visible', async () => {
    server.use(http.post(`${FUNCTIONS_BASE}/coach`, () => HttpResponse.json({
      verdict: 'suggest',
      categories: ['minimization'],
      reasoning: '"At least" can shrink a loss the family is still carrying.',
      rewrite: "The time you had with her mattered, and I'm sorry it's ending this way.",
    })));

    const { container } = renderWithProviders(<CommentForm announcementId="a1" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'At least you got to keep her for a while.');
    await user.tab();
    await screen.findByRole('region', { name: 'Suggested rewrite' });

    await expectNoA11yViolations(container);
  });
});
