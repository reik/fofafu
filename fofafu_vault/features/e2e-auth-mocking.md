---
slug: e2e-auth-mocking
title: E2E Auth Mocking
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P1
created: 2026-09-23
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# E2E Auth Mocking

## Problem

Every Playwright spec that needs an authenticated session calls
`e2e/utils/login.ts`'s `loginAs(page, email)`, which drives the real
`/login` UI and waits for a real Supabase Auth sign-in to succeed against a
real, reachable Supabase project seeded with the dummy families from
`backend/scripts/seed-dummy.ts`. In any sandbox without a populated
`frontend/.env` (no `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`),
`src/lib/supabaseClient.ts` throws at module import before the app even
renders, and `loginAs` fails identically across every spec that calls it.

This has already independently blocked E2E execution (not authoring — the
specs get written, just never run) on at least four features:
[[features/moderation-report-block]], [[features/header-nav-redesign]],
[[features/playdates]], and [[features/feed-skeleton-loading]]. Each
e2e-test-writer run has re-discovered and re-logged the same root cause.
This feature exists to fix it once, for every spec, rather than have each
future feature rediscover it again.

## Acceptance criteria

- [ ] A sandbox with no `frontend/.env` at all can still run the full
      `frontend/e2e/` suite end to end (`npx playwright test`), with zero
      specs failing due to `supabaseClient.ts` throwing at import or
      `loginAs` failing to establish a session.
- [ ] `loginAs` (or its replacement) does not require a real, reachable
      Supabase project, real seeded credentials, or real network access to
      `*.supabase.co`. Every Supabase Auth network call the login flow makes
      is intercepted and answered locally by Playwright (or bypassed
      entirely, e.g. by seeding `localStorage`/session state directly before
      navigation) -- implementer's call on the mechanism; either is
      acceptable if it satisfies the ACs.
- [ ] The mocked session round-trips correctly through the app's real auth
      wiring: `useAuthStore.setSession` (`frontend/src/stores/auth.ts`)
      ends up with a non-null `token` and a `user` whose shape matches
      `AuthUser` (id/email/name/city/state from `user.user_metadata`), and
      `supabase.auth.onAuthStateChange` fires as it would for a real sign-in
      -- i.e. this mocks the network boundary, not the app's auth logic.
- [ ] All 9 existing call sites of `loginAs` (see Out of scope note on scope)
      keep working with either no change or a mechanical one-line change
      (e.g. an added fixture import) -- this is a drop-in fix to the shared
      helper, not a per-spec rewrite.
- [ ] `frontend/e2e/README` or a comment at the top of `e2e/utils/login.ts`
      documents the mechanism so the next spec author doesn't have to
      reverse-engineer it.
- [ ] Real credentials (if `frontend/.env` *is* populated, e.g. an
      engineer's own machine) still work exactly as before -- this is an
      additive fallback path for sandboxes without credentials, not a
      replacement for real E2E runs where they're available.

## Out of scope

- Backend/Edge Function changes -- this is purely about the Playwright/login
  test harness.
- Fixing or re-running the E2E suites of the four features that already
  logged this blocker ([[features/moderation-report-block]],
  [[features/header-nav-redesign]], [[features/playdates]],
  [[features/feed-skeleton-loading]]) -- once this ships, their next
  `/dispatch` (or a follow-up `/sanity-check`) can re-run E2E and flip
  their `### E2E coverage` sections from pending to a real result. Not
  bundled into this feature's scope to keep it a single concern.
- Any change to `backend/scripts/seed-dummy.ts` or real Supabase project
  configuration.
- CI wiring (per `fofafu_vault/log/2026-09-04.md`, referenced from the
  `moderation-report-block` history, CI runs neither `deno` nor `playwright`
  today -- out of scope here too).

## Open questions

- Mechanism choice: intercept Supabase Auth's REST endpoint
  (`POST <project>/auth/v1/token?grant_type=password`) via `page.route` and
  return a synthetic-but-well-formed session response, vs. skip the UI
  login entirely and seed `localStorage`'s Supabase session key (and/or call
  `supabase.auth.setSession()` from an injected script) before navigating.
  The former exercises more of the real login form; the latter is faster
  and more robust to UI changes. Decide during implementation -- whichever
  approach satisfies the ACs with the least ongoing maintenance burden as
  the login UI evolves.
- Does `supabase-js` client-side verify the JWT signature/expiry on a
  session it's handed (via the intercepted response or `setSession`), or
  does it trust whatever the network/caller provides? This determines
  whether a trivially-fake JWT works or a properly-shaped (still
  unverified-by-a-real-server, but structurally valid) token is needed.
  Verify empirically rather than assuming.

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
