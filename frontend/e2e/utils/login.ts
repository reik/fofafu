import type { Page } from '@playwright/test';
import type { Session, User } from '@supabase/supabase-js';

/**
 * ## Auth mocking mechanism (fofafu_vault/features/e2e-auth-mocking.md)
 *
 * `loginAs` seeds a synthetic, structurally-valid Supabase session directly
 * into `localStorage` under Supabase's default storage key
 * (`sb-<project-ref>-auth-token`) instead of driving the real `/login` form
 * or intercepting Supabase Auth's REST endpoints with `page.route`. No real
 * Supabase project, credentials, or network access to `*.supabase.co` is
 * required or attempted.
 *
 * Why localStorage seeding won over `page.route` interception (the other
 * option from the feature's Open Questions): it never touches the `/login`
 * form's markup or the exact request/response shape of
 * `POST .../auth/v1/token`, so it's more robust to that UI/API evolving —
 * the only surface this file needs to track is the `Session`/`User` shape
 * `supabase-js` expects in storage, which is stable public API.
 *
 * Why this actually works — verified empirically by reading
 * `@supabase/auth-js`'s `GoTrueClient` source (not assumed):
 *   - supabase-js does NOT verify the JWT signature or expiry against any
 *     key on the client. `decodeJWT()` only requires the token to look like
 *     three base64url segments; it JSON-parses the header/payload segments
 *     and base64url-decodes the third ("signature") segment into raw bytes
 *     *without ever checking it against anything*. Real verification only
 *     happens server-side (GoTrue / Postgres RLS) when the token is actually
 *     sent somewhere over the network — which `loginAs` never does.
 *   - The localStorage bootstrap path (`_isValidSession`, used by both
 *     `getSession()` and the constructor's internal `_recoverAndRefresh()`)
 *     doesn't even call `decodeJWT()`. It only checks that `access_token`,
 *     `refresh_token`, and `expires_at` are *present* on the stored object,
 *     then compares `expires_at` (a plain field on the stored session, not
 *     derived from the token) against `Date.now()`.
 *   - As long as the stored session isn't expired and its `user` is a real
 *     object (not a stripped "user not available" proxy — i.e. we must
 *     store the full `user` inline, which we do), `_recoverAndRefresh()`
 *     fires `onAuthStateChange('SIGNED_IN', session)` on its own during app
 *     bootstrap, with zero network calls. That's what satisfies this
 *     feature's AC3 (`onAuthStateChange` fires like a real sign-in) without
 *     any `page.route` mocking.
 *
 * `loginAs` still navigates to `/login` first (a real, unauthenticated page
 * that renders with no network calls) purely to land on the app's own
 * origin before touching `localStorage` — Playwright can't set localStorage
 * for an origin it hasn't navigated to yet. It then does a full navigation
 * to `/` (`page.goto`, not a same-page SPA route change) so the app's
 * module-level auth bootstrap in `src/stores/auth.ts` re-runs from scratch
 * against the freshly-seeded session, exactly as it would after a real
 * sign-in + redirect.
 *
 * See `frontend/e2e/README.md` for how `playwright.config.ts` supplies
 * fallback `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` values so
 * `src/lib/supabaseClient.ts` (which throws at import without them) can
 * boot at all in a sandbox with no `frontend/.env`.
 *
 * ## Real credentials still take the real path (AC6)
 *
 * This mock is an *additive fallback for sandboxes without credentials*, not
 * a replacement for real E2E runs where a real Supabase project is
 * available. `loginAs` checks `process.env.VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_ANON_KEY` at call time — the exact same env vars
 * `playwright.config.ts` guards on (`if (!process.env.VITE_SUPABASE_URL) ...`)
 * — and only takes the localStorage-seeding shortcut above when *both* are
 * genuinely unset (not just falsy-but-present; an empty string still counts
 * as "unset" here, matching `playwright.config.ts`'s own `!value` check).
 * When real credentials *are* configured (an engineer's own machine, or any
 * sandbox with a populated `frontend/.env`), `loginAs` drives the real
 * `/login` UI exactly as it did before this feature existed — fill
 * email/password, click "Sign in", wait for the redirect to `/` — so real
 * E2E runs against a real Supabase project keep exercising a genuine
 * sign-in, unmocked.
 */

/** Password for every dummy family seeded by backend/scripts/seed-dummy.ts. Only relevant on a real machine with real credentials and a real seeded project — the mock path below never submits a password anywhere. */
export const SEED_PASSWORD = 'password123';

/**
 * Fallback Supabase project used only to derive a plausible project ref (for
 * the localStorage key) and to give `supabaseClient.ts` *some* non-empty
 * `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` to boot with in a sandbox
 * with no `frontend/.env`. This host is never actually contacted — `loginAs`
 * never triggers a real Supabase Auth network call — so it does not need to
 * resolve or exist.
 */
export const MOCK_SUPABASE_PROJECT_REF = 'e2e-mock';
export const MOCK_SUPABASE_URL = `https://${MOCK_SUPABASE_PROJECT_REF}.supabase.co`;
export const MOCK_SUPABASE_ANON_KEY = fakeJwt({ role: 'anon', iss: MOCK_SUPABASE_URL });

/** Matches supabase-js's default storage key derivation: `sb-<hostname-first-label>-auth-token` (see @supabase/supabase-js's SupabaseClient constructor). */
const STORAGE_KEY = `sb-${MOCK_SUPABASE_PROJECT_REF}-auth-token`;

/**
 * The dummy families backend/scripts/seed-dummy.ts creates in a real
 * Supabase project, keyed by email. Specs assert on rendered family
 * name/city/state (e.g. "The Chen Family"), so the synthetic session's
 * `user_metadata` needs to match this shape even though no such row exists
 * in any real database for the mock path.
 */
const DUMMY_FAMILIES: Record<string, { name: string; city: string; state: string }> = {
  'anderson@dummy.test': { name: 'The Anderson Family', city: 'Portland', state: 'OR' },
  'brooks@dummy.test': { name: 'The Brooks Family', city: 'Austin', state: 'TX' },
  'chen@dummy.test': { name: 'The Chen Family', city: 'Seattle', state: 'WA' },
  'davis@dummy.test': { name: 'The Davis Family', city: 'Atlanta', state: 'GA' },
};

function base64url(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

/**
 * Builds a structurally-valid (three base64url segments), but entirely
 * unsigned, JWT. Safe because — per the module doc comment above — nothing
 * in the code path `loginAs` exercises ever verifies the signature.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url('e2e-mock-signature-not-verified');
  return `${header}.${body}.${signature}`;
}

/** Deterministic fake UUID-shaped id so repeated `loginAs` calls for the same email are stable within a run. */
function fakeUserId(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, '0');
  return `00000000-0000-4000-8000-${hex.padStart(12, '0')}`;
}

function buildSession(email: string): Session {
  const meta = DUMMY_FAMILIES[email] ?? {
    name: email.split('@')[0] ?? 'E2E Family',
    city: 'Testville',
    state: 'ZZ',
  };
  const userId = fakeUserId(email);
  const nowIso = new Date().toISOString();
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Far enough in the future that no single test run can hit expiry.
  const expiresAt = nowSeconds + 60 * 60 * 24 * 365;

  const user: User = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: nowIso,
    phone: '',
    confirmed_at: nowIso,
    last_sign_in_at: nowIso,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: meta.name, city: meta.city, state: meta.state },
    created_at: nowIso,
    updated_at: nowIso,
  };

  return {
    access_token: fakeJwt({
      sub: userId,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: expiresAt,
    }),
    refresh_token: `e2e-mock-refresh-token-${userId}`,
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expiresAt,
    token_type: 'bearer',
    user,
  };
}

/**
 * Mirrors `playwright.config.ts`'s own guard (`if (!process.env.VITE_SUPABASE_URL) ...`):
 * real credentials are "present" only when both vars are set to a non-empty
 * value. Anything else (unset, or explicitly set to `''`) is treated as "no
 * real credentials" so the mock fallback path stays available.
 */
function hasRealCredentials(): boolean {
  return Boolean(process.env.VITE_SUPABASE_URL) && Boolean(process.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Pre-mock behavior, unchanged: drives the real `/login` form and waits for
 * a genuine Supabase Auth sign-in to redirect to `/`. Used whenever real
 * credentials are configured, so real E2E runs against a real Supabase
 * project keep getting real auth coverage instead of the mock.
 */
async function loginViaRealUI(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}

/**
 * Logs in as one of the seeded dummy families. When real Supabase
 * credentials are configured (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
 * both set), this drives the real `/login` UI and performs a genuine
 * sign-in, exactly as before this feature existed (AC6) — this mock is an
 * additive fallback, not a replacement, for sandboxes with real credentials.
 *
 * Otherwise (the sandbox case this feature exists for), no real `/login` UI
 * is driven and no Supabase Auth network call is made. Instead a synthetic
 * session is seeded directly into `localStorage`, then a full navigation to
 * `/` lets the app's real auth wiring (`src/stores/auth.ts`) bootstrap from
 * it exactly as it would after a real sign-in: `useAuthStore.setSession`
 * ends up with a non-null token and a populated `AuthUser`, and
 * `supabase.auth.onAuthStateChange` fires `SIGNED_IN`. See the mechanism
 * comment at the top of this file for why this is safe and sufficient.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  if (hasRealCredentials()) {
    await loginViaRealUI(page, email);
    return;
  }

  const session = buildSession(email);

  // Land on the app's own origin (a real, unauthenticated page — no network
  // calls needed to render it) before touching localStorage.
  await page.goto('/login');
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: JSON.stringify(session) },
  );

  // Full navigation, not a SPA route change, so the app's module-level auth
  // bootstrap re-runs from scratch and picks up the session we just seeded.
  await page.goto('/');
  await page.waitForURL('/');
}
