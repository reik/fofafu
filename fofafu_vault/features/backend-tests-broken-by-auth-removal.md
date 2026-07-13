---
slug: backend-tests-broken-by-auth-removal
title: Backend integration tests broken by auth.controller.ts/auth.routes.ts removal
owner: engineering
collaborators: []
status: abandoned
priority: P1
created: 2026-07-11
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Backend integration tests broken by auth.controller.ts/auth.routes.ts removal

## Resolved by reverting the deletion, not by fixing the tests

Root-caused further: deleting `auth.controller.ts`/`auth.routes.ts` didn't just break tests — it broke **production**, since `messages`, `playdates`, `uploads`, and `coach` still run on Express and are still gated by `auth.middleware.ts`, which only ever verified Express-issued JWTs. With `/api/auth/*` gone, there was no way for the frontend to obtain a token those routes would accept, so those features would have been completely unreachable, not just the announcements bug this was meant to fix.

Fix applied instead: restored `auth.controller.ts`/`auth.routes.ts`/`auth.test.ts` (local Express auth stays alive for local dev/test and any not-yet-migrated caller), and `auth.middleware.ts` now accepts **either** a legacy Express JWT or a Supabase session token (tries legacy `jwt.verify` first, falls back to `supabaseAdmin().auth.getUser(token)`). This unblocks the Supabase-authenticated frontend against the Edge Functions without touching the still-Express-hosted routes' behavior. 147/147 backend tests pass unmodified; no test-helper rewrite needed.

This feature is abandoned — the fix landed in `[[features/migrate-render-to-vercel-supabase]]` directly instead.

## Problem

#bug — As part of `[[features/migrate-render-to-vercel-supabase]]` (eng-infra-4), `backend/src/controllers/auth.controller.ts`, `backend/src/routes/auth.routes.ts`, and `backend/tests/auth.test.ts` were removed in favor of Supabase Auth. However, 8 of the 10 remaining backend integration test files (`announcements.test.ts`, `author-display.test.ts`, `community.test.ts`, `family.test.ts`, `messages.test.ts`, `playdates.test.ts`, `search.test.ts`, `uploads.test.ts`) share a `register`/`registerAndVerify`-style test helper that provisions its test user by POSTing to the now-deleted `/api/auth/register` (and, for some flows, `/api/auth/login`) Express route to obtain a JWT. With those routes gone, every one of those helper calls now gets Express's default HTML 404 page back instead of JSON, and each test throws `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON` before it ever reaches the endpoint under test.

Running `npm run test:run` in `backend/` today: **31 pass / 100 fail / 131 total**. This is a full-suite regression, not a targeted one — the remaining 8 Edge-Function-adjacent Express endpoints (announcements, family, community, search, messages, playdates, uploads, coach) still run on Express in this hybrid state and are otherwise unaffected by the migration, but their tests can no longer authenticate a test user at all.

## Acceptance criteria

- [ ] A shared backend test helper (e.g. `backend/tests/helpers/testUser.ts`) provisions a verified test user + valid JWT without depending on the deleted `/api/auth/*` routes — either via a direct DB/Supabase Auth admin call, or via a test-only seam that the Express auth middleware already expects (e.g. minting a JWT with the same shape/claims the middleware verifies, backed by a real user row so FK-dependent endpoints still work)
- [ ] All 8 affected test files (`announcements`, `author-display`, `community`, `family`, `messages`, `playdates`, `search`, `uploads`) are updated to use the new helper instead of `/api/auth/register` + `/api/auth/login`
- [ ] `npm run test:run` in `backend/` returns to 0 failures (currently 100/131 failing)
- [ ] No test mocks the auth boundary itself with fakes that bypass the real Express auth middleware — the middleware must still be exercised with a real, verifiable token per the global "no mocks at the boundary" rule

## Out of scope

- Any change to the already-shipped Supabase Auth migration itself (eng-infra-4 DB/Edge-Function side is done and out of scope here)
- Frontend test fallout (frontend suite is green: 31/31 files, 132/132 tests, tsc clean, confirmed in `[[features/migrate-render-to-vercel-supabase]]` Test plan)

## Open questions

- Should the new test helper hit a real (test-project) Supabase Auth admin API to create users, or should backend integration tests move to a lighter-weight JWT-minting fixture now that user identity fully lives in `auth.users`? This decision affects whether backend integration tests require live Supabase credentials in CI.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

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
