---
slug: feed-skeleton-loading
title: Feed Skeleton Loading
owner: engineering            # primary team: engineering | design | marketing
collaborators: [design]       # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
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
