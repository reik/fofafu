---
slug: profile-pages
title: Family profile pages — view and edit
owner: engineering
collaborators: [design]
status: shipped
priority: P0
created: 2026-05-17
target: 2026-05-17
links:
  kanban: "[[kanban/engineering]]"
---

# Family profile pages — view and edit

Second Phase 3 feature. Renders the family page from the `family-profiles` backend. One page for the caller's own family (editable), one for any other family by id (read-only with `kidCount` masked).

## Acceptance criteria

- [x] `/family/me` shows the caller's family and lets them edit name, bio, kid count inline.
- [x] `/family/:id` shows another family read-only with `kidCount` hidden when not the owner (uses `isOwner` flag from the DTO).
- [x] Successful PATCH refreshes the page via TanStack Query invalidation.
- [x] Form validation matches backend Zod schema (max bio 2000, kidCount 0–20).
- [x] Both routes are protected by `RequireAuth`.
- [x] At least one RTL smoke test per surface.

---

## Engineering — Acceptance

### Frontend

**Files (under `frontend/src/`)**

| Path | Purpose |
|---|---|
| `api/family.ts` | typed `getMyFamily`, `getFamily`, `patchFamily` |
| `features/family/components/FamilyHeader.tsx` | name + bio + kid_count chip; renders viewer badge |
| `features/family/components/FamilyEditForm.tsx` | RHF + Zod inline edit (cancel/save) |
| `pages/FamilyMe.tsx` | view + toggle-into-edit; calls patch mutation |
| `pages/FamilyView.tsx` | read-only view by id param |
| `App.tsx` (patch) | mount `/family/me` and `/family/:id` behind RequireAuth |
| `pages/Home.tsx` (patch) | link to "Your family page" |

### Test plan

- FamilyEditForm: submits valid input, calls api.patchFamily.
- FamilyHeader: hides kidCount when isOwner=false.

### E2E coverage

| Scenario | Spec | Status |
|---|---|---|
| Owner edits their family page bio and sees it saved | `frontend/e2e/profile-pages.spec.ts` | pass |
| Visiting another family's page shows a "Message this family" link | `frontend/e2e/profile-pages.spec.ts` | pass |

---

## Design — Spec

Mirrors the Phase 1 worked example: card on `surface-card`, h1 weight 540, pill CTA, kid count as a mono chip when present.

---

*Shipped 2026-05-17. Frontend only.*
