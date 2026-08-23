---
slug: forgot-password-ui
title: Forgot Password UI
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-08-22
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Forgot Password UI

## Problem

A user who forgets their password has no way to recover their account today. The login page's own failure message tells them to "use \"Forgot password\" to set a new one" — but there is nothing to click. No link exists anywhere in the UI, and neither `/forgot-password` nor `/reset-password` is a registered route, even though the latter is the exact URL `requestPasswordReset`'s `redirectTo` already points at. The API layer is not the gap: `frontend/src/api/auth.ts` already exports `requestPasswordReset(email)` and `updatePassword(newPassword)`, both wired to Supabase's native auth flow, unused by anything. Success = a locked-out user can find a "Forgot password?" link on `/login`, request a reset email, follow it, set a new password, and sign in — the full loop, not just the API half of it.

## Acceptance criteria

- [ ] A "Forgot password?" link is visible on the login page/form and routes to a new `/forgot-password` page.
- [ ] The forgot-password page takes an email, calls `requestPasswordReset`, and always shows the same generic confirmation regardless of whether the email exists (account-enumeration prevention — `requestPasswordReset`'s return message already reads this way; the page should not add its own success/failure branching on top of it).
- [ ] A `/reset-password` page exists — the exact route `requestPasswordReset`'s `redirectTo` already targets — where a user arriving from the emailed link sets a new password via `updatePassword`.
- [ ] After a successful reset, the user reaches a clear confirmation and a path to `/login` (or is signed in directly, if Supabase's recovery-link session makes that the simpler path — see Open questions).
- [ ] Both new pages follow the existing `LoginPage`/`RegisterPage` visual and form conventions (RHF + Zod, same layout shell) rather than introducing a new pattern.

## Out of scope

- In-app "change password while signed in" (a settings-page flow) — `updatePassword` already supports it, but no UI is being requested here; separate future feature.
- Any backend/Edge Function work — `requestPasswordReset`/`updatePassword` already exist and work against Supabase's built-in auth today; this is frontend-only.
- Correcting `[[features/auth-password-reset]]`'s stale `status: shipped` / Express-era `### Backend` section — left as historical record; not this feature's writer-ownership.

## Open questions

- Does Supabase's password-recovery link grant a session immediately on landing at `/reset-password` (letting the user skip re-entering credentials after `updatePassword` succeeds), or does the flow need an explicit "now sign in" step? Confirm against `supabase-js`'s actual recovery-session behavior during spec.

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
