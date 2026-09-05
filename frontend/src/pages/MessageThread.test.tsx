import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE, handlers } from '@/tests/msw-server';
import MessageThreadPage from './MessageThread';

const PARTNER_USER_ID = 'u-partner';
const PARTNER_FAMILY_ID = 'f-partner';

const partnerFamily = {
  id: PARTNER_FAMILY_ID,
  ownerId: PARTNER_USER_ID,
  name: 'Anderson',
  bio: '',
  kidCount: null,
  avatarUrl: null,
  isOwner: false,
  updatedAt: '2026-09-01T00:00:00Z',
};

function renderThread() {
  return renderWithProviders(
    <Routes>
      <Route path="/messages/:userId" element={<MessageThreadPage />} />
    </Routes>,
    { route: `/messages/${PARTNER_USER_ID}` },
  );
}

function mockThread() {
  server.use(
    http.get(`${FUNCTIONS_BASE}/message/threads/${PARTNER_USER_ID}`, () =>
      HttpResponse.json([
        { id: 'm1', from: PARTNER_USER_ID, fromName: 'Anderson', to: 'u-me', toName: 'Me', content: 'hi', read: true, createdAt: '2026-09-01T00:00:00Z', mine: false },
      ]),
    ),
    http.get(`${FUNCTIONS_BASE}/message/threads`, () => HttpResponse.json([])),
    http.post(`${FUNCTIONS_BASE}/message/threads/${PARTNER_USER_ID}/read`, () => HttpResponse.json({ marked: 0 })),
    http.get(`${FUNCTIONS_BASE}/family/${PARTNER_USER_ID}`, () => HttpResponse.json(partnerFamily)),
  );
}

describe('MessageThreadPage — blocked partner', () => {
  it('shows no "Blocked" tag/banner and keeps message history + composer when the partner is not blocked', async () => {
    mockThread();
    server.use(handlers.moderationBlocksList([]));
    renderThread();

    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    expect(screen.queryByText(/you've limited this conversation/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /message/i })).toBeEnabled();
  });

  it('shows the header tag + limited-conversation banner while keeping history and an enabled composer (Variant B)', async () => {
    mockThread();
    server.use(handlers.moderationBlocksList([
      { blockerFamilyId: 'f-me', blockedFamilyId: PARTNER_FAMILY_ID, createdAt: '2026-09-02T00:00:00Z' },
    ]));
    renderThread();

    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(await screen.findByText("You've limited this conversation with the Anderson family.")).toBeInTheDocument();
    // History stays, unmodified, per the resolved Open Question.
    expect(screen.getByText('hi')).toBeInTheDocument();
    // Variant B: composer stays enabled — "Message this family" never disables.
    expect(screen.getByRole('textbox', { name: /message/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled();
  });
});
