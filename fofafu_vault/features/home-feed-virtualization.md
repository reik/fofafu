---
slug: home-feed-virtualization
title: Home Dashboard Feed Virtualization
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-09-05
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Home Dashboard Feed Virtualization

## Problem

`pages/Home.tsx`'s dashboard announcements column fetches only the first page (≤20 items, plain `useQuery`) and shows a "See older posts →" link that navigates the user away to the separate `/feed` page instead of continuing to browse inline. Meanwhile `pages/Feed.tsx` was already virtualized via `@tanstack/react-virtual`'s `useWindowVirtualizer` (see [[features/feed-virtualization]], currently `status: review`, not yet shipped) — but that work explicitly kept a manual "Load older posts" button and never touched Home. Replace Home's "See older posts" link with the same viewport-based virtualized rendering, extended with automatic pagination as the user scrolls near the end of the loaded list, so the dashboard feed behaves like a continuously-scrolling feed instead of bouncing the user to another page.

## Acceptance criteria

- [ ] Home dashboard's announcements section renders through the same virtualized/windowed approach as `pages/Feed.tsx` (`@tanstack/react-virtual`'s `useWindowVirtualizer`), mounting only visible + overscan `AnnouncementCard`s.
- [ ] The "See older posts →" link is removed. Scrolling the dashboard feed toward its currently-loaded end automatically fetches the next page and appends it — no manual click/navigation required.
- [ ] Newest-first ordering, composer-at-top, reactions, and existing empty/error/loading states are all preserved.
- [ ] Composing a new post (from Home, or landing from elsewhere) is still reflected correctly regardless of how many pages the user has auto-scrolled through — reuse the cache-derived accumulate pattern from [[features/feed-virtualization]] so that feature's original must-fix #1 desync class of bug (composer invalidation vs. accumulated pages) doesn't recur here.
- [ ] Cards with variable height (long post bodies, images, differing reaction counts) render without overlap or clipping.
- [ ] The two-sidebar dashboard grid layout (`Your family` / `Community` rails) is otherwise unchanged; only the center feed column's behavior changes.
- [ ] A subtle loading affordance is shown while an auto-triggered next-page fetch is in flight, replacing the removed link so users still get feedback instead of a silent pause.
- [ ] At least one automated test covers virtualized rendering on Home and confirms scrolling near the end triggers the next-page fetch, with no "See older posts" link present.

## Out of scope

- `FamilyRecentPosts.tsx`'s own "Load older posts" button/list (family-profile page) — same non-virtualized pattern, but not named in this request; a natural follow-up, not bundled here.
- Any change to `pages/Feed.tsx` itself — it keeps its existing manual "Load older posts" button per [[features/feed-virtualization]]'s own out-of-scope; this feature does not backport auto-scroll pagination there.
- Migrating either page to TanStack Query's `useInfiniteQuery` — a real alternative (see Open questions), not decided here.

## Open questions

- `useQuery` + cursor state (mirroring `pages/Feed.tsx`'s already-reviewed pattern, preserving today's implicit cache sharing between Home's and Feed's page-1 query) vs. migrating to `useInfiniteQuery` (more idiomatic for multi-page accumulation, but a different cache shape that would break that sharing unless Feed.tsx migrates too) — needs tech-lead call.
- Extract the accumulate/virtualize/auto-advance logic into a shared hook (e.g. `features/feed/hooks/useVirtualizedFeed.ts`) used by both `Home.tsx` and `Feed.tsx`, or duplicate it in `Home.tsx` only for now — recommend extraction given how subtle the cache-desync fix is, but it touches `Feed.tsx` so flagging for tech-lead sign-off since that file is nominally out of scope above.
- Should a11y-auditor specifically review the auto-load-on-scroll pattern (announcing newly-loaded content to screen-reader users, not stealing scroll/focus) since it's materially different from `Feed.tsx`'s manual-button model? Recommend yes — dispatcher should likely pull in design/a11y-auditor even though `collaborators` is left empty per convention.

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
