---
slug: forgot-password-ui
title: Forgot Password UI
owner: engineering            # primary team: engineering | design | marketing
collaborators: [design, marketing]  # inferred by dispatcher at /dispatch time from AC's UI/copy content
status: abandoned              # drafting | speced | building | review | shipped | blocked | abandoned
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

Covers the "Forgot password?" link, both new pages (`/forgot-password`, `/reset-password`), their two confirmation states, and error states. Voice per `standards/design-system.md` Voice & Tone + the `microcopy-voice` skill: plural "we", active voice, warm not saccharine, no exclamation marks outside CTAs, no emoji. Checked `frontend/src/pages/*.tsx` and `frontend/src/features/auth/**` before writing — no `/forgot-password` or `/reset-password` implementation exists yet, so there's no frontend-dev placeholder copy to reconcile against; this table is the first and canonical source.

**Canonical AC2 confirmation string** — single source of truth for frontend-dev:

> `forgotPassword.confirmation.body` = **"If an account exists for that email, we've sent a reset link."**

This is an on-voice rewording of `requestPasswordReset`'s current resolved value in `frontend/src/api/auth.ts` (`'If an account exists for that email, a reset link is on its way.'`) — same enumeration-safe "if an account exists" conditional preserved verbatim, reworded from an impersonal/passive construction into the platform's plural-"we" voice. Precedent for not rendering the API's returned `{ message }` string verbatim already exists in this codebase: `frontend/src/pages/Register.tsx`'s `RegisterPage` ignores `register()`'s resolved `"Check your email to confirm your account."` entirely and writes its own confirmation JSX instead. Do the same here — call `requestPasswordReset` for its side effect and error-throwing behavior only, then always render the string above, regardless of what `result.message` contains. Do not branch on response content (per AC2, the page adds no success/failure branching on top of the already-generic call).

`[[features/auth-password-reset]]` is stale (Express-era, superseded) — used for table-shape reference only, per task instructions. None of its content, including its `api.forgot.response` string ("If that email exists, a reset link has been sent."), was reused anywhere below.

| key | string |
|---|---|
| `login.forgotPasswordLink` | Forgot password? |
| `forgotPassword.heading` | Forgot your password? |
| `forgotPassword.intro` | Enter your email and we'll send you a link to set a new one. |
| `forgotPassword.email.label` | Email |
| `forgotPassword.email.error.invalid` | That does not look like an email. |
| `forgotPassword.submit.default` | Send reset link |
| `forgotPassword.submit.pending` | Sending… |
| `forgotPassword.confirmation.heading` | Check your email |
| `forgotPassword.confirmation.body` | If an account exists for that email, we've sent a reset link. |
| `forgotPassword.error.generic` | Something went wrong. Try again? |
| `forgotPassword.error.rateLimit` | You've already requested a reset recently. Check your inbox, or try again in a few minutes. |
| `resetPassword.heading` | Set a new password |
| `resetPassword.intro` | Choose a new password for your account. |
| `resetPassword.password.label` | New password |
| `resetPassword.password.error.tooShort` | Use at least 8 characters. |
| `resetPassword.submit.default` | Set new password |
| `resetPassword.submit.pending` | Setting your password… |
| `resetPassword.confirmation.heading` | Password updated |
| `resetPassword.confirmation.body` | You've set a new password. Sign in to continue. |
| `resetPassword.confirmation.loginLink` | Back to sign in |
| `resetPassword.error.generic` | Something went wrong. Try again? |

**Optional / contingent additions** — not required by the literal task scope (link, headings/intro, labels, buttons, validation, the two confirmation states, one generic-failure error). Supplied so frontend-dev isn't blocked on a follow-up round if design/product lands on including any of these; none override the canonical table above.

| key | string | why it's here |
|---|---|---|
| `resetPassword.confirmPassword.label` | Confirm new password | Optional second field. `RegisterForm` has no confirm-password field, so strict parity says skip it here too — but I'd lean toward including it on this page specifically, since a typo here locks the user out with no fallback (unlike registration, where a typo just means "wrong password next login," recoverable via this very flow). Product call for design-lead/frontend-dev, not mine to force. |
| `resetPassword.confirmPassword.error.mismatch` | Those passwords don't match. | Pairs with the row above — only needed if the confirm field ships. |
| `resetPassword.confirmation.signedIn.body` | You're all set — you're signed in. | Contingent on the feature file's Open Question (does landing on `/reset-password` via Supabase's recovery link grant a session immediately). Phrasing deliberately parallels `frontend/src/pages/VerifyEmail.tsx`'s existing authenticated-state copy ("Thanks for confirming your email — you're signed in."). Use instead of, not alongside, `resetPassword.confirmation.body` + `.loginLink` if the open question resolves toward auto-sign-in. |
| `resetPassword.confirmation.signedIn.feedLink` | Go to your feed | Pairs with the row above — reuses `VerifyEmail.tsx`'s exact authenticated-state link text. |
| `resetPassword.error.invalidLink.body` | This reset link isn't valid anymore. | Beyond the literal task scope (which named network/rate-limit specifically) — flagging because an expired or already-used Supabase recovery link landing on `/reset-password` is a realistic failure mode for this exact feature, not a hypothetical one. Trim if design-lead judges it out of scope for this pass. |
| `resetPassword.error.invalidLink.cta` | Request a new link | Pairs with the row above; routes back to `/forgot-password`. |
| `forgotPassword.confirmation.body.extended` | If an account exists for that email, we've sent a reset link. Check your spam folder if you don't see it soon. | Optional two-sentence alternative to the canonical one-line confirmation, if the confirmation state has visual room. Does not change the canonical string's status as source of truth — this is a longer variant of it, not a competing one. |

**Notes**

1. Canonical AC2 string is `forgotPassword.confirmation.body`, called out in full above — treat it as the single source of truth frontend-dev needs.
2. `forgotPassword.confirmation.heading` ("Check your email") deliberately reuses `Register.tsx`'s exact confirmation heading — same instruction to the user ("go check your inbox now"), same phrase, intentional not accidental.
3. `resetPassword.confirmation.loginLink` ("Back to sign in") is the AC4 path-to-`/login` deliverable. It deliberately reuses `Register.tsx`'s exact post-confirmation link text for cross-page consistency across every "you're done, here's the way back" state in the app.
4. `forgotPassword.email.error.invalid` and `resetPassword.password.error.tooShort` reuse `LoginPayload`/`RegisterPayload`'s existing Zod validation messages verbatim (`frontend/src/api/auth.ts`) — same words, same 8-character rule, so the two new forms don't introduce a second voice for a validation rule that's already established elsewhere in the app.
5. Minor pre-existing inconsistency, flagged not fixed (outside `### Microcopy` writer-ownership): `auth.ts`'s `INVALID_CREDENTIALS_MESSAGE` already quotes the link as `"Forgot password"` (no question mark). The canonical link text here is `Forgot password?` (with one) — it reads better as a standalone link and matches this task's own framing. For engineering's awareness only.
6. The `forgotPassword.error.*` rows cover the "genuine failure" ask directly: `.generic` is the sitewide fallback reused verbatim from `LoginForm.tsx`/`RegisterForm.tsx`'s own `onError` handlers (`'Something went wrong. Try again?'`), and `.rateLimit` is an on-voice override for when `AuthError`'s raw `error.message` is Supabase's technical rate-limit text — same pattern `RegisterForm.tsx` already uses to intercept and reword its "already registered" case rather than showing the raw Supabase message.

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
