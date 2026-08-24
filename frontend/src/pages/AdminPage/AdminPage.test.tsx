import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE, SUPABASE_URL } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import AdminPage from './AdminPage';

const REST_BASE = `${SUPABASE_URL}/rest/v1`;

function setAuthed(): void {
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'admin-1', email: 'admin@fofafu.dev', name: 'Admin', city: 'Phoenix', state: 'AZ' },
  });
}

function mockIsAdmin(value: boolean) {
  server.use(http.post(`${REST_BASE}/rpc/is_admin`, () => HttpResponse.json(value)));
}

const ONE_USER = [{
  id: 'u-1',
  familyId: 'fam-1',
  name: 'Garcia',
  bio: '',
  kidCount: 2,
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  email: 'garcia@example.com',
  banned: false,
}];

describe('AdminPage', () => {
  it('does not show admin content to a non-admin', async () => {
    setAuthed();
    mockIsAdmin(false);
    renderWithProviders(<AdminPage />, { route: '/admin' });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the Users view for an admin, and can ban a user', async () => {
    setAuthed();
    mockIsAdmin(true);
    let banned = false;
    server.use(
      http.get(`${FUNCTIONS_BASE}/admin/users`, () =>
        HttpResponse.json([{ ...ONE_USER[0], banned }]),
      ),
      http.post(`${FUNCTIONS_BASE}/admin/users/u-1/ban`, () => {
        banned = true;
        return HttpResponse.json({ id: 'u-1', banned: true });
      }),
    );
    renderWithProviders(<AdminPage />, { route: '/admin' });

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(await screen.findByText('Garcia')).toBeInTheDocument();
    expect(screen.getByText('garcia@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ban' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ban' })).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Unban' })).toBeInTheDocument();
  });

  it('Content tab: edits an announcement and deletes it', async () => {
    setAuthed();
    mockIsAdmin(true);
    let row: { id: string; user_id: string; content: string; media_url: null; media_type: null; created_at: string; updated_at: string } | null = {
      id: 'a-1',
      user_id: 'u-1',
      content: 'original text',
      media_url: null,
      media_type: null,
      created_at: 't1',
      updated_at: 't1',
    };
    server.use(
      http.get(`${FUNCTIONS_BASE}/admin/users`, () => HttpResponse.json([])),
      http.get(`${FUNCTIONS_BASE}/admin/content/announcements`, () => HttpResponse.json(row ? [row] : [])),
      http.patch(`${FUNCTIONS_BASE}/admin/content/announcements/a-1`, async ({ request }) => {
        const body = (await request.json()) as { content: string };
        row = { ...row!, content: body.content, updated_at: 't2' };
        return HttpResponse.json(row);
      }),
      http.delete(`${FUNCTIONS_BASE}/admin/content/announcements/a-1`, () => {
        row = null;
        return HttpResponse.json({ deleted: true });
      }),
    );
    renderWithProviders(<AdminPage />, { route: '/admin' });

    await userEvent.click(await screen.findByRole('tab', { name: 'Content' }));
    expect(await screen.findByText('original text')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textbox = screen.getByDisplayValue('original text');
    await userEvent.clear(textbox);
    await userEvent.type(textbox, 'edited text');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('edited text')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('edited text')).not.toBeInTheDocument());
  });

  it('Messages tab: shows the private-conversation banner and supports edit + delete', async () => {
    setAuthed();
    mockIsAdmin(true);
    let row: { id: string; sender_id: string; receiver_id: string; content: string; read: boolean; created_at: string } | null = {
      id: 'm-1',
      sender_id: 'ua',
      receiver_id: 'ub',
      content: 'hey there',
      read: true,
      created_at: 't1',
    };
    server.use(
      http.get(`${FUNCTIONS_BASE}/admin/users`, () => HttpResponse.json([])),
      http.get(`${FUNCTIONS_BASE}/admin/messages/ua/ub`, () => HttpResponse.json(row ? [row] : [])),
      http.patch(`${FUNCTIONS_BASE}/admin/messages/m-1`, async ({ request }) => {
        const body = (await request.json()) as { content: string };
        row = { ...row!, content: body.content };
        return HttpResponse.json(row);
      }),
      http.delete(`${FUNCTIONS_BASE}/admin/messages/m-1`, () => {
        row = null;
        return HttpResponse.json({ deleted: true });
      }),
    );
    renderWithProviders(<AdminPage />, { route: '/admin' });

    await userEvent.click(await screen.findByRole('tab', { name: 'Messages' }));
    await userEvent.type(screen.getByLabelText('User A id'), 'ua');
    await userEvent.type(screen.getByLabelText('User B id'), 'ub');
    await userEvent.click(screen.getByRole('button', { name: 'Load conversation' }));

    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText(/private conversation/i)).toBeInTheDocument();
    expect(await screen.findByText('hey there')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textbox = screen.getByDisplayValue('hey there');
    await userEvent.clear(textbox);
    await userEvent.type(textbox, 'edited message');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('edited message')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('edited message')).not.toBeInTheDocument());
  });
});
