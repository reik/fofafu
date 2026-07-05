---
slug: family-profiles
title: Family profile API (read self, read other, patch self)
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

# Family profile API

Real version of the Phase 1 worked-example feature [[features/user-profile]]. Adds the `families` table, three endpoints, and an auto-create on registration so every authenticated user always has a family row to return.

## Acceptance criteria

- [x] Registration auto-creates a families row with `name` = the user's registration name and an empty bio.
- [x] `GET /api/family/me` returns the caller's family with all fields.
- [x] `GET /api/family/:id` returns public fields (id, name, bio); `kid_count` only when caller is the owner.
- [x] `PATCH /api/family/me` accepts `{ name?, bio?, kidCount? }`; updates `updated_at`.
- [x] All endpoints behind JWT auth (no public family pages — matches the noindex decision in the worked-example spec).
- [x] Integration tests cover happy paths + auth required + privacy of kid_count + 404 for unknown id.

---

## Engineering — Acceptance

### Backend

| Method | Route | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/family/me` | yes | — | `Family` (full) |
| GET | `/api/family/:id` | yes | — | `Family` (kid_count masked unless owner) |
| PATCH | `/api/family/me` | yes | `{ name?, bio?, kidCount? }` | `Family` (full) |

**DB schema (added)**

```sql
CREATE TABLE families (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  bio         TEXT NOT NULL DEFAULT '',
  kid_count   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_families_user ON families(user_id);
```

**Registration side-effect**

`POST /api/auth/register` now also inserts a families row in the same transaction. `families.name` = `users.name` at create time. The bio starts empty and `kid_count` is NULL.

**Validation (Zod)** — `FamilyPatch` in `backend/src/schemas/family.schemas.ts`.

### Frontend

Deferred to Phase 3 (`profile-pages` feature).

### Test plan

`backend/tests/family.test.ts` — 7 cases: registration creates family, get-me returns it, patch rotates fields + updated_at, get-by-id by another user masks kid_count, get-by-id of unknown returns 404, all endpoints 401 without JWT, PATCH validates kid_count range.

---

## Design — Spec

This feature is API-only. The visual spec lives in [[features/user-profile]] (Phase 3 frontend will consume both).

---

## Marketing — Spec

### Launch copy

**Release note**

> Every family on fofafu now has a page. Today it's just the API — the page you can see is coming in Phase 3.

### Growth

Carries the metric from `[[features/user-profile]]`: 50% of families with a saved bio of >=40 chars within 7 days of first login.

---

*Shipped 2026-05-16. Backend only.*
