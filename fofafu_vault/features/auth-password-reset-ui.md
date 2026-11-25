---
slug: auth-password-reset-ui
title: Password reset UI — forgot + reset password pages
owner: engineering
collaborators: []
status: building
priority: P1
created: 2026-08-22
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Password reset UI — forgot + reset password pages

## Problem

Password reset has shipped on the backend twice over — once as Express endpoints ([[features/auth-password-reset]], explicitly "backend only") and again as Supabase Auth wiring during the Render migration (`requestPasswordReset`/`updatePassword` in `frontend/src/api/auth.ts`, already calling `supabase.auth.resetPasswordForEmail`/`updateUser`, with `redirectTo` already pointed at `/reset-password`) — but no UI has ever called either. `LoginForm.tsx` has no "Forgot password?" link, and there is no `/forgot-password` or `/reset-password` route anywhere in the frontend router. The only trace of the feature is plain text inside the invalid-credentials error message, which engineering explicitly logged as a pragmatic stopgap (kanban `eng-infra-4`: "Forced-password-reset AC satisfied pragmatically... client can't distinguish [wrong password from] a pre-migration account with no Supabase Auth record"). That text currently points at a page that doesn't exist. Anyone who forgets their password, or holds a pre-migration account, is stuck with no way forward.

## Acceptance criteria

- [x] Login page shows a "Forgot password?" link near/under the password field (placement reference: `~/dev/fofa/frontend/src/pages/LoginPage.tsx`), routing to `/forgot-password`.
- [x] `/forgot-password` page: email field, calls the existing `requestPasswordReset(email)` (`frontend/src/api/auth.ts`), always shows the same generic confirmation regardless of whether the account exists (no enumeration — matches the message already returned by `requestPasswordReset`).
- [ ] `/reset-password` page: hosts the post-magic-link flow. Supabase's client auto-detects the recovery session from the redirect URL (`detectSessionInUrl`, on by default), so this page does **not** need to parse a manual `?token=` param the way `~/dev/fofa`'s Express-backed `ResetPasswordPage` does — that part of the reference implementation does not port faithfully and needs adapting, not copying. New-password field, calls the existing `updatePassword(newPassword)`, shows success/error, redirects to `/login` (or `/`) on success.
- [ ] Both routes registered in `App.tsx`; visual style matches the existing auth pages (single-column, ≤480px, centered, tokens from `fofafu_vault/standards/design-system.md`).
- [ ] At least one Vitest smoke test per new page, following `LoginForm.test.tsx` / `RegisterForm.test.tsx` conventions (msw at the network boundary, not module mocks).

## Out of scope

- Any backend/API changes — `requestPasswordReset` and `updatePassword` already exist and are already Supabase-backed. This is a pure frontend feature.
- The in-app "change password" flow for already-authenticated users (already covered by the same `updatePassword`; no dedicated page requested here).
- Re-litigating the pragmatic invalid-credentials copy decided in `eng-infra-4`.

## Open questions

- Should this route through design-lead for a microcopy/visual pass, or does reusing the Login/Register pattern make that unnecessary? `auth-password-reset.md` already speced the *reset email's* copy; the on-page form copy (field labels, button text, confirmation/error states) is still undefined.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

**Delivery: two PRs, because screenshots plus both halves would exceed the 16-file limit.**

1. **Forgot password (this PR).** "Forgot password?" link in `LoginForm`; `ForgotPasswordForm` + `pages/ForgotPassword.tsx` (public route `/forgot-password`, signed-in visitors redirect to `/`); `ForgotPasswordPayload` Zod schema in `api/auth.ts`. Shows the generic confirmation from `requestPasswordReset` for every valid email (no enumeration) and a separate alert if the request itself fails. `App.tsx` no longer exists: routes live in `src/router.tsx` (see [[features/router-provider-refactor]]). Tests: `ForgotPasswordForm.test.tsx` (5), `LoginForm.test.tsx` (+1), `router.test.tsx` (+1); vitest 410/410, tsc clean. Screenshots: `docs`-style assets under `.github/pr-assets/forgot-password-*.png`.
2. **Reset password (next PR).** `/reset-password`: new-password + confirm fields, `updatePassword`, wait for the auth store's `initialized` flag (Supabase parses the recovery token from the URL hash itself), expired-link state when there is no recovery session.

Link colour uses `text-brand-primary-pressed`, not `text-brand-primary` (the latter is ~3.4:1 on the cream surface).

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
