import { describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusMainOnRouteChange } from './useFocusMainOnRouteChange';

function TestApp() {
  useFocusMainOnRouteChange();
  const navigate = useNavigate();
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/feed">Feed</Link>
        <Link to="/page#section">Anchor</Link>
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
      </nav>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<h1>Home Page</h1>} />
          <Route path="/feed" element={<h1>Feed Page</h1>} />
          <Route path="/page" element={<h1>Anchor Page</h1>} />
        </Routes>
      </main>
    </div>
  );
}

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TestApp />
    </MemoryRouter>,
  );
}

describe('useFocusMainOnRouteChange', () => {
  it('does not focus <main> on initial render', () => {
    renderAt('/');
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses <main> after navigating to a new pathname', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: /feed/i }));
    expect(screen.getByRole('heading', { name: /feed page/i })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('main'));
  });

  it('does not focus <main> when the destination has a hash (anchor jump)', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: /anchor/i }));
    expect(screen.getByRole('heading', { name: /anchor page/i })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.getElementById('main'));
  });

  it('focuses <main> after browser back navigation (popstate)', async () => {
    const user = userEvent.setup();
    renderAt('/');
    // Forward: / -> /feed
    await user.click(screen.getByRole('link', { name: /feed/i }));
    expect(screen.getByRole('heading', { name: /feed page/i })).toBeInTheDocument();
    // The forward navigation already moved focus to <main>; move it away so the
    // post-back assertion is meaningful.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    // Back: /feed -> /
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('heading', { name: /home page/i })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});
