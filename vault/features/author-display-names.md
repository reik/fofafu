---
slug: author-display-names
title: Author Display Names
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-05-20
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Author Display Names

## Problem

Across announcements, comments, and message threads the UI exposes raw `authorId` / `userId` UUIDs (e.g. `0f8d3a1c-…`) instead of the family's display name. Foster families can't tell who said what without clicking through to each profile, which breaks the basic social-feed promise of the product.

## Acceptance criteria

- [x] Announcement cards show the author's family name (linked to `/family/:id`) instead of a UUID.
- [x] Comments show the commenter's family name (linked to `/family/:id`).
- [x] DM thread headers and partner labels show the partner's family name instead of a UUID.
- [x] When a family record is missing (deleted user), the UI falls back to a neutral label (e.g. "A former member") rather than crashing or showing a UUID.

## Out of scope

- Per-user (not per-family) display names — fofafu has one family-record-per-user.
- Avatars next to author names in the feed (already covered by `family-avatar` on the family page; out of scope here unless trivial via the DTO change).
- Display-name editing UI (families already have a `name` field via `FamilyMe`).

## Open questions

- Should the backend hydrate DTOs with `authorName` server-side, or should the frontend fetch families separately and join? (Lead toward server-side hydration to keep frontend simple.)
- Caching strategy for repeated author lookups within a single feed page.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

Server-side DTO hydration. The backend joins `families` once per query and exposes the family name on every DTO that carries an author/partner/sender id. No N+1, no frontend fan-out.

**DTO shape changes**

- `AnnouncementDTO`: add `authorName: string | null`.
- `CommentDTO`: add `authorName: string | null`.
- `MessageDTO`: add `fromName: string | null` and `toName: string | null`.
- `ThreadDTO`: add `partnerName: string | null` (audit: previously absent; now present).

In all four cases `null` means "no `families` row was found for this user_id" — the frontend renders a neutral fallback ("A former member") rather than a UUID.

**Query strategy**

A single `LEFT JOIN families f ON f.user_id = <author/sender/receiver>.user_id` is added to the existing SELECTs:

- `announcement.controller.ts`: `ANNOUNCEMENT_SELECT` and `COMMENT_SELECT` constants centralise the joined projection; `create/get/list/patch` all use them.
- `message.controller.ts`: `MESSAGE_SELECT` joins twice (`fs` for sender, `fr` for receiver). `listThreads` extends the CTE with a `LEFT JOIN families f ON f.user_id = p.partner_id`.

`families.user_id` is `UNIQUE`, so the join multiplicity is 1:1 and the LEFT JOIN gracefully yields `NULL` for orphaned rows.

**Endpoints affected (no URL/contract change beyond the added field)**

- `POST /api/announcements` → 201 with `authorName`
- `GET  /api/announcements` (list) → each item has `authorName`
- `GET  /api/announcements/:id` → `authorName`
- `PATCH /api/announcements/:id` → `authorName`
- `POST /api/announcements/:id/comments` → 201 with `authorName`
- `GET  /api/announcements/:id/comments` → each item has `authorName`
- `POST /api/messages` → 201 with `fromName`, `toName`
- `GET  /api/messages/threads` → each thread has `partnerName`
- `GET  /api/messages/threads/:userId` → each message has `fromName`, `toName`

**Files touched**

- `backend/src/controllers/announcement.controller.ts`
- `backend/src/controllers/message.controller.ts`
- `backend/tests/announcements.test.ts` (+3 cases)
- `backend/tests/messages.test.ts` (+3 cases)

**Test results**: `62/62 pass`, `tsc --noEmit` clean. No new dependencies.

### Frontend

**Shared util**

- `frontend/src/utils/formatAuthor.ts` — single source of truth.
  - `formatAuthor(name: string | null | undefined): string` — returns the trimmed name or `AUTHOR_FALLBACK` = `"A former member"`.
  - Used everywhere a family display name is rendered from a DTO field.

**Zod schema extensions** (`frontend/src/api/`)

- `AnnouncementDTO.authorName: z.string().nullable()` — mirrors backend `LEFT JOIN families`.
- `CommentDTO.authorName: z.string().nullable()` — same.
- `ThreadDTO.partnerName: z.string().nullable()` — same.
- `MessageDTO.fromName: z.string().nullable()` and `MessageDTO.toName: z.string().nullable()` — backend ships both, derived from a double `LEFT JOIN families` (sender + receiver).

**Components & pages updated**

- `features/feed/components/AnnouncementCard.tsx`
  - Header leads with `formatAuthor(authorName)`.
  - When `authorName` is non-null → `<Link to={`/family/${authorId}`}>{name}</Link>` (semibold, hover underline).
  - When `null` → plain `<span>` with the fallback in italic muted text (no link, no broken `/family/<uuid>` target).
  - Timestamp now sits next to the author; edit/delete/open actions stay on the right.
- `features/feed/components/CommentList.tsx`
  - Same author/link/fallback pattern per comment row.
- `pages/Messages.tsx`
  - Thread rows show `formatAuthor(partnerName)` instead of `partnerId.slice(0, 8)`. Row stays a link (the conversation exists even if the family record is gone); only the label is the fallback. `cn()` controls the italic-muted variant.
- `pages/MessageThread.tsx`
  - Header reads `With <Link to="/family/:partnerId">{formatAuthor(partnerName)}</Link>`.
  - Partner name is resolved by first consulting the `messageKeys.threads` query cache, then falling back to the first incoming message's `fromName`, then `null` → fallback string.
- `features/messages/components/MessageBubble.tsx`
  - Unchanged. The bubble does not render a per-message sender label (sender identity is already conveyed by left/right alignment + the thread header).

**Tests**

- New tests authored by qa-engineer (now pass against this implementation):
  - `features/feed/components/AnnouncementCard.test.tsx` — link present when name set, fallback non-link when null, never renders raw UUID.
  - `features/feed/components/CommentList.test.tsx` — same three cases for comments.
  - `pages/Messages.test.tsx` — link label = partner name; falls back to "A former member" when `partnerName` is null.
- Existing fixtures updated to satisfy the now-required nullable fields (Zod parses at the network boundary):
  - `features/feed/components/ReactionBar.test.tsx` (added `authorName`)
  - `features/feed/components/AnnouncementComposer.test.tsx` (added `authorName`)
  - `features/feed/components/CommentForm.test.tsx` (msw response now includes `authorName`)
  - `features/messages/components/MessageComposer.test.tsx` (msw response now includes `fromName`, `toName`)
  - `tests/a11y.test.tsx` (announcement fixture)

**Quality gates**

- `npm test -- --run` → **46/46 passing** (38 pre-existing + 8 new author-display tests).
- `npx tsc --noEmit` → clean.
- `npm run build` → clean (363 kB JS bundle, 14.6 kB CSS).

**Contract reconciliation with backend-dev**

Aligned with backend-dev's ship 1:1. Backend's `MessageDTO` ships both `fromName` and `toName` (not just `fromName`); frontend schema follows suit (both required-but-nullable). No mismatches; both halves of the contract land together.

### Test plan

Coverage strategy: complement (don't duplicate) backend-dev's regression updates inside `announcements.test.ts` / `messages.test.ts` and frontend-dev's DTO-shape updates to existing tests. New tests live in dedicated files so the author-display contract is auditable in one place.

| # | AC | Type | File | One-line assertion |
|---|---|---|---|---|
| 1 | Announcement cards show family name as link | unit | `frontend/src/features/feed/components/AnnouncementCard.test.tsx` | Header renders a link to `/family/:authorId` with the family name as accessible text. |
| 2 | Announcement fallback when family missing | unit | `frontend/src/features/feed/components/AnnouncementCard.test.tsx` | When `authorName` is null the card shows "A former member" as plain (non-link) text. |
| 3 | Announcement card never leaks UUIDs | unit | `frontend/src/features/feed/components/AnnouncementCard.test.tsx` | Visible card text never contains the raw `authorId`. |
| 4 | Comments show family name as link | unit | `frontend/src/features/feed/components/CommentList.test.tsx` | Comment header renders a link to `/family/:authorId` with the family name. |
| 5 | Comment fallback when family missing | unit | `frontend/src/features/feed/components/CommentList.test.tsx` | When `authorName` is null the comment shows "A former member" as plain (non-link) text. |
| 6 | Comment never leaks UUIDs | unit | `frontend/src/features/feed/components/CommentList.test.tsx` | Visible comment text never contains the raw `authorId`. |
| 7 | Thread list shows partner family name | integration (MSW) | `frontend/src/pages/Messages.test.tsx` | Each row is a link to `/messages/:partnerId` accessible-named by `partnerName`. |
| 8 | Thread list fallback when partner family missing | integration (MSW) | `frontend/src/pages/Messages.test.tsx` | When `partnerName` is null the row's visible label is "A former member"; the link still points to `/messages/:partnerId`. |
| 9 | GET `/api/announcements/:id` hydrates `authorName` | integration (real SQLite) | `backend/tests/author-display.test.ts` | DTO field equals the joined `families.name`. |
| 10 | GET `/api/announcements` list hydrates `authorName` per item | integration | `backend/tests/author-display.test.ts` | Every item has the correct `authorName`. |
| 11 | GET `/api/announcements/:id` fallback when family missing | integration | `backend/tests/author-display.test.ts` | `authorName === null` after `DELETE FROM families`; endpoint stays 200. |
| 12 | GET `/api/announcements/:id/comments` hydrates per-comment, null when missing | integration | `backend/tests/author-display.test.ts` | Mixed list shows both populated and null `authorName`. |
| 13 | POST `/api/announcements` echoes `authorName` | integration | `backend/tests/author-display.test.ts` | Response includes the author's family name. |
| 14 | POST `/api/announcements/:id/comments` echoes `authorName` | integration | `backend/tests/author-display.test.ts` | Response includes the author's family name. |
| 15 | GET `/api/messages/threads` hydrates `partnerName` | integration | `backend/tests/author-display.test.ts` | Each thread row has the partner's `families.name`. |
| 16 | GET `/api/messages/threads` fallback when partner family missing | integration | `backend/tests/author-display.test.ts` | `partnerName === null` after `DELETE FROM families`; endpoint stays 200. |

Sweep results (2026-05-20):

- Backend: **70 / 70 passing** (`announcements`, `messages`, `auth`, `family`, `community`, `search`, `uploads`, `author-display`). Backend-dev's complementary cases inside `announcements.test.ts` and `messages.test.ts` cover the joined `authorName` / `partnerName` / `fromName` / `toName` happy paths; this file covers the missing-family fallback paths and round-trips through every endpoint that surfaces an author identity.
- Frontend: **46 / 46 passing** (17 test files). The three new files above add 8 author-display cases on top of frontend-dev's regression updates to `AnnouncementComposer.test.tsx`, `CommentForm.test.tsx`, `MessageComposer.test.tsx`, `ReactionBar.test.tsx`.
- `tsc --noEmit`: clean in both workspaces.
- `vite build`: clean (148 modules, 363 KB JS / 14 KB CSS).

Known coverage gap (acceptable for this feature): the `MessageThread` page header copy ("Conversation — With …") is exercised indirectly via `Messages.test.tsx`; a focused `MessageThread.test.tsx` is deferred and can be tracked as a low-priority follow-up if needed.

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
