import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { RouteError } from './RouteError';

function Boom(): never {
  throw new Error('kaboom');
}

function mountBrokenRoute() {
  const router = createMemoryRouter(
    [{ path: '/', element: <Boom />, errorElement: <RouteError /> }],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
}

describe('RouteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_announce_a_friendly_error_when_a_route_throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountBrokenRoute();
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('should_not_leak_the_raw_error_message_to_the_user', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountBrokenRoute();
    expect(screen.queryByText(/kaboom/i)).not.toBeInTheDocument();
  });

  it('should_offer_a_link_back_home', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountBrokenRoute();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });
});
