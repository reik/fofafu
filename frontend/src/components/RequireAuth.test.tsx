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

describe('RequireAuth', () => {
  it('redirects to /login when no token is in the store', () => {
    useAuthStore.getState().clear();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireAuth><ProtectedView /></RequireAuth>} />
        <Route path="/login" element={<LoginView />} />
      </Routes>,
      { route: '/' },
    );
    expect(screen.getByText(/please sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it('renders the protected children when a token exists', () => {
    useAuthStore.getState().setAuth({
      token: 'real-jwt',
      user: { id: 'u1', email: 'a@b.com', name: 'X', city: 'Y', state: 'Z' },
    });
    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireAuth><ProtectedView /></RequireAuth>} />
        <Route path="/login" element={<LoginView />} />
      </Routes>,
      { route: '/' },
    );
    expect(screen.getByText(/secret/i)).toBeInTheDocument();
  });
});
