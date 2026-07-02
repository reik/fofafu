---
slug: family-owner-link
title: Expose ownerId in family DTO + "Message this family" CTA
owner: engineering
collaborators: [design]
status: shipped
priority: P1
created: 2026-05-18
target: 2026-05-18
links:
  kanban: "[[kanban/engineering]]"
---

# family-owner-link

The family DTO returns `family.id` but messaging requires the underlying `user_id`. This feature exposes `ownerId` so the FamilyView page can link to a thread with the owner.

## Acceptance criteria

- [x] Backend `Family` DTO now includes `ownerId` = `families.user_id`.
- [x] Existing family tests still pass.
- [x] Frontend Zod schema parses `ownerId`.
- [x] FamilyView page renders "Message this family" pill linking to `/messages/<ownerId>` when viewing someone else's family.
- [x] Self-view does not show the CTA.

---

## Engineering

### Backend
- `family.controller.ts` → `toFamilyDTO` includes `ownerId: row.user_id`.
- `tests/family.test.ts` → no contract change needed; existing tests don't assert on absence of ownerId. Updated where helpful.

### Frontend
- `api/family.ts` → `FamilyDTO.ownerId: z.string()`.
- `pages/FamilyView.tsx` → "Message this family" CTA when `!data.isOwner`.

---

*Shipped 2026-05-18.*
