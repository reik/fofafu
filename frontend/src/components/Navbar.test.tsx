import { describe, it, expect } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import { Navbar } from './Navbar';

function setAuthed() {
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'u1', email: 'a@b.com', name: 'Jane Doe', city: 'Phoenix', state: 'AZ' },
  });
}

describe('Navbar', () => {
  it('renders icon-only primary links with accessible names and marks the active page', async () => {
    setAuthed();
    server.use(http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })));

    renderWithProviders(<Navbar />, { route: '/family/me' });

    expect(screen.getAllByRole('link', { name: /^home$/i })[0]).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link', { name: /^family$/i })[0]).toHaveAttribute('href', '/family/me');
    expect(screen.getAllByRole('link', { name: /messages/i })[0]).toHaveAttribute('href', '/messages');
    expect(screen.getAllByRole('link', { name: /community/i })[0]).toHaveAttribute('href', '/search');

    // Puck: the active page's link carries aria-current="page".
    const familyLinks = screen.getAllByRole('link', { name: /^family$/i });
    expect(familyLinks.some((el) => el.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('shows an unread-message badge when count > 0', async () => {
    setAuthed();
    server.use(http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 3 })));

    renderWithProviders(<Navbar />, { route: '/' });

    expect(await screen.findAllByLabelText(/messages, 3 unread/i)).not.toHaveLength(0);
  });

  it('reveals sign out behind the account chip, clears auth, and routes to /login', async () => {
    setAuthed();
    server.use(http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })));

    renderWithProviders(
      <Routes>
        <Route path="/" element={<Navbar />} />
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>,
      { route: '/' },
    );

    const user = userEvent.setup();

    // Sign out is not directly reachable until the account chip is opened.
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    expect(useAuthStore.getState().token).toBeNull();
    expect(await screen.findByText(/login screen/i)).toBeInTheDocument();
  });
});
