import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

/**
 * Layout route that guards every nested route behind a signed-in session.
 * Mount it as a pathless parent: `{ element: <RequireAuth />, children: [...] }`.
 */
export function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
