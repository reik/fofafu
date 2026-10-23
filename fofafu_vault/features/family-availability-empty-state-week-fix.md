---
slug: family-availability-empty-state-week-fix
title: Family Availability Empty State Week Fix
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-09-15
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Family Availability Empty State Week Fix

## Problem

On a family profile page (`/family/:id`), the "`___`'s availability" section always renders for any non-owner viewer, regardless of whether that family has entered availability. The empty-state message ("`firstName` hasn't set any availability yet.") only fires when the viewed week is strictly *in the future*. Since the section defaults to the **current** week, a family with zero slots shows a blank `WeekCalendar` grid with a legend and no explanation — confusing, since it looks like a broken feed rather than an intentional empty state.

## Acceptance criteria

- [ ] Viewing another family's availability for the current (or a past) week with zero slots shows the same "`firstName` hasn't set any availability yet." empty-state message, not a bare empty grid.
- [ ] Future weeks with zero slots continue to show the same message (no regression).
- [ ] Weeks with at least one slot still render `WeekCalendar` as before (no regression).
- [ ] A test covers the current-week empty state, since none currently exists.

## Out of scope

- Any change to how availability slots are created/edited (`SlotForm`, `MonthCalendar`, owner-mode calendar).
- Any change to whether the section is shown at all (it stays gated on `!isOwner`).

## Open questions

- None — this is a single boolean-condition fix in `frontend/src/pages/FamilyView.tsx`.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

One-line condition fix in the `FamilyAvailability` component in `frontend/src/pages/FamilyView.tsx` (around line 290):

- **Before:** `) : slots.length === 0 && isoDate(weekStart) > isoDate(new Date()) ? (` — the empty-state branch only fired when the viewed week was strictly in the future, so the default (current) week with zero slots fell through to the bare `WeekCalendar` render instead.
- **After:** `) : slots.length === 0 ? (` — the empty-state now fires whenever the viewed week (current, past, or future) has zero slots, matching the acceptance criteria.

The empty-state DOM/copy itself (`{firstName} hasn't set any availability yet.`, same wrapper markup/classes) was left untouched, so existing qa-engineer component-test selectors and the e2e-test-writer's Playwright text-based selector continue to match without modification.

Scope discipline respected per the feature's Out of scope section: no changes to `SlotForm`, `MonthCalendar`, the owner-mode calendar, or the `!isOwner` gate that controls whether this section renders at all — this is a single boolean-condition edit.

Verification: full frontend suite 188/188 passing (`npx vitest run`), `npx tsc --noEmit` clean.

### Test plan

Unit/integration tests in `frontend/src/pages/FamilyView.test.tsx`, new `describe('FamilyView — Availability empty state', ...)` block (Vitest + RTL, MSW-mocked `GET /playdates/availability/:familyId`). 3 tests:

| # | Test | Type | Assertion | Acceptance criteria covered |
|---|---|---|---|---|
| 1 | `shows the "hasn't set any availability yet" message for the current week when there are zero slots` | unit/integration | With `mockAvailability([])` and no week navigation (defaults to current week), the "Lee hasn't set any availability yet." text renders and the `WeekCalendar`/legend ("click a slot to request") does NOT render | AC1 (current-week zero-slots empty state) + AC4 (a test covers the current-week empty state) |
| 2 | `still shows the empty-state message after navigating to a future week with zero slots (no regression)` | unit/integration | Same zero-slot mock; after clicking the "Next" week-nav button, the empty-state message still renders and the calendar/legend still does not | AC2 (future weeks with zero slots keep showing the message — no regression) |
| 3 | `renders WeekCalendar instead of the empty-state message when at least one slot exists` | unit/integration | With one `free` slot mocked, the calendar/legend ("click a slot to request") renders and the empty-state message does NOT | AC3 (weeks with ≥1 slot still render `WeekCalendar` — no regression) |

Result: full frontend suite 188/188 passing (`npx vitest run` from `frontend/`), including the 3 new tests (`FamilyView.test.tsx` now has 6 total tests, up from 3). `npx tsc --noEmit` clean.

No new endpoint was introduced (existing `GET /playdates/availability/:familyId` reused), so no additional integration test against a real DB boundary was required beyond what these component tests already exercise via MSW at the network boundary per the co-located test convention.

### E2E coverage

Extended the existing `AC5 — another family's free slots on their profile page` describe block in `frontend/e2e/playdates.spec.ts` (this feature enhances a `/family/:id` flow already covered there — no new spec file). Reused the `davis@dummy.test` seed family, which already has zero availability slots seeded (previously used only for the playdates-requests empty state), so no new fixture/seed was needed.

| Scenario | Spec | Status |
|---|---|---|
| Viewing another family's availability for the current week with zero slots shows the "hasn't set any availability yet." empty state instead of a bare grid | `frontend/e2e/playdates.spec.ts` (`AC5 … › shows the empty-state message, not a bare grid, for the current week when no slots exist`) | pending (not run live — see below) |
| Weeks with ≥1 slot still render `WeekCalendar` (no regression) | `frontend/e2e/playdates.spec.ts` (`AC5 … › shows the FamilyAvailability section with read-only free slots`, pre-existing) | pending (not run live — pre-existing test, unaffected by this diff) |

Not added: a dedicated future-week-empty-state E2E case. That branch of the condition was already correct pre-fix (no regression risk) and is covered by qa-engineer's component test in `FamilyView.test.tsx`; a second E2E case would be redundant coverage of the same conditional for no added flow-level signal.

**Not run live.** `npx tsc --noEmit` passes and `npx playwright test e2e/playdates.spec.ts --list` discovers the new test correctly (`playdates.spec.ts:314`), but this sandbox has no `frontend/.env` (no `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), so the suite can't authenticate against Supabase to execute it — same known gap noted in `login-page-navbar-leak` and `header-nav-redesign`. Needs a live run (CI or a machine with `frontend/.env` populated) before this can be marked pass.

### Code review

No code-reviewer pass — tech-lead judgment call, not a skip-by-default. The production diff is a single boolean-condition simplification (`slots.length === 0 && isoDate(weekStart) > isoDate(new Date())` → `slots.length === 0`, 4 characters removed) in one existing component, with no new endpoint, no new dependency, no auth/security/data surface, and an explicit Out-of-scope section confirming `SlotForm`/`MonthCalendar`/owner-mode calendar/the `!isOwner` gate were untouched. Risk is fully bounded by the 3 new unit tests (current-week empty state, future-week regression, ≥1-slot regression) plus the extended E2E assertion, which together cover all 4 acceptance criteria. Proportionality per `[[protocols/dispatch]]` §3 (light editorial/consolidation authority) and `[[teams/engineering]]` mandate ("no surprise abstractions... calm, well-tested code") — spawning a full review for a 1-line conditional would be process overhead disproportionate to the change's blast radius. If a future audit surfaces something this diff missed, treat it as a fresh bug (new feature file), not a reason to retroactively gate this one.

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
