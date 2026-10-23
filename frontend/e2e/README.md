# Playwright E2E suite

Specs live in `frontend/e2e/*.spec.ts`. Run with:

```
npm run test:e2e --workspace frontend
```

`playwright.config.ts`'s `webServer` starts the Vite dev server on port 5273
for you.

## Auth: no real Supabase project needed (and real projects still work)

Every spec that needs a signed-in user calls `loginAs(page, email)` from
`e2e/utils/login.ts`. As of [[features/e2e-auth-mocking]], this works with
**zero** real Supabase project, zero populated `frontend/.env`, and zero
network access to `*.supabase.co` — **and** it still performs a genuine
sign-in when real credentials are available, so real E2E runs don't lose
coverage:

- `loginAs` checks `process.env.VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` at call time — the same two vars
  `playwright.config.ts` guards on — to decide which path to take:
  - **Real credentials present** (both vars non-empty, e.g. a populated
    `frontend/.env` on an engineer's machine): `loginAs` drives the real
    `/login` form and waits for a genuine Supabase Auth sign-in to redirect
    to `/`, exactly as it did before this feature existed. This is the
    unmocked path — no shortcuts.
  - **Real credentials absent** (the sandbox case this feature exists for):
    `loginAs` seeds a synthetic-but-structurally-valid Supabase session
    directly into `localStorage` instead (Supabase's own bootstrap path
    never verifies the JWT signature/expiry client-side — see the detailed
    comment at the top of `e2e/utils/login.ts` for how this was verified
    against the `@supabase/auth-js` source, not assumed).
- `playwright.config.ts` injects fallback `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` values into the dev server's environment
  (`webServer.env`) *only* when those aren't already set — a real,
  populated `frontend/.env` (or already-exported env vars) always wins and
  is left untouched. This exists purely so `src/lib/supabaseClient.ts`
  (which throws at import without these vars) can boot at all; when the
  mock path is taken, the fake host is never actually contacted.

The mock is an **additive fallback for sandboxes without credentials, not a
replacement for real E2E runs where they're available** — real credentials
always take the real, unmocked path.

**Call sites don't need to change.** `loginAs(page, email)` keeps the same
signature every existing spec already uses, and which path it takes is
decided internally based on the environment it's run in.

**Out of scope for the mock:** anything the app fetches *after* login (feed
posts, search results, messages, playdates — all real Edge Function /
Postgres calls) still needs either a reachable real Supabase project seeded
via `backend/scripts/seed-dummy.ts`, or its own fixture/mock, to assert on.
Specs that only need an authenticated session to render a page (route
guards, client-side validation, layout) work fully in a bare sandbox; specs
that assert on seeded data will fail there until pointed at a real project.
See each feature's `### E2E coverage` section for which category a given
spec falls into.

## Adding a new spec that needs auth

```ts
import { loginAs } from './utils/login';

test('...', async ({ page }) => {
  await loginAs(page, 'anderson@dummy.test'); // or brooks/chen/davis@dummy.test
  await page.goto('/wherever');
  // ...
});
```

`anderson`, `brooks`, `chen`, and `davis` are pre-wired with the same
name/city/state as `backend/scripts/seed-dummy.ts`'s real dummy families, so
anything asserting on the rendered family name works identically against
the mock or a real seeded project. Any other email gets a generic synthetic
identity.
