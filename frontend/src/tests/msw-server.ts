import { setupServer } from 'msw/node';
import { http, HttpResponse, type JsonBodyType } from 'msw';

export const server = setupServer();

// Matches supabaseClient.ts's test env (see vite.config.ts test.env) and
// edgeClient.ts's FUNCTIONS_URL derivation (`${url}/functions/v1`).
export const SUPABASE_URL = 'https://test-project.supabase.co';
export const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
export const GOTRUE_BASE = `${SUPABASE_URL}/auth/v1`;

export interface FakeGoTrueUser {
  id: string;
  email: string;
  name: string;
  city: string;
  state: string;
}

function gotrueSession(user: FakeGoTrueUser) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    refresh_token: 'fake-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { name: user.name, city: user.city, state: user.state },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

export const JANE: FakeGoTrueUser = { id: 'u1', email: 'jane@example.com', name: 'Jane', city: 'Phoenix', state: 'AZ' };

export const handlers = {
  // ---- Supabase Auth (GoTrue) — auth.ts calls supabase-js, which hits these
  // REST endpoints under the hood. This is the network boundary per
  // CLAUDE.md's msw rule; we don't mock the supabase-js module itself. ----
  signUpOk: () =>
    http.post(`${GOTRUE_BASE}/signup`, () => HttpResponse.json(gotrueSession(JANE), { status: 200 })),
  signUpDuplicate: () =>
    http.post(`${GOTRUE_BASE}/signup`, () =>
      HttpResponse.json({ error_code: 'user_already_exists', msg: 'User already registered' }, { status: 422 }),
    ),
  loginOk: (user: FakeGoTrueUser = JANE) =>
    http.post(`${GOTRUE_BASE}/token`, () => HttpResponse.json(gotrueSession(user), { status: 200 })),
  loginInvalidCredentials: () =>
    http.post(`${GOTRUE_BASE}/token`, () =>
      HttpResponse.json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, { status: 400 }),
    ),
  resetPasswordOk: () => http.post(`${GOTRUE_BASE}/recover`, () => HttpResponse.json({}, { status: 200 })),
  updateUserOk: () =>
    http.put(`${GOTRUE_BASE}/user`, () => HttpResponse.json(gotrueSession(JANE).user, { status: 200 })),
  signOutOk: () => http.post(`${GOTRUE_BASE}/logout`, () => new HttpResponse(null, { status: 204 })),

  // ---- Edge Functions (announcement/family/community/search) ----
  announcementsFeed: (body: JsonBodyType = { items: [], nextCursor: null }) =>
    http.get(`${FUNCTIONS_BASE}/announcement`, () => HttpResponse.json(body)),
  announcementsFeedError: () =>
    http.get(`${FUNCTIONS_BASE}/announcement`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
  familyMe: (body: JsonBodyType) => http.get(`${FUNCTIONS_BASE}/family/me`, () => HttpResponse.json(body)),
  familyById: (id: string, body: JsonBodyType) => http.get(`${FUNCTIONS_BASE}/family/${id}`, () => HttpResponse.json(body)),
  communityRecent: (body: JsonBodyType = []) => http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json(body)),
  searchFamilies: (body: JsonBodyType = []) => http.get(`${FUNCTIONS_BASE}/search/families`, () => HttpResponse.json(body)),

  // ---- Legacy Express (unchanged in this migration slice) ----
  messagesUnreadCount: (count = 0) => http.get('/api/messages/unread/count', () => HttpResponse.json({ count })),
};
