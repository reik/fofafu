---
slug: feed-avatars
title: Feed Avatars
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: shipped                # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-06-13
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Feed Avatars

## Problem

Announcement cards in the feed show the author's display name (shipped in
[[features/author-display-names]]) but no visual identity. Families already
have an `avatarUrl` (shipped in [[features/family-avatar]]), set via
`FamilyEditForm`. The feed should show that avatar next to the author's name
on each post so the feed feels more like a community of people, not a list
of text blocks. Families without an avatar should fall back to the same
initial-letter circle already used in `FamilyHeader`.

## Acceptance criteria

- [ ] Each announcement card in the feed (Home, FamilyView, AnnouncementDetail)
      shows the author's avatar immediately to the left of their display name.
- [ ] If the author has no `avatarUrl`, show the initial-letter circle fallback
      (same pattern as `FamilyHeader`), using the same first-letter-of-name logic.
- [ ] If the author's family record was deleted (authorName is null /
      "A former member"), show a neutral placeholder avatar — no crash, no
      broken image.
- [ ] Avatar reuses a shared component rather than duplicating the circle/img
      markup that currently lives only in `FamilyHeader`.

## Out of scope

- Avatars in `CommentList` (comment rows) — feed posts only for this pass.
- Avatar upload/edit flow — already covered by [[features/family-avatar]].
- Avatars in messages/DM threads.

## Open questions

- None — the backend pattern (LEFT JOIN families, nullable field) is already
  established by [[features/author-display-names]] and [[features/family-avatar]].

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

Extended the existing `LEFT JOIN families` pattern (established by
[[features/author-display-names]]) in `announcement.controller.ts` to also
project `families.avatar_url` (nullable `TEXT`, shipped by
[[features/family-avatar]]) — no new joins, no new migrations.

**DTO shape change**

- `AnnouncementDTO` (the object returned by `toAnnouncementDTO`): added
  `authorAvatarUrl: string | null`, immediately after `authorName` in the
  shape. `null` means either "no `families` row for this `user_id`" (deleted
  family) or "family exists but has no avatar set" — the frontend can't
  distinguish the two from this field alone, but `authorName === null` already
  signals the former (per author-display-names), so the frontend can combine
  both fields for the "neutral placeholder vs. initial-letter circle" decision
  per the acceptance criteria.

**Query strategy**

- `ANNOUNCEMENT_SELECT` now selects `f.avatar_url AS author_avatar_url` in
  addition to `f.name AS author_name`, via the same
  `LEFT JOIN families f ON f.user_id = a.user_id`. Same 1:1 multiplicity
  (`families.user_id` is `UNIQUE`), no N+1.
- `AnnouncementRow` interface gained `author_avatar_url: string | null`.
- `toAnnouncementDTO` maps `row.author_avatar_url` → `authorAvatarUrl`.

**Endpoints affected (no URL/contract change beyond the added field)**

- `POST /api/announcements` → 201 with `authorAvatarUrl`
- `GET  /api/announcements` (list) → each item has `authorAvatarUrl`
- `GET  /api/announcements/:id` → `authorAvatarUrl`
- `PATCH /api/announcements/:id` → `authorAvatarUrl`

**Out of scope (per dispatcher decomposition)**

- `COMMENT_SELECT` / `CommentDTO` — untouched. `CommentRow`, `toCommentDTO`,
  and all comment endpoints are unchanged; comment-row avatars are out of
  scope for this feature (feed posts only).
- `MessageDTO` / `ThreadDTO` — untouched (DMs out of scope).

**Files touched**

- `backend/src/controllers/announcement.controller.ts`

**Test results**

- `82/82 pass` (full backend suite, excluding `tests/coach.test.ts` which has
  a pre-existing unrelated syntax error from a prior feature branch — see
  notes). `34/34 pass` in `announcements.test.ts` + `author-display.test.ts`
  specifically, which exercise `ANNOUNCEMENT_SELECT`/`toAnnouncementDTO`.
- `tsc --noEmit`: clean except the same pre-existing `tests/coach.test.ts`
  error (unrelated to this change — confirmed `git diff HEAD -- tests/coach.test.ts`
  is empty, so it's already on `HEAD`, not introduced by this feature).
- No new dependencies, no new migrations (`families.avatar_url` already
  existed from [[features/family-avatar]]).

**Note for frontend-dev**: field name is exactly `authorAvatarUrl` (camelCase),
matching the `authorName` precedent. Add
`authorAvatarUrl: z.string().nullable()` to the `AnnouncementDTO` Zod schema —
do not add it to `CommentDTO` (out of scope, not present in `COMMENT_SELECT`).

### Frontend

**Shared component**

- `frontend/src/components/Avatar/Avatar.tsx` (+ `index.ts` barrel + `Avatar.test.tsx`) — new shared component, extracted from the inline `img`/initial-circle markup that previously lived only in `FamilyHeader`.
  - Props: `avatarUrl?: string | null`, `name?: string | null`, `size?: 'sm' | 'lg'` (default `'sm'`), `className?: string`.
  - `avatarUrl` set → `<img src={avatarUrl} alt="" className="... rounded-full object-cover shadow-lift" />`.
  - `avatarUrl` null/undefined, `name` set → initial-letter circle, `bg-brand-primary/15 text-brand-primary` (same tokens as the old `FamilyHeader` markup), first character of `name` uppercased.
  - Both `avatarUrl` and `name` null/undefined (AC3 — deleted-family / "A former member" case) → neutral placeholder circle (`bg-surface-card text-ink-muted`) with a generic person glyph (inline SVG, `aria-hidden`), no initials, no broken `<img>`.
  - `size="lg"` → `h-16 w-16 text-2xl` (matches FamilyHeader's old fixed size). `size="sm"` → `h-10 w-10 text-base` (feed-card size).

**Refactor**

- `frontend/src/features/family/components/FamilyHeader.tsx` — replaced the inline avatar/initial-circle JSX with `<Avatar avatarUrl={family.avatarUrl} name={family.name} size="lg" />`. Prop signature unchanged; `FamilyHeader.test.tsx` still passes unmodified.

**Feed integration**

- `frontend/src/features/feed/components/AnnouncementCard.tsx` — header now renders `<Avatar avatarUrl={announcement.authorAvatarUrl} name={announcement.authorName} size="sm" />` immediately to the left of the author name/link/fallback. Wrapped the name+timestamp pair in their own `flex items-baseline` group so the avatar can align with `items-center` on the outer row. Renders on Home, FamilyView (via `FamilyRecentPosts`), and AnnouncementDetail since all three render through `AnnouncementCard`.

**Zod schema**

- `frontend/src/api/announcements.ts`: added `authorAvatarUrl: z.string().nullable()` to `AnnouncementDTO`, immediately after `authorName`. Matches backend-dev's shipped field exactly (`row.author_avatar_url` via the existing `LEFT JOIN families`) — no name mismatch, no adaptation needed.

**Test fixtures updated** (Zod parses `AnnouncementDTO`/`FeedPage` at the network boundary, so the new required-but-nullable field had to be added to every hand-built fixture that goes through `.parse()`):

- `features/feed/components/ReactionBar.test.tsx`
- `features/family/components/FamilyRecentPosts.test.tsx`
- `features/feed/components/AnnouncementComposer.test.tsx`
- `src/tests/a11y.test.tsx`
- `pages/FamilyView.test.tsx`

(`AnnouncementCard.test.tsx` and `CommentList.test.tsx` use `as unknown as AnnouncementDTO` / `CommentDTO` casts and bypass `.parse()`, so they were unaffected — though `Avatar.test.tsx` was extended directly with additional cases including the `alt=""` decorative-image assertion.)

**Quality gates**

- `npm test -- --run` → **69/69 passing** (21 test files, up from 46/46 across 17 files on `author-display-names`).
- `npx tsc --noEmit` → clean.
- `npm run build` → clean (153 modules, 367 kB JS / 14.9 kB CSS, up from 148 modules / 363 kB).

**Out of scope confirmed untouched**: `CommentList.tsx`, `MessageBubble`/DM components, `ImagePicker` / avatar upload flow.

### Test plan

Coverage strategy: backend cases extend `author-display.test.ts` alongside the
existing `authorName` LEFT JOIN fallback tests (same DB-reset helpers,
`dropFamilyFor` + new `setAvatarFor`). Frontend cases extend
`AnnouncementCard.test.tsx` (new `describe('AnnouncementCard author avatar')`
block) and the pre-existing `Avatar.test.tsx` (fixed a query bug — decorative
`<img alt="">` resolves to ARIA role `presentation`, not `img`, so
`getByRole('img', { hidden: true })` never matched; replaced with
`container.querySelector('img')`).

| # | AC | Type | File | One-line assertion |
|---|---|---|---|---|
| 1 | "Each announcement card ... shows the author's avatar immediately to the left of their display name" | unit | `frontend/src/features/feed/components/AnnouncementCard.test.tsx` | When `authorAvatarUrl` is set, an `<img alt="">` with that `src` renders in the header alongside the author-name link. |
| 2 | "If the author has no `avatarUrl`, show the initial-letter circle fallback ... using the same first-letter-of-name logic" | unit | `frontend/src/features/feed/components/AnnouncementCard.test.tsx` | When `authorAvatarUrl` is null and `authorName` is "The Garcias", the card shows the initial-letter circle "T" and no `<img>`. |
| 3 | "If the author's family record was deleted (authorName is null / 'A former member'), show a neutral placeholder avatar — no crash, no broken image" | unit | `frontend/src/features/feed/components/AnnouncementCard.test.tsx` | When both `authorAvatarUrl` and `authorName` are null, the card renders an inline `<svg>` placeholder (no `<img>`, no initials) alongside the "A former member" label. |
| 4 | "Avatar reuses a shared component rather than duplicating the circle/img markup" — img state | unit | `frontend/src/components/Avatar/Avatar.test.tsx` | `<Avatar avatarUrl="…" name="Garcia" />` renders `<img alt="">` with `src` equal to `avatarUrl`. |
| 5 | "Avatar reuses a shared component" — initial-letter state | unit | `frontend/src/components/Avatar/Avatar.test.tsx` | `<Avatar avatarUrl={null} name="Garcia" />` renders no `<img>` and the text "G" (uppercased first letter). |
| 6 | "Avatar reuses a shared component" — initial-letter casing | unit | `frontend/src/components/Avatar/Avatar.test.tsx` | `<Avatar avatarUrl={null} name="garcia" />` (lowercase input) still renders "G". |
| 7 | "Avatar reuses a shared component" — neutral placeholder state (AC3, both null) | unit | `frontend/src/components/Avatar/Avatar.test.tsx` | `<Avatar avatarUrl={null} name={null} />` renders no `<img>`, no text, and an inline `<svg>`. |
| 8 | "Avatar reuses a shared component" — neutral placeholder when `name` is `undefined` | unit | `frontend/src/components/Avatar/Avatar.test.tsx` | `<Avatar avatarUrl={null} />` (name omitted) renders the same `<svg>` placeholder, no crash. |
| 9 | Backend contract for AC1/AC2: `authorAvatarUrl` reflects `families.avatar_url` when set | integration (real SQLite) | `backend/tests/author-display.test.ts` | POST/GET detail/GET list all return `authorAvatarUrl === 'https://cdn.example.com/avatars/garcia.png'` after `setAvatarFor`. |
| 10 | Backend contract for AC2 default: `authorAvatarUrl === null` when family has no avatar set | integration | `backend/tests/author-display.test.ts` | GET `/api/announcements/:id` returns `authorAvatarUrl === null` for a family row with `avatar_url` unset (default). |
| 11 | Backend contract for AC3: `authorAvatarUrl === null` when the family record is deleted | integration | `backend/tests/author-display.test.ts` | After `dropFamilyFor`, GET `/api/announcements/:id` returns `authorAvatarUrl === null` and `authorName === null`; endpoint stays 200 (mirrors the `authorName` fallback test). |

Sweep results (2026-06-13):

- Backend: **85/85 passing** in `node:test` across all `*.test.ts` files except
  `tests/coach.test.ts`, which has a **pre-existing syntax error**
  (`tests/coach.test.ts:218` — `error TS1005: '}' expected`, a missing closing
  brace in a `reply-coach` test from a prior branch). Confirmed via
  `tsc --noEmit` and by checking the file is already part of the working tree
  before this session (`git status` shows it modified on this branch, not by
  qa). Out of scope for feed-avatars; flagged for code-reviewer/tech-lead —
  not filed as a new P1 bug here since it predates this feature and a fix
  would touch a different feature's test file (writer-ownership boundary).
  `author-display.test.ts` alone: **11/11 passing** (8 pre-existing + 3 new
  `authorAvatarUrl` cases).
- Frontend: **72/72 passing** (21 test files, up from 69/69 after backend-dev
  + frontend-dev's hand-off). +3 new cases in `AnnouncementCard.test.tsx`
  (now 6/6) and +2 additional cases in `Avatar.test.tsx` (now 5/5, plus a
  fixed query bug in the pre-existing "renders an image" case).
- `tsc --noEmit`: clean on frontend; clean on backend except the pre-existing
  `coach.test.ts` error noted above.
- `eslint`: not runnable — no `eslint.config.js`/`.eslintrc.*` exists in either
  workspace (pre-existing repo-wide gap, unrelated to this feature).

All 4 acceptance criteria have direct test coverage (rows 1–8 frontend, 9–11
backend). Out-of-scope areas (`CommentList` avatars, avatar upload/edit,
DM avatars) were not touched, per the feature's "Out of scope" list.

### Code review

**Summary.** Reviewed the full uncommitted diff on `feat/feed-avatars` (13 files,
~121/-33 lines, no commits yet on top of `master`): backend's `LEFT JOIN
families` extension in `announcement.controller.ts` + 3 new integration tests
in `author-display.test.ts`, the new shared `frontend/src/components/Avatar/`
component (+ test + barrel), its adoption in `FamilyHeader.tsx` and
`AnnouncementCard.tsx`, the Zod schema addition in `frontend/src/api/
announcements.ts`, and 6 test-fixture updates for the new required field.
Verdict: clean, well-scoped, follows the established author-display-names
precedent precisely. No must-fix issues found.

**Must-fix**

None.

**Nice-to-have**

- `frontend/src/components/Avatar/Avatar.tsx:11-12` — `avatarUrl?: string |
  null | undefined` and `name?: string | null | undefined`: the `| undefined`
  is redundant given the `?` optional marker already permits `undefined`.
  Harmless, but `avatarUrl?: string | null` is the convention used elsewhere
  in this codebase (e.g. `AnnouncementDTO.authorAvatarUrl: z.string()
  .nullable()` infers `string | null`, no `?`/`undefined`).
- `frontend/src/features/feed/components/AnnouncementCard.tsx:26-48` — the
  header now nests two flex containers (`items-center` outer, `items-baseline`
  inner) to align the avatar with the name+timestamp baseline. Works and is
  tested, but if a third consumer of this header layout shows up, consider
  extracting an `AnnouncementAuthor` sub-component to avoid drifting copies of
  this nesting.

**Acceptance criteria spot-check**

- [x] Each announcement card in the feed (Home, FamilyView, AnnouncementDetail)
      shows the author's avatar immediately to the left of their display name
      — `AnnouncementCard.tsx` is the single render path for all three routes;
      `<Avatar ... size="sm" />` placed before the name/timestamp group.
      Covered by `AnnouncementCard.test.tsx` ("renders an avatar image next to
      the author name when authorAvatarUrl is set").
- [x] If the author has no `avatarUrl`, show the initial-letter circle fallback
      (same pattern as `FamilyHeader`), using the same first-letter-of-name
      logic — `Avatar.tsx` falls through to the `bg-brand-primary/15
      text-brand-primary` initial circle when `avatarUrl` is falsy and `name`
      is present; `FamilyHeader.tsx` now uses the same component (`size="lg"`)
      so the tokens are shared, not duplicated. Covered by
      `AnnouncementCard.test.tsx` and `Avatar.test.tsx`.
- [x] If the author's family record was deleted (authorName is null / "A
      former member"), show a neutral placeholder avatar — no crash, no
      broken image — `Avatar.tsx` returns the `bg-surface-card text-ink-muted`
      circle with an inline `aria-hidden` SVG person glyph when both
      `avatarUrl` and `name` are null/undefined; no `<img>` is rendered in
      this branch so there's no broken-image icon. Covered by
      `AnnouncementCard.test.tsx` ("renders a neutral placeholder avatar...")
      and two `Avatar.test.tsx` cases (both-null, and `name` omitted).
- [x] Avatar reuses a shared component rather than duplicating the
      circle/img markup that currently lives only in `FamilyHeader` —
      `frontend/src/components/Avatar/Avatar.tsx` is the single
      implementation; `FamilyHeader.tsx`'s old inline `img`/initial-circle JSX
      (16 lines) was deleted and replaced with `<Avatar avatarUrl={family
      .avatarUrl} name={family.name} size="lg" />`. No duplicated markup left
      behind in either consumer.

**Contract check.** `f.avatar_url AS author_avatar_url` (SQL) →
`AnnouncementRow.author_avatar_url: string | null` → `toAnnouncementDTO` →
`authorAvatarUrl` → frontend `AnnouncementDTO.authorAvatarUrl: z.string()
.nullable()` (infers `string | null`) → `Avatar` prop `avatarUrl`. Naming and
nullability consistent end-to-end, no drift. `COMMENT_SELECT`/`CommentDTO`
correctly untouched (matches "Out of scope").

**Out-of-scope check.** `git diff --name-only HEAD` shows no changes to
`CommentList.tsx`, `CommentList.test.tsx`, `ImagePicker.tsx`, or any
`features/messages/` file — out-of-scope list honored.

**Pre-existing issue (not this feature's must-fix).** `backend/tests/
coach.test.ts` has a syntax error around line 217-218 (a `node:test` callback
missing its closing `}` before `});`), which breaks workspace-wide `tsc
--noEmit` / `npm test` for the backend. Confirmed via `git diff master --
backend/tests/coach.test.ts` and `git diff HEAD -- backend/tests/coach.test.ts`
— both empty, i.e. this file is byte-identical to `master` and was not touched
by this branch. This predates `feed-avatars` (introduced on the `reply-coach`
branch, already merged to `master` per `git log`). Both backend-dev and
qa-engineer correctly scoped around it rather than fixing it under this
feature's writer-ownership. Recommend a small standalone `fix:` follow-up
feature/PR to repair `coach.test.ts` on `master` directly — flagging for
tech-lead, not gating this feature.

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
