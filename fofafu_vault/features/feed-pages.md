---
slug: feed-pages
title: Announcements feed UI — list, compose, react, comment
owner: engineering
collaborators: [design]
status: shipped
priority: P0
created: 2026-05-17
target: 2026-05-17
links:
  kanban: "[[kanban/engineering]]"
---

# Announcements feed UI

Third Phase 3 feature. Renders the announcements-feed backend so families can post, react, and comment. Edit/delete UI for posts deferred (the backend supports it; UI in a later polish pass).

## Acceptance criteria

- [x] `/feed` shows newest-first posts with composer at the top.
- [x] Composer submits a new post; the feed updates without a reload.
- [x] Each post shows reactions; tapping a reaction toggles add/remove/switch.
- [x] `/post/:id` shows a single post with its full comment thread and a comment composer.
- [x] All routes behind `RequireAuth`.
- [x] At least one RTL test per new component (composer + reaction bar + comment form).

---

## Engineering — Acceptance

### Frontend

| Path | Purpose |
|---|---|
| `api/announcements.ts` | typed list/get/create + comment endpoints + reaction toggle |
| `features/feed/components/AnnouncementComposer.tsx` | RHF+Zod compose form |
| `features/feed/components/AnnouncementCard.tsx` | post card with reaction bar + link to detail |
| `features/feed/components/ReactionBar.tsx` | 5 buttons with counts; toggles via mutation |
| `features/feed/components/CommentForm.tsx` | RHF+Zod comment compose |
| `features/feed/components/CommentList.tsx` | ordered list of comments |
| `pages/Feed.tsx` | composer + paginated feed |
| `pages/AnnouncementDetail.tsx` | single post + comments thread |
| `App.tsx` (patch) | mount `/feed` and `/post/:id` behind RequireAuth |

### Test plan

- AnnouncementComposer: submits with the expected body shape, clears on success.
- ReactionBar: toggles like → unlike (mock returns toggled:'added'|'removed').
- CommentForm: submits, clears the textarea.

### E2E coverage

| Scenario | Spec | Status |
|---|---|---|
| Feed lists existing posts and a family can compose a new one | `frontend/e2e/feed-pages.spec.ts` | pass |

---

## Design — Spec

Cards on `surface-card` with `shadow-lift`, headings weight 540, pill reactions inline. Mono kicker for the timestamp.

---

*Shipped 2026-05-17. Frontend only.*
