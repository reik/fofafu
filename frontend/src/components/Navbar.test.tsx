import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, handlers, FUNCTIONS_BASE } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/lib/supabaseClient';
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

  it('shows the full user.name on the chip, not a first-name extraction, truncated past 24 chars', async () => {
    // Household display name, not a personal name — this app has no
    // separate first-name field, and "The Anderson Family".split(' ')[0]
    // ("The") is not a usable identifier. Regression guard for that bug.
    useAuthStore.getState().setAuth({
      token: 'jwt',
      user: { id: 'u2', email: 'b@c.com', name: 'The Extraordinarily Long Winslow-Fitzgerald Family', city: 'Tempe', state: 'AZ' },
    });
    server.use(http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })));

    renderWithProviders(<Navbar />, { route: '/' });

    const chip = screen.getByRole('button', { name: /the extraordinarily long winslow-fitzgerald family account menu/i });
    expect(chip).toBeInTheDocument();
    // Truncation is CSS-driven (max-w-[24ch] truncate, matching the
    // precedent in community-playdate-badge.md) — the full name stays in the
    // DOM/accessible name; jsdom can't compute the visual clip, so assert
    // the class hook is present instead.
    expect(screen.getByText('The Extraordinarily Long Winslow-Fitzgerald Family')).toHaveClass('truncate', 'max-w-[24ch]');
  });

  it('reveals sign out behind the account chip, clears auth, and routes to /login', async () => {
    setAuthed();
    server.use(http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })));
    server.use(handlers.signOutOk());

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

  it('invalidates the actual Supabase session on sign out, not just local store state', async () => {
    // Regression test: clicking "Sign out" used to only clear the Zustand
    // store and navigate, without ever calling supabase.auth.signOut(). The
    // persisted GoTrue session in localStorage survived, so a reload (or the
    // background token-refresh / onAuthStateChange sync) silently signed the
    // user back in — "Sign out" appeared to work but didn't. Spying (not
    // mocking) supabase.auth.signOut lets the real call still hit the msw
    // network boundary via handlers.signOutOk(), per this repo's "mock at
    // the network boundary, not at module level" rule.
    setAuthed();
    server.use(http.get(`${FUNCTIONS_BASE}/message/unread/count`, () => HttpResponse.json({ count: 0 })));
    server.use(handlers.signOutOk());
    const signOutSpy = vi.spyOn(supabase.auth, 'signOut');

    renderWithProviders(
      <Routes>
        <Route path="/" element={<Navbar />} />
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>,
      { route: '/' },
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});
