---
slug: login-page-navbar-leak
title: Login page shows the main-nav header when already authenticated
owner: engineering
collaborators: []
status: drafting
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
