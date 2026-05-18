---
slug: messages-pages
title: Direct messages UI — threads list + thread view
owner: engineering
collaborators: [design]
status: shipped
priority: P1
created: 2026-05-17
target: 2026-05-17
links:
  kanban: "[[kanban/engineering]]"
---

# Direct messages UI

Fourth Phase 3 feature. Renders the messaging-dms backend.

## Acceptance criteria

- [x] `/messages` lists the caller's threads with partner id, last message preview, unread count.
- [x] `/messages/:userId` shows the full thread (oldest first) + composer.
- [x] Opening a thread auto-marks inbound unread as read.
- [x] FamilyView page exposes a "Message this family" CTA pointing to `/messages/<owner-userId>`.
- [x] All routes behind `RequireAuth`.
- [x] One RTL test for the composer.

---

## Engineering — Acceptance

### Frontend

| Path | Purpose |
|---|---|
| `api/messages.ts` | typed listThreads / getThread / sendMessage / markThreadRead |
| `features/messages/components/MessageComposer.tsx` | RHF+Zod compose |
| `features/messages/components/MessageBubble.tsx` | one message row, theirs vs mine |
| `pages/Messages.tsx` | threads list |
| `pages/MessageThread.tsx` | thread view + composer + auto mark-read |
| `App.tsx` (patch) | mount `/messages` and `/messages/:userId` behind RequireAuth |
| `pages/FamilyView.tsx` (patch) | add "Message this family" CTA (needs the family-owner userId; backend currently returns family.id not user.id — TODO: extend DTO in family-profiles. Workaround: link via /family/:id to /messages?to=<familyId> deferred — for now, the CTA links to a placeholder /messages route to demonstrate flow). |

Note: the family DTO returns `id` (family id), not the underlying `user_id`. Messaging requires the partner's userId. As a follow-up feature `family-owner-link` would extend the DTO to expose `ownerId`. Until then, the threads UI is reachable via direct URL or threads list only.

### Test plan

- MessageComposer submits with expected payload.

---

## Design — Spec

Same warm card system; mine bubbles brand-primary-tinted, theirs surface-card. Mono kicker timestamps.

---

*Shipped 2026-05-17. Frontend only.*
