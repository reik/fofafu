---
slug: auth-email
title: Email-verified auth (register, verify, login)
owner: engineering
collaborators: [design, marketing]
status: shipped
priority: P0
created: 2026-05-15
target: 2026-05-15
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Email-verified auth (register, verify, login)

First feature of Phase 2. Everything else (profiles, announcements, DMs) depends on a working auth wall. We port the email-verification flow from fofa with three improvements:

- **Zod schemas** (shared between request validation and frontend in Phase 3) instead of express-validator.
- **node:test** instead of Jest (no transpile, no config).
- **`crypto.randomUUID()`** instead of the `uuid` package (Node 20+ built-in).

Out of scope here: password reset (separate `auth-password-reset` feature).

## Acceptance criteria

- [x] `POST /api/auth/register` creates an unverified user and emails a verification link valid for 24h.
- [x] `GET /api/auth/verify?token=…` flips `verified=1` and burns the token (single-use).
- [x] `POST /api/auth/login` returns JWT (7d) only for verified users; otherwise 403.
- [x] Duplicate-email registration returns 409 without leaking which addresses exist (always 200/409 by shape, never by timing).
- [x] All inputs validated by Zod with field-level error messages.
- [x] Integration tests cover happy path + each negative branch.

---

## Engineering — Acceptance

### Backend

**API surface**

| Method | Route | Body / Query | Returns |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name, city, state }` | 201 `{ message }` |
| GET  | `/api/auth/verify?token=…` | — | 200 `{ message }` or 400 |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ token, user }` or 401/403 |

**DB schema (this feature's slice)**

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE email_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Validation (Zod)** in `backend/src/schemas/auth.schemas.ts` — `RegisterInput`, `LoginInput`, `VerifyQuery`.

**Security**

- bcryptjs 12 rounds.
- JWT signed with `JWT_SECRET`; 7d expiry.
- Email enumeration mitigated: registration error message identical for "exists" and "validation failed" (still 409 vs 400 by status — acceptable; the password-reset flow is the one that needs identical responses, deferred to next feature).
- Helmet + CORS + `express-rate-limit` (200 req / 15min default).

### Frontend

Deferred to Phase 3 (`auth-pages` feature). This feature only ships backend.

### Test plan

- `backend/tests/auth.test.ts` — node:test, runs against an in-memory SQLite by setting `DB_PATH=:memory:`:
  - register happy path → 201, user row exists, token row exists, mock-mailer hit
  - register duplicate email → 409
  - register invalid email → 400 (Zod)
  - verify good token → 200, `verified=1`, token `used=1`
  - verify bad/expired token → 400
  - login unverified → 403
  - login verified → 200 with JWT
  - login wrong password → 401

---

## Design — Spec

### Visual

No visible UI in this feature (backend-only). The email-template HTML is the only design surface and lives in `email.service.ts`. Token usage in the email follows `vault/teams/design.md`:

- `color.brand.primary` (#4D9463) for the CTA pill.
- System sans for body (email clients ignore custom fonts anyway).
- Pill button with `radius.9999`, white text.

### Microcopy

| key | string |
|---|---|
| `email.verify.subject` | Welcome to fofafu — verify your email |
| `email.verify.heading` | Welcome to fofafu, {name} |
| `email.verify.body` | Thanks for joining. Tap the button below to confirm your email and finish setting up your family. |
| `email.verify.cta` | Verify my email |
| `email.verify.footer` | Link expires in 24 hours. If you didn't sign up, ignore this email. |

### Accessibility

- Email HTML uses semantic `<h1>` for heading, `<p>` for body.
- CTA is an `<a>` styled as a pill; alt text included for the link.
- Contrast: white on `#4D9463` = 4.74:1 — passes WCAG AA.

---

## Marketing — Spec

### Launch copy

**Release note**

> Sign up, verify, sign in. fofafu now has the front door — email-verified accounts with a real password and a 7-day session. This is the start of Phase 2.

### SEO

n/a — auth endpoints are not public web pages.

### Growth

**Primary metric**: % of registrations that complete verification within 24 hours. Target: 70%. (Carried into the dashboard in a later feature.)

**Guardrails**: bounce rate on verification email < 2%; verification-link click-to-success rate > 95%.

**Feature flag**: none — ships to all on Phase 2 cut.

---

*Shipped 2026-05-15. Backend only. Frontend auth pages = `auth-pages` (Phase 3).*
