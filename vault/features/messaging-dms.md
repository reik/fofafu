---
slug: messaging-dms
title: Direct messages between families
owner: engineering
collaborators: [design, marketing]
status: shipped
priority: P1
created: 2026-05-17
target: 2026-05-17
links:
  kanban: "[[kanban/engineering]]"
---

# Direct messages between families

Two foster families can exchange private messages. No groups, no attachments (this feature). The reply UI sees a thread per partner; the backend stores per-message rows.

## Acceptance criteria

- [x] `POST /api/messages` sends a message to another user; cannot send to self.
- [x] `GET /api/messages/threads` returns one row per partner with the last message preview + unread count for that thread.
- [x] `GET /api/messages/threads/:userId` returns the full ordered thread with another user.
- [x] `POST /api/messages/threads/:userId/read` marks all inbound messages from that user as read.
- [x] `GET /api/messages/unread/count` returns total unread for the caller.
- [x] All endpoints JWT-protected.
- [x] Tests cover send, self-send rejection, thread listing, unread accounting, mark-read transition.

---

## Engineering — Acceptance

### Backend

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/api/messages` | `{ to: userId, content }` | 201 `Message` |
| GET | `/api/messages/threads` | — | 200 `Thread[]` (sorted by last-message time desc) |
| GET | `/api/messages/threads/:userId` | — | 200 `Message[]` (oldest first) |
| POST | `/api/messages/threads/:userId/read` | — | 200 `{ marked: number }` |
| GET | `/api/messages/unread/count` | — | 200 `{ count: number }` |

**DB schema (added)**

```sql
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_sender   ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_pair     ON messages(sender_id, receiver_id, created_at);
```

**Validation (Zod)** — `SendMessageInput`, `ThreadParams` in `backend/src/schemas/message.schemas.ts`.

**Thread aggregation**

`GET /threads` returns one row per partner using a window-style query: for each `partner_id = (sender_id ≠ self ? sender_id : receiver_id)`, pick the row with `MAX(created_at)`, plus `COUNT(*) FILTER WHERE receiver_id = self AND read = 0` as the unread count.

### Frontend

Deferred to Phase 3.

### Test plan

`backend/tests/messages.test.ts` — 7 cases: send + read-back, self-send rejected, thread listing with two partners ordered by recency, thread view by partner, mark-read flips read flag, unread-count, all endpoints 401 without JWT.

---

## Design — Spec

API only. Microcopy:

| key | string |
|---|---|
| `message.send.self` | You can't send a message to yourself. |
| `message.send.unknown` | We couldn't find that person. |

---

## Marketing — Spec

### Launch copy

**Release note**

> DMs are on. Reach out to another foster family one-to-one. Quiet, no group chats, no attachments yet.

### Growth

**Primary metric**: weekly active conversers (families that sent at least one message in the last 7 days). Target: 15% of registered families within 30 days.

---

*Shipped 2026-05-17. Backend only.*
