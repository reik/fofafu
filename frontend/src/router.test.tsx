import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { providerFutureFlags, routerFutureFlags, routes } from './router';

function mountApp(initialPath: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: [initialPath],
    future: routerFutureFlags,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={providerFutureFlags} />
    </QueryClientProvider>,
  );
  return router;
}

function signIn() {
  useAuthStore.getState().setAuth({
    token: 'real-jwt',
    user: { id: 'u1', email: 'a@b.com', name: 'X', city: 'Y', state: 'Z' },
  });
}

describe('app router', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('should_redirect_to_login_when_unauthenticated_visits_protected_route', () => {
    const router = mountApp('/feed');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should_remember_the_original_path_when_redirecting_to_login', () => {
    const router = mountApp('/feed');
    expect(router.state.location.state).toEqual({ from: '/feed' });
  });

  it('should_render_the_login_form_after_the_redirect', () => {
    mountApp('/messages');
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('should_keep_register_public_when_unauthenticated', () => {
    const router = mountApp('/register');
    expect(router.state.location.pathname).toBe('/register');
  });

  it('should_redirect_unknown_paths_to_home_when_authenticated', () => {
    signIn();
    const router = mountApp('/definitely-not-a-page');
    expect(router.state.location.pathname).toBe('/');
  });

  it('should_stay_on_a_protected_route_when_authenticated', () => {
    signIn();
    const router = mountApp('/feed');
    expect(router.state.location.pathname).toBe('/feed');
  });
});
