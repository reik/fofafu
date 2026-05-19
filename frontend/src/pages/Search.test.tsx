import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import SearchPage from './Search';

const sampleResult = [{
  id: 'f1',
  ownerId: 'u1',
  name: 'Garcia',
  bio: 'caring for three teens since 2022',
  kidCount: null,
  avatarUrl: null,
  isOwner: false,
  updatedAt: '2026-05-18',
}];

describe('SearchPage', () => {
  it('submits the query and renders result cards', async () => {
    let receivedQ: string | null = null;
    server.use(
      http.get('/api/search/families', ({ request }) => {
        const url = new URL(request.url);
        receivedQ = url.searchParams.get('q');
        return HttpResponse.json(sampleResult);
      }),
    );

    renderWithProviders(<SearchPage />, { route: '/search' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search/i), 'garcia');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/the garcia family/i)).toBeInTheDocument();
    expect(receivedQ).toBe('garcia');
  });

  it('rejects too-short queries client-side without firing the API', async () => {
    let fired = false;
    server.use(
      http.get('/api/search/families', () => {
        fired = true;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<SearchPage />, { route: '/search' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search/i), 'a');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(fired).toBe(false);
  });
});
