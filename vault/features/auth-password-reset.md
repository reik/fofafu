---
slug: auth-password-reset
title: Password reset (forgot, reset, change)
owner: engineering
collaborators: [design, marketing]
status: shipped
priority: P0
created: 2026-05-16
target: 2026-05-16
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Password reset (forgot, reset, change)

Closes out the auth surface. Two unauthenticated endpoints for the lost-password flow, one authenticated for in-app password change. The two unauthenticated endpoints respond identically whether the email exists or not — account-enumeration prevention.

## Acceptance criteria

- [x] `POST /api/auth/forgot-password` always returns 200 with the same generic message regardless of whether the email exists.
- [x] `POST /api/auth/reset-password` accepts `{ token, password }`, flips the password, burns the token.
- [x] `POST /api/auth/change-password` (JWT-protected) accepts `{ currentPassword, newPassword }`, verifies the current password, rotates.
- [x] Reset tokens are single-use, 1-hour TTL.
- [x] Integration tests cover happy paths + enumeration + token re-use + auth-required.

---

## Engineering — Acceptance

### Backend

| Method | Route | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/forgot-password` | no | `{ email }` | 200 (always) |
| POST | `/api/auth/reset-password` | no | `{ token, password }` | 200 / 400 |
| POST | `/api/auth/change-password` | yes (JWT) | `{ currentPassword, newPassword }` | 200 / 400 / 401 |

**DB schema (added by this feature)**

```sql
CREATE TABLE password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
```

**Security**

- Forgot-password always returns the same 200 + same message body. Timing leak (bcrypt + DB write path only fires when user exists) noted for a later `auth-hardening` feature.
- Reset-token TTL: 1 hour (vs 24h for email verification).
- Tokens single-use; transactional burn-and-rotate.
- Change-password requires current password.

### Frontend

Deferred to Phase 3 (`auth-pages`).

### Test plan

Added to `backend/tests/auth.test.ts` (7 new cases): forgot known/unknown, reset happy, reset reused token, change happy, change wrong-current, change without JWT.

---

## Design — Spec

### Microcopy

| key | string |
|---|---|
| `email.reset.subject` | fofafu — reset your password |
| `email.reset.heading` | Reset your fofafu password |
| `email.reset.body` | Hi {name}, we got a request to reset your password. Tap the button below if it was you. |
| `email.reset.cta` | Set a new password |
| `email.reset.footer` | Link expires in 1 hour. If you didn't ask for this, ignore this email — your password stays unchanged. |
| `api.forgot.response` | If that email exists, a reset link has been sent. |

### Accessibility

Same shape as the verification email: semantic h1, single pill CTA on `color.brand.primary` (white on green, 4.74:1).

---

## Marketing — Spec

### Launch copy

**Release note**

> Forgot your password? Now you can fix it without emailing us. Reset by email, set a new password, sign back in.

### Growth

**Primary metric**: % of reset requests that lead to a successful login within 24h. Target: 60%.

**Guardrails**: bounced reset emails < 2%; no spike in support tickets tagged `password`.

---

*Shipped 2026-05-16. Backend only.*
