---
slug: community-playdate-badge
title: Community Playdate Badge
owner: engineering
collaborators: []
status: building
priority: P2
created: 2026-07-16
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Community Playdate Badge

## Problem

The Community sidebar on the Home dashboard lists nearby families but gives
no signal about which of them are actually open to a playdate right now.
[[features/playdates]] shipped availability slots and a request flow, but
that surface is buried on `/family/:id` — a user has to click into every
family to discover they have a free slot. Success: a family with at least
one future free slot gets a small badge in the Community list; clicking it
jumps straight into the request flow instead of requiring a detour through
the profile page first.

## Acceptance criteria

- [x] Each family row in the Home dashboard's Community sidebar shows
      "City, State" on a second line, directly under the family name
- [x] If a family has at least one `status: free` availability slot with a
      future date, a "🗓 Playdate" badge renders on that same second line,
      next to City, State
- [x] Family name truncates with an ellipsis only past 24 characters;
      shorter names render in full (no truncation)
- [x] Clicking the badge navigates directly to the playdate request flow for
      that family's next free slot — not just the family profile page
- [x] Families with no future free slots render exactly as before (name +
      location, no badge)

## Out of scope

- Showing *which* slot/time on the badge itself (hover title only)
- Any change to `/family/:id`'s existing `FamilyAvailability` widget
- Community search page (`/search`) — same badge is a fast-follow if wanted

## Open questions

- None — reuses `availability_slots` table and `/family/:id` request flow
  from the already-shipped [[features/playdates]] feature.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

`GET /api/community/recent` now joins `users` (for `city`/`state`) and
`availability_slots` (for a future free-slot marker) so the frontend gets
everything in one call.

**Files touched:**
- `backend/src/controllers/community.controller.ts` — `getRecent` query
  extended with a `LEFT JOIN users` and a correlated subquery against
  `availability_slots` (`status = 'free' AND date >= date('now')`) that
  returns the earliest matching slot's `id`.
- `backend/src/schemas/community.schemas.ts` — no param shape change
  (query params untouched).

**DTO addition** (`CommunityFamilyDTO`, extends `FamilyDTO`):

| Field | Type | Notes |
|---|---|---|
| `city` | `string \| null` | from `users.city`; null if owner never set it |
| `state` | `string \| null` | from `users.state` |
| `nextFreeSlotId` | `string \| null` | id of the soonest future free slot, or null if none |

### Frontend

**Files touched:**
- `frontend/src/api/community.ts` — `FamilyDTO` extended inline with
  `city`, `state`, `nextFreeSlotId` via a `CommunityFamilyDTO` Zod schema
  (kept local to this file — `FamilyDTO` in `api/family.ts` is unchanged
  since `/family/:id` and `/family/me` don't need these fields).
- `frontend/src/pages/Home.tsx` — Community row markup:
  - Name: `max-w-[24ch] truncate` (was unconditional `truncate`).
  - New second line: `flex items-center gap-1.5` containing a `City, State`
    span (`text-xs text-ink-muted`) and, when `nextFreeSlotId` is present, a
    `<Link>` badge to `/family/{fam.id}/request-playdate/{fam.nextFreeSlotId}`.
  - Badge is a sibling `<Link>` to the row's own `<Link>`, not nested inside
    it (nested `<a>` is invalid HTML) — `stopPropagation` not needed since
    they're siblings, not overlapping.
  - Badge styling: `bg-brand-warm/20 text-[#8a5a12] border border-brand-warm/50`
    pill, `text-[10px] font-bold`, per the approved mock.

**Route:** `/family/:id/request-playdate/:slotId` reuses the existing
`RequestPlaydateModal` from [[features/playdates]], opened as a route-driven
modal over `FamilyView` (modal opens on mount if `slotId` param present and
matches an available free slot; falls back to the plain profile view if the
slot is no longer free).

### Test plan

- Backend: integration test for `GET /api/community/recent` asserting
  `city`/`state` passthrough and `nextFreeSlotId` set only for families with
  a future free slot (past-dated free slots excluded).
- Frontend: `Home.test.tsx` — renders badge only when `nextFreeSlotId` is
  present; renders City, State always; truncates names > 24 chars only.

### E2E coverage

Extend `frontend/e2e/playdates.spec.ts` with one scenario: badge click from
the Home dashboard's Community list opens the request modal pre-filled with
the correct slot.

## Design — Spec

### Visual

Matches the approved mock: badge sits on the same line as City, State
(second line under the family name), uses `color.brand.warm` at low opacity
+ a warm border, distinct from `color.brand.primary` (reserved for primary
CTAs). Name column gets a `24ch` max-width with ellipsis truncation, applied
only past that length.

### Microcopy

Badge label: "🗓 Playdate". Hover/title text: "Open playdate slot — click to
request".

### Accessibility

Badge is a real `<Link>` (not a `<span>` with a click handler), keyboard
focusable and reachable via Tab, with an accessible name via the visible
"🗓 Playdate" text plus a `title` attribute for the extra context. Distinct
from the row's own link target so screen reader users get two distinguishable
link stops per family, not one link with ambiguous behavior.

## Marketing — Spec

### Launch copy
Not warranted — this is a small discoverability improvement to an
already-launched feature, not new functionality; no separate announcement.

### SEO
N/A — authenticated dashboard surface, `noindex` per existing Home page
convention.

### Growth
Not tracked separately — folds into [[features/playdates]]'s existing
request-volume metric as a new entry point.
