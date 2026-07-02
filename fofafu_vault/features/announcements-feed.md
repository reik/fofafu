---
slug: announcements-feed
title: Announcements feed with comments and reactions
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

# Announcements feed with comments and reactions

The core product loop. Foster families share short posts; others react and comment. Three new tables. Image uploads are a separate `uploads-images` feature — this feature accepts `mediaUrl` if provided but does not handle the upload pipeline.

## Acceptance criteria

- [x] `POST /api/announcements` creates a post.
- [x] `GET /api/announcements?cursor=…&limit=…` returns a cursor-paginated feed (newest first).
- [x] `GET /api/announcements/:id` returns one post with aggregated reactions and caller's own reaction.
- [x] `PATCH /api/announcements/:id` and `DELETE /api/announcements/:id` enforce author-only.
- [x] `POST /api/announcements/:id/comments` + `GET …/comments` + `DELETE /api/comments/:id` (author-only).
- [x] `POST /api/announcements/:id/reactions { type }` toggles — POST creates if absent, deletes if present. 5 types: like, love, hug, celebrate, support.
- [x] All endpoints behind JWT.
- [x] Integration tests cover happy paths, author-only enforcement, reaction toggle, and feed pagination.

---

## Engineering — Acceptance

### Backend

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/api/announcements` | `{ content, mediaUrl?, mediaType? }` | 201 `Announcement` |
| GET | `/api/announcements?cursor=&limit=` | — | 200 `{ items: Announcement[], nextCursor }` |
| GET | `/api/announcements/:id` | — | 200 `Announcement` |
| PATCH | `/api/announcements/:id` | `{ content?, mediaUrl?, mediaType? }` | 200 `Announcement` (author only) |
| DELETE | `/api/announcements/:id` | — | 204 (author only) |
| POST | `/api/announcements/:id/comments` | `{ content }` | 201 `Comment` |
| GET | `/api/announcements/:id/comments` | — | 200 `Comment[]` |
| DELETE | `/api/comments/:id` | — | 204 (author only) |
| POST | `/api/announcements/:id/reactions` | `{ type }` | 200 `{ toggled: 'added'\|'removed', reactions, myReaction }` |

**DB schema (added)**

```sql
CREATE TABLE announcements (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  media_url   TEXT,
  media_type  TEXT CHECK(media_type IN ('image','video') OR media_type IS NULL),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX idx_announcements_user ON announcements(user_id);

CREATE TABLE comments (
  id              TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_announcement ON comments(announcement_id, created_at);

CREATE TABLE reactions (
  id              TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK(type IN ('like','love','hug','celebrate','support')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(announcement_id, user_id)
);
CREATE INDEX idx_reactions_announcement ON reactions(announcement_id);
```

**Pagination**: cursor = the oldest seen `created_at` value in the previous page; next page is `WHERE created_at < cursor`. Limit clamped to 1..100, default 20.

### Frontend

Deferred to Phase 3 (`feed-pages` feature).

### Test plan

`backend/tests/announcements.test.ts` — 11 cases: create + read, list + pagination, author-only patch, author-only delete, comments CRUD, comment author-only delete, reaction add, reaction toggle-off, reaction switch type, reactions aggregate, all endpoints 401 without JWT.

---

## Design — Spec

Visual deferred to Phase 3. Microcopy for the API error messages:

| key | string |
|---|---|
| `announcement.create.empty` | Add a few words before posting. |
| `announcement.forbidden` | Only the author can change or delete this post. |
| `reaction.unknown_type` | That reaction isn't one we know yet. |

---

## Marketing — Spec

### Launch copy

**Release note**

> The feed is on. Share what's going on at home, react to other families' posts, comment when you have something to say. Backend's in; the page lands in Phase 3.

### Growth

**Primary metric**: daily active posting families. Target: 25% of registered families post at least once per week within 30 days of launch.

**Guardrails**: comment-to-post ratio stays >= 0.5 (otherwise feed feels one-way); negative-reaction-only posts < 5% (we don't have downvote-only — all five reactions are positive).

---

*Shipped 2026-05-16. Backend only.*
