---
slug: family-avatar
title: Family avatar — image on the family page
owner: engineering
collaborators: [design]
status: shipped
priority: P2
created: 2026-05-18
target: 2026-05-18
links:
  kanban: "[[kanban/engineering]]"
---

# family-avatar

Adds an avatar image to family profiles. Reuses the existing image-upload backend.

## Acceptance criteria

- [x] `families.avatar_url TEXT NULL` migration.
- [x] `PATCH /api/family/me` accepts `avatarUrl: string | null`.
- [x] Family DTO returns `avatarUrl`.
- [x] FamilyHeader renders a circular avatar above the name; falls back to initials when null.
- [x] FamilyEditForm has an ImagePicker for the avatar; saving sets/clears `avatarUrl`.

---

## Engineering

### Backend
- migrate.ts: append `ALTER TABLE families ADD COLUMN avatar_url TEXT;` guarded by an IF NOT EXISTS-equivalent (SQLite: check pragma table_info before adding).
- Actually simpler: include the column in the CREATE TABLE for new DBs and use a pragma check for existing.
- schemas/family.schemas.ts: FamilyPatch accepts `avatarUrl: string.url() | null | undefined`.
- controller toFamilyDTO + patch handler: include avatar_url ↔ avatarUrl mapping.

### Frontend
- api/family.ts: FamilyDTO + FamilyPatchInput add `avatarUrl: string | null`.
- FamilyHeader: avatar circle (h-20 w-20 rounded-full) — image or first-initial badge.
- FamilyEditForm: ImagePicker bound to attached avatar; on save translates to avatarUrl.

### Test plan
- Backend: patch with avatarUrl sets and clears; get returns it.
- Frontend: FamilyHeader renders avatar when set, initial when not.

---

*Shipped 2026-05-18.*
