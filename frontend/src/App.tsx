import { Routes, Route, Navigate } from 'react-router-dom';
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
import { RequireAuth } from '@/components/RequireAuth';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/family/me"
        element={
          <RequireAuth>
            <FamilyMePage />
          </RequireAuth>
        }
      />
      <Route
        path="/family/:id"
        element={
          <RequireAuth>
            <FamilyViewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/feed"
        element={
          <RequireAuth>
            <FeedPage />
          </RequireAuth>
        }
      />
      <Route
        path="/post/:id"
        element={
          <RequireAuth>
            <AnnouncementDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/messages"
        element={
          <RequireAuth>
            <MessagesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/messages/:userId"
        element={
          <RequireAuth>
            <MessageThreadPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
