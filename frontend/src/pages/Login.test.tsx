import { describe, it, expect } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { useAuthStore } from '@/stores/auth';
import LoginPage from './Login';

function HomeStub() {
  return <div>home stub</div>;
}

describe('LoginPage', () => {
  it('redirects to / and never renders the login form or Navbar when already authenticated', () => {
    useAuthStore.getState().setAuth({
      token: 'real-jwt',
      user: { id: 'u1', email: 'a@b.com', name: 'X', city: 'Y', state: 'Z' },
    });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomeStub />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
    );

    expect(screen.getByText(/home stub/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /welcome back/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
  });

  it('renders the login form and no Navbar when unauthenticated', () => {
    useAuthStore.getState().clear();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomeStub />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
    );

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
  });
});
