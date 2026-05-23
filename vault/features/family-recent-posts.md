---
slug: family-recent-posts
title: Family Recent Posts
owner: engineering
collaborators: []
status: shipped
priority: P2
created: 2026-05-22
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Family Recent Posts

## Problem

`FamilyView` (`frontend/src/pages/FamilyView.tsx`) currently shows a family's header (avatar, name, bio, city/state) plus a "Message this family" CTA, and nothing else. A foster family landing on another family's page can't tell whether that family is active in the community — there's no sense of "are they posting, what do they talk about, when were they last seen." That makes the page feel like a dead-end and gives no reason to engage beyond DMing. Success: a visitor on `/family/:id` sees a "Recent posts" section with that family's announcements (most recent first, paginated), each linking to the existing announcement detail page. If the family has never posted, the section shows a warm empty state instead of being hidden, so the absence is intentional rather than ambiguous.

## Acceptance criteria

- [ ] `GET /api/announcements?familyId=<id>` (or equivalent — backend-dev picks the shape) returns that family's announcements, paginated with the existing `cursor`/`limit`/`nextCursor` contract used by `listAnnouncements`.
- [ ] On `FamilyView`, a "Recent posts" section appears below the header (and below the Message CTA when present), listing the family's announcements newest first.
- [ ] Each row links to the existing announcement detail page (`/announcement/:id`) and shows the same author/timestamp/content shape used in the home feed (reuses the existing `AnnouncementCard` / `FeedItem` component where reasonable — no parallel component tree).
- [ ] Empty state when the family has never posted: friendly copy ("No posts from this family yet.") rather than a hidden section.
- [ ] Loading and error states use the same patterns as the rest of `FamilyView` (skeleton or "Loading…" text + readable error).
- [ ] Pagination matches the home feed: "Load more" or cursor-driven infinite scroll, whichever the home feed currently uses.

## Out of scope

- Editing or deleting another family's posts from this surface (use the existing detail page for that — and only the author can edit/delete anyway).
- Filtering by reaction type, date range, or media-only.
- Showing comments inline; the link to the detail page is enough.
- Privacy / visibility controls — all announcements are currently community-visible; that's a separate feature.

## Open questions

- Does the home feed currently use cursor-driven infinite scroll, or "Load more", or simple page-size cap with no pagination UI? Frontend-dev should match whatever exists rather than introduce a third pattern.
- Should the section header link to a dedicated "all posts from this family" route, or is in-place pagination sufficient? Default to in-place unless the design lead disagrees.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Decision: extend the existing list endpoint, no sibling route.** Reusing `GET /api/announcements` keeps the home feed and the per-family feed on a single source of truth for cursor / limit / nextCursor semantics, DTO hydration, and auth.

#### Shared contract (frontend-dev: match this exactly)

- **Request**: `GET /api/announcements?familyId=<uuid>&cursor=<opaque|undefined>&limit=<n>`
  - `familyId` is the `families.id` UUID (the same value returned by `GET /api/family/:id` and `GET /api/family/me` as `id`). It is **not** the `user_id`.
  - `cursor` is the opaque `created_at` string returned in the previous response's `nextCursor`. Same shape as the home feed.
  - `limit` is an integer in `[1, 100]`. Default `20` when omitted. Same as the home feed.
- **Response (200)**: `{ items: AnnouncementDTO[], nextCursor: string | null }`
  - `AnnouncementDTO` shape is **identical** to the home feed: `{ id, authorId, authorName, content, mediaUrl, mediaType, createdAt, updatedAt, reactions, myReaction, isAuthor }`. Same `aggregateReactions` join, same `families` LEFT JOIN for `authorName`.
  - `nextCursor` is the `created_at` of the last row when a full page came back, otherwise `null`.
- **Ordering**: newest first by `created_at DESC`, same as the home feed.
- **Empty cases (200 with `{ items: [], nextCursor: null }`)**:
  - Family exists but has zero posts.
  - `familyId` is a well-formed UUID that does not match any family. We deliberately do **not** 404 here — the `FamilyView` surface separately calls `GET /api/family/:id` for header data, and the recent-posts section should just render its empty state when the feed is empty. A 404 from this endpoint would force the frontend to special-case "family missing" twice.
- **Error cases**:
  - `400` when `familyId` is present but is not a UUID (Zod `z.string().uuid()`).
  - `401` without a valid JWT (whole router is behind `authenticate`).

#### Schema change

`backend/src/schemas/announcement.schemas.ts` — `ListAnnouncementsQuery` gains an optional `familyId: z.string().uuid().optional()`. Backward-compatible: omitting it produces the existing home-feed behaviour byte-for-byte.

#### Controller change

`backend/src/controllers/announcement.controller.ts` — `listAnnouncements` resolves `familyId` to `families.user_id` with a single primary-key lookup, then adds `a.user_id = ?` to the existing `WHERE` clause. The cursor predicate (`a.created_at < ?`) and the `ORDER BY a.created_at DESC LIMIT ?` are unchanged, so pagination math stays identical. Existing indexes are sufficient: `idx_announcements_user` covers the family filter and `idx_announcements_created` covers the order — better-sqlite3 will use both for the small N expected here.

#### Migration

None. `announcements.user_id` and `families.user_id` already exist; the join was already wired by the `authorName` hydration.

#### Files changed

- `backend/src/schemas/announcement.schemas.ts` (+1 line)
- `backend/src/controllers/announcement.controller.ts` (`listAnnouncements` rewritten to branch on `familyId`)
- `backend/tests/announcements.test.ts` (+6 tests under a new `family-recent-posts` describe block)

#### Tests added (all pass; full suite 82/82)

1. Multiple posts paginate cleanly: 5 interleaved posts across two families (A: 3, B: 2), `limit=2&familyId=A` returns only A's posts in DESC order, `nextCursor` non-null on page 1, page 2 returns the remaining 1 with `nextCursor=null`. Also asserts DTO shape parity (`reactions`, `myReaction`, `authorName`, `isAuthor`) and that no B-* content leaks in.
2. One post: family with exactly one post returns a 1-item page, `nextCursor=null`.
3. Zero posts: family that has never posted returns `{ items: [], nextCursor: null }`.
4. Unknown familyId (well-formed but non-existent UUID): `200 { items: [], nextCursor: null }` — not 404.
5. Non-UUID `familyId`: `400` via Zod.
6. Missing JWT: `401`.

#### Quality gates

- `cd backend && npm test` — 82/82 pass.
- `cd backend && npx tsc -p tsconfig.json --noEmit` — clean.

No new dependencies.

### Frontend

**Decision: one new co-located component, no parallel card tree, Load-more pagination matching `Feed.tsx`.** The home feed uses cursor-driven "Load older posts" (not infinite scroll); the recent-posts section mirrors that pattern verbatim so users get a single mental model across `/feed` and `/family/:id`.

#### Files changed

- `frontend/src/api/announcements.ts` — `listAnnouncements` gains an optional `familyId?: string` in its opts (URL-encoded into `?familyId=…` only when present, so existing home-feed callers in `Home.tsx` and `Feed.tsx` are unaffected byte-for-byte). `feedKeys` gains `byFamily(familyId)` for cache isolation against `feedKeys.page`.
- `frontend/src/features/family/components/FamilyRecentPosts.tsx` — new component. Owns the section heading, the `useQuery` against `listAnnouncements({ familyId, cursor, limit: 20 })`, the loading / error / empty / paginated states. Reuses `AnnouncementCard` directly — no parallel card. Cursor is local `useState<string | null>` (matches `Feed.tsx`).
- `frontend/src/features/family/components/FamilyRecentPosts.test.tsx` — RTL smoke tests (4 cases): renders section heading + a post (and asserts the request URL carries `familyId`), warm empty state, server-error message surfaced, "Load older posts" button when `nextCursor` is non-null.
- `frontend/src/pages/FamilyView.tsx` — imports `FamilyRecentPosts` and renders `<FamilyRecentPosts familyId={data.id} />` immediately below the Message CTA (and above the existing "Back home" link). Section is always rendered in the success branch; the warm empty state shows when a family has never posted, so the section's absence never reads as a page glitch.

#### Contract adaptation

Backend-dev's `### Backend` subsection landed first and matched the dispatcher's shared contract exactly: `GET /api/announcements?familyId=<uuid>` with `{ items: AnnouncementDTO[], nextCursor: string | null }`, identical to the home feed DTO. **No client-side adaptation was needed.** Notable consequence: backend deliberately returns `200 { items: [], nextCursor: null }` for an unknown but well-formed `familyId` rather than `404`. The component renders the same warm empty state in that case, which is the correct UX — `FamilyView` already 404s on the family lookup via its `getFamily(id)` call, so this section never has to repeat that branch.

#### Component contract

```ts
interface Props { familyId: string }

// useQuery key: ['feed', 'byFamily', familyId, cursor | null]
// queryFn: listAnnouncements({ familyId, cursor, limit: 20 })
// states (mutually exclusive top to bottom):
//   isPending → "Loading…"   (matches FamilyView header-loading copy)
//   isError   → error.message or "Could not load recent posts."  (text-feedback-error)
//   items=[]  → "No posts from this family yet."  (text-ink-muted italic)
//   items>0   → <AnnouncementCard /> per item
// pagination: if nextCursor, render "Load older posts" button that swaps cursor.
```

The query key includes the cursor (mirroring `Feed.tsx`) so each page is cached independently and going back to page 1 is instant. Cache invalidations from `AnnouncementCard`'s edit/delete mutations target `feedKeys.page` for the home feed; the family-scoped key is intentionally separate to avoid cross-surface refetch storms — a small staleness window is acceptable since the author can only act on their own posts and they see the fresh state on the detail page.

#### Pagination behaviour

Matches the home feed exactly:

- `limit=20` per page.
- Initial query: `cursor=null`.
- "Load older posts" button replaces the current page rather than appending — this is the existing Feed.tsx semantic, not an accidental difference. If a future feature wants append-style "Load more", it should change both surfaces together.

#### Reuse of `AnnouncementCard`

Reused as-is, including:

- Author link to `/family/:authorId` (the family page itself — internal links are fine).
- "Open" link to `/post/:id` (the existing detail route; the feature AC's `/announcement/:id` copy reflects an older naming and is satisfied by parity with the home feed).
- Edit / Delete affordances on the viewer's own posts. When the visitor is the family's owner viewing their own page, they get the same in-card edit/delete UX as on `/feed`. When viewing another family, `isAuthor=false` from the DTO hides the controls.
- `ReactionBar` continues to work; reaction toggles invalidate `feedKeys.page` (home feed) but not `feedKeys.byFamily`. This is a known small staleness window for the count badge on the current family page, acceptable for v1.

#### Quality gates

- `cd frontend && npm test -- --run` — **61/61 pass**, 19 test files, including the 4 new `FamilyRecentPosts` cases.
- `cd frontend && npx tsc --noEmit` — clean.
- `cd frontend && npx eslint .` — not run; the repo has no local ESLint config and no `lint` script in `frontend/package.json`. (No regression introduced; matches the existing repo state.)

#### Out of scope (deferred)

- A dedicated "all posts from this family" route — in-place pagination is sufficient for v1 per the open-question default.
- Cross-surface cache linking between `feedKeys.page` and `feedKeys.byFamily` — would let a reaction toggle on the home feed propagate to a stale family page; the round-trip cost outweighs the benefit at current scale.
- Skeleton placeholder for the loading state — `FamilyView`'s rest of the page uses plain "Loading…" text, so we matched that. A real skeleton is a cross-cutting design-lead call, not a frontend-dev call.

### Test plan

**Acceptance criterion → test mapping**

| AC | Type | File | Assertion |
|---|---|---|---|
| AC1 — `GET /api/announcements?familyId=<id>` returns paginated list, preserving cursor contract | integration (node:test) | `backend/tests/announcements.test.ts` (suite `family-recent-posts: GET /api/announcements?familyId=<id>`) | Filters to only that family's posts; `nextCursor` advances and goes null on last page; DTO shape matches home feed (`reactions`, `myReaction`, `authorName`, `isAuthor`) |
| AC1 — single-post family | integration | same file | One-item page, `nextCursor: null` |
| AC1 — empty / unknown family | integration | same file | Empty `items: []`, `nextCursor: null`; unknown UUID is 200, not 404 |
| AC1 — input validation | integration | same file | Non-UUID `familyId` → 400 (Zod); missing JWT → 401 |
| AC2 — "Recent posts" section appears on FamilyView below header + Message CTA | integration (Vitest + RTL + MSW) | `frontend/src/pages/FamilyView.test.tsx` | Heading `/recent posts/i` renders alongside `the lee family` header and `message this family` CTA; non-owner viewer path |
| AC2 — section visible on empty-state pages too (not hidden) | integration | `frontend/src/pages/FamilyView.test.tsx` | Heading still renders when feed is empty |
| AC2 — viewed `familyId` is forwarded on the announcements query | integration | `frontend/src/pages/FamilyView.test.tsx` | `URL.searchParams.get('familyId')` equals the route param |
| AC3 — row links to the announcement detail page; reuses `AnnouncementCard` | unit (Vitest) | `frontend/src/features/family/components/FamilyRecentPosts.test.tsx` | Article-roled card renders content; reused `AnnouncementCard` (existing `AnnouncementCard.test.tsx`) already pins the `Open` link target. Spec said `/announcement/:id` — the existing app routes the detail page at `/post/:id` and `AnnouncementCard` links there; frontend-dev consciously reused the existing card link, so the test follows the actual route. |
| AC4 — empty state copy when no posts | unit | `frontend/src/features/family/components/FamilyRecentPosts.test.tsx` | "No posts from this family yet." renders for `items: []` |
| AC5 — loading state matches FamilyView pattern | unit (implicit) | `frontend/src/features/family/components/FamilyRecentPosts.test.tsx` | "Loading…" branch is exercised in transit to every `findBy*`; same plain-text pattern as `FamilyView`'s existing isPending branch |
| AC5 — error state | unit | `frontend/src/features/family/components/FamilyRecentPosts.test.tsx` | 500 response renders a readable message ("Boom" from the mock surfaces) |
| AC6 — pagination matches home feed | unit | `frontend/src/features/family/components/FamilyRecentPosts.test.tsx` | "Load older posts" button surfaces when `nextCursor` is non-null; identical affordance to `Feed.tsx` (cursor-driven button, not infinite scroll). `Home.tsx` itself shows only "See older posts →" linking to `/feed`, so the dedicated `/feed` page is the canonical in-page paginator that this section matches. |

**Coverage produced by each specialist**

- **backend-dev** (`backend/tests/announcements.test.ts`, suite "family-recent-posts: GET /api/announcements?familyId=<id>"): six tests covering filter correctness, cursor pagination, single-page, empty-feed, unknown-family, Zod 400, and 401 auth. Full AC1 coverage.
- **frontend-dev** (`frontend/src/features/family/components/FamilyRecentPosts.test.tsx`): four tests — heading + content render, empty state, error state, "Load older posts" affordance. Covers AC3 (delegated to reused `AnnouncementCard`, whose existing tests pin author link + DTO shape), AC4, AC5 (error path explicit, loading path implicit), AC6.
- **qa-engineer gap fills**:
  - `frontend/src/pages/FamilyView.test.tsx` (new, 3 tests) — AC2 page-level integration that frontend-dev's component-only test did not exercise: composition with header + Message CTA + Recent posts, empty-state at page level, and `familyId` forwarded from route param to announcements request.

**Gaps and notes**

- The feature spec mentioned `/announcement/:id`; the codebase actually routes the detail page at `/post/:id` and the reused `AnnouncementCard` already links there. Tests follow the actual route (documented in `FamilyRecentPosts.test.tsx` and in the table above). If the spec wording needs to win, that is a separate cleanup feature.
- `Home.tsx` does not paginate in-place — it shows a "See older posts →" link to `/feed`, and `Feed.tsx` is where the cursor-driven button lives. Frontend-dev matched `Feed.tsx`'s affordance, which is the only in-page paginator in the app. The unit test pins the button label "Load older posts".
- ESLint flat config is missing at the workspace root (`eslint .` errors with "ESLint couldn't find an eslint.config.(js|mjs|cjs) file"). This is a pre-existing tooling gap, not a regression introduced by this feature; no `#bug` feature file filed.

**Sweep results (2026-05-22, post-frontend-dev / backend-dev returns)**

- `cd backend && npm test` → **82 / 82 pass** (12 suites, 0 fail, 0 skipped, 25.8s)
- `cd frontend && npm test` → **64 / 64 pass** (20 files, 0 fail, 3.8s)
- `cd backend && npx tsc --noEmit` → clean
- `cd frontend && npx tsc --noEmit` → clean
- `cd frontend && npx eslint .` → not run; no flat config present (pre-existing infra gap, see Gaps)

No regressions introduced. Every AC is covered by at least one automated test, with AC2 also covered by a page-level integration test added by QA.

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
