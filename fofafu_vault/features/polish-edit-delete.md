---
slug: polish-edit-delete
title: Edit & delete UI on announcements + comments
owner: engineering
collaborators: [design]
status: shipped
priority: P1
created: 2026-05-18
target: 2026-05-18
links:
  kanban: "[[kanban/engineering]]"
---

# Polish — edit & delete UI

Backend already supports `PATCH /api/announcements/:id`, `DELETE /api/announcements/:id`, and `DELETE /api/comments/:id` (all author-only). This feature surfaces the buttons.

## Acceptance criteria

- [x] Author sees an "Edit" / "Delete" affordance on their own announcement card and detail page.
- [x] Edit toggles an inline form pre-filled with the current content + media.
- [x] Delete shows a confirm prompt and removes the post from the feed.
- [x] Author sees a small "delete" link on their own comments.
- [x] RTL tests cover the patch and delete flows.

---

## Engineering — Acceptance

### Frontend
- `api/announcements.ts`: add `patchAnnouncement` and `deleteAnnouncement` + `deleteComment` exports.
- `features/feed/components/AnnouncementEditForm.tsx`: inline RHF+Zod form, calls patch.
- `AnnouncementCard.tsx`: render edit/delete actions when `isAuthor`; toggle inline edit.
- `AnnouncementDetail.tsx`: same actions.
- `CommentList.tsx`: render a small "delete" link on `isAuthor` comments.

### Test plan
- Edit form submits the patch and exits edit mode.
- Delete fires the mutation and the card disappears from the list.

---

*Shipped 2026-05-18. Frontend only.*
