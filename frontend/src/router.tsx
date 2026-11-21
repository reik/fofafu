import { Navigate, createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import LoginPage from '@/pages/Login';
import RegisterPage from '@/pages/Register';
import VerifyEmailPage from '@/pages/VerifyEmail';
import HomePage from '@/pages/Home';
import FamilyMePage from '@/pages/FamilyMe';
import FamilyViewPage from '@/pages/FamilyView';
import FeedPage from '@/pages/Feed';
import AnnouncementDetailPage from '@/pages/AnnouncementDetail';
import MessagesPage from '@/pages/Messages';
import MessageThreadPage from '@/pages/MessageThread';
import SearchPage from '@/pages/Search';
import PlaydatesPage from '@/pages/PlaydatesPage/PlaydatesPage';
import AdminPage from '@/pages/AdminPage/AdminPage';
import { RequireAuth } from '@/components/RequireAuth';
import { RouteError } from '@/components/RouteError';

export const routes = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/family/me', element: <FamilyMePage /> },
          { path: '/family/:id', element: <FamilyViewPage /> },
          { path: '/feed', element: <FeedPage /> },
          { path: '/post/:id', element: <AnnouncementDetailPage /> },
          { path: '/messages', element: <MessagesPage /> },
          { path: '/messages/:userId', element: <MessageThreadPage /> },
          { path: '/search', element: <SearchPage /> },
          { path: '/playdates', element: <PlaydatesPage /> },
          { path: '/admin', element: <AdminPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
] satisfies RouteObject[];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
