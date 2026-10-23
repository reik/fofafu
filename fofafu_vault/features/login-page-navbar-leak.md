---
slug: login-page-navbar-leak
title: Login page shows the main-nav header when already authenticated
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-08-28
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Login page shows the main-nav header when already authenticated

## Problem

Reported via user observation: a header appears on the login page that "doesn't make sense" there — it's the header meant to be shown after login, appearing while still on the login page.

Root cause: `pages/Login.tsx` never checks auth state before rendering the sign-in form. It wraps its content in `<Layout>` (`components/Layout.tsx`), whose `{token && <Navbar />}` shows the full authenticated app header — brand mark, nav pills, unread badge, account chip — whenever a Zustand `token` exists, regardless of route. `/login` is also not wrapped in `RequireAuth` and has no inverse guard, so an already-authenticated user who lands on `/login` (back button, stale bookmark, typed URL, a redirect race right after login) sees the authenticated Navbar rendered directly above the "Welcome back — sign in" form — two contradictory states on screen at once.

This is an existing, correct pattern elsewhere in the same feature: `pages/VerifyEmail.tsx` explicitly branches on `token` and shows a "you're verified / go to your feed" state (with header) instead of the check-your-inbox form when already signed in. `pages/Login.tsx` is missing the equivalent branch. The original `auth-pages` spec ([[features/auth-pages]], shipped) never called for this guard — it's a gap, not a regression.

The reference implementation at `~/dev/fofa/frontend/src/pages/LoginPage.tsx` sidesteps the whole class of bug differently: its login screen doesn't use the shared app shell/header at all, it's a fully standalone centered card. fofafu's rewrite instead composes `Login.tsx` from the shared `<Layout>`, which is what introduces the conditional-header risk — so this needs an adaptation (an authenticated-redirect guard), not a literal port.

## Acceptance criteria

- [ ] Visiting `/login` while already authenticated (a `token` is present in `useAuthStore`) redirects to `/` instead of rendering the login form — mirrors `RequireAuth`'s existing inverse redirect (`<Navigate to="/login" replace />` when no token), so the Navbar never renders on `/login`.
- [ ] Visiting `/login` while unauthenticated is unchanged: form renders, no Navbar.
- [ ] At least one test covers the already-authenticated redirect, alongside the existing `Login`/`LoginForm` smoke tests.

## Out of scope

- `pages/Register.tsx` has the same missing-guard shape (no already-authenticated check) but was not part of the reported symptom — not touched here. Noted below as a candidate follow-up.
- Any visual/copy redesign of the login page itself (e.g. adopting `~/dev/fofa`'s standalone card layout) — out of scope; this is a guard fix, not a redesign.

## Open questions

- Should `pages/Register.tsx` get the identical already-authenticated redirect in a fast-follow, the way [[features/navbar-component-extraction]] and [[features/auth-user-name-semantics]] were spun out of [[features/header-nav-redesign]]? Flagging rather than silently expanding this fix's scope.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

Implemented in `frontend/src/pages/Login.tsx` — a direct mirror of `RequireAuth.tsx`'s inverse guard, exactly as specced:

```tsx
const token = useAuthStore((s) => s.token);

if (token) {
  return <Navigate to="/" replace />;
}
```

Placed as the first thing `LoginPage` does, before the `<Layout>` return — so on an authenticated visit the Navbar is never mounted even transiently (no flash-then-redirect; React never renders `<Layout>`/`<Navbar>` at all on that pass). Redirect target is exactly `/` per the assigned contract, not `location.state?.from` — there's no "from" concept entering `/login,` so none was invented. Unauthenticated path is byte-identical to the pre-existing JSX (same heading, copy, `LoginForm`, "Create an account" link) — only the two new lines and the two new imports (`Navigate` from `react-router-dom`, `useAuthStore`) were added. Full diff is 7 lines added, 1 line changed (the `Link` import merged with `Navigate`), 0 lines removed from the JSX itself.

`pages/Register.tsx` was **not** touched — explicitly out of scope per this feature file's own "Out of scope" section. The Open Question about spinning that into a fast-follow is already recorded there and isn't mine to resolve or duplicate.

**Reconciliation with qa-engineer's `### Test plan` run above:** that section's "Run results" (5/6 / 173/174, one expected-red failure) were captured *before* this guard landed, exactly as their own note says (`git diff` on `Login.tsx` was empty at their verification time). Re-run after this fix, full suite is green: **174/174 passed, 34/34 files**, including qa-engineer's `Login.test.tsx` (both cases: authenticated → redirected, no form/no Navbar; unauthenticated → form renders, no Navbar), the pre-existing `LoginForm.test.tsx`, `RequireAuth.test.tsx`, and `a11y.test.tsx` (which also imports `LoginPage`). `tsc --noEmit` (frontend workspace) clean. No new dependency, no new `console.*`, no RHF/Zod touched (none needed for a guard clause). Did not create or edit `Login.test.tsx` myself, per assigned writer ownership — read it read-only to confirm the shared contract (`<Navigate to="/" replace />` on token-present, unchanged render otherwise) matches exactly before finalizing.

**Screenshots — captured live, not skipped, with the method disclosed honestly.** There is no `frontend/.env`/real Supabase project reachable in this sandbox (same precondition [[features/header-nav-redesign]] and [[features/migrate-render-to-vercel-supabase]] hit repeatedly), so a *genuine backend-verified* sign-in isn't achievable here. Rather than skip the mandatory screenshot convention on that basis, used the same technique the 2026-08-24 log entry on [[features/admin-access]] documents working for the identical constraint: a temporary, gitignored `frontend/.env` (placeholder, non-secret `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, deleted immediately after use) let a real `vite dev` server boot; a throwaway Playwright script (deleted after use, never committed) drove real headless Chromium against it, seeding a fake-but-structurally-valid Supabase session into `localStorage` under the exact key/shape `@supabase/auth-js` expects (`sb-<ref>-auth-token`, `expires_at` an hour out) so `useAuthStore`'s real `setSession()` bootstrap picks it up with **zero network calls** — no real or fake backend request was ever made; `*.supabase.co` was additionally routed to `abort()` as a belt-and-suspenders guard. This is mechanically the same trigger the Problem section names ("back button, stale bookmark... a token merely persisted locally"), just seeded directly instead of produced by a prior real login. Both captured at 1280×900 (matching `docs/screenshots/admin-access/`'s viewport convention):
- `docs/screenshots/login-page-navbar-leak/before.png` — current code at the time, unmodified: shows the full authenticated Navbar (brand mark, nav pills, "The Demo Family" account chip) rendered directly above the "Welcome back — sign in" form on `/login` — the bug, reproduced.
- `docs/screenshots/login-page-navbar-leak/after.png` — same seeded session, same URL, guard in place: `/login` redirects to `/`; screenshot shows the Home dashboard (Navbar + family card + composer + community rail) with no trace of the login form. Community/feed panels read "Failed to fetch" / "Could not load community." — expected and harmless, since real data-fetching was never the point of this capture (all `*.supabase.co` calls are aborted by design); `HomePage.tsx`'s existing `isError` branches degrade to that inline text with no crash, so it doesn't muddy the evidence the redirect actually fired.

Both temporary artifacts (`frontend/.env`, the capture script) were deleted before this task ended; `git status` confirms only the two PNGs are new, `frontend/.env.example` is untouched, and no stray files remain.

### Test plan

| # | Acceptance criterion | Test type | File | Assertion |
|---|---|---|---|---|
| 1 | Already-authenticated visit to `/login` redirects away; Navbar never renders on `/login` | Unit/component (Vitest + RTL) | `frontend/src/pages/Login.test.tsx` | Seed `useAuthStore` via `setAuth({ token: 'real-jwt', user: {...} })`, render a `<Routes>` stub (fake `/` element + real `LoginPage` at `/login`) at initial route `/login` — asserts the `/` stub is shown, the "Welcome back" heading is absent, and `queryAllByRole('navigation')` has length 0. |
| 2 | Unauthenticated visit to `/login` is unchanged: form renders, no Navbar | Unit/component (Vitest + RTL) | `frontend/src/pages/Login.test.tsx` | `useAuthStore.getState().clear()`, same route stub at `/login` — asserts the "Welcome back" heading and the email field (`getByLabelText(/email/i)`) render, and `queryAllByRole('navigation')` has length 0. |
| 3 | At least one test covers the already-authenticated redirect, alongside existing `Login`/`LoginForm` smoke tests | Unit/component (Vitest + RTL) | `frontend/src/pages/Login.test.tsx` (new, co-located sibling to `frontend/src/features/auth/components/LoginForm.test.tsx`) | Satisfied by test 1; `LoginForm.test.tsx` and `RequireAuth.test.tsx` left untouched and still green (see run results below). |

**Run results (2026-08-28):**
- Targeted run (`Login.test.tsx` + `LoginForm.test.tsx` + `RequireAuth.test.tsx`): **5/6 passed, 1 failed** — the failure is `LoginPage > redirects to / and never renders the login form or Navbar when already authenticated`. This is an expected-red test written against the contract (frontend-dev implements `if (token) return <Navigate to="/" replace />;` in `pages/Login.tsx`), not a bug in the test: `git diff` on `frontend/src/pages/Login.tsx` was empty at verification time, i.e. the guard had not landed yet.
- Full frontend Vitest suite: **173/174 passed, 1 failed** (34 test files, 1 failed) — same single failure, no other regressions introduced.
- `tsc --noEmit` (frontend workspace): clean, exit 0.
- No ESLint config/script exists for the frontend workspace (`npm ls` scripts has no `lint`, no `.eslintrc*`/`eslint.config.*` found) — skipped, not a QA regression.

### E2E coverage

**Call: no new/extended Playwright spec.** This is my own judgment call per the e2e-test-writer role file, not a directive — reasoning below, so it's auditable rather than a bare "skipped."

- qa-engineer's `### Test plan` above names **zero** E2E scenarios — all three rows are typed "Unit/component (Vitest + RTL)." Per the role file's coordination contract, qa-engineer's Test plan is the source of truth for *which* E2E scenarios should exist; none were named for me to implement here, so this isn't a case of dropping a requested scenario — none was requested.
- The guard itself (verified read-only in `Login.tsx`: `if (token) return <Navigate to="/" replace />;`, placed before `<Layout>` ever returns) is one synchronous conditional over a Zustand-selected value, using the exact same `react-router-dom` `<Navigate>` primitive `RequireAuth.tsx` already ships with. No network call, no async step in the guard's own logic — so there's no integration surface (server round-trip, multi-page choreography, timing) that a real browser would expose beyond what qa-engineer's RTL tests already exercise. Those tests render a real `react-router-dom` `<Routes>`/`<Navigate>` (per their own description, not a mock), so the actual client-side redirect mechanism is under test, not stubbed out.
- Checked (not assumed) whether the new redirect breaks any *existing* E2E spec, since that's the one thing genuinely worth verifying live rather than reasoning about in the abstract: grepped every `/login` touch point across `frontend/e2e/*.spec.ts`. Every `loginAs()` call (`utils/login.ts`) happens exactly once per `test()`/`beforeEach`, always in a fresh Playwright context — no `storageState`/`globalSetup` is configured in `playwright.config.ts`, so no token is ever present before `loginAs` does its own `goto('/login')`. `header-nav-redesign.spec.ts`'s two post-sign-out `/login` assertions run *after* the token is cleared, so they exercise `RequireAuth`'s pre-existing guard, not this new one. Confirmed: nothing in the current suite breaks or needs updating.
- Standing up genuine live execution here would mean reusing frontend-dev's screenshot-only technique (temp gitignored `.env` + a throwaway localStorage-seeding script). No `frontend/.env` exists in this sandbox, confirmed by listing the directory, and `header-nav-redesign.spec.ts` throws at import time without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, confirmed by reading it — so any `loginAs()`-based spec (needs a real Supabase project + seeded dummy accounts) can't execute here regardless. That workaround was proportionate there because a screenshot needs real pixels; it wouldn't buy additional assertion power here — a session pre-seeded into `localStorage` before first paint just exercises the same "token already known at mount" case RTL already covers. Disproportionate machinery to stand up and tear down for a two-line guard clause with no named E2E ask behind it.
- One adjacent, out-of-scope observation, flagged for the record rather than actioned: `stores/auth.ts` bootstraps `token` asynchronously via `supabase.auth.getSession()` on a hard page load (typed URL / bookmark — two of the trigger mechanisms the Problem section names). During that resolve window a hard-reloaded, already-authenticated `/login` would briefly render the form before the guard fires on the next store update. This does *not* reproduce the reported bug — `Layout`'s `{token && <Navbar />}` needs the same `token` to be truthy, so the Navbar stays hidden for that identical window — and it's a pre-existing, cross-cutting property of the app's auth bootstrap shared by every `RequireAuth`-protected route already, not something this guard introduces. Not chasing it under this feature's scope; worth its own feature file if it ever matters, the same way the `Register.tsx` guard gap is already flagged under Open Questions above rather than folded into this fix.

| Acceptance criterion | Existing coverage | E2E status |
|---|---|---|
| AC1 — authenticated visit to `/login` redirects to `/`, Navbar never renders | `frontend/src/pages/Login.test.tsx` (RTL, real `react-router-dom` `<Routes>`/`<Navigate>`) | no E2E gap — see reasoning above |
| AC2 — unauthenticated visit to `/login` unchanged (form renders, no Navbar) | `frontend/src/pages/Login.test.tsx` + `frontend/src/features/auth/components/LoginForm.test.tsx` | no E2E gap — see reasoning above |
| AC3 — at least one test covers the redirect | `frontend/src/pages/Login.test.tsx` | satisfied at unit/component layer; AC3's own wording is "at least one test," not E2E-specific |

No `frontend/e2e/login-page-navbar-leak.spec.ts` added. No existing spec file touched or re-run (none was affected — see above).

### Code review

**Summary.** Scope reviewed: `frontend/src/pages/Login.tsx` (`git diff master -- frontend/src/pages/Login.tsx` — 7 lines added, 1 import line changed, 0 JSX lines removed) and the new `frontend/src/pages/Login.test.tsx` (2 tests, uncommitted/untracked). Read both independently rather than transcribing the `### Frontend`/`### Test plan` self-reports, and cross-read `RequireAuth.tsx`, `Layout.tsx`, `App.tsx` (route table), `stores/auth.ts`, `Navbar.tsx`, `Register.tsx`, and `VerifyEmail.tsx` for context the diff calls but doesn't modify. Independently re-ran `npx vitest run src/pages/Login.test.tsx` (2/2 pass), `npx tsc --noEmit` (clean, no output), and `a11y.test.tsx` + `RequireAuth.test.tsx` + `LoginForm.test.tsx` together (15/15 pass, no regressions) — did not re-run the full suite, that's qa-engineer's lane. Verdict: **clean, no must-fix.** The guard is the correct shape: a synchronous early return before `<Layout>` is ever constructed, so `Navbar` cannot mount even transiently on an authenticated `/login` visit (no `useEffect`-then-redirect flash pattern). `useAuthStore` is the only hook called in `LoginPage`, called unconditionally before the early return — Rules of Hooks respected, and nothing below the return calls a hook conditionally (`Layout`'s and `LoginForm`'s hooks simply never execute on that render pass since their JSX is never constructed). Redirect target is exactly `/`, no `location.state`/`from` invented — confirmed against `RequireAuth.tsx` (which does pass `state={{ from: ... }}`) and `LoginForm.tsx`'s own post-login `navigate('/')`, which already ignores any `from` today, so this guard's simpler unconditional `/` is consistent with existing app behavior, not a new inconsistency. Confirmed via `App.tsx`'s route table that this guard and `RequireAuth`'s inverse guard read the same `useAuthStore().token` field with complementary conditions (`if (token)` here vs. `if (!token)` there), so there is no redirect-loop risk. `Register.tsx` confirmed byte-for-byte untouched (no import/token-check diff), matching the feature's explicit out-of-scope note. Screenshots at `docs/screenshots/login-page-navbar-leak/{before,after}.png` exist, are correctly named/pathed per `engineering-standards.md`, and visually match the claimed states on inspection: `before.png` reproduces the bug (Navbar stacked directly above the "Welcome back" form on `/login`); `after.png` shows the redirect landed (Home dashboard, no login form). No leftover `.env` or throwaway Playwright script found in the working tree; the admin-access 2026-08-24 precedent cited for the seeded-localStorage screenshot technique checks out against the actual log entry. Both new tests are meaningful, not vacuous: `Navbar.tsx` renders two real `<nav aria-label="Main navigation">`/`<nav aria-label="Mobile navigation">` landmarks, so `queryAllByRole('navigation')` would return length 2, not 0, if the guard regressed — verified by reading `Navbar.tsx` directly rather than assuming the assertion has teeth.

**Must-fix**

Must-fix: none.

**Nice-to-have**
- `frontend/src/pages/Login.tsx:7` — the guard branches on `token` alone, not `stores/auth.ts`'s `initialized` flag. On a hard reload of `/login` while a valid session already sits in `localStorage`, there's a brief window (until `supabase.auth.getSession()` resolves) where `token` reads `null` and the login form renders before the redirect fires on the next store update. Not a regression this diff introduces — `RequireAuth.tsx` and `VerifyEmail.tsx` both branch on `token` alone too, and it cannot reproduce the reported bug, since `Layout`'s `{token && <Navbar />}` reads the same field and stays suppressed for that identical window. Independently corroborated by e2e-test-writer's `### E2E coverage` note (same observation, same conclusion: pre-existing, cross-cutting, out of scope). Worth its own feature file if an app-wide `initialized`-aware guard pass ever becomes worth doing — not this fix.
- `frontend/src/pages/Login.test.tsx:13-30,32-46` — each test bundles 3 assertions (positive render target, negated heading, negated `navigation` landmarks) rather than one assertion per test per `~/.claude/agents.md`'s TDD guideline. Not asking for a split: this exactly mirrors the existing sibling pattern in `RequireAuth.test.tsx`, and matching local precedent here is worth more than dogmatic adherence.
- Open Questions (this file) — if `Register.tsx` gets the same already-authenticated guard in a fast-follow, consider extracting a small shared `RequireGuest`/`GuestOnly` wrapper (mirroring `RequireAuth.tsx`) at that point so `if (token) return <Navigate .../>` isn't hand-duplicated a third time. Premature to extract now for a single call site.

**Acceptance criteria spot-check**
- [x] Visiting `/login` while already authenticated redirects to `/` instead of rendering the login form, Navbar never renders on `/login` — guard is a pre-render synchronous early return (no flash possible); redirect target exactly `/`, `replace`; confirmed by diff read, independent `vitest run` (2/2 pass), and `after.png`.
- [x] Visiting `/login` while unauthenticated is unchanged: form renders, no Navbar — unauthenticated JSX path is byte-identical to before this diff; confirmed by diff, by `Login.test.tsx`'s second test, and by the pre-existing unauthenticated `a11y.test.tsx` "Login" case (still green, no `withAuth()` call).
- [x] At least one test covers the already-authenticated redirect, alongside existing `Login`/`LoginForm` smoke tests — `Login.test.tsx` (new, co-located next to `Login.tsx`) has 2 tests covering both branches; `LoginForm.test.tsx` and `RequireAuth.test.tsx` left untouched and still pass (verified independently: 15/15 across all three files, no regressions).

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
