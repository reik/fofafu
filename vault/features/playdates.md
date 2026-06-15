---
slug: playdates
title: Playdates
owner: engineering
collaborators: []
status: drafting
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
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
