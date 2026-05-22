---
slug: focus-reset-on-route-change
title: Focus Reset On Route Change
owner: engineering
collaborators: [design]
status: shipped
priority: P2
created: 2026-05-21
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Focus Reset On Route Change

## Problem

After client-side navigation (React Router `<Link>` clicks, programmatic `navigate()`), keyboard focus stays where it was on the previous page — usually deep inside whatever link was just activated. Screen-reader users hear the previous page's last-focused element narrated instead of the new page's heading, and Tab users continue from a stale position. This was the one a11y gap flagged during the `[[features/a11y-audit]]` sweep that wasn't fixed inline.

## Acceptance criteria

- [x] After any in-app route change, focus moves to the new page's `<main>` landmark (the `Layout`'s `<main id="main" tabIndex={-1}>`) and the page's primary heading is announced by screen readers.
- [x] Browser back/forward (`popstate`) is also handled — not only `<Link>` clicks and programmatic `navigate()`.
- [x] The behaviour does not run on the *initial* page load (don't fight the browser's default; only react to subsequent route changes).
- [x] Anchor jumps (`/page#section`) preserve their native behaviour — focus goes to the targeted element, not `<main>`.
- [x] An automated test covers at least one navigation pair (e.g. `/` → `/feed`) and asserts that `<main>` receives focus.

## Out of scope

- Visual focus-ring styling (already handled by Tailwind defaults + the existing `focus:outline-none` on `<main>`).
- Scroll restoration (separate concern; React Router has its own primitive).
- Modal / dialog focus traps (no modals shipped yet).

## Open questions

- Should the focus go to `<main>` or the first heading inside it? `<main tabIndex={-1}>` is simpler and matches what the skip-link already targets; first-heading-focus has a slight a11y advantage but couples to per-page content.
- Where should the hook live — `Layout.tsx` (every page that uses Layout gets it for free) or `App.tsx` at the router level (decoupled from Layout)?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

**Shape chosen**: a small reusable hook `useFocusMainOnRouteChange()`, invoked from `Layout.tsx`.

**Files**

- `frontend/src/hooks/useFocusMainOnRouteChange.ts` — the hook.
- `frontend/src/hooks/useFocusMainOnRouteChange.test.tsx` — co-located unit test (3 cases: initial render, route change, anchor jump).
- `frontend/src/components/Layout.tsx` — calls `useFocusMainOnRouteChange()` once per render so every page wrapped in `<Layout>` (all 11 pages) gets the behaviour.

**Behaviour**

1. Reads `useLocation()` from `react-router-dom`.
2. Keeps a `useRef(true)` flag (`isInitialRender`) that flips to `false` on first effect run — the initial page load is left untouched (acceptance criterion: no fight with browser default).
3. On subsequent `location.pathname` or `location.hash` changes:
   - If `location.hash` is non-empty (e.g. `/page#section`), returns early — browsers' native anchor-jump behaviour is preserved.
   - Otherwise, calls `document.getElementById('main').focus()`. `<main id="main" tabIndex={-1}>` already exists in `Layout.tsx` and is the same target the skip-link uses.
4. Works for `<Link>` clicks, programmatic `navigate()`, and browser back/forward — `useLocation()` updates uniformly for all three.

**Why Layout (not App.tsx)**

The dispatcher offered both. Layout is simpler and every page (including `/login`, `/register`, `/verify-email`) already wraps in `<Layout>`, so wiring it once covers everything. App-level placement would require `<Routes>` to be wrapped in a child component that calls the hook, adding a needless indirection layer.

**Element being focused**: `document.getElementById('main')` — the `<main>` landmark inside `Layout.tsx`. QA's nav-pair test and the a11y audit should assert against this exact element.

**Quality gates passed**

- `npm test -- --run`: 49/49 pass (46 baseline + 3 new hook tests).
- `npx tsc --noEmit`: clean.
- `npm run build`: clean (149 modules, 363 kB JS).

### Test plan

File: `frontend/src/hooks/useFocusMainOnRouteChange.test.tsx` (Vitest + RTL, JSDOM, co-located with the hook).

Harness: a small `<TestApp>` mounts the hook inside a `MemoryRouter` with three routes (`/`, `/feed`, `/page`), a `<main id="main" tabIndex={-1}>` landmark, three `<Link>`s, and a `Back` button wired to `useNavigate(-1)` to simulate a popstate-equivalent history pop under `MemoryRouter`.

| # | Acceptance criterion | Type | Assertion |
|---|---|---|---|
| 1 | AC3 — initial render must not steal focus | unit | After rendering at `/`, `document.activeElement === document.body`. |
| 2 | AC1, AC5 — focus moves to `<main>` after route change | unit | Click `/feed` Link; heading "Feed Page" present; `document.activeElement === document.getElementById('main')`. |
| 3 | AC4 — hash anchors preserve native behavior | unit | Click `/page#section` Link; heading "Anchor Page" present; `document.activeElement !== document.getElementById('main')`. |
| 4 | AC2 — browser back/forward (popstate) is handled | unit | Navigate `/ -> /feed`, blur active element, then click `Back` (`navigate(-1)`); heading "Home Page" present; `document.activeElement === document.getElementById('main')`. |

Result: 4/4 pass. Full frontend suite 50/50 (was 49 after frontend-dev's three pre-seeded cases; QA added +1 popstate case). Backend sanity 70/70. `tsc --noEmit` clean.

Notes:

- Case 4 uses `navigate(-1)` rather than `window.history.back()` because JSDOM's `popstate` event is decoupled from `MemoryRouter`'s in-memory history stack. The production hook still reacts to real browser popstate because its sole trigger is `useLocation()`, which updates identically on `<Link>` clicks, programmatic `navigate()`, and history pops.
- Case 4 explicitly blurs the active element after the forward hop so the post-back assertion is meaningful (otherwise focus is already on `<main>` from the forward navigation and the back-nav assertion is trivially true).
- We do not assert on `<main>`'s `tabIndex` — that is a `Layout.tsx` contract already exercised indirectly by `src/tests/a11y.test.tsx` (axe sweep: 0 violations across 11 pages).
- Coverage delta is small (~15 LOC hook) and is fully exercised by the four cases above; no integration or E2E needed for this scope.

## Design — Spec

### Visual
*Not applicable — this feature has no visual surface. The existing `focus:outline-none` on `<main>` is intentional: programmatically focusing a landmark should not flash a focus ring (the navigation event itself is what signals the change to AT users, not a visible outline on a non-interactive container). No tokens or layout change.*

### Microcopy
*Not applicable — this feature ships no user-visible strings. The existing "Skip to main content" link copy is untouched.*

### Accessibility

**Audit date:** 2026-05-21
**Audited against:** WCAG 2.2 AA, plus established SPA focus-management best practices (Marcy Sutton / Adrian Roselli / GOV.UK Design System guidance).
**Scope:** behavioural / semantic audit of `frontend/src/hooks/useFocusMainOnRouteChange.ts` + its wiring in `frontend/src/components/Layout.tsx`, plus a re-run of the existing axe-core sweep.

#### Verdict

**Status: success. Zero blocking findings.** The implementation is correctly scoped, correctly placed, and exercises the right WCAG-relevant control points. Re-running the consolidated axe-core sweep showed no regressions.

#### What was audited

| Aspect | Finding | Blocking? |
|---|---|---|
| Focus target = `<main>` landmark | Correct. Matches the skip-link's destination, reuses the existing `tabIndex={-1}` container, and is the conventional landmark for SR narration. Decoupled from per-page heading structure. | n/a |
| Initial-render exception | Correct. `isInitialRender` ref returns early on first effect. Avoids the well-known anti-pattern of stealing focus on page load (which makes SRs re-announce/stutter and breaks Cmd-L → Tab keyboard flow). | n/a |
| `popstate` (back/forward) handling | Correct, implicitly. React Router's `useLocation` updates synchronously on `popstate`, so the effect's `[location.pathname, location.hash]` dependency fires identically for `<Link>` clicks, programmatic `navigate()`, and history navigation. No additional listener needed. | n/a |
| Hash-anchor exception (`/page#section`) | Correct. When `location.hash` is truthy the effect returns early; the browser places focus on the anchored element per its native algorithm. Covered by `useFocusMainOnRouteChange.test.tsx:49`. | n/a |
| Hook is wired into the app | Correct. `Layout.tsx:13` calls `useFocusMainOnRouteChange()`. All 11 pages render through `<Layout>`, so the behaviour applies app-wide. | n/a |
| Same-pathname navigation | No-op (intended). Effect depends on `[pathname, hash]`; clicking the active nav link does not yank focus. | n/a |
| `tabIndex={-1}` on `<main>` | Correct. Programmatic-focus-only — no sticky tab stop during normal keyboard traversal. | n/a |

#### Non-blocking observations

1. **No `aria-live` announcement needed.** Focusing a landmark whose first child is the `<h1>` is sufficient — VoiceOver, NVDA, and JAWS all narrate the landmark role + accessible name + first child when focus lands on a `tabIndex={-1}` `<main>`. Adding a polite live-region with the page title would risk double-announcement and is not recommended without screen-reader user testing pointing to a gap.

2. **Cross-page hash navigation is a deliberate trade-off.** `/feed` → `/feed#latest` will skip the focus reset (correct — the user is expressing intent to land on the anchor). Worth noting in case future feature work introduces in-page hash patterns inside an SPA route.

3. **qa-engineer's test does not include an explicit `popstate` case.** Non-blocking because the code path is identical to a `<Link>` click (same `useLocation` update source) and the hook is dependency-driven, not event-driven. Adding a `history.back()` case would be belt-and-braces; defer.

4. **Pre-existing React `act()` warnings from `Navbar`'s unread-count query** surface during the axe sweep. They predate this feature, do not affect violations, and should be triaged separately by `qa-engineer`. Flagged as housekeeping, not as a blocker for this feature.

#### Contrast / ARIA / Semantics

- **Contrast:** no new color pairs introduced. The audit in `[[features/a11y-audit]]` remains valid.
- **ARIA:** no new roles/attributes. The implicit `role="main"` on `<main>` is what AT will announce on focus.
- **Semantics:** `<main>` remains unique per page and wraps page content. No change.
- **Keyboard:** post-reset, Tab order resumes from the first focusable descendant of `<main>` — the page's first interactive control. No new tab traps.
- **Screen-reader:** no new accessible names required. Each page's `<h1>` carries page identity.

### a11y — Build audit (axe-core sweep)

Re-ran the existing consolidated sweep at `frontend/src/tests/a11y.test.tsx` to confirm no regression with the hook now active in `Layout.tsx`.

```
$ cd frontend && npm test -- --run a11y
✓ src/tests/a11y.test.tsx (11 tests) 934ms
  Test Files  1 passed (1)
       Tests  11 passed (11)
```

**Result: 11/11 pages, 0 violations.** No regression on contrast, ARIA, or landmark structure across Login, Register, VerifyEmail, Home, FamilyMe, FamilyView, Feed, AnnouncementDetail, Messages, MessageThread, Search.

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
