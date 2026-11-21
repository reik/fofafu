import { describe, it, expect } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { useAuthStore } from '@/stores/auth';
import { RequireAuth } from './RequireAuth';

function ProtectedView() {
  return <div>secret</div>;
}
function LoginView() {
  return <div>please sign in</div>;
}

function renderGuardedApp() {
  renderWithProviders(
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<ProtectedView />} />
      </Route>
      <Route path="/login" element={<LoginView />} />
    </Routes>,
    { route: '/' },
  );
}

describe('RequireAuth', () => {
  it('redirects to /login when no token is in the store', () => {
    useAuthStore.getState().clear();
    renderGuardedApp();
    expect(screen.getByText(/please sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it('renders the nested route when a token exists', () => {
    useAuthStore.getState().setAuth({
      token: 'real-jwt',
      user: { id: 'u1', email: 'a@b.com', name: 'X', city: 'Y', state: 'Z' },
    });
    renderGuardedApp();
    expect(screen.getByText(/secret/i)).toBeInTheDocument();
  });
});
