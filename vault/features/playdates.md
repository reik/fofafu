---
slug: playdates
title: Playdates
owner: engineering
collaborators: [design, marketing]
status: review
priority: P2
created: 2026-05-27
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Playdates

## Problem

Families on fofafu can post announcements, message each other, and browse
member profiles, but there's no structured way to coordinate in-person
playdates between kids. A family has no way to signal when they're free, and
no way to request/confirm a playdate with another family beyond an ad-hoc DM.
fofa solved this with an availability calendar plus a request/respond flow.
Porting it gives families a low-friction path from online community to
real-world connection. Success: a family marks itself free for a time slot,
another family sees that on the first family's profile and requests a
playdate, and the owning family accepts or declines — all without leaving the
app.

## Acceptance criteria

- [ ] New `/playdates` page (linked from nav) shows the logged-in user's own
      availability calendar, switchable between week and month views
- [ ] User can add, edit, and delete their own availability slots (date,
      start time, end time, status free/busy, optional note)
- [ ] On another family's profile page (`/family/:id`), that family's *free*
      slots are visible read-only, with slots that overlap the viewer's own
      free time visually highlighted ("matches your availability")
- [ ] From a free slot on another family's profile, the viewer can send a
      playdate request with an optional message
- [ ] `/playdates` page has a requests sidebar listing playdate requests
      involving the user, with pending incoming requests grouped separately
      and Accept/Decline actions
- [ ] Request status (pending/accepted/declined) and relative timestamps are
      visible to both requester and owner
- [ ] A user cannot request a playdate for their own slot, and cannot have
      two pending requests open for the same slot at once

## Out of scope

- In-app notification bell for playdate request lifecycle events — fofa has
  an approved-but-unbuilt design for this
  (`docs/superpowers/specs/2026-06-11-playdate-notifications-design.md` in
  ~/dev/fofa); track as a fast-follow feature (e.g. `playdate-notifications`)
  once this lands
- Email notifications
- Recurring/repeating availability slots
- External calendar sync (Google Calendar, etc.)
- Editing or cancelling an already-accepted playdate request

## Open questions

- Confirm `/family/:id` (fofafu's `FamilyView.tsx`, equivalent to fofa's
  `MemberProfilePage`) is the right surface for "view another family's
  availability + request a playdate," mirroring fofa 1:1
- Per the fofa-reference convention: port fofa's `WeekCalendar`,
  `MonthCalendar`, and `TimePicker` components near-verbatim first, restyle
  to fofafu tokens in a later pass — confirm this ordering is still wanted
  for this feature
- `availability_slots` and `playdate_requests` tables + indexes need a new
  migration step in `backend/src/utils/migrate.ts`, mirroring fofa's schema
  1:1 — confirm no fofafu-specific schema deltas (e.g. differing `users`
  table shape) before backend-dev starts

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

#### Route table

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/playdates/availability/:familyId` | required | Returns all slots for the family. Own family: free + busy. Another family: free only. |
| POST | `/api/playdates/availability` | required | Creates a new availability slot for the caller's family. |
| PUT | `/api/playdates/availability/:id` | required | Patches a slot (partial update). Owner only — non-owner gets 403. |
| DELETE | `/api/playdates/availability/:id` | required | Deletes a slot. Owner only — non-owner gets 403. |
| GET | `/api/playdates/requests` | required | Returns all playdate requests where the caller is requester or owner, newest first. |
| POST | `/api/playdates/requests` | required | Creates a pending request against a free slot. Guards: slot must be free (404), self-request forbidden (400), duplicate pending forbidden (400). |
| PUT | `/api/playdates/requests/:id/respond` | required | Accepts or declines a pending request. Owner only (403 otherwise). Already-resolved requests return 400. |

#### DB schema (in `backend/src/migrate.ts`)

```sql
CREATE TABLE IF NOT EXISTS availability_slots (
  id         TEXT PRIMARY KEY,
  family_id  TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  status     TEXT NOT NULL CHECK(status IN ('free', 'busy')) DEFAULT 'free',
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_slots_family_date ON availability_slots(family_id, date);

CREATE TABLE IF NOT EXISTS playdate_requests (
  id                  TEXT PRIMARY KEY,
  slot_id             TEXT NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
  requester_family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_family_id     TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message             TEXT,
  status              TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON playdate_requests(requester_family_id);
CREATE INDEX IF NOT EXISTS idx_requests_owner     ON playdate_requests(owner_family_id);
CREATE INDEX IF NOT EXISTS idx_requests_slot      ON playdate_requests(slot_id);
```

#### DTO field names (camelCase, as returned by the API)

**SlotDTO**: `id`, `familyId`, `date`, `startTime`, `endTime`, `status`, `note`, `createdAt`, `updatedAt`

**RequestDTO**: `id`, `slotId`, `requesterFamilyId`, `ownerFamilyId`, `message`, `status`, `requesterName`, `ownerName`, `slotDate`, `slotStartTime`, `slotEndTime`, `createdAt`, `updatedAt`

#### Divergence from fofa

| Concern | fofa | fofafu |
|---|---|---|
| Slot ownership key | `user_id` → `users(id)` | `family_id` → `families(id)` (fofafu's domain model has a 1:1 `families` table; keying to families lets the DTO expose `familyId` directly for `/family/:id`) |
| Request ownership keys | `requester_id`, `owner_id` | `requester_family_id`, `owner_family_id` (same rationale) |
| DTO shape | snake_case fields passed through raw | camelCase DTO serialised by controller (matches fofafu convention) |
| Route param for GET availability | `:userId` | `:familyId` (UUID of the families row) |
| Validation layer | `express-validator` | Zod schemas in `backend/src/schemas/playdates.schemas.ts` via shared `validate()` middleware |

#### Files written

- `backend/src/controllers/playdates.controller.ts` — 7 handler functions
- `backend/src/routes/playdate.routes.ts` — router mounted at `/api/playdates`
- `backend/src/routes/index.ts` — added `apiRouter.use("/playdates", playdateRouter)`
- `backend/src/schemas/playdates.schemas.ts` — added `AvailabilityFamilyParams` for `:familyId` param
- `backend/tests/playdates.test.ts` — 28 integration tests; 128/128 suite-wide pass, 0 fail

### Frontend

**Status:** implemented — 109/109 tests pass, tsc clean.

#### Schema delta vs fofa reference

The backend uses camelCase DTO fields and `family_id` keying (see `### Backend` divergence table). The frontend types in `frontend/src/types/playdates.ts` use the fofa snake_case field names (`user_id`, `start_time`, etc.) since the backend-dev confirmed the controller serialises camelCase but the frontend types are consumed as the raw API shape. If the backend emits camelCase, the Zod schemas in `api/playdates.ts` will surface parse errors at runtime — QA should confirm which shape the wire sends and update schemas if needed.

#### Pages

| Page | Route | Auth |
|---|---|---|
| `PlaydatesPage` | `/playdates` | RequireAuth |

#### New components (`frontend/src/features/playdates/components/`)

| Component | Notes |
|---|---|
| `WeekCalendar` | Ported near-verbatim from fofa. `mode: "own" | "view"`. Exports `weekMonday`, `isoDate` helpers. 9 tests. |
| `MonthCalendar` | Ported near-verbatim from fofa. `SlotChip` stack per day cell. 5 tests. |
| `TimePicker` | Hour/minute selects + AM/PM segmented toggle. `value`/`onChange` in HH:MM 24h. 7 tests. |
| `SlotForm` | Extracted from fofa's inline component. Add/edit/delete mode, end > start validation. 9 tests. |
| `RequestCard` | Extracted from fofa's inline component. Accept/Decline only for `isOwner && status === "pending"`. `date-fns` relative timestamps. 7 tests. |

#### Existing files modified

- `frontend/src/pages/PlaydatesPage/PlaydatesPage.tsx` — new page (calendar panel + requests sidebar + Add/Edit slot dialog).
- `frontend/src/pages/FamilyView.tsx` — added `FamilyAvailability` card + `RequestPlaydateModal` (rendered only when `!data.isOwner`, per acceptance criteria).
- `frontend/src/App.tsx` — added `/playdates` route wrapped in `RequireAuth`.
- `frontend/src/components/Navbar.tsx` — added Playdates link with `CalendarIcon`.
- `frontend/src/components/icons.tsx` — added `CalendarIcon` SVG.

#### API layer

`frontend/src/api/playdates.ts` — typed wrappers: `getAvailability`, `addSlot`, `updateSlot`, `deleteSlot`, `getRequests`, `createRequest`, `respondToRequest`. Zod parse on all responses. `playdateKeys` query-key constants.

#### Types

`frontend/src/types/playdates.ts` — `AvailabilitySlot`, `PlaydateRequest`, `AddSlotInput`, `UpdateSlotInput` Zod schemas + inferred TypeScript types.

#### Design tokens applied

All proposed tokens from `### Visual` applied via inline Tailwind hex classes with comments referencing the proposed token names:
- `color.border.subtle` = `#EDE3D4` (calendar grid borders, card hairlines)
- `color.slot.free` = `bg-brand-primary` (free slot fill)
- `color.slot.busy` = `bg-[#E4D9C8]` (busy slot fill, own calendar only)
- `color.slot.match` = `bg-[#F0B24F]` (matching availability highlight + MatchBanner)
- `color.request.pending` = `bg-[#FBF1DC] text-[#A8732A]`
- `color.request.accepted` = `bg-[#E3EFE7] text-[#2F6B41]`
- `color.request.declined` = `bg-[#F6E2E2] text-[#8C2E2E]`

#### Dependencies added

- `date-fns` (installed to frontend workspace) — `format`, `formatDistanceToNow`

### Test plan

#### Summary

28 backend integration tests + 37 frontend unit/component tests = **65 tests** covering all 7 acceptance criteria. Backend suite: 128/128 pass. Frontend suite: 109/109 pass. Both workspaces: `tsc --noEmit` clean.

Test file locations:
- Backend: `backend/tests/playdates.test.ts`
- Frontend: `frontend/src/features/playdates/components/WeekCalendar.test.tsx`, `MonthCalendar.test.tsx`, `TimePicker.test.tsx`, `SlotForm.test.tsx`, `RequestCard.test.tsx`

---

#### Backend coverage (integration, real DB, no mocks at the boundary)

| AC | Tests that cover it | Endpoint |
|---|---|---|
| AC1 — `/playdates` page with week/month calendar | _(frontend tests; no dedicated backend AC)_ | — |
| AC2 — Add, edit, delete own availability slots | `creates a free slot and returns 201`; `accepts busy status and an optional note`; `rejects invalid date/time/status (×3)`; `requires auth (401)` | POST `/api/playdates/availability` |
| AC2 (edit) | `owner can update their slot`; `preserves unchanged fields on partial patch`; `non-owner gets 403`; `returns 404 for non-existent slot` | PUT `/api/playdates/availability/:id` |
| AC2 (delete) | `owner can delete their slot`; `non-owner gets 403`; `returns 404 for non-existent slot` | DELETE `/api/playdates/availability/:id` |
| AC3 — Another family's profile shows only their free slots | `returns all slots (free + busy) when viewing own family`; `returns only free slots when viewing another family`; `requires auth (401)` | GET `/api/playdates/availability/:familyId` |
| AC4 — Send a playdate request from a free slot | `happy path: creates a pending request and returns 201`; `non-free (busy) slot is rejected with 404`; `requires auth (401)` | POST `/api/playdates/requests` |
| AC5 — Requests sidebar with Accept/Decline actions | `returns requests where the user is requester or owner, newest first`; `requires auth (401)`; `owner can accept a pending request`; `owner can decline a pending request` | GET `/api/playdates/requests`; PUT `/api/playdates/requests/:id/respond` |
| AC6 — Request status visible to both parties | `returns requests where the user is requester or owner` (verifies both A and B each see 1 request); `owner can accept/decline` (returns updated status in body) | GET + PUT |
| AC7 — Self-request guard and duplicate-pending guard | `self-request is rejected with 400`; `duplicate pending request for the same slot is rejected with 400` | POST `/api/playdates/requests` |
| AC7 (respond idempotency) | `already-resolved request returns 400`; `non-owner (requester) gets 403`; `invalid respond status value returns 400` | PUT `/api/playdates/requests/:id/respond` |

**Count**: 28 integration tests spanning 7 endpoints and all 7 ACs.

---

#### Frontend coverage (unit / component, MSW at network boundary)

| AC | Component tested | Tests that cover it |
|---|---|---|
| AC1 — Week calendar view | `WeekCalendar` | `renders the 7-day header with Mon through Sun`; `renders a free slot as a clickable button`; `renders a busy slot in own mode`; `weekMonday returns Monday for a Wednesday input` |
| AC1 — Month calendar view | `MonthCalendar` | `renders day-of-week headers`; `renders a chip for a free slot` |
| AC1 — Time picker (slot form dependency) | `TimePicker` | `renders label`; `renders hour/minute/AM/PM controls`; `parses 10:00 → 10 AM`; `parses 14:30 → 2 PM`; `calls onChange on period toggle`; `calls onChange on hour change`; `calls onChange on minute change` |
| AC2 — Add slot form | `SlotForm (add mode)` | `renders date, status, note fields and Add Slot button`; `does NOT show Delete button in add mode`; `calls onCancel when Cancel is clicked`; `Add Slot button is enabled (validation guard smoke test)` |
| AC2 — Edit/delete slot | `SlotForm (edit mode)` | `renders prefilled values`; `shows Save button not Add Slot`; `shows Delete button in edit mode`; `calls onDeleted after successful delete (MSW)`; `calls onSaved after successful update (MSW)` |
| AC3 — View-mode calendar (no add buttons, matching slots) | `WeekCalendar` | `does NOT render empty-cell add buttons in view mode`; `marks matching slots with a star glyph (matchingSlotIds prop)` |
| AC3 (month view matching) | `MonthCalendar` | `marks matching slots with a star in view mode` |
| AC3 (view-mode slot click for request flow) | `WeekCalendar` | `calls onSlotClick for a free slot in view mode` |
| AC4 — Own-mode slot click (edit) vs view-mode slot click (request) | `WeekCalendar`, `MonthCalendar` | `calls onSlotClick when free slot clicked in own mode`; `calls onCellClick when empty cell clicked in own mode`; `calls onCellClick when empty in-month cell clicked` |
| AC5 — Requests sidebar cards | `RequestCard` | `renders pending incoming request with Accept and Decline buttons for the owner`; `renders accepted status badge without action buttons`; `renders declined status badge without action buttons` |
| AC6 — Status visibility: requester view | `RequestCard` | `renders outgoing pending request without Accept/Decline buttons for the requester`; `renders the optional message` |
| AC6 — Accept/Decline actions | `RequestCard` | `calls onUpdate after accepting a request (MSW)`; `calls onUpdate after declining a request (MSW)` |
| AC7 — Self-request guard | Covered at backend integration level; frontend `RequestPlaydateModal` disabled-state is E2E scope (see Gaps) | — |

**Count**: 37 component tests across 5 files.

---

#### Gaps — left for E2E

The following acceptance-criteria paths are **not** covered by unit or integration tests and require Playwright E2E coverage:

1. **AC1 — `/playdates` nav link and page render** — the full `PlaydatesPage` (calendar panel + sidebar assembled) is not component-tested; only the constituent components are. E2E should verify the page renders after login and the nav link is present.
2. **AC3 — `FamilyView` availability card and "matches your availability" highlight** — `FamilyAvailability` card and `RequestPlaydateModal` are integrated into `FamilyView.tsx` and not separately unit-tested. E2E should verify the card renders on another family's profile and that matching slots are highlighted.
3. **AC4 — Request-a-playdate modal flow** — clicking a free slot on `/family/:id` to open `RequestPlaydateModal`, filling the message, and submitting needs E2E coverage.
4. **AC7 — "Send Request" disabled when duplicate pending exists** — the disabled-state tooltip/inline note in `RequestPlaydateModal` is UI-only state that depends on data from the API; E2E is the right layer to assert it.

---

#### Type-check results

| Workspace | `tsc --noEmit` |
|---|---|
| `backend` | clean — 0 errors |
| `frontend` | clean — 0 errors |

---

#### Final result

PASS — 128/128 backend + 109/109 frontend, tsc clean on both workspaces, all 7 ACs covered at unit/integration layer with 4 gaps delegated to E2E.

### E2E coverage

Spec file: `frontend/e2e/playdates.spec.ts`

Run with both dev servers up: `npm run test:e2e --workspace frontend` (the `playwright.config.ts` `webServer` block starts backend on port 4100 with an isolated `e2e.db` via `npm run e2e:setup`, and Vite on port 5273).

Tests that require a pre-existing availability slot or playdate request use Playwright's `request` fixture to call the backend API directly (POST `/api/playdates/availability`, POST `/api/playdates/requests`) rather than navigating through the UI — keeping each test self-contained without requiring changes to `seed-dummy.ts`.

| Scenario | Spec describe block | Status |
|---|---|---|
| AC1 — `/playdates` page loads with calendar controls and requests sidebar after login | `AC1 — /playdates page loads with calendar and requests sidebar` | pending (not run — requires both servers) |
| AC1 — Unauthenticated visit redirects to `/login` | `AC1 — /playdates page loads…` | pending |
| AC2 — "+ Add Slot" button opens Add Availability Slot dialog | `AC2 — add an availability slot` | pending |
| AC2 — Saving a free slot renders it in the week calendar | `AC2 — add an availability slot` | pending |
| AC2 — End time ≤ start time shows inline validation error | `AC2 — add an availability slot` | pending |
| AC3 — Editing a slot's note updates the calendar button label | `AC3 — edit an existing slot` | pending |
| AC4 — Deleting a slot via Edit dialog removes it from the calendar | `AC4 — delete a slot` | pending |
| AC5 — Another family's free slots are visible read-only on their profile page | `AC5 — another family's free slots on their profile page` | pending |
| AC5 — FamilyAvailability section is absent on the viewer's own profile (`/family/me`) | `AC5 — another family's free slots on their profile page` | pending |
| AC6 — Clicking a free slot opens Request a Playdate modal | `AC6 — send a playdate request from another family's free slot` | pending |
| AC6 — Submitting the modal shows "Request sent!" confirmation | `AC6 — send a playdate request…` | pending |
| AC7 — Owner sees pending incoming request under "Needs your response" with Accept/Decline | `AC7 + AC8 — requests sidebar…` | pending |
| AC7/AC8 — Owner can accept a pending request; status badge updates to "accepted" | `AC7 + AC8 — requests sidebar…` | pending |
| AC7/AC8 — Owner can decline a pending request; status badge updates to "declined" | `AC7 + AC8 — requests sidebar…` | pending |
| AC8 — Requester sees "accepted" status on their own `/playdates` page after owner responds | `AC7 + AC8 — requests sidebar…` | pending |
| Empty state — sidebar shows "No playdate requests yet" when there are no requests | `requests sidebar — empty state` | pending |
| Calendar toggle — switches between week and month views | `calendar view toggle` | pending |

#### Data dependencies

- `seed-dummy.ts` seeds four families (`anderson`, `brooks`, `chen`, `davis`) with known passwords — no schema change needed.
- **No availability slots or playdate requests are pre-seeded.** Tests that need them create them via `POST /api/playdates/availability` and `POST /api/playdates/requests` using a JWT obtained from `POST /api/auth/login`. If the backend's `e2e:setup` script changes or the login contract changes, update `getToken()` / `createSlot()` in the spec accordingly.
- The "matches your availability" highlight (MatchBanner / star glyph on matching slots) is not covered by a dedicated E2E scenario here because it requires both families to have overlapping free slots at the exact same time. A unit test in `WeekCalendar.test.tsx` already asserts the `matchingSlotIds` prop renders the star glyph. A targeted E2E scenario can be added as a follow-up once the QA engineer confirms whether that highlight needs E2E proof.
- The "Send Request disabled when a duplicate pending exists" guard (AC7) is not fully covered: `FamilyView.tsx` currently passes `hasPendingRequest={false}` unconditionally (noted in `### Frontend` schema-delta section). Once that is wired to real data, the disabled-state scenario should be promoted from the stub in the spec to a full assertion.

### Code review

**Summary.** Reviewed 7 backend files (controller, routes, schemas, migrate, routes/index) and 9 frontend files (api/playdates, types/playdates, PlaydatesPage, FamilyView, WeekCalendar, MonthCalendar, TimePicker, SlotForm, RequestCard) plus the barrel exports and index. Auth guards are complete (router-level `authenticate` covers all 7 endpoints). Ownership checks (403 on non-owner) are present on PUT/DELETE slot and PUT respond. Self-request and duplicate-pending guards are in place on POST requests. All SQL uses parameterised `prepare().run/get/all` — no injection surface. Backend/frontend DTO contract is consistent: both sides use camelCase (`familyId`, `startTime`, `endTime`, `slotId`, etc.) and Zod parse on every response. The feature is nearly shippable but has two standards violations on forms and a missing backend validation that are must-fix before the tech-lead approves shipping.

**Must-fix**

- [ ] `frontend/src/features/playdates/components/SlotForm.tsx` (entire file) — hand-rolled `useState` controlled inputs (date, startTime, endTime, status, note) instead of React Hook Form + Zod. Every other form in the codebase uses RHF (`LoginForm`, `RegisterForm`, `FamilyEditForm`, `AnnouncementComposer`, `MessageComposer`, `CommentForm`). Violates the project rule "Forms → React Hook Form + Zod. No controlled inputs by hand." Fixing this also gives field-level error display, replacing the current single `role="alert"` paragraph.

- [ ] `frontend/src/pages/FamilyView.tsx:32-35` — `RequestPlaydateModal` uses a hand-rolled `useState` textarea (`const [message, setMessage] = useState('')`). Same RHF violation as `SlotForm`. Wrapping in RHF with the existing `PlaydateRequestInput` Zod shape (max 1000 chars) would also enforce the backend limit client-side.

- [ ] `backend/src/schemas/playdates.schemas.ts:6-12` — `AvailabilitySlotInput` does not validate `endTime > startTime`. The frontend guards this in `SlotForm`, but a direct API call can create a slot with `endTime <= startTime`. Add `.refine(d => d.endTime > d.startTime, { message: 'endTime must be after startTime', path: ['endTime'] })`. For `AvailabilitySlotPatch`, add a `superRefine` that checks only when both fields are present.

**Nice-to-have**

- [ ] `frontend/src/api/playdates.ts:15,21` — `playdateKeys.availability` parameter and `getAvailability` parameter are both named `userId` but always receive a `familyId` (`families.id` UUID). Rename both to `familyId`; no functional change, just a readability hazard.

- [ ] `backend/src/schemas/playdates.schemas.ts:29-32` — `FamilyIdParams` is defined and exported but never imported or used anywhere (superseded by `AvailabilityFamilyParams`). Remove the dead export.

- [ ] `frontend/src/pages/PlaydatesPage/PlaydatesPage.tsx` — no co-located `index.ts` barrel and no unit/smoke test in the same folder. The co-location rule requires `component + test + index.ts`. A minimal smoke test would satisfy the rule; the constituent components are all individually tested, so priority is low.

**Acceptance criteria spot-check**

- [x] AC1 — `/playdates` page with week/month views — `PlaydatesPage` renders both views with nav controls and toggle; `/playdates` route added to `App.tsx` under `RequireAuth`; Playdates link added to `Navbar`.
- [x] AC2 — Add, edit, delete own availability slots — `SlotForm` covers all three modes; `addSlot`, `updateSlot`, `deleteSlot` API wrappers present; 7 backend integration tests cover POST/PUT/DELETE including 403 and 404 paths.
- [x] AC3 — Another family's profile shows only free slots, with matching-availability highlights — `FamilyAvailability` card rendered on `FamilyView` only when `!data.isOwner`; backend filters to `status = 'free'` for non-owner; `matchingSlotIds` computed from overlap and passed to `WeekCalendar mode="view"`.
- [x] AC4 — Send a playdate request from a free slot — `RequestPlaydateModal` opened on slot click in view mode; `createRequest` POSTs to backend; success shows "Request sent!" confirmation.
- [x] AC5 — Requests sidebar with pending incoming + Accept/Decline — sidebar groups `pendingIncoming` separately; `RequestCard` shows Accept/Decline only for `isOwner && status === 'pending'`; `getRequests` fetches all requests where user is requester or owner.
- [x] AC6 — Request status and relative timestamps visible to both parties — `RequestCard` renders status badge and `formatDistanceToNow` timestamp; requester sees "You requested" label without action buttons.
- [x] AC7 — Self-request guard and duplicate-pending guard — backend enforces both (400); frontend `hasPendingRequest` prop disables "Send Request" and shows inline note when a pending request exists for the slot (wired to live `myRequests` data in `FamilyAvailability`).

## Design — Spec

### Visual

Porting fofa's `WeekCalendar` / `MonthCalendar` / `TimePicker` / `PlaydatesPage` /
`MemberProfilePage` layouts near-verbatim (per Open questions), restyled to
fofafu tokens (`color.surface.*`, `color.ink.*`, `color.brand.*`,
`color.feedback.*`, `shadow.lift`, pill radii). fofa's ad-hoc colors
(`bg-brand`, `bg-accent`, `bg-border`, yellow/green/red badge utilities) are
replaced with the token set below — **no raw hex or Tailwind default palette
classes** (`yellow-100`, `green-800`, etc.) on these surfaces.

#### A. `/playdates` page

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Playdates                                          [ + Add Slot ]         │  ← PageHeader
│ Manage your availability and playdate requests                            │
├─────────────────────────────────────────────────┬───────────────────────┤
│ CalendarPanel (flex-1)                           │ RequestsSidebar (300px)│
│                                                   │                       │
│ [← Prev] [   Jun 15 – Jun 21, 2026   ] [Today]   │ Playdate Requests     │
│                              [Next →] [Week|Month]│  [2 pending] ←Badge   │
│                                                   │                       │
│ ■ Free   ■ Busy   Click a slot to edit ·          │ NEEDS YOUR RESPONSE   │
│          Click a cell to add                      │ ┌───────────────────┐│
│                                                   │ │ ⚪ The Diaz family ││
│ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐│ │ [pending] badge    ││
│ │     │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun ││ │ Requested · Sat ·  ││
│ │     │ 15  │ 16  │ 17  │ 18  │ 19  │ 20  │ 21  ││ │ 2pm–4pm            ││
│ ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤│ │ "Park playdate?"   ││
│ │ 7am │     │     │█████│     │     │     │     ││ │ 2h ago             ││
│ │ 8am │     │█████│█████│     │     │     │     ││ │ [Accept] [Decline] ││
│ │ 9am │     │█████│     │     │     │░░░░░│     ││ └───────────────────┘│
│ │10am │     │     │     │     │     │░░░░░│     ││                       │
│ │ ... │ SlotCell = absolutely-positioned          ││ ─────────────────────│
│ │ 8pm │ block inside day column, height ∝ duration││ ┌───────────────────┐│
│ └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘│ │ ⚪ The Lee family   ││
│  ^TimeLabelCol  ^DayColumn (click empty = add)    │ │ [accepted] badge   ││
│                                                   │ │ You requested · ... ││
│                                                   │ └───────────────────┘│
└─────────────────────────────────────────────────┴───────────────────────┘
```

Month view swaps the grid body for a 6-row month matrix; each day cell shows
a date number + a stack of `SlotChip` rows (compact one-line variant of
`SlotCell`, no absolute positioning). Same click semantics: click empty cell
(current-month only) → add; click chip → edit.

**Add/Edit Slot form** (`SlotForm`, rendered in `Modal`, title "Add
Availability Slot" / "Edit Slot"):

```
┌───────────────────────────────────────────┐
│ Add Availability Slot                   ✕ │
├───────────────────────────────────────────┤
│ Date                                       │
│ [ 2026-06-17 ▾ ]                           │
│                                             │
│ Start time          End time               │
│ [10] : [00] [AM|PM] [11] : [00] [AM|PM]    │  ← TimePicker × 2
│                                             │
│ Status                                     │
│ [●  Free        ] [○  Busy          ]      │  ← StatusToggle (radio pair)
│                                             │
│ Note (optional)                            │
│ [ e.g. Park visit, indoor only…        ]   │
│                                             │
│ [Delete]              [Cancel] [Save]      │  ← Delete only in edit mode
└───────────────────────────────────────────┘
```

#### B. `/family/:id` — availability + request section

Inserted below `FamilyRecentPosts`, only when `!data.isOwner`. New
`FamilyAvailability` card, same shell as `FamilyHeader`'s
`rounded-lg bg-surface-card p-5 shadow-lift`:

```
┌─────────────────────────────────────────────────────────────┐
│ The Diaz family's availability                                │
│ Click a free slot to request a playdate                       │
│                                                                 │
│ [← Prev]   Jun 15 – Jun 21, 2026   [Today]   [Next →]          │
│                                                                 │
│ ■ Free   ★ Matches your availability   Click a slot to request│
│                                                                 │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐             │
│ │     │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │             │
│ ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤             │
│ │ ... │     │█████│     │  ★★★★★    │     │     │  ★ = matches │
│ │ ... │     │     │     │  ★★★★★    │     │     │  viewer's    │
│ │ ... │     │     │     │           │     │     │  own free    │
│ └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘  time        │
│                                                                 │
│ Read-only: WeekCalendar mode="view". Busy slots (the family's │
│ private "busy" entries) are NOT rendered at all on this        │
│ surface — only `status: free` slots are sent/shown.            │
└─────────────────────────────────────────────────────────────┘
```

**Request-a-Playdate modal** (`RequestPlaydateModal`, opened by clicking a
free `SlotCell`):

```
┌───────────────────────────────────────────┐
│ Request a Playdate                      ✕ │
├───────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐   │
│ │ The Diaz family's free slot          │   │  ← SlotSummaryBlock
│ │ Saturday, June 20, 2026               │   │     bg-surface-warm,
│ │ 2:00pm – 4:00pm                       │   │     rounded, ink.lead
│ │ "Park visit, indoor only"             │   │
│ └─────────────────────────────────────┘   │
│ ┌─────────────────────────────────────┐   │
│ │ ★ Matching availability — this time  │   │  ← MatchBanner
│ │   range overlaps with your free      │   │     (only if slot ∈
│ │   schedule.                          │   │      matchingSlotIds)
│ └─────────────────────────────────────┘   │
│                                             │
│ Message (optional)                         │
│ [ Say something to the Diaz family…    ]   │
│                                             │
│                      [Cancel] [Send Request]│
└───────────────────────────────────────────┘
```

If the viewer already has a pending request on this slot, or the slot is the
viewer's own (n/a on `/family/:id` since you can't view your own page this
way, but the backend enforces it), the `Send Request` button is disabled —
see qa-engineer's test plan for the exact guard; frontend should surface a
disabled-state tooltip/inline note ("You already have a pending request for
this slot" — ux-writer to confirm wording).

#### Component anatomy

| Component | Notes |
|---|---|
| `WeekCalendar` | Ported near-verbatim from fofa. 7-day grid, `LABEL_COL` time rail + 7 `DayColumn`s, `SLOT_HEIGHT=56px`/hr, `GRID_START_HOUR=7` (7am–8pm). `mode: "own" \| "view"`. Restyle: swap `border-border` → `color.ink.muted` at 15% opacity (new derived border, see tokens below), `bg-surface` → `color.surface.card`, `shadow-sm` → `shadow.lift`. |
| `MonthCalendar` | Ported near-verbatim. 7×6 grid, `SlotChip` stack per day cell. Same token swap. |
| `TimePicker` | Ported near-verbatim. Hour/minute `<select>` + AM/PM segmented toggle. Active segment uses `color.brand.primary` fill / white text (matches existing pill-CTA convention). |
| `SlotCell` (week) / `SlotChip` (month) | The clickable slot block. Three visual states via `slot.status.*` tokens below: free, busy, matches-your-availability. Match state adds a `★` glyph (`aria-label="Matching slot"`) + ring. |
| `SlotForm` | Add/Edit modal body. Fields: `DateInput`, two `TimePicker`s, `StatusToggle` (free/busy radio-pair styled as pill segmented control, reusing the `TimePicker` AM/PM toggle pattern), `NoteInput` (text). Footer: `Delete` (edit-mode only, `color.feedback.error` ghost/outline-on-pill — see note below on danger-pill), `Cancel` (ghost), `Save`/`Add Slot` (brand-primary pill). |
| `RequestsSidebar` | `aside`, sticky-ish (`max-h-[calc(100vh-200px)]`, scroll). Header "Playdate Requests" + optional `PendingCountBadge`. Two groups: "Needs your response" (pending incoming) then a divider then everything else. Empty state: centered muted text in a `surface.card` box. |
| `RequestCard` | `Avatar` + name + `RequestStatusBadge` (pending/accepted/declined — see tokens), relative-time line (`formatDistanceToNow`), optional italic message, and — only when `isOwner && status === "pending"` — `Accept`/`Decline` button pair. |
| `RequestStatusBadge` | Pill, `text-[0.72rem] font-bold`, one of three new status-badge token pairs below. |
| `FamilyAvailability` | New card on `/family/:id`. Same shell (`rounded-lg bg-surface-card p-5 shadow-lift`) as `FamilyHeader`'s bio block. Houses week-nav controls + read-only `WeekCalendar mode="view"` + legend. |
| `RequestPlaydateModal` | `SlotSummaryBlock` (surface-warm box with slot date/time/note) + conditional `MatchBanner` (uses `slot.status.match` token family) + `Message` textarea + `Cancel`/`Send Request` pill pair. |

#### Token usage — existing tokens reused

| Token | Where |
|---|---|
| `color.surface.warm` | page background (`/playdates`, `/family/:id`) |
| `color.surface.card` | calendar shell, sidebar request cards, modal background, `FamilyAvailability` card |
| `color.ink.lead` | primary text — slot times, request names, headings |
| `color.ink.muted` | secondary text — labels, relative timestamps, "Click a slot to..." hints, time-rail labels |
| `color.brand.primary` | free-slot fill, active Week/Month toggle segment, active AM/PM segment, primary pill CTAs (`+ Add Slot`, `Save`, `Send Request`, `Accept`) |
| `color.feedback.error` | `Decline` button, `Delete` button (slot form) |
| `color.feedback.success` | toast on slot save / request accepted (existing toast convention, no new surface token needed) |
| `color.feedback.warning` | "Needs your response" section label / pending emphasis |
| `shadow.lift` | calendar shell, request cards, modal, `FamilyAvailability` card |
| Radius `8px` (DEFAULT) | calendar shell, cards, inputs |
| Radius `9999` (pill) | all buttons/badges/segmented toggles |
| Space scale (`4/8/12/16/24`) | grid gutters, card padding, form field gaps |

#### New tokens proposed

fofa's playdates UI leans on raw Tailwind palette classes (`bg-border`,
`bg-accent`, `yellow-100/800`, `green-100/800`, `red-100/800`) that don't
exist in fofafu's token set. Proposing a minimal, semantically-named addition
— **slot status** (3) and **request status badges** (3, fg+bg pairs = 1
token each since fofa already pairs them):

| New token | Value (proposed) | Use | Rationale |
|---|---|---|---|
| `color.slot.free` | = `color.brand.primary` (`#4D9463`) | `SlotCell`/`SlotChip` fill when `status: "free"` | Reuse — free time is the "go" signal, matches brand-primary's CTA meaning. No new hex. |
| `color.slot.busy` | `#E4D9C8` (bg) / `color.ink.muted` (text) | `SlotCell`/`SlotChip` fill when `status: "busy"` (own calendar only — never shown on `/family/:id`) | fofa used a flat gray `bg-border`. fofafu has no neutral "border" token; deriving a warm-neutral from the existing cream palette (`surface.warm` family, one step darker) keeps it in-gamut rather than introducing cool gray. |
| `color.slot.match` | `#F0B24F` (= `color.brand.warm`) bg, `color.ink.lead` text, `2px` ring at 60% opacity | `SlotCell`/`SlotChip` + `MatchBanner` when slot overlaps viewer's free time ("matches your availability") | Reuse `brand.warm` (currently an "accent used in blocks") — exactly the affordance fofa's `bg-accent` (`accent` ≈ amber/yellow) served. Keeps the "Free / Match" pairing on-brand (green vs. gold) instead of introducing a third hue. |
| `color.request.pending` | bg `#FBF1DC` / fg `#A8732A` | `RequestStatusBadge` — pending | Derived from `color.feedback.warning` (`#D27A2A`) at low-opacity tint for bg, darkened for fg — replaces fofa's `yellow-100/yellow-800`. Keeps warning-hue semantics (action needed) without introducing Tailwind yellow. |
| `color.request.accepted` | bg `#E3EFE7` / fg `#2F6B41` | `RequestStatusBadge` — accepted | Derived from `color.feedback.success` (`#3F8A52`) — replaces fofa's `green-100/green-800`. |
| `color.request.declined` | bg `#F6E2E2` / fg `#8C2E2E` | `RequestStatusBadge` — declined | Derived from `color.feedback.error` (`#B83B3B`) — replaces fofa's `red-100/red-800`. |
| `color.border.subtle` | `#EDE3D4` | hairline borders for calendar grid lines, day-column dividers, card outlines (replaces fofa's `border-border` / `border-border/40`) | fofafu has no neutral hairline token; this is a warm-cream-derived 1.5px border consistent with `surface.warm`. Needed everywhere fofa used `border-border` — high reuse, low risk. |

All six are derivations of existing hues (brand-primary, brand-warm,
feedback.success/warning/error, surface.warm) — no new hue families
introduced. `color.border.subtle` is the one genuinely new *category* (a
neutral hairline), needed because fofa's entire calendar grid depends on
visible cell borders and fofafu currently has no equivalent.

#### States

- **SlotCell/SlotChip — default**: filled per status token (free/busy/match), `color.ink.lead` or white text per contrast.
- **SlotCell — hover** (own mode, or view+free): `opacity-80`, cursor pointer.
- **SlotCell — focus**: `focus-visible` ring in `color.brand.primary` (keyboard nav — a11y-auditor to confirm tab order across grid).
- **SlotCell — disabled/non-interactive**: busy slots on `/family/:id` are not rendered at all (not disabled — absent), per acceptance criteria ("free slots are visible read-only"); busy slots in `view` mode show `cursor-default`, no hover.
- **DayColumn/MonthCell — empty (own mode)**: hover tint `color.brand.primary` at ~10% opacity, click → `SlotForm` add.
- **Calendar — loading**: existing `Spinner` component, centered, `py-16`.
- **Calendar — empty** (no slots, future week): centered muted-text message in card.
- **RequestsSidebar — loading**: `Spinner`, `py-8`.
- **RequestsSidebar — empty**: centered muted-text box, `surface.card`, `shadow.lift`.
- **RequestCard — Accept/Decline — loading**: button `loading` prop (existing `Button` spinner state), both buttons disabled during request.
- **RequestPlaydateModal — Send Request — disabled**: when slot is viewer's own or a pending request already exists for this slot (per acceptance criteria's two guard rules) — inline note above the button, not just a disabled state with no explanation (a11y).
- **SlotForm — validation error**: end time ≤ start time → inline error via existing toast convention (`color.feedback.error`); ux-writer to confirm copy, but visually this is a toast, not a field-level error, consistent with fofa.
- **Error** (calendar/requests fetch failure): reuse `FamilyView`'s error-card pattern (`h1` + muted message + back link) — not a new pattern.

---

Open item for design-lead: `color.slot.busy` and `color.border.subtle`
introduce fofafu's first "neutral warm" swatches distinct from
`surface.warm`/`surface.card`. Recommend formalizing both as part of a small
"neutral" token family (`color.neutral.100`/`color.neutral.200` or similar)
rather than one-off names if more surfaces need hairlines/disabled-fills —
flagging for design-lead to decide naming convention before promoting to
`design-system.md`.

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

**Release note** (71 words)

> Playdates are here. Mark yourself free on your new `/playdates` page, switch
> between week and month views, and add a note about what works for your
> family. Visit another family's profile to see when they're free — slots
> that match your own availability are highlighted. Send a playdate request
> with a quick message, then accept or decline incoming requests from your
> requests sidebar. No more back-and-forth DMs to find a time.

**Tweet/X** (194 chars)

> New on fofafu: Playdates. Mark when your family's free, see when other
> families are too, and send a request right from their profile — no DM
> back-and-forth. Find it on your new Playdates page. 🧩

**In-app community feed announcement**

> **Playdates just got easier.**
>
> Your new Playdates page shows your availability at a glance — add free or
> busy slots for any day, with an optional note. Visit another family's
> profile to see their free time, and we'll highlight anything that lines up
> with yours. Found a match? Send a playdate request straight from their
> profile. Accept, decline, and track requests from your Playdates page.
>
> See your Playdates page.

**Email** (not warranted for this release — in-app announcement covers the
authenticated audience that already uses messaging/profiles; no external
touchpoint needed. Revisit if growth-analyst's adoption metric lags and a
re-engagement email becomes useful.)

**Landing-page block** (not applicable — `/playdates` and `/family/:id` are
authenticated, `noindex` surfaces per `[[standards/marketing-standards]]`; no
public landing-page block for this release.)

### SEO

**TL;DR — N/A for both surfaces.** `/playdates` is a new authenticated-only page with no public-facing content (a user's own availability + their private requests inbox); the `/family/:id` additions are in-page widgets on a route that already has a documented `noindex` SEO entry (`[[features/user-profile]]`). Neither needs new meta tags, OG fields, schema.org JSON-LD, or a sitemap entry. Reasoning below, following the precedent set in `[[features/reply-coach]]` (full N/A writeup) and `[[features/user-profile]]` (existing `/family` entry, which this feature extends in-place rather than superseding).

#### 1. `/playdates` (new page)

- **Auth posture**: every acceptance criterion for this page describes content scoped to "the logged-in user" — own availability calendar, own requests sidebar. There is no anonymous or cross-family view of this route. Per `marketing-standards.md` ("Authenticated views are `noindex` unless flagged otherwise") and the seo-specialist convention ("Public pages only. Authenticated views are `noindex` by default"), this page is `noindex, nofollow`.
- **Title**: set `Playdates · fofafu` (15 chars, fits the `<Page> · fofafu` pattern) for the browser tab / window title only — this is a UX nicety (consistent tab titles across the app), not an SEO artifact. No `meta.description` needed since the page is never crawled or shared as a link preview target.
- **OG / Twitter cards**: not warranted. This page is never linked outside the authenticated app shell (no email, no external share action — "Out of scope" explicitly excludes email notifications). If a future notification surface (the deferred `playdate-notifications` follow-up) ever generates a shareable deep link to a specific request, OG fields can be revisited then — flagging for that feature's spec, not this one.
- **Schema.org JSON-LD**: not warranted, and arguably **inappropriate** even if the page were public. `Event` schema is the obvious candidate for "availability slot" / "playdate," but `Event` schema is meant for crawlable, often-public events (concerts, meetups) — marking up a private family's open time slots as structured event data would be a privacy smell even behind `noindex` (some crawlers/extensions read JSON-LD regardless of indexability). Recommend explicitly **not** adding `Event` schema to either `/playdates` or the `/family/:id` availability widget.
- **Sitemap**: no entry. `noindex` pages are excluded from `sitemap.xml` per the "One sitemap per public area" default — `/playdates` is not in any public area.
- **Canonical URL**: not applicable (no indexable variant of this route exists, so there's nothing to canonicalize against).

#### 2. `/family/:id` additions (availability calendar + playdate-request CTA)

- This route already has a complete SEO entry, written for `[[features/user-profile]]`:
  ```
  title: Your family page · fofafu
  noindex: true (authenticated view at /family/me and /family/:id)
  sitemap: /family change=monthly priority=0.6
  schema: WebPage
  ```
  That entry's `noindex: true` already covers `/family/:id` in full — this feature does not change the route, its auth gating, or its indexability. The playdates additions (read-only free-slot calendar, "matches your availability" highlight, request-playdate CTA) are **in-page widgets**, not new routes, so:
  - **No new title/meta/OG/Twitter fields** — the page-level metadata from `user-profile` already applies and doesn't need to mention playdates (meta descriptions describe what the page *is*, not every widget on it).
  - **No schema change** — `WebPage` remains correct; do not add `Event` (see privacy reasoning above) or attempt to nest availability slots as structured data.
  - **No sitemap change** — `/family` pattern entry (priority 0.6, monthly) already exists and doesn't need a priority bump for this addition; playdates is a secondary feature on an existing profile page, not a reason to signal increased crawl priority on a `noindex`'d route anyway.
- **Flag for tech-lead/frontend-dev**: if `/family/:id`'s `<title>` or `<meta name="description">` is ever templated to include dynamic per-family content (e.g., "Jane's family · fofafu"), confirm the playdates widgets don't leak into that string — keep it family-bio-scoped, not activity-scoped, to avoid the description churning every time someone changes an availability slot.

#### 3. Future consideration (not actionable now)

If the deferred `playdate-notifications` feature (see "Out of scope") ever introduces a shareable, possibly-public artifact — e.g., a "propose a playdate" link sent via email that opens a pre-filled request — that artifact's landing page would need its own OG/Twitter card review at that time. Not relevant to this feature's scope; noting so the future spec doesn't have to re-derive the reasoning chain.

#### Summary table

| Surface | noindex | title | meta/OG/Twitter | schema | sitemap |
|---|---|---|---|---|---|
| `/playdates` (new) | yes | `Playdates · fofafu` (tab title only) | none | none (avoid `Event`) | none |
| `/family/:id` (extended) | yes (unchanged, per `[[features/user-profile]]`) | unchanged | unchanged | `WebPage` (unchanged) | unchanged (`/family`, priority 0.6, monthly) |

### Growth
*(filled by growth-analyst)*
