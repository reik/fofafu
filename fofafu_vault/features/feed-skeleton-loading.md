---
slug: feed-skeleton-loading
title: Feed Skeleton Loading
owner: engineering            # primary team: engineering | design | marketing
collaborators: [design]       # additional teams; dispatcher infers if empty
status: review                # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-09-15
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: "[[docs/screenshots/feed-skeleton-proposal/mock.html]]"
---

# Feed Skeleton Loading

## Problem

The home page (`/`) and the `/feed` page currently show a plain `Loading…`
text line while announcements fetch (`feed.isPending` in `pages/Home.tsx`
and `pages/Feed.tsx`). For a community platform whose core loop is reading
the feed, that is the single most-seen loading state in the product — and a
bare text line reads as janky and unfinished, gives no sense of what content
is coming, and causes a visible layout pop when real cards render. The same
applies to the Community rail on the home page (`community.isPending`).

A human-approved proposal mock exists:
`docs/screenshots/feed-skeleton-proposal/` (`mock.html`,
`home-feed-skeleton.png`, `feed-column-skeleton.png`), built against the
real `AnnouncementCard` markup and the design tokens in
[[standards/design-system]] — that mock is the visual source of truth.

## Acceptance criteria

- [ ] While announcements load on the home page (`/`), show 2–3 skeleton
      announcement cards in place of the `Loading…` text, mirroring the
      `AnnouncementCard` anatomy: avatar circle → author-name line →
      timestamp line → 2–4 body text lines → reaction pill row. At least one
      skeleton card should include a media placeholder block (posts may
      carry images).
- [ ] While announcements load on `/feed` (`Feed.tsx`, initial page load
      only — `isPending && cursor === null`), show the same skeleton cards
      instead of `Loading…`.
- [ ] While the Community rail loads on the home page
      (`community.isPending`), show skeleton rows (avatar circle + name line
      + city/state line) instead of `Loading…`.
- [ ] Skeleton is built from a reusable component (e.g.
      `AnnouncementCardSkeleton`) rather than inline copy-pasted markup, so
      `Feed.tsx` and `Home.tsx` share it.
- [ ] Visual conformance with the approved mock: bones use
      `surface.subtle` (`#F4ECDF`) base with a subtle pulse/shimmer
      animation, `rounded-lg` cards with `shadow-lift` matching real card
      chrome, `rounded-full` for pill/avatar bones. No new color tokens.
- [ ] The skeleton announces loading state accessibly: the feed section
      carries `aria-busy="true"` while pending; skeleton blocks are
      `aria-hidden`. No focus stealing; once real content renders it must
      be reachable without extra tab stops.
- [ ] Reduced-motion: the pulse/shimmer animation is disabled under
      `prefers-reduced-motion` (static bones instead).
- [ ] Before/after screenshots committed at
      `docs/screenshots/feed-skeleton-loading/{before,after}.png` per
      [[standards/engineering-standards]] (after.png should match the
      approved proposal mock).

## Out of scope

- Skeletons for other pages (Messages, FamilyView, Playdates, Search) —
  feed + home Community rail only; the shared component may be reused
  later.
- Pagination "Load older posts" skeletons on `/feed` (that button-triggered
  append keeps the existing pattern).
- Any backend change — purely a frontend rendering concern.
- Error-state redesign (`feed.isError` copy stays as-is).

## Open questions

- Whether `AnnouncementDetail.tsx` (`postQuery.isPending`) should also get a
  single-card skeleton — it renders one `AnnouncementCard`; leaning yes as a
  trivial reuse, but the mock only covers the list case. Decide during
  implementation; default to including it if the shared component drops in
  cleanly.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

**Landed.** All code below is committed on this worktree/branch as of this write-up
(2026-09-23). Cross-checked against qa-engineer's `### Test plan` contract and
e2e-test-writer's `### E2E coverage` spec, both written concurrently before this
implementation existed — reconciliation notes below.

**Components**
- `frontend/src/features/feed/components/AnnouncementCardSkeleton.tsx` — exports:
  - `AnnouncementCardSkeleton({ lines?: number; withMedia?: boolean; className?: string })`
    — root `<div data-testid="announcement-card-skeleton" aria-hidden="true">`, mirrors
    `AnnouncementCard`'s anatomy: avatar circle → stacked name/timestamp bones → "Open"
    pill bone → 2–4 body-line bones (`lines`, clamped 2–4) → optional media bone
    (`data-testid="announcement-card-skeleton-media"`, `withMedia`) → 5-pill reaction row.
    Card chrome (`rounded-lg bg-surface-card p-5 shadow-lift`) is byte-identical to the
    real `AnnouncementCard`'s own classes.
  - `AnnouncementFeedSkeleton()` — the shared 3-card variant mix (3 lines / 2 lines +
    media / 2 lines) both `Home.tsx` and `Feed.tsx` import directly — no copy-pasted
    skeleton markup at either call site.
- `frontend/src/components/CommunityRowSkeleton.tsx` — exports `CommunityRowSkeleton`
  (single row: avatar circle + name line + city/state line,
  `data-testid="community-skeleton-row"`) and `CommunityRailSkeleton` (4 varied-width
  rows), used by `Home.tsx`'s Community rail.
- `frontend/src/hooks/usePrefersReducedMotion.ts` — new hook (`(): boolean`), wraps
  `matchMedia('(prefers-reduced-motion: reduce)')` with a live `change` listener (not
  polling). Added mid-implementation to satisfy qa-engineer's `usePrefersReducedMotion.test.ts`
  contract (written ahead of this code, TDD-style, per dispatch instructions) — the bones
  also carry the CSS-only `motion-reduce:animate-none` Tailwind variant as a
  belt-and-suspenders fallback, so reduced-motion is correct even in contexts where the
  hook hasn't mounted/run (e.g. first paint). Both `AnnouncementCardSkeleton` and
  `CommunityRowSkeleton` consume it: `animate-pulse` is omitted outright (not just
  overridden by CSS) when the hook reports `true`.

**Design deviations from the literal mock, both driven by ui-designer's concurrent
`### Visual` audit (read before finalizing markup):**
1. Avatar bones are `h-10 w-10` (40px), not the mock's 32px — matches real
   `<Avatar size="sm">` exactly, per discrepancy #1 in the audit. Shipping the mock's 32px
   verbatim would have reintroduced the exact layout-pop bug this feature exists to fix.
2. Reaction row renders 5 pill bones with per-label-approximate widths (68/70/64/96/84px),
   not the mock's 2–3, per discrepancy #2 — the real `ReactionBar` always renders all 5
   `REACTION_TYPES` pills unconditionally, so a 2–3-pill skeleton row understates the real
   row's width/wrap behavior.
   Everything else (bone fill `bg-surface-subtle`, card `rounded-lg`/`shadow-lift`, pill/
   avatar `rounded-full`, media block `rounded` not `rounded-lg`) matches the mock exactly,
   confirmed against `docs/screenshots/feed-skeleton-proposal/mock.html` directly.

**Integration points**
- `Home.tsx` — `<section aria-label="Announcements">` gets `aria-busy={feed.isPending}`;
  renders `<AnnouncementFeedSkeleton />` instead of the `Loading…` line while
  `feed.isPending`. The Community `<aside aria-label="Community">` gets
  `aria-busy={community.isPending}`; renders `<CommunityRailSkeleton />` instead of
  `Loading…` while `community.isPending`, falling back to the real `<ul>` once resolved.
- `Feed.tsx` — the pre-existing persistent `<section className="mt-6">` wrapper (present
  in both the pending and loaded states — it never unmounts across that transition) now
  carries `data-testid="feed-loading-region"` and `aria-busy={isPending && cursor === null}`,
  and renders `<AnnouncementFeedSkeleton />` only while that expression is true. This
  attachment point was corrected mid-implementation per a11y-auditor's concurrent finding
  #1 (`### Accessibility`): the *inner* `role="feed"` div only mounts once
  `items.length > 0`, so it can't carry `aria-busy` during the exact pending window the
  skeleton covers — the outer, persistent section is the correct place. "Load older posts"
  (`cursor !== null`) is untouched and does not re-trigger the skeleton or flip
  `aria-busy` back to `"true"`, per the feature's explicit out-of-scope note.
- `AnnouncementDetail.tsx` — **Open Question resolved: yes, included.** `postQuery.isPending`
  now renders `<AnnouncementCardSkeleton lines={3} />` (wrapped in a
  `<div aria-busy="true" aria-label="Post">`) instead of the bare `Loading…` line. The
  shared component dropped in cleanly with a single import and zero new markup, so per the
  feature file's own default ("include it if the shared component drops in cleanly"), it's
  in scope. Comments (`commentsQuery.isPending`) are unchanged — out of scope, still
  "Loading comments…".

**Contract reconciliation (qa-engineer / e2e-test-writer wrote speculative tests/specs in
parallel, before this code existed — both explicitly invited "implement to match, or
coordinate a change"):**
- Adopted qa-engineer's exact testids/hook contract: `announcement-card-skeleton`,
  `announcement-card-skeleton-media`, `community-skeleton-row` (renamed from an initial,
  unreconciled `community-row-skeleton` this file used before qa's contract was read),
  `feed-loading-region`, and the `usePrefersReducedMotion` hook. All of qa's new/updated
  spec files (`Home.test.tsx`, `Feed.test.tsx`, `usePrefersReducedMotion.test.ts`) now pass
  against this implementation.
- **Unresolved naming drift, flagged for tech-lead/code-reviewer, not resolved
  unilaterally:** e2e-test-writer's `frontend/e2e/feed-skeleton-loading.spec.ts`
  independently picked `data-testid="skeleton-media"` for the same media-block bone, vs.
  `announcement-card-skeleton-media` used here and in qa-engineer's unit-test contract.
  Kept `announcement-card-skeleton-media` (matches the executable unit-test gate this
  workspace actually runs, and namespaces consistently with the other
  `announcement-card-skeleton-*` ids) — e2e-test-writer's spec selector needs updating to
  match, since e2e specs can't execute in this sandbox anyway (see below) and so aren't
  part of this handoff's verified gate.
- Added a jsdom `window.matchMedia` polyfill to `frontend/src/tests/setup.ts` (default
  `matches: false`, no-op listeners) — jsdom doesn't implement `matchMedia` natively, so
  every test that renders `AnnouncementCardSkeleton`/`CommunityRowSkeleton` (not just
  `usePrefersReducedMotion.test.ts`, which installs its own richer per-test mock) would
  otherwise throw. This is a shared test-infra change, not feature-specific, but was
  required for the hook to be safely consumed anywhere.

**Screenshots — captured live, both against the real running app.** Real E2E
(`npm run test:e2e`) isn't runnable in this sandbox (`frontend/.env` doesn't exist, only
`.env.example`; `supabaseClient.ts` throws synchronously at import with no real Supabase
credentials — same gap qa-engineer/e2e-test-writer independently hit). To still get a
genuine live capture rather than a synthetic mock re-creation, built a throwaway,
uncommitted Playwright + Vite harness (`frontend/.screenshot-harness/`, deleted after use,
never part of any commit): a Vite config aliasing only `@/lib/supabaseClient` to a stub
that resolves a fake session synchronously (so `RequireAuth`/`useAuthStore` work exactly as
in production, no source changes), with Playwright's `page.route()` intercepting the app's
real `fetch()` calls to hold `announcement`/`community/recent` pending indefinitely (so the
loading state is capturable deterministically) while fulfilling `family/me` and
`message/unread/count` with fixture data so the rest of the chrome renders normally.
- `docs/screenshots/feed-skeleton-loading/before.png` — captured first, against the
  unmodified `Home.tsx` (bare "Loading…" for both the feed and Community rail), before any
  code in this feature was written.
- `docs/screenshots/feed-skeleton-loading/after.png` — same harness, same viewport
  (1280×900), same demo state (both queries held pending), captured against the finished
  implementation. Matches the approved mock's visual language (bone fill, card chrome,
  pill/avatar rounding, media block) modulo the two documented, design-lead-driven
  deviations above.

**Quality gates — all clean, re-run after every change in this section:**
- `npx vitest run` (frontend workspace): **244/244 pass** (46 files) — includes 9 new
  component tests (`AnnouncementCardSkeleton.test.tsx`, `CommunityRowSkeleton.test.tsx`, both
  written by this role) plus qa-engineer's 15 concurrently-authored tests across
  `Home.test.tsx`/`Feed.test.tsx`/`usePrefersReducedMotion.test.ts`, all passing against this
  implementation with zero test-file edits needed beyond the one pre-existing
  `Feed.test.tsx` case updated to assert skeleton testids instead of the removed `Loading…`
  text.
- `npx tsc --noEmit`: clean, no errors, no `any`.
- `npm run build --workspace frontend`: clean (511 modules, 256KB/74KB gzip JS, no size
  regression of note).

**Files touched:** `frontend/src/features/feed/components/AnnouncementCardSkeleton.tsx`
(+test), `frontend/src/components/CommunityRowSkeleton.tsx` (+test),
`frontend/src/hooks/usePrefersReducedMotion.ts`, `frontend/src/pages/Home.tsx`,
`frontend/src/pages/Feed.tsx` (+ updated one `Feed.test.tsx` case),
`frontend/src/pages/AnnouncementDetail.tsx`, `frontend/src/tests/setup.ts` (matchMedia
polyfill), `docs/screenshots/feed-skeleton-loading/{before,after}.png`.

### Test plan

**Status at time of writing (2026-09-23): frontend-dev's implementation had not
landed in this worktree yet** (`frontend/src/features/feed/components/` has no
`AnnouncementCardSkeleton`; `Home.tsx`/`Feed.tsx` still render bare
`Loading…`). Per dispatch instructions, tests below were written anyway,
TDD-style, against a concrete contract inferred from the approved mock
(`docs/screenshots/feed-skeleton-proposal/mock.html`) and this codebase's
existing conventions — this is the "red" phase; frontend-dev implements to
make these files green, or coordinates a contract change with qa-engineer/
code-reviewer if a divergent shape is needed. Confirmed via a full
`npm run test --workspace frontend -- --run` at write time: 226/231 existing
tests still pass unmodified; the new specs fail exactly as expected (2 files
fail to collect — `Cannot find module` — because the component/hook don't
exist yet; 5 assertions fail inside `Home.test.tsx`/`Feed.test.tsx` because
the pending states still render the old `Loading…` line and no
`feed-loading-region`/skeleton testids exist yet). `tsc --noEmit` likewise
only errors on the same 2 not-yet-existing module paths.

**Mid-write correction from cross-specialist coordination.** [[agents/a11y-auditor]]'s
`### Accessibility` section (written concurrently in this same dispatch) flagged that
`Feed.tsx`'s only existing `aria-busy` today sits on the inner `role="feed"` div, which
doesn't mount until `items.length > 0` — i.e. it cannot cover the exact pending window the
skeleton is meant to fill. This spec's `Feed.tsx` contract was revised in place to match
that finding: `data-testid="feed-loading-region"` must be the *persistent* wrapper already
present in both the pending and loaded states (today's `<section className="mt-6">`),
toggling `aria-busy` between `"true"`/`"false"` rather than mounting/unmounting. This also
closed a vacuous-pass gap in the "Load older posts" test (see below).

**Assumed contract** (documented in full as doc-comments atop each new spec
file):
- `frontend/src/hooks/usePrefersReducedMotion.ts` — new hook, wraps
  `window.matchMedia('(prefers-reduced-motion: reduce)')`, returns/updates a
  boolean.
- `frontend/src/features/feed/components/AnnouncementCardSkeleton.tsx` — new
  component, `{ withMedia?: boolean }` prop, root `<article
  data-testid="announcement-card-skeleton" aria-hidden="true">`, bones tagged
  `data-testid="skeleton-bone"`, optional
  `data-testid="announcement-card-skeleton-media"`, drops `animate-pulse` when
  `usePrefersReducedMotion()` is true, zero focusable descendants.
- `Home.tsx`'s `aria-label="Announcements"` `<section>` gets
  `aria-busy={feed.isPending}`; renders 2-3 `AnnouncementCardSkeleton` (>=1
  `withMedia`) instead of `Loading…` while pending.
- `Home.tsx`'s Community rail renders skeleton rows tagged
  `data-testid="community-skeleton-row"` / `aria-hidden="true"` instead of
  `Loading…` while `community.isPending`.
- `Feed.tsx`'s persistent wrapper section (present in both pending and loaded
  states — today's `<section className="mt-6">`) is tagged
  `data-testid="feed-loading-region"` and carries a live
  `aria-busy={isPending && cursor === null}`: `"true"` during the first page's
  fetch, `"false"` once resolved, and `"false"` again (not re-tripped) during a
  "Load older posts" fetch — see "Mid-write correction" above. It renders the
  skeleton cards only while that expression is true; the skeletons themselves
  (not the region) disappear once resolved.

| # | Acceptance criterion | Test type | File | Assertion (one line) |
|---|---|---|---|---|
| 1 | Home shows 2-3 skeleton cards (incl. media block) while feed loads | unit/RTL | `frontend/src/pages/Home.test.tsx` (`HomePage skeleton loading`) | 2-3 `announcement-card-skeleton` nodes render, one has a media bone, while `feed.isPending` |
| 2 | `/feed` shows the same skeletons on initial load only | unit/RTL | `frontend/src/pages/Feed.test.tsx` (`FeedPage skeleton loading (initial load only)`) | skeletons render when `isPending && cursor === null`; do not reappear on "Load older posts" |
| 3 | Community rail shows skeleton rows while loading | unit/RTL | `frontend/src/pages/Home.test.tsx` | `community-skeleton-row` nodes render while `community.isPending`, gone once resolved |
| 4 | Skeleton is a reusable shared component | unit/RTL | `frontend/src/features/feed/components/AnnouncementCardSkeleton.test.tsx` | component renders full anatomy (avatar/name/timestamp/2-4 lines/reaction pills) standalone; both `Home.test.tsx` and `Feed.test.tsx` assert against the identical `announcement-card-skeleton` contract, proving reuse rather than duplicated markup |
| 5 | Visual conformance with mock (tokens, radii, shadow, no new colors) | unit/RTL (partial) + manual/E2E for pixels | `AnnouncementCardSkeleton.test.tsx` asserts Tailwind class presence only (`rounded-full` pills, `animate-pulse`); jsdom cannot verify computed pixels/colors — full conformance is a11y-auditor/ui-designer visual review + e2e-test-writer's Playwright screenshot diff against `after.png` | class-name-level checks only in this layer |
| 6a | `aria-busy="true"` on the feed section while pending, `"false"` once loaded | unit/RTL | `Home.test.tsx`, `Feed.test.tsx` | section/region toggles `aria-busy` string value across the pending→resolved transition |
| 6b | Skeleton blocks are `aria-hidden`; no extra tab stops | unit/RTL | `AnnouncementCardSkeleton.test.tsx`, `Home.test.tsx`, `Feed.test.tsx` | every skeleton root has `aria-hidden="true"`; skeleton subtree has zero `a`/`button`/`input`/`[tabindex]`; `queryAllByRole('article')` is empty while pending (skeletons never enter the accessible tree) and non-empty once real content loads |
| 7 | Reduced-motion disables the pulse (static bones) | unit | `frontend/src/hooks/usePrefersReducedMotion.test.ts`, `AnnouncementCardSkeleton.test.tsx` | hook reflects `matchMedia('(prefers-reduced-motion: reduce)').matches` incl. live updates; skeleton bones drop `animate-pulse` when the hook returns `true` |
| 8 | Before/after screenshots committed | N/A for this layer | — | owned by frontend-dev per `[[standards/engineering-standards]]`; not a Vitest/RTL concern |
| (open Q) `AnnouncementDetail.tsx` single-card skeleton | deferred | — | left undecided per the feature file's "Open questions" — no test written pending that decision; add one co-located in a future `AnnouncementDetail.test.tsx` update if adopted |

**Test count: 4 new/updated spec files, 15 new test cases** (4 in
`usePrefersReducedMotion.test.ts`, 7 in `AnnouncementCardSkeleton.test.tsx`, 3
added to `Home.test.tsx`, 4 added to `Feed.test.tsx`) across unit + RTL
integration layers. After the `feed-loading-region`-persistence correction
above, only one known-shallow assertion remains to revisit once the
implementation lands: `Feed.test.tsx`'s "does not surface any accessible
article roles or focusable content while pending" currently passes
**vacuously** (nothing is rendered yet to violate it) — re-run and eyeball it
specifically once real skeleton markup exists, since a vacuous pass can mask a
real future regression. (The "Load older posts" re-trip check now fails for a
real reason — `getByTestId('feed-loading-region')` — confirmed by re-running
the suite after the correction: 226/231 pass, 5 fail for expected reasons.)

E2E (pixel-level visual conformance, real-browser `prefers-reduced-motion`
emulation, before/after screenshot capture) is [[agents/e2e-test-writer]]'s
scope — not duplicated here.

**Contract drift flagged for tech-lead/code-reviewer reconciliation.**
[[agents/e2e-test-writer]]'s `frontend/e2e/feed-skeleton-loading.spec.ts` was
written in parallel against its own guess at the same not-yet-landed
component, and independently picked `data-testid="skeleton-media"` for the
media-block bone, vs. this Test plan's `announcement-card-skeleton-media`.
Both specs otherwise agree (`announcement-card-skeleton`,
`community-skeleton-row`, `aria-hidden`/`aria-busy` semantics). Since neither
of us is the producer, pick one canonical name before frontend-dev implements
— recommend keeping the fuller `announcement-card-skeleton-media` for
namespacing consistency with the other `announcement-card-skeleton-*` hooks in
this file, and updating the Playwright spec's selector to match — and note
whichever is chosen back in both specs' doc-comments.

### E2E coverage

Written against the ACs before frontend-dev's implementation had landed in
this worktree (parallel dispatch — Home.tsx/Feed.tsx still showed plain
`Loading…` text and no `AnnouncementCardSkeleton`-equivalent component
existed at the time this spec was authored). Selectors encode an assumed
test-hook contract documented at the top of the spec file
(`[aria-busy="true"]` on the pending container, `data-testid="announcement-card-skeleton"`
per skeleton card + `aria-hidden="true"` + no focusable descendants,
`data-testid="announcement-card-skeleton-media"` for the media-block variant
(corrected from an initial `skeleton-media` assumption during code review —
see below), `data-testid="community-skeleton-row"` for the rail) — if the shipped
markup uses different hooks, frontend-dev/tech-lead should update the
selectors, not the assertions, since the assertions are the ACs themselves.
Tests intercept the real Supabase Edge Function calls (`page.route` +
delayed `route.continue()`) to make the pending window observable against
real network timing rather than mocking response bodies.

| Scenario | Spec | Status |
|---|---|---|
| Home feed shows 2–3 skeleton cards (one with a media block) while pending, aria-busy clears and skeletons unmount once real cards render | `frontend/e2e/feed-skeleton-loading.spec.ts` | skeleton behavior verified; real-content tail blocked on seed data (see below) |
| Tabbing while the home feed is pending never focuses inside a skeleton block (no extra tab stops) | `frontend/e2e/feed-skeleton-loading.spec.ts` | skeleton behavior verified; real-content tail blocked on seed data (see below) |
| Home Community rail shows skeleton rows while pending, swaps to real rows | `frontend/e2e/feed-skeleton-loading.spec.ts` | skeleton behavior verified; real-content tail blocked on seed data (see below) |
| `/feed` initial load shows the same skeleton cards, then swaps to real content | `frontend/e2e/feed-skeleton-loading.spec.ts` | skeleton behavior verified; real-content tail blocked on seed data (see below) |
| `/feed` "Load older posts" pagination does not re-show the initial-load skeleton (isPending && cursor === null only) | `frontend/e2e/feed-skeleton-loading.spec.ts` | blocked before it reaches the pagination step — needs seeded initial content (see below) |
| `prefers-reduced-motion` disables the skeleton's pulse/shimmer animation (static bones) | `frontend/e2e/feed-skeleton-loading.spec.ts` | skeleton behavior verified; real-content tail blocked on seed data (see below) |

**Execution status — now actually run, not just read.** Originally blocked
identically to `moderation-report-block.spec.ts`/`header-nav-redesign.spec.ts`/
`playdates.spec.ts` by the missing-`frontend/.env` root cause traced there.
[[features/e2e-auth-mocking]] (dispatched separately, since the fix is shared
across all four specs) closed that gap; re-ran this spec against its
`loginAs` locally (branch `fix/e2e-auth-mocking`'s `login.ts`, not yet
merged — temporary local copy for verification, not committed here) and
found a second, separate bug: `delayRoute(page, '**/announcement*')`
(4 of the 6 scenarios) also matches Vite's dev-server request for the
source file `src/api/announcements.ts` — imported eagerly by `App.tsx`'s
top-level, non-lazy route table, so it's fetched on *every* page load
including `/login`. The delayed route then hangs indefinitely, timing out
`page.goto('/login')` itself before `loginAs` ever gets a chance to run.
Narrowed the pattern to `**/functions/v1/announcement*` (the real Edge
Function path, per `edgeClient.ts`'s `FUNCTIONS_URL`), which doesn't
collide with any source file. Fixed in this branch's own spec file — not
e2e-auth-mocking's scope, since it's specific to this spec's route pattern.

After that fix: **5 of 6 scenarios reach and pass every skeleton-specific
assertion** (skeleton visible with correct count/media block, `aria-busy`
lifecycle, `aria-hidden` + zero focusable descendants, reduced-motion
`animationName: none`) — they only fail on the final "then real content
replaces it" check (`locator('article')` / `getByText('The Chen Family')`
not found), because this sandbox's Supabase project has no seeded dummy
families/posts. The 6th (pagination) needs seeded content just to reach its
first assertion, so it never gets past that. This is the same
missing-seed-data gap `e2e-auth-mocking` already logged for 3 other specs —
not a bug in this feature, and not something a dispatched fix can close
without a human populating real test data in a reachable project. Once
seed data exists, expect all 6 green with no further code changes.

### Code review

**Summary.** This supersedes an earlier `### Code review` write-up in this file that
was internally inconsistent (it claimed `git diff master...HEAD` was empty while
simultaneously citing specific line numbers from landed code, and today's log has no
entry recording it) — disregard that prior text; this is the real review, done against
commit `1a79dab` (`feat(frontend): skeleton loading states for feed, /feed, and
Community rail`), the only commit on `feat/feed-skeleton-loading` ahead of `master`.
Scope: `AnnouncementCardSkeleton.tsx` (+test), `CommunityRowSkeleton.tsx` (+test),
`usePrefersReducedMotion.ts` (+test), `Home.tsx`, `Feed.tsx`, `AnnouncementDetail.tsx`,
`Home.test.tsx`/`Feed.test.tsx` additions, `tests/setup.ts` matchMedia polyfill, and the
two committed screenshots (20 files, ~1,390 insertions — within normal review depth, no
truncation needed). `npx tsc --noEmit` clean. Spot-ran the 5 touched/added spec files
directly (`Home.test.tsx`, `Feed.test.tsx`, `AnnouncementCardSkeleton.test.tsx`,
`CommunityRowSkeleton.test.tsx`, `usePrefersReducedMotion.test.ts`): 32/32 pass, matching
frontend-dev's broader 244/244 self-report. No `console.log`, `any`, or `@ts-ignore`
anywhere in the diff. No PII surface (this is pure client-rendering chrome, no new API
calls). Overall verdict: solid implementation, functionally correct against every
acceptance criterion — but three verified must-fix items (a real test-coverage gap, a
confirmed-broken e2e selector, and a wholly untested new page behavior) should be closed
before calling this fully done, even though none of them block shipping the visible
behavior itself.

**a11y-auditor's finding #1 (`aria-busy` attachment point) — CONFIRMED FIXED.** Read
`frontend/src/pages/Feed.tsx` directly: `<section className="mt-6"
data-testid="feed-loading-region" aria-busy={isPending && cursor === null}>` is a single,
unconditionally-rendered JSX node — never behind a conditional, never unmounts across the
pending→loaded→paginated lifecycle; only its *children* (skeleton vs. error vs.
empty-state vs. list) are conditional. This is exactly a11y-auditor's required fix: the
region covers the entire initial-pending window (`items.length === 0`), unlike the
pre-existing inner `role="feed"` div, which only mounts once `items.length > 0`.
`aria-busy` correctly stays `"false"` during "Load older posts" (`cursor !== null`) —
confirmed by reading the boolean expression and by the passing
`Feed.test.tsx` "does not re-show the initial-load skeleton..." test. Same pattern in
`Home.tsx`: both `<section aria-label="Announcements" aria-busy={feed.isPending}>` and
`<aside aria-label="Community" aria-busy={community.isPending}>` are the outer,
always-mounted containers.

**a11y-auditor's finding #4 (`prefers-reduced-motion`) — CONFIRMED WIRED, but see
must-fix #1.** `AnnouncementCardSkeleton.tsx:34-39` and `CommunityRowSkeleton.tsx:15-16`
both call `usePrefersReducedMotion()` and build
`bone = cn('bg-surface-subtle motion-reduce:animate-none', !prefersReducedMotion && 'animate-pulse')`
— `animate-pulse` is omitted from the className outright (not just CSS-overridden) when
the hook reports `true`. Real wiring, not dead code. The hook itself
(`usePrefersReducedMotion.ts`) correctly uses a live `matchMedia` `change` listener, not
polling or a one-shot read. However, the two component-level unit tests that claim to
cover this behavior don't actually exercise it — see must-fix #1.

**ui-designer's 2 flagged discrepancies — CONFIRMED APPLIED, both correctly.**
- Avatar bone: `AnnouncementCardSkeleton.tsx:53` is `h-10 w-10`. Cross-checked against
  `frontend/src/components/Avatar/Avatar.tsx` — `SIZE_CLASSES.sm = 'h-10 w-10 text-base'`
  — exact match (40px), not the mock's 32px. Correct per discrepancy #1's recommendation.
- Reaction pills: `AnnouncementCardSkeleton.tsx:12` (`REACTION_PILL_WIDTH_CLASSES`) has 5
  entries, rendered unconditionally. Cross-checked `frontend/src/api/announcements.ts:11`
  — `REACTION_TYPES = ['like', 'love', 'hug', 'celebrate', 'support']` (5, always rendered
  per `ReactionBar.tsx:34`) — exact match. Correct per discrepancy #2.
- Card chrome (`space-y-3 rounded-lg bg-surface-card p-5 shadow-lift`) is byte-identical
  to `AnnouncementCard.tsx`'s own `<article>` classes — confirmed by direct string
  comparison, not just visual inspection.

**Tech-lead verification note (2026-09-23, post-aggregation).** All 3 must-fix items below
were closed directly on commit `0633f7e` (`fix(frontend): close code-review must-fixes on
feed-skeleton-loading`) after this Code review subsection was written, to avoid a further
code-reviewer re-spawn hitting today's session rate limits (see `log/2026-09-23.md` 12:16).
Independently re-verified by tech-lead, not taken on faith: `frontend/e2e/feed-skeleton-loading.spec.ts:58`
now asserts `getByTestId('announcement-card-skeleton-media')`; `frontend/src/tests/installMatchMedia.ts`
exists and is used by `AnnouncementCardSkeleton.test.tsx`, `CommunityRowSkeleton.test.tsx`, and
`usePrefersReducedMotion.test.ts` to exercise a real `matches: true` branch (each file's "drops
the pulse animation" case asserts `bone).not.toHaveClass('animate-pulse')` under the true mock,
not just the presence of the CSS fallback class); `frontend/src/pages/AnnouncementDetail.test.tsx`
now exists with 2 tests covering the pending-skeleton and resolved-content states, and
`AnnouncementDetail.tsx`'s wrapper got `role="group"` per the a11y-auditor's finding #5.
Full suite re-run clean: `npx tsc --noEmit` zero errors, `npx vitest run` 250/250 (47 files).
The findings text below is left as code-reviewer wrote it (their audit was accurate at the time);
treat every item in this **Must-fix** list as CLOSED as of `0633f7e`.

**Must-fix**
- `frontend/src/features/feed/components/AnnouncementCardSkeleton.test.tsx:15-20` and
  `frontend/src/components/CommunityRowSkeleton.test.tsx:13-19` — the tests titled
  "disables the pulse animation under prefers-reduced-motion" never install a
  `matchMedia` mock with `matches: true` before rendering; they render against the
  global `setup.ts` polyfill (always `matches: false`) and only assert that the bone
  carries *both* `animate-pulse` and `motion-reduce:animate-none` simultaneously. That
  assertion would still pass even if the `!prefersReducedMotion &&` conditional were
  deleted from the component (i.e. if `animate-pulse` were applied unconditionally and
  reduced-motion relied on the CSS variant alone). a11y-auditor named reduced-motion
  handling one of exactly two blocking findings for this feature, so the test suite
  should actually exercise the `true` branch — e.g. install a `matches: true` matchMedia
  mock (as `usePrefersReducedMotion.test.ts` already correctly does) before rendering
  `AnnouncementCardSkeleton`/`CommunityRowSkeleton` and assert the bone does **not**
  have `animate-pulse` in that state. The implementation itself is correct (verified
  above); this is a regression-protection gap — a future refactor could silently break
  the reduced-motion requirement with no test failing.
- `frontend/e2e/feed-skeleton-loading.spec.ts:58` — `page.getByTestId('skeleton-media')`
  does not match the shipped `data-testid="announcement-card-skeleton-media"` (used by
  the component itself and by qa-engineer's unit tests). This is real, verified drift,
  not a hypothetical: grepped the spec file directly, confirmed only one occurrence of
  the old name at line 58 (a doc-comment at line 14 also references it). It's true that
  e2e can't execute in this sandbox today (`frontend/.env` missing, `supabaseClient.ts`
  throws at import — independently confirmed by both e2e-test-writer and frontend-dev),
  so it isn't failing any CI gate *right now*. But it is a committed, guaranteed-failing
  assertion the moment someone supplies real Supabase credentials and runs this spec —
  exactly the kind of contract drift the dispatch protocol calls must-fix rather than
  nice-to-have, since "no test currently runs it" isn't the same as "it's correct." Fix:
  rename the selector at line 58 (and the reference in the top-of-file doc-comment) to
  `announcement-card-skeleton-media`.
- `frontend/src/pages/AnnouncementDetail.tsx:48-54` — the new skeleton behavior here
  (`<AnnouncementCardSkeleton lines={3} />` replacing the bare `Loading…` line, resolving
  this feature's own "Open questions" note) has zero test coverage: there is no
  `AnnouncementDetail.test.tsx` file in the repo at all (confirmed via `find`), unlike
  `Home.tsx`/`Feed.tsx`, which both got dedicated new skeleton-loading test blocks. The
  Test plan subsection explicitly anticipated this ("no test written pending that
  decision; add one co-located in a future `AnnouncementDetail.test.tsx` update if
  adopted") — the decision was adopted but the test was never added. Per this project's
  TDD rule and the acceptance criteria's own a11y bullets (aria-busy, aria-hidden,
  no-focus-stealing), this page's new pending-state markup should get at least a smoke
  test asserting the skeleton renders while `postQuery.isPending` and disappears once
  resolved, mirroring the pattern already used in `Home.test.tsx`/`Feed.test.tsx`.

**Nice-to-have**
- `frontend/src/components/CommunityRowSkeleton.tsx:29-34` — `CommunityRailSkeleton`
  renders a fixed 4 rows, while the real Community rail fetches up to
  `COMMUNITY_LIMIT = 12` (`Home.tsx:14`) rows. ui-designer's `### Visual` anatomy section
  suggested rendering "one `CommunityRowSkeleton` per expected row, not a fixed [count]
  if the real limit ever changes." A fixed 4-row skeleton against a potential 12-row
  real list is a smaller version of the same layout-height-pop concern already fixed for
  the avatar/reaction-pill bones. Not blocking — the AC only requires skeleton rows, not
  an exact count — but worth a follow-up.
- `frontend/src/features/feed/components/AnnouncementCardSkeleton.tsx:32-77` — the
  `AnnouncementCardSkeleton` function spans 46 lines (32–77 inclusive), over the
  project's "functions ≤ 40 lines" guideline. Low-risk since it's declarative JSX with no
  branching logic beyond the line-count map, but could be split into small
  `HeaderBone`/`BodyLinesBone`/`ReactionRowBone` pieces for readability if touched again.
- The shipped animation is Tailwind's stock `animate-pulse` (opacity pulse), not the
  mock's `linear-gradient` shimmer-sweep keyframe that ui-designer's `### Visual` section
  specified in detail (including a literal, unregistered `#ebe1d2` gradient stop). This
  is a reasonable simplification — it satisfies the acceptance criterion's literal text
  ("pulse/shimmer animation") and sidesteps the "raw literal color that isn't a token"
  question entirely — but it is a visual-fidelity deviation from the mock that
  design-lead should sign off on explicitly rather than have it pass silently.

**Acceptance criteria spot-check**
- [x] Home shows 2–3 skeleton cards (incl. one media block) instead of `Loading…` — `AnnouncementFeedSkeleton` renders exactly 3, card 2 has `withMedia`; confirmed in code, tests, and `after.png`.
- [x] `/feed` shows the same skeletons on initial load only, not on "Load older posts" — confirmed via `isPending && cursor === null` guard and the passing pagination test.
- [x] Community rail shows skeleton rows instead of `Loading…` — confirmed in `Home.tsx` + `CommunityRowSkeleton.test.tsx`; see nice-to-have on row count above.
- [x] Reusable shared component, no copy-paste between `Home.tsx`/`Feed.tsx` — both import the same `AnnouncementFeedSkeleton`; verified no duplicated skeleton markup at either call site.
- [x] Visual conformance (tokens, radii, shadow, no new color tokens) — bone fill/radii/shadow classes confirmed byte-identical to real components; zero new Tailwind color tokens added; see nice-to-have on shimmer-vs-pulse deviation.
- [x] `aria-busy`/`aria-hidden` semantics correct, no focus stealing — confirmed fixed (see a11y finding #1 above); skeleton roots are `aria-hidden`, no focusable descendants (`tabIndex`/`a`/`button`/`input`) anywhere in either skeleton component or its call sites.
- [x] Reduced-motion disables the animation — confirmed correctly wired at the code level (see a11y finding #4 above), but flagged as must-fix #1 for missing regression-test coverage.
- [x] Before/after screenshots committed at `docs/screenshots/feed-skeleton-loading/{before,after}.png` — both files present in the commit, `after.png` visually matches the approved mock's bone styling modulo the two signed-off design deviations.

## Design — Spec

### Visual

**Ground truth used.** Audited against `docs/screenshots/feed-skeleton-proposal/mock.html` (read in full) + both PNGs (viewed directly), cross-checked line-by-line against the real `frontend/src/features/feed/components/AnnouncementCard.tsx`, `ReactionBar.tsx`, `Avatar.tsx`, and the Community-rail markup in `pages/Home.tsx`. As of this audit, `frontend/src/features/feed/components/` contains no `*Skeleton*` file yet (confirmed via glob) and today's log shows code-review found `git diff master...HEAD` empty — frontend-dev has not landed code. So this write-up has nothing to cross-check against an in-progress implementation; it is anatomy/token spec derived from mock + real-component ground truth only. If frontend-dev's component exists by aggregation time, design-lead should diff it against this section rather than assume it's untouched.

#### Component anatomy

**`AnnouncementCardSkeleton`** — mirrors `AnnouncementCard`'s DOM shape 1:1 so swap-in causes no reflow beyond content painting in:

```
<article class="skel-card">                          → rounded-lg + bg-surface-card + shadow-lift + p-5 + space-y-3 (byte-for-byte AnnouncementCard's own <article> classes)
├── Header  (flex items-center justify-between, text-xs)
│   ├── Author cluster (flex items-center gap-2)
│   │   ├── AvatarBone            — circle, matches Avatar size="sm"
│   │   └── MetaBones (flex flex-col gap-1.5)
│   │       ├── NameLine bone     — ~96–112px wide, 12px tall
│   │       └── TimestampLine bone — ~56px wide, 8px tall
│   └── OpenLinkBone              — pill, ~44px × 12px (stands in for the "Open" affordance; Edit/Delete/ModerationMenu are conditional on `isAuthor`, which is unknown pre-load, so one neutral pill bone is correct — do not render three)
├── BodyLines (flex flex-col gap-2, pt-1)
│   └── 2–4 LineBones, varying width (100% / 92% / 78% / 64% / 48% — vary per card so the stack doesn't look mechanically identical)
├── MediaBone (optional, only on the "has media" variant) — full width, 160px tall, `rounded` (8px, DEFAULT radius — NOT rounded-lg; matches AnnouncementCard's real `<img class="rounded object-cover">`)
└── ReactionRow (flex gap-2, pt-1)
    └── ReactionPillBone × N       — pill, ~52px × 28px
```

**`CommunityRowSkeleton`** — mirrors the real `<li>` row in `Home.tsx`'s Community rail:

```
<li> → div.flex.items-center.gap-2.rounded-md.px-2.py-1.5   (no hover state — non-interactive while loading)
├── AvatarBone       — circle, 32px (h-8 w-8 — matches real community avatar exactly)
└── TextBones (flex flex-col gap-1.5, flex-1 min-w-0)
    ├── NameLine bone — variable width 55–80% (vary per row per mock)
    └── LocationLine bone — variable width 38–50%, shorter than name line
```
5 rows per the mock (matches `COMMUNITY_LIMIT` list length; render one `CommunityRowSkeleton` per expected row, not a fixed 5 if the real limit ever changes).

#### Token usage (confirmed: zero new color tokens)

| Bone/surface | Token | Source-of-truth match |
|---|---|---|
| Bone base fill | `surface.subtle` (`#F4ECDF`, `bg-surface-subtle`) | Exact match, mock `--surface-subtle` |
| Card chrome | `rounded-lg` (16px) + `shadow.lift` (`0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)`) | Exact match, `tailwind.config.js` `boxShadow.lift` = mock `--shadow-lift` byte-for-byte |
| Media bone radius | `rounded` (DEFAULT, 8px) — **not** `rounded-lg` | Matches real `<img class="rounded">`; mock's `.skel-media` also uses 8px, not the card's 16px. Flag for frontend-dev: don't let radius bleed from the outer card class. |
| Pills (reaction bones, name/timestamp/line bones, avatars) | `rounded-full` (`bone-round` in mock) | Matches mock exactly — even body-text line bones get pill (fully-rounded) end-caps, not the 8px default. Deliberate mock choice, carry it through. |
| Card background | `surface.card` (`#FFFFFF`, unchanged, bones sit on top of it) | n/a — card shell itself isn't a bone |

**Shimmer gradient — flagged, not a new token.** The mock's `.bone` gradient is `linear-gradient(90deg, surface.subtle 0%, #ebe1d2 45%, surface.subtle 90%)`. `#ebe1d2` isn't in the token table and the acceptance criteria bars new color tokens. Recommendation: treat it the same way `shadow.lift` already embeds literal `rgba(0,0,0,.04)`/`rgba(0,0,0,.06)` inline without promoting them to standalone color tokens — i.e. bake `#ebe1d2` as a raw, unregistered value scoped only inside the shimmer gradient utility (not added to `tailwind.config.js` `colors`, not given a semantic name). This is pixel-faithful to the approved mock and doesn't violate "no new color tokens" because it never becomes an addressable token — it's an implementation detail of one animation, exactly like the shadow's rgba stops. Design-lead: confirm this reading before frontend-dev implements; if you want it fully token-derived instead, the alternative is `color-mix(in srgb, theme(colors.surface.subtle) 100%, white 40%)`, which is more "correct" but is a CSS feature not yet used elsewhere in this codebase — the literal-value approach is lower-risk and matches precedent.

**Animation spec (from mock, not yet in design-system.md as a named pattern):** `@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }`, `background-size: 200% 100%`, `1.4s ease-in-out infinite`. Proposing this as a `## Patterns` candidate — **"Skeleton Shimmer"** — for design-lead to promote into `standards/design-system.md`, parallel to the existing "Pill Track" pattern precedent (reusable composition of existing tokens, ratified once a second use exists; this feature's own scope note already anticipates reuse: "the shared component may be reused later"). No new tokens needed for the pattern itself.

**Design-lead sign-off — pulse vs. shimmer (2026-09-23, aggregation).** Read `docs/screenshots/feed-skeleton-proposal/mock.html`'s `.bone` rule directly (shimmer sweep via `linear-gradient(90deg, surface-subtle 0%, #ebe1d2 45%, surface-subtle 90%)` animated over `background-position`, 1.4s ease-in-out infinite) against the shipped `AnnouncementCardSkeleton.tsx`/`CommunityRowSkeleton.tsx` (Tailwind's stock `animate-pulse` opacity pulse on a flat `bg-surface-subtle` fill — no gradient, confirmed by reading both files in full; `bone = cn('bg-surface-subtle motion-reduce:animate-none', !prefersReducedMotion && 'animate-pulse')`). **Call: the pulse is acceptable as shipped — no fast-follow required.** Rationale: (1) the acceptance criteria's own bullet reads "a subtle pulse/shimmer animation" — pulse literally satisfies that text, it isn't an approximation of a stricter requirement; (2) shipping the pulse sidesteps introducing `#ebe1d2` as a raw non-token color literal entirely, which is a cleaner outcome against this system's token discipline than even the scoped exception ui-designer's own note above proposed (precedented by `shadow.lift`'s inline rgba) — zero new color surface beats a documented-but-still-present exception; (3) `animate-pulse` is an already-audited, widely-used Tailwind utility elsewhere in this codebase, vs. a bespoke keyframe that would be new, ongoing surface to maintain and gate under `prefers-reduced-motion`; (4) every other visual dimension — anatomy, card chrome, radii, `shadow.lift`, pill/avatar rounding, media-block radius — already matches the mock exactly, independently confirmed both by code-reviewer and by my own read of the shipped component above, so the only delta is animation richness, not fidelity to tokens or layout. This closes the item — not deferred as debt. Per this call, I'm declining to promote the proposed **"Skeleton Shimmer"** pattern into `standards/design-system.md`: the shipped code doesn't use it, and promoting an unused pattern into canon would be documentation drift. If a shimmer sweep is wanted later, it should be scoped as its own deliberate enhancement, not inherited from this feature.

#### State checklist (per `design-tokens-and-components` skill)

Skeletons are non-interactive display-only elements (`aria-hidden`, no focus target), so most interaction states are N/A — noted explicitly per the skill rather than left silent:

- **default (animated):** shimmer running per the animation spec above, `surface.subtle` base.
- **reduced-motion:** `@media (prefers-reduced-motion: reduce)` → `animation: none`, static `surface.subtle` fill, no gradient sweep (mock doesn't demonstrate this state — it's a static PNG/HTML — so this is a spec addition, not lifted from the mock). This is also an explicit acceptance-criteria bullet; a11y-auditor owns verifying it's wired, this section owns specifying what "static" should look like visually (flat `bg-surface-subtle`, not a frozen mid-gradient frame).
- **hover / focus / disabled:** N/A — skeleton bones are not interactive and must never receive a focus ring or hover affordance. If a bone element is accidentally left focusable (e.g. a stray `<button>` instead of `<div>`), that's a build defect, not a state to design.
- **loading:** the skeleton *is* the loading state of its parent (`AnnouncementCard` / community row) — there is no nested loading-within-loading state.
- **empty:** N/A at the bone level. (Zero-item empty state after load, e.g. "No other families yet.", is unchanged — out of this feature's scope.)
- **error:** N/A at the bone level — `isError` unmounts the skeleton in favor of existing error copy (unchanged per Out of scope).

#### Discrepancies found — flagged for design-lead reconciliation, not resolved unilaterally here

1. **Avatar bone size mismatch (announcement card only).** Mock's `.skel-avatar` is `32px × 32px`. The real `AnnouncementCard` renders `<Avatar size="sm" />`, and `Avatar.tsx`'s `sm` size class is `h-10 w-10` = **40px**, not 32px. This is the exact failure mode the Problem statement calls out ("causes a visible layout pop when real cards render") — a 32px→40px avatar swap will visibly pop on every card. The mock's *Community*-rail avatar (32px) is correct — it matches the real `h-8 w-8` community row avatar exactly, no discrepancy there. **Recommendation: build `AnnouncementCardSkeleton`'s avatar bone at 40px (`h-10 w-10`), overriding the mock's 32px, not the other way around** — visual conformance to the mock's proportions matters less than the acceptance criterion's own stated goal of zero layout pop. Design-lead: confirm this override before frontend-dev builds, since "the mock is the visual source of truth" is a criteria bullet too and this is a direct, if minor, deviation from it.
2. **Reaction-pill count.** Mock shows 2–3 reaction bones per card. The real `ReactionBar` always renders all 5 `REACTION_TYPES` (like/love/hug/celebrate/support) unconditionally — never fewer. A 2–3-bone skeleton row is narrower/shorter than the real 5-pill row will be once it wraps, which is a smaller version of the same layout-pop risk as #1, though less severe since `flex-wrap` absorbs some of it. Recommendation: match the mock's pill *widths/spacing* but consider 5 bones (or at minimum size the row's reserved height for a wrapped 5-pill row) rather than the mock's 2–3, so the reaction row's height doesn't grow when real content mounts. Flagging rather than mandating — this is a smaller-magnitude issue than #1 and reasonable people could ship the mock as-is; frontend-dev/design-lead should pick one deliberately rather than by accident.
3. **Name/timestamp orientation (cosmetic, not flagged as a defect).** Real `AnnouncementCard` lays author name and timestamp out horizontally on one baseline (`flex items-baseline gap-2`); the mock stacks them as two separate vertical bone lines. This is a normal, acceptable skeleton simplification (two bones read fine as a placeholder for "name string + inline timestamp" — a single bone can't represent two independently-sized inline strings cleanly) and does not need reconciliation, noted for completeness only.

#### Variant matrix (satisfies "2–3 cards, at least one with media")

Three `AnnouncementCardSkeleton` instances per the mock, used on both `/` and `/feed` initial load:
- Card 1: text-only, 3 body lines (100/92/64%), 3 reaction bones.
- Card 2: **has-media variant** — 2 body lines (92/78%) + `MediaBone`, 3 reaction bones (see discrepancy #2 above on final count).
- Card 3: short post, 2 body lines (100/48%), 2 reaction bones.

`AnnouncementCardSkeleton` should take a `hasMedia?: boolean` and a line-count/width prop (or a small fixed set of internal variants) so `Feed.tsx` and `Home.tsx` can render this exact 3-variant mix from one shared component, per the acceptance criteria's reusability bullet.

### Microcopy
*(filled by ux-writer)*

### Accessibility

**Re-audit basis (2026-09-23, second pass).** The first pass (below, superseded) audited
the spec/mock before any code existed. Implementation has since landed and is committed
on this branch (`1a79dab`). Re-verified every one of the 8 prior findings directly against
the shipped code, read in full:
`frontend/src/features/feed/components/AnnouncementCardSkeleton.tsx`,
`frontend/src/components/CommunityRowSkeleton.tsx`,
`frontend/src/hooks/usePrefersReducedMotion.ts`, and their call sites in
`frontend/src/pages/Home.tsx` (lines 69–121), `frontend/src/pages/Feed.tsx` (lines 74–131),
and `frontend/src/pages/AnnouncementDetail.tsx` (lines 47–55). This also corroborates (does
not merely trust) code-reviewer's independent RE-VERIFY confirmations already logged in
`### Code review` above.

**Acceptance criteria — pass/fail (re-verified against landed code)**

1. **`aria-busy` attachment point — RESOLVED, confirmed fixed. Was blocking.**
   - `Home.tsx:69` — `<section aria-label="Announcements" aria-busy={feed.isPending} ...>`
     is the persistent, always-mounted container; `feed.isPending` is a live boolean, not
     hardcoded. Same pattern at `Home.tsx:92` — `<aside aria-label="Community"
     aria-busy={community.isPending} ...>`.
   - `Feed.tsx:78` — `<section className="mt-6" data-testid="feed-loading-region"
     aria-busy={isPending && cursor === null}>` is unconditionally rendered (not behind any
     `if`); only its children (skeleton vs. error vs. empty vs. virtualized list) are
     conditional. This covers the exact pending window (`items.length === 0`) that the
     original bug missed. Confirmed `aria-busy` correctly stays `false` during "Load older
     posts" (`cursor !== null`), per the out-of-scope note — the inner, pre-existing
     `role="feed"` div (`Feed.tsx:93-94`) still independently carries `aria-busy={isPending}`
     for the pagination-append case, which is a legitimate nested busy region (announces
     "busy" only for that sub-region while new items append) and does not conflict with the
     outer section's value.
   - **Verdict: fixed as required. No longer blocking.**

2. **Skeleton blocks are `aria-hidden` — CONFIRMED, matches spec exactly.**
   - `AnnouncementCardSkeleton.tsx:43-44` — root `<div data-testid="announcement-card-skeleton"
     aria-hidden="true">`. `AnnouncementFeedSkeleton` (the 3-card wrapper actually used by
     both pages) also carries `aria-hidden="true"` on its own wrapper div (line 86) — belt
     and suspenders, still correct granularity (whole subtree hidden once).
   - `CommunityRowSkeleton.tsx:19` — root `aria-hidden="true"`; `CommunityRailSkeleton`'s
     `<ul>` wrapper (line 39) also `aria-hidden="true"`.
   - **Verdict: pass, confirmed.**

3. **No focus stealing; reachable without extra tab stops — CONFIRMED, matches spec.**
   - Read every element in both skeleton components: all `div`s, zero `button`/`a`/`input`/
     `tabIndex`. No `.focus()` calls anywhere in the loading→loaded transition.
   - `Home.tsx:72` and `Feed.tsx:79` are straight `{condition && <Skeleton />}` /
     ternary swaps inside the already-persistent container — no extra wrapper element is
     introduced only for the transition.
   - `AnnouncementDetail.tsx:47-55` — the single-card skeleton (Open Question, resolved
     "yes") is a full early `return`, swapped for a different full `return` once
     `postQuery.isPending` clears; no shared wrapper persists across the two, so there's
     no leftover tab stop to worry about either way.
   - **Verdict: pass, confirmed.**

4. **`prefers-reduced-motion` disables the pulse — RESOLVED, confirmed wired. Was
   blocking.**
   - `usePrefersReducedMotion.ts` — wraps `matchMedia('(prefers-reduced-motion: reduce)')`
     with a live `change` listener (not polling), correct implementation.
   - `AnnouncementCardSkeleton.tsx:34-39` and `CommunityRowSkeleton.tsx:15-16` both call the
     hook and build `bone = cn('bg-surface-subtle motion-reduce:animate-none',
     !prefersReducedMotion && 'animate-pulse')` — `animate-pulse` is omitted from the
     className outright (not merely CSS-overridden) when the hook reports `true`, plus the
     `motion-reduce:animate-none` Tailwind variant as a CSS-only fallback for the
     pre-hydration paint. Real, load-bearing wiring, not a dead import.
   - **Non-blocking follow-up, not mine to fix but worth flagging:** code-reviewer's
     `### Code review` already caught that the two unit tests titled "disables the pulse
     animation under prefers-reduced-motion" (`AnnouncementCardSkeleton.test.tsx`,
     `CommunityRowSkeleton.test.tsx`) never mock `matchMedia` to `matches: true`, so they
     don't actually exercise the `true` branch — a future refactor could silently regress
     this exact blocking requirement with no test catching it. The implementation itself is
     correct today; the regression-test gap is a code-reviewer must-fix, not an open a11y
     defect, cross-referenced here because it protects a finding I originally marked
     blocking.
   - **Verdict: fixed as required. No longer blocking.**

**New finding from reading the real implementation (not visible from the mock/spec alone)**

5. **`AnnouncementDetail.tsx:50` — `aria-label` on a bare, roleless `<div>` — non-blocking,
   new.**
   - `<div aria-busy="true" aria-label="Post">` wraps the single-card skeleton. A plain
     `<div>` has no implicit ARIA role, and `aria-label` on an element with no role is
     unreliable across screen readers/browsers (it may not be exposed as an accessible
     name at all, unlike `Home.tsx`/`Feed.tsx`'s `<section>`/`<aside>` landmarks, which have
     implicit roles and reliably expose their `aria-label`). `aria-busy` itself is a global
     attribute and isn't affected by this (it doesn't require a role to be honored), so
     this doesn't reopen finding 1 — but the "Post" label may be silently dropped by some
     AT. The hardcoded literal `"true"` (vs. a bound `{postQuery.isPending}`) is not a bug
     either, since this whole `<div>` only exists inside the early-return branch taken while
     pending and is fully replaced by a different return once data resolves — functionally
     equivalent to a bound boolean.
   - **Recommendation for frontend-dev (non-blocking, fast-follow):** give the wrapper an
     explicit landmark-ish role, e.g. `<div role="group" aria-busy="true" aria-label="Post">`
     (or reuse `<section aria-label="Post" aria-busy="true">` to match the pattern already
     used on `Home.tsx`/`Feed.tsx`), so the label is reliably exposed.

**Contrast** (non-blocking, informational — no new color tokens introduced; original
gradient-based finding is now moot)
- The original audit flagged the mock's shimmer gradient mid-stop (`#ebe1d2`, ≈1.17:1
  against `surface.card`) as a literal non-token color needing sign-off. **The shipped
  implementation doesn't use that gradient at all** — both skeleton components use
  Tailwind's stock `animate-pulse` (opacity pulse) on a flat `bg-surface-subtle` fill, per
  `### Code review`'s nice-to-have note (a documented, reasonable simplification from the
  mock). No `#ebe1d2` or any other new literal color appears anywhere in the shipped
  components (confirmed by reading both files in full). This resolves the contrast FYI by
  removing its premise — nothing left to flag.
- All color tokens used (`surface.subtle`, `surface.card`) are pre-existing and already
  contrast-audited in [[standards/design-system]]; no new pairs introduced by this feature.

**Keyboard**
- Skeleton state: zero tab stops (no focusable elements) — confirmed by direct read of
  both skeleton components (see finding 3).
- Loaded state: tab order is unchanged from before this feature — the skeleton is a
  straight conditional swap inside the same persistent container, not an overlay; no new
  wrapper, no `tabIndex={0}` anywhere in the diff. Confirmed clean.

**Semantics**
- Root of each skeleton subtree: `aria-hidden="true"`, confirmed at both the individual
  card/row level and the list-wrapper level (`AnnouncementFeedSkeleton`,
  `CommunityRailSkeleton`) — belt-and-suspenders, correct.
- Persistent feed/Community section containers carry `aria-busy` bound live to each
  query's `isPending`, confirmed (finding 1). No `aria-live` region was added on top —
  correct per the original recommendation; still the right call after reading the landed
  code, since the loaded feed isn't itself a live-updating region outside of explicit,
  user-triggered pagination.
- No new roles introduced beyond what already existed (`role="feed"` in `Feed.tsx`, plain
  `<section>`/`<aside aria-label>` in `Home.tsx`) — the skeleton remains purely
  presentational filler underneath. Exception noted in finding 5 above
  (`AnnouncementDetail.tsx`'s roleless wrapper `<div>`).

**Screen-reader**
- No non-obvious accessible names in either skeleton component — confirmed every bone
  element is a plain, unlabeled `div` under an `aria-hidden="true"` ancestor; nothing in
  either skeleton subtree is exposed to the accessibility tree.
- Confirmed no `<img>` anywhere in the media-block bone
  (`announcement-card-skeleton-media`, `AnnouncementCardSkeleton.tsx:68`) — it's a plain
  `div`, as recommended.
- See finding 5 for the one accessible-name concern found in the real implementation
  (`AnnouncementDetail.tsx`'s `aria-label="Post"` on a roleless `<div>`).

**Summary.** 9 findings total after re-verification (8 original + 1 new from reading
landed code): **0 blocking** (both prior blocking findings — aria-busy attachment point,
missing `prefers-reduced-motion` handling — are confirmed fixed in the shipped code), 9
non-blocking (aria-hidden granularity confirmed pass, focus/tab-stop confirmed pass,
keyboard tab-order confirmed pass, contrast FYI resolved/moot, no extra live region
confirmed correct, no accessible names on bones confirmed, plus the new roleless-`<div>`
`aria-label` finding, plus a cross-referenced note on code-reviewer's reduced-motion
test-coverage gap). This feature's accessibility requirements are met; the one new item
(finding 5) and the cross-referenced test-coverage gap are both fast-follow polish, not
blockers to shipping.

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
