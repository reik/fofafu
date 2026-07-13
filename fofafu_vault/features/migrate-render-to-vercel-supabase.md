---
slug: migrate-render-to-vercel-supabase
title: Migrate Render To Vercel Supabase
owner: engineering
collaborators: []
status: building
priority: P1
created: 2026-07-11
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Migrate Render To Vercel Supabase

## Problem

Production currently runs on Render: Express + better-sqlite3 backend, static frontend, local-disk file uploads. This is a single-vendor lock-in with no managed Postgres, no object storage, and sqlite doesn't scale past one instance. We're moving to Vercel (frontend hosting) + Supabase (Postgres, Storage, Auth, Edge Functions for backend compute), eliminating Render entirely.

## Acceptance criteria

- [ ] Postgres schema on Supabase mirrors current sqlite schema (translated, not copied verbatim)
- [ ] All current Express routes ported to Supabase Edge Functions with equivalent behavior
- [ ] File uploads (`backend/uploads`) migrated to Supabase Storage with signed URLs
- [ ] Auth flow migrated to Supabase Auth (or equivalent Edge Function auth); existing users forced through password reset (no hash migration)
- [ ] Frontend deployed on Vercel, pointed at Supabase Edge Functions / client SDK
- [ ] Existing production data migrated from sqlite to Supabase Postgres
- [ ] Full test suite (unit + E2E) passes against the new stack
- [ ] Render service decommissioned after cutover

## Out of scope

- Mobile (Phase 4, still dormant)
- Any new product features — this is a pure infra migration, behavior must stay equivalent

## Open questions

- RLS policies for the tables in `supabase/migrations/20260711000000_initial_schema.sql` are deferred to eng-infra-4/5/6 (auth pattern must be settled first); tables are RLS-enabled with zero policies in the meantime, so no anon/authenticated access until then

## Sub-tickets (kanban/engineering.md)

- eng-infra-1 — parent ticket, closes when all below are Done and Render is decommissioned
- eng-infra-2 — schema translation (sqlite → Postgres DDL): families, users, announcements, comments, reactions, messages, playdates, coach_events
- eng-infra-3 — data migration script (sqlite → Supabase Postgres, row-count + FK verification)
- eng-infra-4 — auth: auth.controller.ts/auth.routes.ts → Supabase Auth, forced password reset for existing users
- eng-infra-5 — Edge Functions batch 1: announcement, community, family, search
- eng-infra-6 — Edge Functions batch 2: message, playdates, coach (keep MockClaudeClient/LiveClaudeClient seam)
- eng-infra-7 — uploads: local disk → Supabase Storage + signed URLs; update ImagePicker/Avatar consumers
- eng-infra-8 — Vercel deploy + staging cutover + full test suite green + Render decommission

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
eng-infra-2 done: `supabase/migrations/20260711000000_initial_schema.sql` translates all 8 sqlite tables from `backend/src/migrate.ts` to Postgres. Deltas: `users` table dropped (folds into `auth.users` — Supabase Auth owns credentials/verification, closes eng-infra-4's open question); `email_tokens`/`password_reset_tokens` dropped (Supabase Auth owns these flows); TEXT ids → uuid; INTEGER booleans → boolean; TEXT timestamps → timestamptz; RLS enabled on all 8 tables with no policies yet (locked down pending eng-infra-4/5/6). Verified against live project `rlizubjugevyxsfzmpny` via `supabase link` + `supabase db push`; `supabase migration list` confirms remote matches local. eng-infra-2 Done.

eng-infra-4 (DB side) done: `supabase/migrations/20260711010000_auth_trigger_and_rls.sql` adds `on_auth_user_created` trigger on `auth.users` (auto-creates the `families` row register used to do in a transaction) and RLS policies for all 8 tables deferred from eng-infra-2. A background security review flagged 2 findings — UPDATE policies without `WITH CHECK` on `messages`/`announcements`/`comments`/`playdate_requests` would have let callers spoof authorship or rewrite fields beyond what the policy intended (e.g. a message receiver marking read could also rewrite `sender_id`/`content`). Fixed via `WITH CHECK` clauses pinning ownership plus column-level `GRANT UPDATE (col)` restrictions on `messages` (only `read`) and `playdate_requests` (only `status`) as defense in depth. Verified live via `supabase db push` + `migration list`. Remaining for eng-infra-4: swap frontend auth calls from Express `/auth/*` to `supabase-js` (`signUp`/`signInWithPassword`/`resetPasswordForEmail`/`updateUser`), remove `backend/src/controllers/auth.controller.ts` + `auth.routes.ts`, and the forced-password-reset flow for existing users.

eng-infra-5 (batch 1) deployed and live-verified: `supabase/functions/{family,community,search,announcement}/index.ts` port `family.controller.ts`, `community.controller.ts`, `search.controller.ts`, `announcement.controller.ts` (the largest, with comments + reaction toggling). Shared per-request client (`_shared/client.ts`) forwards the caller's Authorization header so RLS evaluates as the real user rather than the service role. PostgREST can't replicate sqlite's `LEFT JOIN families`/`GROUP BY reactions` in a single query (no FK from announcements to families — both merely reference `auth.users` independently), so author lookups and reaction aggregates are batched follow-up queries within the function, same DTO shape as before. Also added `supabase/migrations/20260711020000_family_location.sql`: search previously joined `users.city`/`users.state`, but `users` no longer exists as a queryable table, so city/state are now denormalized onto `families` and populated by the signup trigger. Deployed via `supabase functions deploy`; smoke-tested `GET /functions/v1/search?q=test` returns 200 against the live project. Not yet wired: the frontend still calls the old Express endpoints.

eng-infra-4 (Express cleanup) done: removed `backend/src/controllers/auth.controller.ts`, `backend/src/routes/auth.routes.ts`, and `backend/tests/auth.test.ts` (dead code/tests for the old JWT-issuing endpoints, now superseded by `supabase-js` `signUp`/`signInWithPassword`/`resetPasswordForEmail`/`updateUser`/`signOut` on the frontend). Removed the `authRouter` import and `apiRouter.use("/auth", authRouter)` mount from `backend/src/routes/index.ts`; all other route mounts (`/family`, `/announcements`, `/comments`, `/messages`, `/uploads`, `/search`, `/community`, `/playdates`) untouched. `backend/src/middleware/auth.middleware.ts` left in place and unmodified — it's still load-bearing for every Express-hosted route in this hybrid state (eng-infra-6/7 haven't ported message/playdates/uploads/coach to Edge Functions yet). `npx tsc --noEmit` is clean.

Compile-time check for old `users` table references (it was dropped in eng-infra-2's migration): `backend/src/migrate.ts` (sqlite DDL, now dead — the app no longer runs against sqlite in production, but the file still exists and self-references `users` internally; not touched here, out of this ticket's scope, flagging for eng-infra-8/decommission cleanup) and `backend/src/controllers/message.controller.ts:49` (`SELECT id FROM users WHERE id = ?`, sqlite-side recipient-existence check) — this only executes against the local sqlite dev DB via `better-sqlite3`, which is unaffected by the Postgres/Supabase migration until eng-infra-6 ports `message.controller.ts` to an Edge Function; no other backend source file references a `users` table or imports from the deleted auth files.

Email verification / password reset: `email.service.ts` (if present in the old flow) is fully superseded by Supabase Auth's built-in email templates (verification, magic link, password recovery) — no backend code should send auth emails going forward. Checked `backend/src/services/` for any auth-email sender still wired to a live route; none found post-removal (the only caller was `auth.controller.ts`, now deleted).

**Blocking issue for qa-engineer / tech-lead**: running the backend test suite (`npm run test:run`) after this removal shows the auth removal breaking far more than just `auth.test.ts` — 220 of 260 assertions across `family.test.ts`, `messages.test.ts`, `community.test.ts`, `playdates.test.ts`, `coach.test.ts`, `search.test.ts`, `coach-live.test.ts`, `announcements.test.ts`, `uploads.test.ts`, `author-display.test.ts` now fail with `SyntaxError: Unexpected token '<'` because each suite's `register`/`registerAndVerify` test helper POSTs to the now-deleted `/api/auth/register` to mint a JWT for calling protected routes, and gets Express's HTML 404 page back instead of JSON. This is out of my writer-ownership (task scope said "do NOT touch other backend tests"), so I left them as-is, but the suite is NOT green and the "existing routes must remain green" quality gate is not met by this change alone. Two ways forward, for tech-lead to route: (a) add a small `tests/helpers/authToken.ts` that signs a JWT locally with `jsonwebtoken`/`JWT_SECRET` matching the payload shape `auth.middleware.ts` expects (`{ userId }`), bypassing the deleted endpoint entirely, for use in every suite's setup — cheapest, keeps Express-hosted routes testable without live Supabase; or (b) note that `auth.middleware.ts` itself needs a follow-up (probably eng-infra-6, since it's the same hybrid-auth-bridge work) to verify real Supabase-issued JWTs (which carry `sub` not `userId`, and are signed with Supabase's JWT secret, not the app's local `JWT_SECRET`) so tests can mint tokens the same way real signed-in users would. Recommend (a) as an immediate unblock and (b) as the actual production fix, tracked separately since it touches `auth.middleware.ts` which I was told not to modify in this ticket.

**Resolution (superseding the above, same day):** the "Express cleanup" removal above was actually a production-breaking regression, not just a test-fixture problem — `messages`, `playdates`, `uploads`, and `coach` all still run on Express, gated by `auth.middleware.ts`, which only ever verified Express-issued JWTs. With `/api/auth/*` gone, the frontend had no way to obtain a token those routes would accept — those features would have been completely unreachable in production, not just the originally-reported announcements bug. Root-caused and fixed by:
- Restoring `backend/src/controllers/auth.controller.ts`, `backend/src/routes/auth.routes.ts`, `backend/tests/auth.test.ts`, and the `apiRouter.use("/auth", authRouter)` mount in `backend/src/routes/index.ts` — local Express auth stays alive for local dev/test and any not-yet-migrated caller (its sqlite `users` table is independent of the Postgres/Supabase schema and unaffected by eng-infra-2's migration).
- `backend/src/lib/supabaseAdmin.ts` (new) — lazily-constructed service-role Supabase client, used only to verify a caller's Supabase session token.
- `backend/src/middleware/auth.middleware.ts` — now accepts **either** token type: tries the legacy `jwt.verify(token, JWT_SECRET)` first (cheap, local, what all existing tests and any not-yet-migrated caller use), and falls back to `supabaseAdmin().auth.getUser(token)` (network call, what the now-Supabase-authenticated frontend sends) only if legacy verification fails.

This unblocks the Supabase-authenticated frontend against all four live Edge Functions without resurrecting the old users-table architecture as the primary path and without any test-helper rewrite. Verified: `npx tsc --noEmit` clean (backend + frontend), `npm run test:run` in `backend/` **147/147 pass** (unmodified), frontend `vitest run` **132/132 pass**, frontend `npm run build` clean. `[[features/backend-tests-broken-by-auth-removal]]` is now abandoned — superseded by this fix.

### Frontend
eng-infra-4 (frontend side) + eng-infra-5 wiring done: installed `@supabase/supabase-js` (no `@supabase/ssr` — this is a Vite SPA, not Next.js) and added `frontend/src/lib/supabaseClient.ts`, a singleton `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)` plus a derived `FUNCTIONS_URL` (overridable via `VITE_SUPABASE_FUNCTIONS_URL` for local `supabase functions serve`). Added ambient env types to `frontend/src/vite-env.d.ts`.

**Auth**: rewrote `frontend/src/api/auth.ts` to use `supabase.auth.signUp` / `signInWithPassword` / `resetPasswordForEmail` / `updateUser` / `signOut`, dropping the old `apiRequest`-based `/auth/*` calls and the removed `verifyEmail` (Supabase's hosted confirmation link redirects back and signs the user in itself via `detectSessionInUrl`; there's no client-callable verify endpoint anymore). Rewrote `frontend/src/stores/auth.ts`: `useAuthStore` now bootstraps from `supabase.auth.getSession()` and stays in sync via `supabase.auth.onAuthStateChange` (`setSession`), so supabase-js owns session persistence — no more hand-rolled JWT in localStorage. Kept `setAuth`/`clear`/`token`/`user` on the store for back-compat with call sites (`RequireAuth`, `Navbar`, `client.ts`'s 401 handler, existing tests) so nothing outside auth.ts/the two auth forms needed touching. Acceptance criterion "existing users forced through password reset": implemented pragmatically — Supabase returns the same invalid-credentials error for "wrong password" and "pre-existing account with no Supabase Auth record" (old sqlite `users` + hashes are gone, nothing to auto-migrate), so `login()` throws a single `AuthError` with `INVALID_CREDENTIALS_MESSAGE` pointing users at "Forgot password" for both cases. Updated `LoginForm.tsx` and `RegisterForm.tsx` to consume the new `AuthError` (dropped `ApiError`/`setAuth` call sites) and `VerifyEmail.tsx` to reflect current session state instead of calling the removed endpoint.

**Edge Functions (eng-infra-5 wiring)**: added `frontend/src/api/edgeClient.ts`, a `fetch` wrapper that attaches `Authorization: Bearer <session.access_token>` (from `supabase.auth.getSession()`) and targets `${FUNCTIONS_URL}/<fn><path>`. Repointed `announcements.ts`, `family.ts`, `community.ts`, `search.ts` at it. DTO shapes are unchanged (`AnnouncementDTO`, `CommentDTO`, `FamilyDTO`, `ReactionResponse`, etc. all still parse against the deployed functions' actual output — verified by reading `supabase/functions/{announcement,family,community,search}/index.ts`). One path drift found and adapted: the announcement function's route prefix is singular (`/announcement`, not `/announcements`), and reactions are `POST /announcement/:id/react`, not the old Express `POST /announcements/:id/reactions` — `toggleReaction` now calls the `/react` path. `messages.ts`, `playdates.ts`, `uploads.ts`, and `client.ts` are untouched and still point at the old Express backend (`VITE_API_URL`) — intentional hybrid state per eng-infra-6/7 not being live yet.

Added `frontend/.env.example` with `VITE_API_URL`, `VITE_SUPABASE_URL` (real project ref `rlizubjugevyxsfzmpny` as placeholder, not secret), `VITE_SUPABASE_ANON_KEY` (`your-anon-key-here` placeholder), and a commented `VITE_SUPABASE_FUNCTIONS_URL` override.

Quality gates: `npx tsc --noEmit` clean; `vite build` clean (648 kB main chunk — pre-existing size warning, unrelated to this change). `vitest run`: 95/119 passing; 24 failures across 12 files are all pre-existing tests that either (a) seed `useAuthStore` / assert the old `{token, user}` `LoginResponse` shape, or (b) use msw handlers pointed at the old `/api/announcements`, `/api/family`, `/api/community`, `/api/search` paths and the old `ApiError` 401/403/409 semantics. None are new regressions in app logic — they need their msw handlers and auth-store seeding updated to the Supabase-Auth/Edge-Function contract described above. Flagged for qa-engineer: affected files are `FamilyView.test.tsx`, `Feed.test.tsx`, `Home.test.tsx`, `Search.test.tsx`, `LoginForm.test.tsx`, `RegisterForm.test.tsx`, `FamilyEditForm.test.tsx`, `FamilyRecentPosts.test.tsx`, `AnnouncementComposer.test.tsx`, `CommentForm.test.tsx`, `CommentList.test.tsx`, `ReactionBar.test.tsx`.

### Test plan

**Mocking strategy**: per CLAUDE.md's global rule, mock at the network boundary, not the module boundary. `supabase-js`'s `GoTrueClient` makes plain `fetch` calls under the hood (confirmed by reading `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`: `POST {url}/auth/v1/signup`, `POST {url}/auth/v1/token?grant_type=password`, `POST {url}/auth/v1/recover`, `PUT {url}/auth/v1/user`, `POST {url}/auth/v1/logout`), so msw intercepts these exactly like any other HTTP call — no need to mock the `supabase-js` module itself. `frontend/src/tests/msw-server.ts` was extended with `GOTRUE_BASE`/`FUNCTIONS_BASE` constants and matching handlers; `frontend/vite.config.ts` test config now sets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` to fixed test values (`supabaseClient.ts` throws at import time without them — this was blocking 21/29 test files before the fix).

- Unit — `frontend/src/api/auth.test.ts` — `signUp` resolves with confirmation copy on success and throws `AuthError` with the Supabase message on `422 user_already_exists`; `signInWithPassword` resolves (session sync happens via `onAuthStateChange`, not the return value) and maps any `400`/invalid-credentials response to the shared `INVALID_CREDENTIALS_MESSAGE`; `resetPasswordForEmail` resolves with a generic non-leaking message; `updateUser` resolves once a session exists; `signOut` resolves and clears the session; `getSession()` bootstrap reflects a persisted (empty) session with zero network calls (asserted implicitly by `onUnhandledRequest: 'error'` — an unexpected request would fail the test).
- Unit — `frontend/src/features/auth/components/LoginForm.test.tsx` — asserts the store is populated from a mocked GoTrue token response, and that an invalid-credentials response renders a `role="alert"` matching `/forgot password/i` — this is the login-failure-surfaces-password-reset UX path (per the feature's auth-flow acceptance criterion: "existing users forced through password reset (no hash migration)"; `auth.ts`'s `INVALID_CREDENTIALS_MESSAGE` intentionally can't distinguish wrong-password from no-Supabase-Auth-record, so both point users at "Forgot password").
- Unit — `frontend/src/features/auth/components/RegisterForm.test.tsx` — happy path + friendly duplicate-email copy on a mocked `422`.
- Unit — `frontend/src/api/edgeClient.test.ts` (new) — confirms `edgeRequest` hits `${FUNCTIONS_BASE}/<fn><path>` (not `/api/...`), forwards `Authorization: Bearer <access_token>` when a session exists (verified by first signing in through the mocked GoTrue `/token` endpoint, matching how `edgeClient.ts` actually sources the token via `supabase.auth.getSession()`), sends no `Authorization` header when there is no session, and surfaces `EdgeApiError` with the upstream status/message on non-2xx.
- Integration (RTL, existing suites updated in place) — `Feed.test.tsx`, `FamilyRecentPosts.test.tsx`, `FamilyView.test.tsx`, `Home.test.tsx`, `Search.test.tsx`, `FamilyEditForm.test.tsx`, `AnnouncementComposer.test.tsx`, `CommentForm.test.tsx`, `CommentList.test.tsx`, `ReactionBar.test.tsx` — msw handlers repointed from the old `/api/announcements`, `/api/family/*`, `/api/community/recent`, `/api/search/families`, `/api/comments/:id` Express paths to `${FUNCTIONS_BASE}/announcement`, `/family/me`, `/family/:id`, `/community/recent`, `/search/families`, `/announcement/comments/:id` (matching the deployed Edge Functions' route shapes, including the `announcement`→singular and `/react` drift noted in the Backend section above) — these tests now exercise the real repointed `announcements.ts`/`family.ts`/`community.ts`/`search.ts` modules end-to-end through `edgeClient.ts`, not a mock of those modules.
- Confirmed unchanged and still green: `messages.ts`, `playdates.ts`, `uploads.ts` (still call `apiRequest`/Express `/api/...`, verified via `git diff` showing zero changes to those 3 files) and their consumers (`Messages.test.tsx`, `MessageComposer.test.tsx`, playdates feature tests, `ImagePicker.test.tsx`) — all pass unmodified in the hybrid state.

**Results**: frontend `npx vitest run` — **31/31 test files, 132/132 tests passing**; `npx tsc --noEmit` — clean (after typing `msw-server.ts`'s Edge Function handler bodies as `JsonBodyType` instead of `unknown`). ESLint could not run (`frontend/` has no `eslint.config.js` — pre-existing gap, not introduced by this feature; not blocking).

**Backend**: `npm run typecheck` — clean. `npm run test:run` — **31/131 passing, 100 failing**. Root cause: 8 of 10 backend integration test files share a `register`/login-based test-user helper that POSTs to the now-removed `/api/auth/register` + `/api/auth/login` Express routes (deleted in this same feature's eng-infra-4 slice); every helper call now gets Express's default HTML 404 instead of JSON, throwing `SyntaxError: Unexpected token '<'` before the endpoint under test is ever exercised. This is a full-suite regression across `announcements`, `author-display`, `community`, `family`, `messages`, `playdates`, `search`, `uploads` — filed as `[[features/backend-tests-broken-by-auth-removal]]` (P1, `#bug`) rather than fixed in-place here, since it requires a new test-user provisioning seam (direct DB/Supabase Auth admin call or JWT-minting fixture) that's a design decision, not a mechanical repoint.

**Deferred / known gaps** (manual or staging verification needed, not coverable by unit/integration tests):
- Live Supabase Auth email delivery (confirmation link, password-reset link) — cannot be exercised in jsdom/msw; needs manual or staging verification against the real `rlizubjugevyxsfzmpny` project.
- The forced-password-reset flow for pre-existing (pre-migration) users specifically — `INVALID_CREDENTIALS_MESSAGE`'s copy is tested, but there is no way to unit-test "this account existed in the old sqlite `users` table" since that table no longer exists; needs a staging check with a known pre-migration email once data migration (eng-infra-3) lands.
- `eslint .` sweep on `frontend/` — blocked by missing `eslint.config.js` (separate from this feature; flag to tech-lead for follow-up).
- No E2E coverage owned by this subsection — see `### E2E coverage` (e2e-test-writer).

### E2E coverage
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
