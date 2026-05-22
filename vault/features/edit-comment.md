---
slug: edit-comment
title: Edit Comment
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-05-21
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Edit Comment

## Problem

Comments on announcements can be deleted (shipped as part of `[[features/polish-edit-delete]]`) but not edited. Announcements themselves can be edited and deleted. The asymmetry is awkward: foster parents who fix a typo in their own post can't fix one in their own comment reply. Closes the parity gap.

## Acceptance criteria

- [x] Author of a comment sees an "Edit" affordance on their own comment, alongside the existing "Delete".
- [x] Clicking Edit reveals an inline editor pre-populated with the current content; Save submits the patch and Cancel reverts without writing.
- [x] The edited comment renders the new content immediately (optimistic or refetch — implementer's call).
- [x] Edits respect the same content validation as comment creation (non-empty; max-length).
- [x] Backend exposes `PATCH /api/comments/:id` (or equivalent) that only the comment's author can call; everyone else gets 403.
- [x] Edit affordances are not shown on comments authored by other families (consistent with how Delete already behaves).
- [x] An "edited" indicator (small muted "(edited)" label or similar) appears next to comments whose `updatedAt > createdAt`. Shipped as the literal `(edited)` in italic, with `aria-label="This comment was edited"`.

## Out of scope

- Edit history / diff view (just the latest version is shown).
- Edit window time-limit (no "edits within 15 minutes" rule).
- Markdown / rich text in comments (kept plain-text per current behaviour).
- Editing announcement edits or DM messages (separate features).

## Open questions

- Does the existing `CommentDTO` already carry `updatedAt`? If yes, the "(edited)" indicator is trivial to compute frontend-side. If no, add it backend-side as a tiny DTO extension.
- Should the inline editor be a `<textarea>` (like `AnnouncementEditForm`) or a simpler `<input>` per the smaller scale of comments? Lean toward `<textarea>` for parity and to allow multi-line edits.
- Permission check: is there already an `assertCommentAuthor` helper used by the delete endpoint? Reuse it.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Endpoint.** `PATCH /api/comments/:id` — auth-required.

- Request body (Zod `PatchCommentInput` in `backend/src/schemas/announcement.schemas.ts`): `{ content: string }` with `min(1).max(2000)` — exactly the same constraints as `CreateCommentInput`.
- Route params validated with `CommentIdParams` (`id: uuid`).
- Responses:
  - `200 OK` → full `CommentDTO` (see shape below) when the caller is the comment's author.
  - `403 Forbidden` (`{ error: "Only the author can edit this comment." }`) when `comment.user_id !== req.userId`.
  - `404 Not Found` when no comment with that id exists.
  - `400` from Zod on empty / oversized content or non-uuid id.
  - `401` from `authenticate` when no JWT.
- On success the handler runs `UPDATE comments SET content = ?, updated_at = datetime('now') WHERE id = ?` and re-reads via the shared `COMMENT_SELECT` (which joins `families` for `author_name`).

**DTO contract for frontend-dev** (`CommentDTO`, returned by `createComment` + `listComments` + new `patchComment`):

```ts
{
  id: string;              // uuid
  announcementId: string;  // uuid
  authorId: string;        // uuid
  authorName: string | null;
  content: string;
  createdAt: string;       // sqlite datetime, UTC, "YYYY-MM-DD HH:MM:SS"
  updatedAt: string;       // NEW — equals createdAt on initial create; advances on PATCH
  isAuthor: boolean;
}
```

Frontend renders the "(edited)" indicator iff `updatedAt > createdAt` (string comparison is safe — both are SQLite UTC timestamps with the same fixed-width format). Field name is `updatedAt` (camelCase), mirroring `AnnouncementDTO.updatedAt`.

**Schema migration.** `comments.updated_at TEXT NOT NULL DEFAULT (datetime('now'))` added to `runMigrations()` in `backend/src/migrate.ts`. For existing databases the `ensureColumn` helper (now returning `boolean`) does an `ALTER TABLE comments ADD COLUMN updated_at TEXT` followed by `UPDATE comments SET updated_at = created_at WHERE updated_at IS NULL` — SQLite forbids `datetime('now')` as an `ADD COLUMN` default, so the backfill copies `created_at` to make the "(edited)" check (`updatedAt > createdAt`) false for legacy rows. Fresh `:memory:` test DBs get the column from the CREATE TABLE path.

**Author check.** Inline (`row.user_id !== userId`) — same pattern as `deleteComment` and `patchAnnouncement`. There is no `assertCommentAuthor` helper in the current codebase; introducing one for a single second caller would not earn its keep. Noted as a possible follow-up if a third caller appears.

**Files touched.**

- `backend/src/migrate.ts` — added `updated_at` column + backfill; `ensureColumn` now returns `boolean`.
- `backend/src/schemas/announcement.schemas.ts` — added `PatchCommentInput` and `CommentIdParams` Zod schemas (and inferred types).
- `backend/src/controllers/announcement.controller.ts` — added `updated_at` to `CommentRow` + `COMMENT_SELECT`; new `toCommentDTO` serializer used by `createComment`, `listComments`, and the new `patchComment` controller.
- `backend/src/routes/announcement.routes.ts` — wired `commentRouter.patch('/:id', validate(CommentIdParams), validate(PatchCommentInput), patchComment)`; also tightened the existing `DELETE` to validate params against `CommentIdParams` (was `AnnouncementIdParams`; identical shape, just correct naming).
- `backend/tests/announcements.test.ts` — +4 tests (happy-path edit + updatedAt advance, 403 non-author, 404/400/401 envelope, DTO shape across create+list).

**Quality gates.** `backend` full suite: 76/76 pass (baseline 70 pre-feature; +4 backend-dev cases + 2 qa-engineer cases = 6 net-new in `announcements.test.ts`, which now holds 20 `it()` blocks). `npx tsc --noEmit` clean. No new dependencies. (Tech-lead edit 2026-05-21: corrected the count after the post-merge sweep; backend-dev's original "80/80; was 76/76" double-counted the baseline.)

### Frontend

**Files touched**

- `frontend/src/api/announcements.ts` — `CommentDTO` gains required `updatedAt: z.string()`; new `patchComment(id, { content }): Promise<CommentDTO>` mirrors `patchAnnouncement`'s shape (PATCH `/comments/:id`, body `{ content }`, response parsed through `CommentDTO`).
- `frontend/src/features/feed/components/CommentEditForm.tsx` — **new**. Inline editor lifted from `AnnouncementEditForm`: RHF + Zod (`content: z.string().min(1).max(2000)` — same bounds as `CommentForm`), submits the PATCH via `useMutation`, surfaces server errors. `onDone(updated?: CommentDTO)` returns the fresh DTO on success or fires bare on Cancel.
- `frontend/src/features/feed/components/CommentList.tsx` — adds an "Edit" button beside the existing "Delete" (rendered only when `c.isAuthor && !isEditing`), tracks `editingId` and a local `edits` override map keyed by comment id so the just-edited comment renders in place after Save without needing a parent refetch. The mutation still invalidates `feedKeys.comments(announcementId)` so production query-driven consumers (`AnnouncementDetail`) refresh too. Adds the "(edited)" indicator (small italic, `aria-label="This comment was edited"`) when `updatedAt > createdAt`.
- `frontend/src/features/feed/components/CommentList.test.tsx` — pre-existing fixture extended with `updatedAt` (set equal to `createdAt` so the existing 3 author-display tests keep passing).
- `frontend/src/features/feed/components/CommentForm.test.tsx` — pre-existing msw fixture for `POST /api/announcements/:id/comments` extended with `updatedAt`, otherwise the now-stricter `CommentDTO.parse()` would reject the response.

**Contract consumed** (matches what backend-dev shipped in parallel)

- `PATCH /api/comments/:id`, body `{ content: string }`. 200 → full `CommentDTO`; 403 non-author; 404 missing; 400 Zod; 401 unauthenticated.
- `CommentDTO.updatedAt: string` (camelCase; sqlite UTC `"YYYY-MM-DD HH:MM:SS"`) — surfaced via backend-dev's new `toCommentDTO` serializer. Field name confirmed against `backend/src/controllers/announcement.controller.ts` after their commit landed; no drift to adapt to.

**Behaviour**

- Edit affordance is gated on `c.isAuthor` (same gate as Delete) — never shown on others' comments.
- Click Edit → header switches to `<textarea>` pre-filled with current content + Save + Cancel; the `<p>` content block is replaced by the form.
- Save → PATCH fires; on success the parent merges the returned DTO into its override map, closes the editor, and "(edited)" appears (since `updatedAt > createdAt`). On error the form stays open and shows the message.
- Cancel → editor closes, original content + timestamp re-render verbatim; no network call.
- Delete continues to work unchanged.
- "(edited)" literal used: the exact string `(edited)` rendered in `<span class="italic">` with `aria-label="This comment was edited"`. QA's F5/F6 assertions match against `/\(edited\)/i`, so this passes.

**Quality gates**

- `npm test -- --run`: 57/57 pass (baseline 50; qa-engineer's 7 new cases in `CommentList.test.tsx` are F1–F6 + an extra split between gating-when-absent and present-with-Delete).
- `npx tsc --noEmit`: clean.
- `npm run build` (tsc + vite): clean, 150 modules transformed.

### Test plan

Net-new test cases layered on top of what backend-dev and frontend-dev write inline. Coverage strategy: complement the producer's happy-path / 4xx coverage with the cross-cutting cases (listing roundtrip, "(edited)" indicator state, edit-affordance permission gating).

**Backend** — `backend/tests/announcements.test.ts`. Backend-dev's own 4 cases (happy-path edit + updatedAt advance, 403 non-author, 404/400-empty/401, DTO shape across create+list) already cover the basic envelope. QA adds the two cases backend-dev did not cover:

| # | Type | AC | Assertion |
|---|---|---|---|
| B1 | integration | too-long content | `PATCH /api/comments/:id` with `content` of length 2001 returns 400 (Zod max(2000)) — the upper boundary of the validation contract |
| B2 | integration | listing roundtrip | after PATCH, `GET /api/announcements/:id/comments` reports the edited comment with `updatedAt > createdAt` (`new Date()` comparison) AND the new `content` — proves the read path picks up the new column end-to-end |

**Frontend** — `frontend/src/features/feed/components/CommentList.test.tsx` (edit-specific cases added to the existing file):

| # | Type | AC | Assertion |
|---|---|---|---|
| F1 | unit (RTL) | Edit affordance gating | Edit button absent when `isAuthor === false`; present when `isAuthor === true` (mirrors Delete behaviour) |
| F2 | unit (RTL) | Edit reveals textarea | Clicking Edit reveals a textbox pre-filled with the current `content`; Save + Cancel buttons appear |
| F3 | integration (RTL + msw) | Save submits PATCH | Typing new text + clicking Save fires `PATCH /api/comments/:id` with the new content; UI re-renders the new content in place |
| F4 | unit (RTL) | Cancel reverts | Clicking Cancel after editing restores the original rendered content and does NOT fire any network call |
| F5 | unit (RTL) | "(edited)" indicator present | Comment with `updatedAt > createdAt` renders a muted `(edited)` label |
| F6 | unit (RTL) | "(edited)" indicator absent | Comment with `updatedAt === createdAt` does NOT render `(edited)` |

**Sweep**: backend `node --test` + frontend `vitest run` + `tsc --noEmit` both workspaces + `vite build` frontend.

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
