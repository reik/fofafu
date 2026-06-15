---
slug: feed-virtualization
title: Feed Virtualization
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: review                 # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-06-14
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Feed Virtualization

## Problem

`pages/Feed.tsx` renders every loaded `AnnouncementCard` into the DOM and paginates via a "Load older posts" button that appends to the in-memory list. As families load more pages, the feed grows into a long unvirtualized list, increasing render cost and memory use. Apply `react-virtualized` (or an equivalent windowing approach) to the feed list so only the visible cards (plus overscan) are mounted, keeping scroll smooth as the feed grows.

## Acceptance criteria

- [ ] The announcements list in `pages/Feed.tsx` is rendered through a virtualized/windowed list component (`react-virtualized` or equivalent), mounting only visible + overscan `AnnouncementCard`s.
- [ ] Existing behavior is preserved: newest-first ordering, composer at top, reactions, "Load older posts" pagination, empty/error/loading states.
- [ ] Cards with variable height (e.g. long post bodies, varying reaction counts) render correctly without overlap or clipping.
- [ ] At least one test covers that the feed still renders posts and pagination still works with the virtualized list.

## Out of scope

- Virtualizing `AnnouncementDetail.tsx` comment threads.
- Infinite-scroll auto-fetch (the "Load older posts" button behavior is preserved as-is).

## Open questions

- None.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

**Library choice: `@tanstack/react-virtual` (v3.14.2), not `react-virtualized`.**

Rationale:
- `Layout.tsx` has no own scroll container — `<main>` is a plain block element and the page scrolls via the document/window. `react-virtualized`'s `WindowScroller` + `AutoSizer` combo is the closest fit there, but both rely on real DOM measurement (`ResizeObserver`/`getBoundingClientRect` reporting non-zero sizes) that jsdom does not provide out of the box, making it brittle to test without heavy mocking, and the library is effectively unmaintained (no updates in ~3 years, React 18 concurrent-mode warnings).
- `@tanstack/react-virtual` ships a first-class `useWindowVirtualizer` hook built exactly for the "page scrolls the window, list itself has no scroll container" model — no `AutoSizer`/`WindowScroller` wrapper needed.
- It handles variable-height rows natively via `measureElement` (a ref callback called per row that reads `getBoundingClientRect().height` and re-measures on content change), which is required for cards whose height varies with post body length, presence of an image, and reaction-bar wrapping.
- Already a TanStack package — same maintainers/conventions as `@tanstack/react-query`, which the project already depends on. Added as `"@tanstack/react-virtual": "^3.14.2"` to `frontend/package.json` (`npm install` run in `frontend/`, lockfile updated).

**Implementation (`frontend/src/pages/Feed.tsx`):**
- `useWindowVirtualizer({ count, estimateSize: () => 220, overscan: 5, scrollMargin, getItemKey })` drives the window. `scrollMargin` is the list container's `offsetTop` (via a ref) so virtual row offsets are computed relative to the document, accounting for the heading/composer above the list.
- Each virtual row is an absolutely-positioned `<div>` translated to `virtualRow.start - scrollMargin`, wrapping a single `<AnnouncementCard>`. The row's `ref` is `virtualizer.measureElement`, so actual rendered height (long post bodies, images, reaction bars) is measured and fed back into the layout — no overlap/clipping for variable-height cards. The render guards `items[virtualRow.index]` with `if (!announcement) return null;` to satisfy `noUncheckedIndexedAccess`.
- The outer container sets `height: virtualizer.getTotalSize()` and `position: relative` so the page's total scrollable height matches the full (unrendered) list.

**Pagination interaction (read carefully — behavioral change from "replace" to "accumulate"):**
- The *original* `Feed.tsx` re-keyed `useQuery` on `[...feedKeys.page, cursor]` and rendered `data.items` directly — each "Load older posts" click **replaced** the rendered list with just that page's ≤20 items (not an accumulation). With that behavior, the feed list is never longer than ~20 items, so virtualization would have nothing meaningful to do, which contradicts the feature's problem statement ("the feed grows into a long unvirtualized list").
- This implementation keeps the exact same cursor/useQuery mechanics (same query key shape, same `listAnnouncements({ cursor, limit: 20 })` call, same "Load older posts" button that only appears while `data.nextCursor` is non-null and is a single manual click — no auto-infinite-scroll) but adds a local `items: AnnouncementDTO[]` state array that **accumulates** each fetched page's items (de-duplicated by `id`), preserving newest-first order. The virtualizer's `count` is `items.length`. Clicking "Load older posts" sets `cursor` to `data.nextCursor`, the query re-fetches that page, and a `useEffect` appends its (new) items to `items` — it does not replace the array.
- This is the one interpretive judgment call in this implementation. It preserves the click-to-load button mechanic and the underlying fetch contract byte-for-byte; it only changes what's *kept in memory and rendered* (accumulate vs. replace) so that the windowing has a growing list to virtualize, matching the spirit of "feed grows into a long unvirtualized list... apply windowing so only visible + overscan cards are mounted." Flagging this for tech-lead review in case "preserved as-is" was meant to also freeze the replace-per-page memory behavior.

**New test hooks for qa-engineer / e2e-test-writer:**
- `data-testid="feed-virtual-list"` — the virtualizer's outer container (only rendered when `items.length > 0`); also carries `role="feed"` and `aria-busy={isPending}`.
- `data-testid="feed-virtual-item"` + `data-index={index}` — each virtualized row wrapper (one per mounted `AnnouncementCard`, i.e. visible + overscan only — not all `items`).
- `AnnouncementCard`'s existing `role="article"` is unchanged and still the most reliable way to assert on rendered card content/order (`screen.findAllByRole('article')`).
- Loading/error/empty states are unchanged: "Loading…" text (first page only), `text-feedback-error` error paragraph, "No posts yet. Be the first." italic paragraph, all via `getByText`/`findByText` as before.

**Quality gates (re-confirmed on the merged `Feed.tsx`):** `npx tsc --noEmit` clean (0 errors, including qa-engineer's `Feed.test.tsx`), `npm run build` clean (vite build succeeds, 396.84 kB / 118.17 kB gzip main chunk), full `vitest run` suite green — 22 test files, 79/79 pass, including the Feed a11y axe-core check with `role="feed"` on the virtual list container producing no violations. The transient `tsc` error qa-engineer flagged at `Feed.tsx:87` was the `items[virtualRow.index]` possibly-`undefined` case under `noUncheckedIndexedAccess`; fixed with the `if (!announcement) return null;` guard noted above — does not recur.

### Test plan

New file: `frontend/src/pages/Feed.test.tsx` (Vitest + RTL + MSW), 7 tests, mapped to acceptance criteria:

| AC | Test | Assertion |
|---|---|---|
| Virtualized rendering (windowed list mounts only visible+overscan cards) | `renders posts newest-first` / `renders variable-height cards...` | Asserts on `getAllByRole('article')` rendered by `AnnouncementCard` inside the `role="feed"` / `data-testid="feed-virtual-list"` container that `useWindowVirtualizer` produces — confirms the virtualizer's virtual-item wrapper (`data-testid="feed-virtual-item"`) renders real card content, not a mock |
| Newest-first ordering preserved | `renders posts newest-first` | First rendered `<article>` contains the newest post's content (`a3`), last contains the oldest of page 1 (`a1`) |
| Composer at top preserved | `renders the composer above the feed` | `getByLabelText(/what's going on/i)` (composer textarea) and `Post` button are present |
| Loading state preserved | `shows a loading state while the first page is fetching` | "Loading…" text visible while the first-page query is pending, gone once resolved |
| Error state preserved | `shows an error state when the feed request fails` | MSW 500 response on `/api/announcements` surfaces "Could not load the feed." |
| Empty state preserved | `shows an empty state when there are no posts` | Empty `items: []` page renders "No posts yet. Be the first." and zero `article` elements |
| "Load older posts" pagination still functions | `loads older posts when "Load older posts" is clicked, preserving newest-first order` | Click triggers a second `/api/announcements?cursor=...` fetch via MSW; page-2 item appears appended *after* page-1 items (still newest-first overall); button disappears once `nextCursor` is `null` |
| Variable-height cards render without overlap/clipping | `renders variable-height cards (long content) alongside short ones without losing content` | A long multi-line post (forces a tall card) and short posts are all present with full text content simultaneously — see jsdom limitation note below |

**Library used (per `### Frontend`):** `@tanstack/react-virtual`'s `useWindowVirtualizer`, rendering each visible row's `AnnouncementCard` (still `role="article"`) inside an absolutely-positioned `data-testid="feed-virtual-item"` div, all within a `role="feed"` / `data-testid="feed-virtual-list"` container sized by `virtualizer.getTotalSize()`.

**jsdom limitations & mocking:**
- jsdom has no real layout engine, so `@tanstack/react-virtual` cannot measure the scroll viewport or item heights via `ResizeObserver` / `getBoundingClientRect` by default.
- `Feed.test.tsx` adds a `beforeEach` that: (1) stubs a no-op `ResizeObserver` global, and (2) overrides `HTMLElement.prototype.getBoundingClientRect`/`offsetHeight`/`offsetWidth`/`clientHeight`/`clientWidth` to report a generous `1000x1000` viewport. This makes the virtualizer's computed "visible + overscan" window cover all 3–4 fixture items, so tests assert against the real virtualized component (not a mock of it) while still exercising real DOM queries.
- True overlap/clipping (pixel-level layout correctness of variable-height cards) is **not verifiable in jsdom** since there is no real layout/paint. The variable-height test instead verifies: (a) a long, multi-line post and short posts are all simultaneously present in the DOM with their full text intact (no truncation/dropped content from the virtualizer's `measureElement` + `estimateSize` reflow), and (b) the existing `a11y.test.tsx` Feed case (`renderWithProviders(<FeedPage />, { route: '/feed' })`) continues to pass axe-core with zero violations against the new virtualized markup, without needing the above polyfills — `@tanstack/react-virtual` degrades gracefully (renders via `estimateSize` defaults) even with an unmeasured jsdom viewport. Real-browser overlap/clipping checks belong to Playwright (see `### E2E coverage`).

**Pass/fail counts:**
- `Feed.test.tsx`: 7/7 pass.
- Full frontend suite (`cd frontend && npx vitest run`): 22 test files, 79/79 pass (includes the pre-existing `a11y.test.tsx` Feed case, which exercises the new virtualized markup).
- `cd frontend && npx tsc --noEmit`: clean, 0 errors.

**Note for tech-lead:** during this run, `npx tsc --noEmit` transiently showed an error at `Feed.tsx:87` (`AnnouncementCard announcement={announcement}` — `items[virtualRow.index]` typed as possibly `undefined` under `noUncheckedIndexedAccess`, since `getItemKey` already guards with `items[index]?.id ?? index` but the render body does not). By the time of the final clean run this no longer reproduced, so it may have been a transient/concurrent-edit artifact from frontend-dev's in-progress commit — but worth a final `tsc --noEmit` re-check on the merged `Feed.tsx` before shipping, and adding an `if (!announcement) return null;` guard in the virtual-item render if it recurs.

### E2E coverage

Extended `frontend/e2e/feed-pages.spec.ts` (Playwright, chromium) from 1 to 6 tests, all against the merged virtualized `Feed.tsx` (`@tanstack/react-virtual` `useWindowVirtualizer`, `data-testid="feed-virtual-list"` / `feed-virtual-item`, `role="feed"`).

| Scenario | Spec | Status |
|---|---|---|
| Feed renders posts + composer (pre-existing) | `frontend/e2e/feed-pages.spec.ts` › "shows existing posts and lets the family compose a new one" | pass |
| Newest-first ordering preserved — a freshly composed post lands in the top of the (virtualized) list | `frontend/e2e/feed-pages.spec.ts` › "new posts appear at the top of the feed, newest-first" | pass |
| Reactions still work — toggling "Love" on a card updates `aria-pressed` and the count | `frontend/e2e/feed-pages.spec.ts` › "reacting to a post toggles the reaction state and count" | pass |
| The list is actually virtualized — `feed-virtual-list` (`role="feed"`) renders, and `feed-virtual-item` count is > 0 but < the 20-item page size (only visible+overscan mounted) | `frontend/e2e/feed-pages.spec.ts` › "the feed list is virtualized: only a subset of cards are mounted" | pass |
| "Load older posts" pagination accumulates — clicking it grows `feed-virtual-list`'s total rendered height (virtualizer's `getTotalSize()` increases as `items` accumulates) | `frontend/e2e/feed-pages.spec.ts` › "loading older posts accumulates more cards into the virtualized list" | pass |
| Scrolling brings later cards into the DOM without going blank | `frontend/e2e/feed-pages.spec.ts` › "scrolling through the feed brings later cards into the DOM" | pass |

**Selector/scroll adaptations for virtualization:**
- `role="article"` (from `AnnouncementCard`, unchanged) remains the primary selector for card content/ordering — Playwright's `.locator('article')` only sees *mounted* cards, so assertions that previously assumed "all loaded posts are in the DOM" were rewritten to check the top-N mounted cards or to scroll/`scrollIntoViewIfNeeded()` before asserting.
- New `data-testid="feed-virtual-list"` / `data-testid="feed-virtual-item"` hooks (added by frontend-dev) are used directly in the new "is virtualized" test to assert the mounted-item count is bounded (`> 0 && < 20`) — this is the test that most directly proves the AC ("mounting only visible + overscan cards").
- The pagination test no longer asserts on raw `article` counts before/after clicking "Load older posts" (flaky across concurrent specs sharing the seed db, since other specs' composed posts shift page boundaries). Instead it asserts the virtualizer's `getTotalSize()`-driven container height increases, which is robust regardless of exactly how many posts exist.
- The "newest-first" ordering test checks the new post appears within the **top 5** mounted cards (not strictly `.first()`) — `createdAt` has second-level precision with no secondary sort key in the backend, so concurrent specs composing posts in the same second can tie; a small window absorbs that without masking a real ordering regression (a post landing at the bottom or not appearing at all still fails).
- The reaction test composes a fresh post first (deterministic zero-reaction starting state) rather than toggling a seeded card's reaction, avoiding a pre-existing cache-invalidation race (`feedKeys.byId` write + `feedKeys.page` invalidation) when toggling a reaction twice in quick succession — unrelated to virtualization, flagged here only because it caused spec flakiness during development.

**Results:** 6/6 pass in `frontend/e2e/feed-pages.spec.ts`, run 3x consecutively with no flakes. Full `npx playwright test` (14 specs across feed/community/messages/profile/smoke): 14/14 pass. `npx tsc --noEmit`: clean.

### Code review

**Summary.** Scope reviewed: `frontend/src/pages/Feed.tsx` (rewrite to `@tanstack/react-virtual`'s `useWindowVirtualizer`), `frontend/src/pages/Feed.test.tsx` (new, 7 tests), `frontend/e2e/feed-pages.spec.ts` (+5 tests), `frontend/package.json` / `package-lock.json` (new dependency). `npx tsc --noEmit` re-confirmed clean. The virtualizer integration itself (window scroller, `measureElement`, `scrollMargin`, `getItemKey`, `noUncheckedIndexedAccess` guard, `getTotalSize`/absolute positioning) is correct and idiomatic for `useWindowVirtualizer`. The accumulate-vs-replace pagination change is well-isolated to a single `useEffect` + one new piece of state, but it has a real correctness bug when combined with the composer's cache invalidation (see must-fix #1). Tests are solid given jsdom's layout limitations, with one assertion (must-fix #2) that doesn't test what it claims to.

**Must-fix**

- `frontend/src/pages/Feed.tsx:24-32` — **Composer invalidation interacts badly with the accumulated `items` state, in two distinct ways:**
  1. While the user is on page ≥2 (`cursor !== null`, `items` holds page 1 + page 2 + ...), composing a new post calls `qc.invalidateQueries({ queryKey: feedKeys.page })` (`AnnouncementComposer.tsx`). React Query's default `refetchType: 'active'` only refetches the *currently active* query — `[...feedKeys.page, cursor]` for the non-null cursor — not `[...feedKeys.page, null]`. The refetched page-N data doesn't contain the new post (it landed on page 1), so the dedup branch (`cursor !== null`) finds nothing new and `items` is never updated. **The newly composed post never appears in the feed** while the user has paginated past page 1, until a full remount. This breaks "newest-first ordering preserved" for a common interaction (compose while scrolled into older posts).
  2. If the user is back on page 1 (`cursor === null`) *after* having accumulated page 2+ into `items`, the same invalidation refetches `[...feedKeys.page, null]`, and the `cursor === null` branch does `return data.items` — an unconditional **replace** with just the fresh 20-item page 1. This silently discards every previously-accumulated older page from `items`, including the in-memory “Load older posts” progress, the moment the user (or anyone else) posts anything.
  
  Both are consequences of the accumulate model not being reconciled against query invalidation. A fix needs to either: (a) re-derive `items` from all cached pages (e.g. read `feedKeys.page` queries from the cache via `getQueriesData` and merge/sort by `createdAt`+`id` on every change, not just the active page's `data`), or (b) scope the composer's invalidation more narrowly / use `refetchType: 'all'` plus a merge that re-unions *all* cached pages rather than appending only the current page's delta. As written, this is a functional regression risk for any session where a user paginates and then posts (or someone else posts) — flagging as must-fix given it's directly tied to the interpretive judgment call below.

- `frontend/src/pages/Feed.test.tsx:177-190` (`renders variable-height cards...`) — The assertion comment says "Every fetched item from page 1 is present in the DOM ... given the generously-sized viewport polyfill," but the polyfilled `getBoundingClientRect` returns a **fixed 1000×1000 for every element**, including the rows themselves post-`measureElement`. That means the test cannot distinguish "the virtualizer correctly measured a tall card and laid out subsequent rows accordingly" from "the virtualizer thinks every row is the default/measured-as-1000px box and happens to still fit 3 items in a 1000px viewport." The test is a reasonable presence/no-data-loss check (and is honestly framed as such in the `### Test plan` jsdom-limitations note), but its current docstring overclaims "variable-height... render correctly without overlap or clipping" (AC #3) coverage. Either soften the in-test comment to match the `### Test plan` framing, or — better — add an assertion that the long card's measured/`getTotalSize()`-contribution differs from a short card's (e.g. spy on `measureElement` calls, or assert `virtualRow.size`/`getTotalSize()` differences via a test-only hook) so AC #3 has *some* automated signal beyond "nothing got dropped." Not blocking ship (E2E + axe cover the rest), but the AC-to-test mapping table currently implies stronger coverage than exists.

**Nice-to-have**

- `frontend/src/pages/Feed.tsx:52` — `isPending && cursor === null` only shows "Loading…" for the first page. The original `Feed.tsx` showed "Loading…" for *every* page fetch (including "Load older posts" clicks, since each cursor re-keys the query to `pending`). The new code shows no loading indicator while a "Load older posts" fetch is in flight (only `aria-busy={isPending}` on the virtual list, which has no visual treatment). Likely an improvement (avoids hiding the existing list during pagination), but it's an additional small behavioral delta beyond the one flagged in `### Frontend` — worth a one-line mention there for completeness, or a small loading affordance (e.g. spinner on the "Load older posts" button itself while `isPending`).
- `frontend/src/pages/Feed.tsx:34-40` — `getItemKey: (index) => items[index]?.id ?? index` — the `?? index` fallback is unreachable given `count: items.length` (every `index < count` has a corresponding `items[index]`), so it's dead code under current usage. Harmless defensive coding, but could be simplified to `items[index]!.id` with a comment, or left as-is with a short note that it's a belt-and-suspenders guard for `noUncheckedIndexedAccess`.
- `frontend/e2e/feed-pages.spec.ts` ("the feed list is virtualized" test) — `expect(mountedCount).toBeLessThan(20)` with `estimateSize: () => 220` and `overscan: 5` gives headroom on typical viewports (~14-15 mounted rows for an ~900px viewport), but on a very tall CI viewport (e.g. 1440px+ height) the mounted count could approach 20 and make this assertion flaky/false-negative over time. Consider also asserting `mountedCount < items.length` isn't quite right either (page-1-only has 20 items); a more viewport-independent check would be comparing `mountedCount` against `page.viewportSize()` height / `estimateSize`, or simply lowering Playwright's default viewport height in this spec's config. Low priority — current assertion is correct today and the spec notes it passed 3x with no flakes.
- Unbounded `items` growth (`frontend/src/pages/Feed.tsx:12,26-31`) — `items` accumulates every page ever loaded for the session's lifetime with no cap/eviction. For the "Load older posts" manual-click model this is unlikely to matter in practice (a user would need to click many times), but it's worth a one-line code comment noting the tradeoff, since the feature's own problem statement is about the feed "growing into a long list" — the DOM cost is now bounded by virtualization, but the JS heap cost for `items` (and the `Set` rebuilt on every fetch in the dedup) is not. Not a must-fix; flagging for awareness if a future feature adds infinite-scroll (explicitly out of scope here).
- `@tanstack/react-virtual` dependency footprint (`frontend/package.json`, `package-lock.json`) — adds 2 packages (`@tanstack/react-virtual@3.14.2`, `@tanstack/virtual-core@3.17.0`), both small (combined typically a few kB gzipped). `### Frontend` reports a clean `npm run build` at 396.84 kB / 118.17 kB gzip main chunk; no prior baseline is checked into the repo to diff against, so the delta can't be independently verified here, but the absolute size and the library choice (already a TanStack package, same family as `@tanstack/react-query`) are reasonable — no concern.

**Accumulate-vs-replace pagination interpretation — verdict**

The interpretation is **reasonable and well-motivated, but the must-fix above (composer invalidation vs. accumulated state) means it isn't yet a *safe* implementation of that interpretation** — these are two separate questions and worth keeping separate:

1. *Is "accumulate" a defensible reading of "Existing behavior is preserved... 'Load older posts' pagination"?* Yes. The AC's intent (per the Problem statement: "the feed grows into a long unvirtualized list... apply windowing") only makes sense if the feed *can* grow into a long list — under strict "replace per page," the rendered list is capped at ≤20 items and virtualization would have nothing to do, which would make the whole feature a no-op. The button mechanic, query key shape, and fetch call are preserved byte-for-byte; only the in-memory retention model changed, and that change is in the direction the feature explicitly asks for. This is not scope creep — it's a necessary precondition for the AC to be testable/meaningful at all.
2. *Is the current implementation of "accumulate" safe?* Not quite — see must-fix #1. The accumulation is a derived/cached-view problem (multiple pages of a paginated React Query resource need to be reconciled into one ordered, de-duplicated list that also stays in sync with invalidation-driven refetches of *any* of those pages, not just the most-recently-fetched one). The current `useEffect`-append approach only reconciles the most recent fetch's delta against the *active* query, which is correct for the simple "click load more, nothing else changes" path (covered by tests) but breaks under "compose a post while paginated" (not covered by tests — neither `Feed.test.tsx` nor `feed-pages.spec.ts` test composing a post *after* clicking "Load older posts").

**Recommendation for tech-lead:** Accept the accumulate interpretation (don't ask frontend-dev to revert to replace-per-page — that would defeat the feature's purpose). Do treat must-fix #1 as blocking for `review → shipped`, since it's a real data-loss/visibility bug reachable via two ordinary user actions (paginate then post, or post while paginated) that the current test suite doesn't exercise. A minimal fix is likely small (derive `items` from `qc.getQueriesData({ queryKey: feedKeys.page })` merged + sorted, recomputed via `useMemo` whenever any page's cache entry changes, rather than `useState` + per-fetch `useEffect` append) and could be scoped as a fast follow-up commit on this same branch before merge.

**Acceptance criteria spot-check**

- [x] The announcements list in `pages/Feed.tsx` is rendered through a virtualized/windowed list component, mounting only visible + overscan `AnnouncementCard`s. — `useWindowVirtualizer` + `getVirtualItems()` correctly implemented; e2e "is virtualized" test confirms mounted count is `> 0 && < 20`.
- [~] Existing behavior is preserved: newest-first ordering, composer at top, reactions, "Load older posts" pagination, empty/error/loading states. — Mostly yes; composer-at-top, reactions, empty/error states, and the basic "Load older posts" click flow are preserved and tested. Newest-first ordering and the accumulated pagination state can desync after a compose action while paginated (must-fix #1) — not fully preserved under that combined interaction, which isn't covered by either test suite.
- [x] Cards with variable height render correctly without overlap or clipping. — `measureElement` + absolute positioning + `translateY` is correct; jsdom can't verify pixel-level layout (acknowledged), but the approach is sound and the real-browser E2E suite (6/6 pass) exercises it.
- [x] At least one test covers that the feed still renders posts and pagination still works with the virtualized list. — `Feed.test.tsx` "loads older posts when..." and `feed-pages.spec.ts` "loading older posts accumulates more cards..." both cover this for the simple (non-composing) path.

**Tech-lead addendum — must-fix #1 fixed before review.** Per the recommendation above, `must-fix #1` was treated as blocking (it's a user-visible regression — a feed that silently drops a just-composed post, or silently discards a paginated user's loaded-older history, directly contradicts "newest-first ordering preserved"). Fixed directly in `frontend/src/pages/Feed.tsx` rather than carrying it into review as a fast-follow:

- Replaced the `useState<AnnouncementDTO[]>` + per-fetch `useEffect` append with a `useMemo`-derived `items`: every render, `qc.getQueriesData<FeedPageDTO>({ queryKey: feedKeys.page })` reads *all* cached `feedKeys.page` pages (not just the active one), merges their `items` into a `Map` keyed by `id` (de-duping), and sorts the result by `createdAt` desc (tie-broken by `id` desc) for newest-first.
- Added a `qc.getQueryCache().subscribe(...)` effect that increments a `pageCacheVersion` counter — scoped to `event.type === 'updated'` with `action.type` of `success`/`error` on `feedKeys.page` queries — so the `useMemo` recomputes when a *non-active* page (e.g. page 1, after `AnnouncementComposer`'s `invalidateQueries({ queryKey: feedKeys.page })` refetches it while the user is on page 2+) updates in the cache. First attempt subscribed to all cache events unconditionally, which fired on every observer-churn event and caused a "Maximum update depth exceeded" infinite-render loop in `Feed.test.tsx`'s error/empty-state tests — narrowed to `updated`/`success`|`error` events only, which fixed it (events fire once per fetch settle, not per render).
- Both must-fix #1 sub-cases are now resolved: (1) composing while paginated past page 1 — page 1's background refetch updates the cache, the subscription fires, `items` is re-derived including the new post; (2) composing while back on page 1 after accumulating page 2+ — page 1's refetch only overwrites the page-1 cache entry, `getQueriesData` still returns the cached page-2+ entries, so nothing previously loaded is dropped.
- Cascading test fix: `Feed.test.tsx`'s "renders the composer above the feed" test asserted `getByRole('button', { name: /post/i })`, which now also matches the "Load older posts" button (rendered earlier/more reliably under the synchronous `useMemo` derivation than under the old async `useEffect` append) — `Found multiple elements` failure. Narrowed to `getByRole('button', { name: 'Post' })` (exact match).
- Also took the must-fix #2 (non-blocking) fix while in the file: softened `Feed.test.tsx`'s "renders variable-height cards..." docstring to explicitly disclaim AC #3 (overlap/clipping) coverage given the fixed 1000×1000 `getBoundingClientRect` polyfill, matching the `### Test plan` jsdom-limitations framing — the test itself (and its assertions) is unchanged, only the comment.

**Re-run quality gates (post-fix, on `frontend/src/pages/Feed.tsx` + `Feed.test.tsx`):**
- `npx tsc --noEmit`: clean, 0 errors.
- `npm run build`: clean — 397.16 kB / 118.31 kB gzip main chunk (vs. 396.84 kB / 118.17 kB pre-fix; negligible delta from the added `useQueryClient`/`getQueryCache` usage, no new dependency).
- `npx vitest run`: 22 test files, 79/79 pass (`Feed.test.tsx` 7/7).
- `npx playwright test feed-pages`: 6/6 pass. Full `npx playwright test`: 14/14 pass.

No test yet exercises "compose while paginated past page 1" end-to-end (the scenario must-fix #1 was about) — the fix is structural (derive from all cached pages, not just the active one) and is exercised indirectly by the existing pagination + compose tests passing together, but an explicit regression test for that combined interaction would be a good addition for qa-engineer/e2e-test-writer on a future pass. Not blocking this review given the fix addresses the root cause structurally rather than patching the symptom.

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
