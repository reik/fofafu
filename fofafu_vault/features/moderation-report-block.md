---
slug: moderation-report-block
title: Moderation — report and block
owner: engineering
collaborators: [design, marketing]
status: building
priority: P2
created: 2026-06-12
target: null
links:
  kanban: "[[kanban/company]]"
  designs: null
---

# Moderation — report and block

## Problem

A foster-family community needs lightweight, after-the-fact moderation tools. Even with the reply-coach in place to soften draft comments, some content will still land that another family needs to flag, and some families will reach a point where one family doesn't want to see another's posts or receive their DMs. Without `report` and `block`, the only available escape valves are "leave the platform" or "ask an admin manually" — both too heavy for the kind of low-grade interpersonal friction this community will produce.

Success = a foster family can (a) report a specific post, comment, or DM in two taps, and (b) block another family in one tap from their profile, with both actions producing visible, immediate effects (reporter sees a confirmation; blocker stops seeing the blocked family entirely).

## Acceptance criteria

- [ ] Report flow available on every announcement, comment, and DM (icon in the existing action row, not a new surface).
- [ ] Report categories are short and foster-family-appropriate (not generic "spam / abuse / other" — voice owned by ux-writer).
- [ ] Reports persist with `{reporterId, targetType, targetId, category, note?, createdAt}` and are visible to an admin queue (admin tool is out of scope; the data lands).
- [ ] Block flow available on the family profile page and from any post/comment by that family.
- [ ] A blocked family is invisible to the blocker: their announcements vanish from the feed, their comments vanish from threads, their DMs vanish from the threads list, search excludes them.
- [ ] Block is one-way: the blocker sees nothing; the blocked family is not notified.
- [ ] Reporting and blocking are independent actions — reporting does not auto-block, blocking does not auto-report.

## Out of scope

- Admin moderation queue UI. The report data lands; reading it is a separate feature.
- Auto-moderation / classifier-based hiding. Coaching at write-time (reply-coach) is the prevention surface; this feature is the after-the-fact surface only.
- Block-list management screen. v1 surfaces unblock only on the previously-blocked family's profile (which the blocker can navigate to via the block UI confirmation).
- Reporting a *family* (vs. a post/comment/DM by that family). Channel-specific reports only in v1.

## Open questions

- Should blocks hide *historical* comments by the blocked family in already-read threads, or just future ones? (Hiding historical = more complete escape, but breaks thread readability for the blocker.)
- Where do report categories sit on the spectrum from "vague enough to be safe" to "specific enough to be useful for an admin"? Needs ux-writer.
- Should reports against the same target deduplicate per reporter, or accumulate? (Dedupe = cleaner data; accumulate = more honest engagement signal.)
- ~~DM blocks: when family A blocks family B, does the existing thread stay readable for A in case there's prior context A needs, or vanish entirely?~~ **Resolved (2026-07-08):** conversation history stays readable for the blocker (A). Only new messages from the blocked family (B) are prevented going forward; the thread does not vanish from A's inbox.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Stack note.** `[[standards/engineering-standards]]` still describes Express + better-sqlite3; this repo has substantially moved to Supabase Postgres + RLS + Deno Edge Functions (`supabase/functions/`, `supabase/migrations/`) per Phase 5 (`[[features/migrate-render-to-vercel-supabase]]`). Built Supabase-native here, following the `admin-access` precedent (new tables + RLS + new Edge Function), not the stale doc — flagging for tech-lead to update the standards doc separately.

**Shipped:**
- `supabase/migrations/20260904000000_moderation_reports_blocks.sql` — `reports` + `blocks` tables, RLS.
- `supabase/functions/moderation/index.ts` (+ `index.test.ts`, 20 tests) — report/block/unblock/list-blocks.
- `supabase/functions/community/index.ts` + `search/index.ts` — refactored to export a testable `handleRequest` (same pattern as `admin/index.ts`) and query-level blocked-family exclusion (+ `index.test.ts` each, 5 and 4 tests).
- `supabase/functions/announcement/index.ts` + `message/index.ts` — documentation-only changes (see "Per-surface filtering" below); zero runtime changes, so no new test files for these two.
- 49/49 `deno test` passing across `supabase/functions/` (includes the 4 pre-existing `admin/index.test.ts` tests as a regression check — untouched, still green).

**Schema.**

`reports(id, reporter_id -> auth.users, target_type CHECK IN ('announcement','comment','message'), target_id uuid, category text, note text?, created_at)`. `target_type` is a DB CHECK (fixed by contract A); `category` is deliberately **not** a CHECK/ENUM — validated in the Edge Function against a plain array instead, per contract C. RLS: insertable by `reporter_id = auth.uid()`; selectable by the reporter's own rows (needed so `.insert(...).select().single()` can return the created row — Postgres RLS also gates `RETURNING` through SELECT policies) plus `is_admin()` FOR ALL (mirrors every other table in `20260823000000_admin_access.sql` — satisfies contract G: a future admin queue built the same way `admin/index.ts` was needs zero further migration work).

`blocks(id, blocker_family_id -> families, blocked_family_id -> families, created_at, CHECK(blocker != blocked), UNIQUE(blocker_family_id, blocked_family_id))`. Presence of a row is the block; unblock = delete, no UPDATE path. RLS: `FOR ALL` scoped to `blocker_family_id` resolving to the caller's own family — this is the *only* non-admin policy, so a blocked family has no path to discover who blocked them (reinforces "not notified"). Plus `is_admin()` FOR ALL, same reasoning as `reports`.

**Endpoints** (`supabase/functions/moderation/index.ts`):

| Route | Body | Notes |
|---|---|---|
| `POST /moderation/reports` | `{targetType, targetId, category, note?}` | `reporterId`/`createdAt` always server-derived, never accepted from the body (contract A) — covered by a test that passes bogus `reporterId`/`createdAt` and asserts they're ignored. Existence of `targetId` is checked by re-reading it through the caller's own forwarded-auth client — for `target_type: 'message'`, `messages`' existing RLS already restricts SELECT to sender/receiver, so a family that isn't party to a DM gets a plain 404, same as a nonexistent id, with no extra check needed. |
| `POST /moderation/blocks` | `{blockedFamilyId}` | `blockerFamilyId` always server-derived (resolved from `auth.uid()` via `families`). Idempotent: re-blocking returns 200 with the existing row, not a duplicate/500 (also handles a `23505` race the same way). Self-block → 400. `blockedFamilyId` accepts **either** a `families.id` or the family owner's `auth.users.id` (see "blockedFamilyId dual-resolution" below). |
| `GET /moderation/blocks` | — | Lists the caller's own blocks. No `blockerFamilyId` filter needed in the query — `blocks`' own RLS already scopes it. |
| `DELETE /moderation/blocks/:blockedFamilyId` | — | Unblock. Idempotent (204 whether or not a row matched). |

Report and block are independent by construction (contract F): `createReport` only ever touches `reports`, `createBlock`/`deleteBlock` only ever touch `blocks` — no code path writes both. Covered explicitly by a test using a fake client that throws if either handler reaches for the other table.

**Per-surface filtering approach** (contract D — all server-side, none client-side-only):

| Surface | Mechanism | Why |
|---|---|---|
| Announcement feed + single GET | RESTRICTIVE RLS policy on `announcements` (migration) | Applies uniformly to every query path (feed, single-id GET, comment-creation's existence check) with nothing to remember to add per-query. No competing requirement to keep a blocked family's *content* reachable (unlike their profile — see below), so RLS alone satisfies contract D's "RLS or query-level exclusion." `announcement/index.ts` itself is untouched except a doc comment explaining this. |
| Comments | Same RESTRICTIVE-policy mechanism, on `comments` | Same reasoning. |
| Community feed, Search | Query-level exclusion in `community/index.ts` / `search/index.ts`: fetch the caller's own `blocked_family_id`s (relies on `blocks`' RLS to scope to "mine"), `.not("id","in", "(...)")` against the `families` query when non-empty | **Cannot** use RLS here: `families` rows must stay directly fetchable so the blocker can still load the blocked family's own profile page — the *only* unblock surface in v1 (`## Out of scope`). RLS can't distinguish "the feed" from "a direct profile fetch," both are just `SELECT` on `families`. Proven with unit tests that assert the exact `.not(...)` call args when blocks exist and that the call is skipped entirely when they don't. |
| DM threads / thread / unread count / mark-read | RESTRICTIVE RLS policy on `messages`, `FOR ALL` (covers SELECT + UPDATE) | See DM decision below — deliberately does **not** hide history, only new inbound. `message/index.ts` itself is untouched except a doc comment; every route (`listThreads`, `getThread`, `unreadCount`, `markThreadRead`) is automatically correct because they all just query/update `messages` through the caller's own client. |

Reactions are **not** filtered — outside the acceptance criteria's named scope (feed/threads/DM-list/search), and a reaction isn't attributable to a single family the way a post/comment is. Noted explicitly in `announcement/index.ts` as a deliberate non-goal, not an oversight.

**DM decision (contract E).** Confirmed: a blocked sender's `POST /message` always succeeds normally (201, message persisted) — no loud block error. This is enforced entirely by the `messages` RESTRICTIVE policy: `auth.uid() <> receiver_id` is always true for whoever is sending (you can't message yourself), so the policy never blocks an INSERT regardless of block state — the sender is never told they're blocked, matching "not notified" and the dispatch prompt's own steer against an explicit block error. The same policy hides the message from the **receiver** only, and only if it postdates the block (`blocks.created_at <= messages.created_at`) — history stays fully visible, satisfying the resolved Open Question precisely (not the general AC bullet, which that resolution explicitly overrides for messages). Because the message row is genuinely persisted (not silently dropped), the sender's own view of their sent thread stays consistent across refreshes.

**DM composer direction — resolving ui-designer's flagged open question.** `### Visual` §6 ("Handoff — frontend-dev") flags as genuinely open whether blocking closes the channel one-way (inbound only) or both ways, and tentatively recommends "Variant A" (composer fully replaced, both directions closed) absent other input. Confirmed here as **inbound-only**: blocking does not touch the blocker's own outbound — A can still message B after blocking them. This is not a coin-flip: it's what this dispatch's own contract E says ("only NEW inbound messages from B are prevented"), what the resolved DM Open Question's literal text says, and what ux-writer's already-landed `dm.blocked.banner.body` copy already assumes ("this does not claim the blocker's own outgoing is affected"). Two concrete, actionable consequences flagged in a code comment for frontend-dev: (1) ui-designer's **Variant B** (composer stays, inbound-only banner) is the one that matches backend behavior, not their tentative Variant A default; (2) "Message this family" on a blocked family's profile page should stay enabled, not hidden/disabled.

**Category taxonomy — reconciled with ux-writer.** ux-writer's `### Microcopy` landed (uncommitted, same batch) with an explicit "Stored values" line before I finalized this file: `unkind | privacy | unrelated | other`. `REPORT_CATEGORIES` in `moderation/index.ts` matches these exactly (my own placeholder guesses were overwritten before commit — no drift). Still a plain freely-editable array, not a DB CHECK, per contract C, in case the set changes again.

**`blockedFamilyId` dual-resolution — a friction point found in ui-designer's landed spec, fixed proactively.** `### Visual` §1.3 has `ModerationMenu`'s row-level "Block the {name} family" item firing straight off an announcement/comment DTO's `authorId`, which is a **user id** (`toAnnouncementDTO`/`toCommentDTO`: `authorId: row.user_id`), not a family id — calling `POST /moderation/blocks` with that would 404 against a strict family-id-only lookup. `createBlock` now resolves `blockedFamilyId` against `families.id` first, falling back to `families.user_id` if that misses — same dual-lookup convention `family/index.ts`'s own `GET /family/:id` already established for exactly this ambiguity. The stored column is always the canonical family id regardless of which form was passed in; contract B's `{blockedFamilyId}` shape is unchanged, just more permissive about what identifies the target. Covered by a dedicated test. (The DM entry point doesn't have this problem — ui-designer's own spec routes DM-block through the family profile page first, where the family id is already loaded.)

**Assumptions / open items, flagged explicitly rather than silently decided:**
- **Historical vs. future comments** (unresolved Open Question, distinct from the resolved DM one): this migration hides **both** historical and future announcements/comments from a blocker uniformly via RLS. Rationale in the migration's own comment: the shipped AC text states no historical carve-out ("vanish from the feed/threads"), and — unlike DMs — there's no per-user read-state on comments to build a "future only" version against even if that were the goal. Flagging for tech-lead/qa in case product intent differs.
- `note` is capped at 1000 characters — ux-writer explicitly left this as "a backend/frontend schema decision I'm not presuming" (`### Microcopy`); frontend should mirror this exact limit for client-side validation/character-count UI.
- No local Postgres/pgTAP harness exists (same gap `admin/index.test.ts` already documents) — the RLS policies, including the two RESTRICTIVE ones this feature adds, are reviewed by hand (see the migration's own comments) and unit-tested only at the routing/validation layer via fake clients. Should be verified against a real/staging project before ship.
- `deno lint` surfaces pre-existing, repo-wide findings (`jsr:` import prefix, `Deno.serve(async...)` without an inner `await`) already present in untouched `admin/index.ts`/`coach/index.ts` — not introduced here, and `deno lint`/`deno test` aren't wired into `.github/workflows/ci.yml` today (only `npm run typecheck`/`npm test` at the workspace root, which don't touch `supabase/functions/`). Flagging as a gap for tech-lead, not fixing unilaterally (out of this feature's scope).

**Code-review risk checklist** (the five risks `### Code review`'s first pass flagged to re-check once code landed): client-derived `reporterId`/`blockerFamilyId` — never accepted, server-derived + RLS `WITH CHECK` defense-in-depth, tested. Client-side-only filtering — all four surfaces are server-side (RLS or query-level), with unit tests proving the query-level ones actually apply the exclusion. DM thread disappearing — explicitly does not; history stays, only new inbound hidden, matches the resolved OQ exactly. Coupled report/block — independent, tested. Category-wording drift — reconciled against ux-writer's landed table, zero drift.

### Frontend

**Shipped** (all under `frontend/src/`, per the anatomy in `### Visual` — component names match ui-designer's exactly):

- `api/moderation.ts` — Zod schemas (`ReportCategory`, `ReportTargetType`, `ReportDTO`, `BlockDTO`, `CreateReportInput`, `REPORT_NOTE_MAX_LENGTH = 1000`) + typed `edgeRequest` wrappers (`createReport`, `createBlock`, `listBlocks`, `deleteBlock`) + `moderationKeys`, matching `api/family.ts`/`api/announcements.ts`'s existing convention exactly.
- `features/moderation/` (new feature folder):
  - `hooks/useBlock.ts` — `useBlockedFamilies`, `useIsFamilyBlocked`, `useBlockFamilyMutation`, `useUnblockFamilyMutation`. All cache invalidation for "blocked content disappears reactively" lives here in one place: `moderationKeys.blocks`, `feedKeys.all` (prefix-matches feed page/byId/comments/byFamily in one call), `['community']`, `['search']`. DM query keys are deliberately **not** invalidated — the resolved Open Question keeps thread + history visible regardless of block state, so nothing about `messages` queries should change as a direct effect of a block.
  - `contentType.ts` — shared `{announcement→post, comment→comment, message→message}` display-word map (ux-writer's `{contentType}` convention), consumed by both `ModerationMenu` and `ReportModal` so the mapping isn't duplicated.
  - `components/ModerationMenu.tsx` — combines ui-designer's `ModerationMenuTrigger` + `ModerationMenu` anatomy into one disclosure component, the same shape as `Navbar`'s existing account-chip menu (outside-click closes, Escape closes **and returns focus to the trigger**, same as the header-nav-redesign precedent this dispatch pointed at). Kebab icon is a new `MoreIcon` in `components/icons.tsx` (3 dots, matches the file's existing SVG conventions). `aria-label="More actions"` (ui-designer's suggested safe default — `### Microcopy` doesn't fill this exact slot). Report item always renders; Block item is omitted for `targetType: 'message'` and when `authorId`/`authorName` is null (removed author) — both per `### Visual` §1.1/§1.3.
  - `components/ReportModal.tsx` — reuses `RequestPlaydateModal`'s dialog shell exactly (overlay, card, close button, sent-state content swap, `isSubmitting ? 'Sending...' : ...` label pattern). Category picker is a **native radiogroup** — a `<fieldset>`/`<legend>` of visually-hidden `<input type="radio">`s styled as pills via the same JS-computed-className pattern `ReactionBar` already uses for its active state — rather than a hand-rolled `role="radio"` widget. Deliberate: this gets correct APG keyboard behavior (arrow keys, single Tab stop into the group) from the platform for free instead of reimplementing it by hand. Flagging for a11y-auditor to confirm this satisfies `### Visual` §7's radiogroup ask even though the mechanism differs from what the anatomy literally describes. RHF + Zod (`category` required with ux-writer's exact `report.category.error.required` message, `note` optional and capped at 1000 both via `maxLength` and a mirrored Zod `.max()`). Submit stays disabled until a category is picked, with a `sr-only` hint wired through `aria-describedby` per the a11y flag on that state. Focus moves to the close button on mount; Escape closes; a minimal hand-rolled Tab-wrap focus trap is implemented (`### Visual` §3 notes `RequestPlaydateModal` itself has neither — worth retrofitting there too, not done here since that file isn't otherwise part of this feature).
  - `components/BlockedContentPlaceholder.tsx`, `components/BlockUndoStrip.tsx`, `components/FamilyProfileBlockControl.tsx`, `components/ThreadHeaderBlockedTag.tsx`, `components/BlockedThreadBanner.tsx` — built to the one-tap-plus-inline-undo interaction (no confirmation dialog), per ui-designer's decision 2 and this dispatch's explicit instruction.
- Wired into `features/feed/components/AnnouncementCard.tsx`, `features/feed/components/CommentList.tsx` (blocking swaps **every** comment by that author in the currently-rendered list, not just the row Block was fired from — tracked by author id, not comment id), `features/messages/components/MessageBubble.tsx` (hover/focus-revealed via opacity only, never `display:none`; report-only, no Block item), `pages/MessageThread.tsx` (`ThreadHeaderBlockedTag` + `BlockedThreadBanner`, Variant B — `MessageComposer` itself is untouched/still enabled), `pages/FamilyView.tsx` (`FamilyProfileBlockControl` next to "Message this family", gated on `!data.isOwner`). Also wired into `pages/AnnouncementDetail.tsx` (the single-post `/post/:id` view) — not explicitly named in the dispatch prompt's file list, but its own header is a second, independent action row on the same "announcement" the AC's literal "every announcement" wording covers, with no report/block affordance otherwise if someone reaches a post directly rather than via the feed.

**A contract gap found and fixed client-side** (a frontend adaptation, not a backend bug report): `createBlock`'s dual-resolution (`blockedFamilyId` accepts either a `families.id` or an owner's `auth.users.id`) is **not** mirrored by `deleteBlock` — confirmed by reading `supabase/functions/moderation/index.ts` directly: `DELETE /moderation/blocks/:blockedFamilyId` matches `blocked_family_id` literally, no fallback lookup. `ModerationMenu`'s row-level Block item only has a content DTO's `authorId` on hand (a **user** id, e.g. `AnnouncementDTO.authorId: row.user_id`) — calling a later Undo/unblock with that raw id would silently no-op (204, zero rows actually matched, family stays blocked). Fixed by having `ModerationMenu`'s `onBlocked` callback hand back `createBlock`'s own response `blockedFamilyId` (always the canonical, server-resolved family id) instead of the original `authorId`, and threading *that* value through `BlockedContentPlaceholder` / `CommentList`'s per-author block map for any later Undo call. `FamilyProfileBlockControl` never had this problem — it already operates in family-id space via `FamilyDTO.id`. Documented in `api/moderation.ts`'s and `useBlock.ts`'s doc comments so it isn't rediscovered the hard way.

**`authorName` bare-vs-formatted question — resolved.** `### Visual` §6 flagged not having verified whether `AnnouncementDTO`/`CommentDTO`/`MessageDTO`'s `authorName` is bare (matching `FamilyHeader`'s `family.name` convention) or pre-formatted. Checked directly against `supabase/functions/announcement/index.ts`: `toAnnouncementDTO`/`toCommentDTO` both set `authorName: author?.name ?? null`, i.e. `families.name`, bare — same convention as `FamilyHeader`. Every "{name} family" interpolation in this feature's components assumes a bare name accordingly. Side note for whoever touches these tests next: the pre-existing `AnnouncementCard.test.tsx`/`CommentList.test.tsx`/`tests/a11y.test.tsx` fixtures use already-prefixed-and-pluralized values (`"The Garcias"`, `"The Patels"`, `"The Lees"`) — harmless for what those specific tests assert, but not representative of a real DTO; my new tests reusing those same shared fixtures inherit the same quirk (e.g. the blocked-placeholder text in `AnnouncementCard.test.tsx` reads "...blocked the The Garcias family..." given the shared fixture — asserted as-is, not "fixed," since changing the shared `baseAnnouncement` const would ripple into unrelated pre-existing assertions).

**Block copy vs. the shipped interaction — reconciled, not silently dropped.** ux-writer's `### Microcopy` `#### Block` table is written for a confirmation-dialog flow (`block.confirm.title/.body/.cta/.cancel`), but ui-designer's ratified anatomy (§1.3, decision 2) and this dispatch's explicit instruction both require **one tap + inline undo, no dialog**. Reconciled by using ux-writer's exact strings everywhere they map onto the shipped shape — `block.trigger.profile` ("Block this family"), `block.trigger.post` ("Block {name}"), `block.success`, `block.error`, and the whole `profile.blocked.*`/`profile.unblock.*` table verbatim, including `profile.blocked.unblock.cta` = bare "Unblock" over `### Visual` §3's own placeholder assumption of "Unblock the {name} family" — and adapting where they don't fit: `block.confirm.body`'s pre-action consequences ("You won't see their posts... They won't be notified...") has no home once the confirm step is removed, so it's dropped rather than force-fit somewhere it wasn't written for. `block.success.viewProfile` ("View their profile"), written for a dialog's secondary action, is repurposed as `BlockedContentPlaceholder`'s durable link — the actual place someone who just blocked a family *from a post* (not from the profile) needs a path back to Unblock later, per `## Out of scope`'s "unblock only on the profile page" constraint. Flagging for design-lead/ux-writer sign-off alongside ui-designer's own already-flagged decision 2, not deciding unilaterally that this is the final word.

**Optimistic UI** (per `### Visual` §6's explicit ask): `FamilyProfileBlockControl`'s Block↔Unblock flip and its undo/unblock acknowledgments are driven by local `ack` state, not by waiting on the invalidated query's refetch. `ModerationMenu`'s row-blocking swap and `ReportModal`'s menu-close both happen on tap, before the mutation resolves.

**Screenshots — captured live against a real running app, not skipped.** This worktree has no real Supabase credentials (`frontend/.env` doesn't exist, only `.env.example` placeholders), so the ordinary login flow can't reach an authenticated route. Rather than skip the requirement, captured genuine Chromium-rendered screenshots: (1) a throwaway `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pair in a local `frontend/.env` (deleted immediately after, already `.gitignore`d so it was never at risk of being committed); (2) a one-off Playwright script (not committed) that fakes an already-valid Supabase session via `localStorage` — key `sb-localhost-auth-token`, matching `@supabase/supabase-js`'s own default `storageKey` derivation, confirmed by reading its source (`sb-${hostname.split('.')[0]}-auth-token`) rather than guessing — and intercepts every Edge Function route `FamilyView` touches; (3) `git stash` of only the tracked, modified source files (new/untracked moderation files were left in place but became unreferenced dead code once the modified files reverted) to reconstruct the true pre-change render for `before.png`, then `git stash pop` plus a second capture for `after.png`, same 1280×800 viewport and same seeded family/route both times. `docs/screenshots/moderation-report-block/{before,after}.png` — the only visible difference is the new "Block this family" button next to "Message this family."

**Not built (flagging, not silently skipping):**
- `dm.blocked.threadList.tag` (optional inbox-row "Blocked" tag) — ux-writer's own copy table marks it optional/"if ui-designer wants one there," and no component for it appears in ui-designer's component anatomy (only `ThreadHeaderBlockedTag` + `BlockedThreadBanner` are specced), so it wasn't added.
- The row-menu `BlockedContentPlaceholder`'s Undo shows its "Unblocked" acknowledgment as soon as the mutation resolves rather than holding a distinct durable beat first, unlike `FamilyProfileBlockControl`'s `BlockUndoStrip` (auto-dismiss timer). `### Visual` §3 describes the "brief acknowledgment, then reverts" behavior for both; implemented faithfully for the strip, close-but-not-identical for the placeholder.
- No shared `Modal`/`Dialog` extraction — `ReportModal` is now a second near-identical consumer of `RequestPlaydateModal`'s shell, crossing the threshold ui-designer's §6 flagged. Not extracted here, matching that section's own "not requesting it here" framing; a natural next step if a third consumer shows up.

**Tests:** 212/212 frontend tests pass, 42/42 files. New/changed this feature: `ModerationMenu.test.tsx`, `ReportModal.test.tsx`, `FamilyProfileBlockControl.test.tsx`, `BlockedContentPlaceholder.test.tsx`, `ThreadHeaderBlockedTag.test.tsx`, `BlockedThreadBanner.test.tsx`, `MessageBubble.test.tsx` (new — this component had no test file before), `MessageThread.test.tsx` (new — same), plus additions to `AnnouncementCard.test.tsx`/`CommentList.test.tsx`, plus a `handlers.moderationBlocksList([])` mock added to the 3 pre-existing `FamilyView.test.tsx` cases so `FamilyProfileBlockControl`'s new query doesn't leave them making an unhandled request. `frontend/src/tests/msw-server.ts` gained 4 new handler factories (`moderationBlocksList`/`moderationCreateBlock`/`moderationDeleteBlock`/`moderationCreateReport`) for qa-engineer/e2e-test-writer to reuse.

**Quality gates:** `npm run test:frontend` — 212/212 pass. `npm run typecheck --workspace frontend` — clean. `npm run build --workspace frontend` — clean (256KB JS / 74KB gzip).

**Open for qa-engineer / e2e-test-writer / a11y-auditor:**
- No Playwright e2e spec added under `frontend/e2e/` — that's e2e-test-writer's file per the org chart, not written here.
- The native-radio-input radiogroup and the hand-rolled `ReportModal` focus trap are both reasoned engineering choices (see above) but haven't been run through an actual screen reader or `axe-core` — worth a11y-auditor's pass specifically on this feature rather than assuming the reasoning holds.
- The `deleteBlock` dual-resolution gap documented above is a real, if narrow, correctness risk if any future call site passes a raw user id instead of a canonical family id to unblock — worth qa-engineer adding a regression test for the exact "block from a post, then Undo, then confirm truly unblocked" path if one doesn't already exist in `### Test plan`.

### Test plan
*(filled by qa-engineer)*

### Code review

**Summary.** No backend or frontend implementation code has landed on `feat/moderation-report-block` at the time of this review (2026-09-04, ~09:35, first pass of the parallel wave). `git diff master...HEAD` and `git status` in this worktree show zero changes under `backend/src/` or `frontend/src/` — no `reports`/`blocks` routes, tables, components, or Zod schemas exist yet. The only content in scope is (a) one pre-existing commit, `c98e27a` "chore(process): enforce async-state / cold-start checks," which is already merged on `origin/master` but not yet reflected in this worktree's local `master` ref (see note below — it is unrelated to this feature and predates it), and (b) the dispatcher's own bookkeeping (feature-file `status: drafting → building`, the `company.md` kanban card move, today's log stub). This is not a false negative: I completed the required reads, re-checked `git diff`/`git status` after an interval, checked for uncommitted/untracked files under `backend/src` and `frontend/src` (none, tracked or untracked), and confirmed no `.git/index.lock` (no commit in flight) before finalizing. **Verdict: nothing to review yet.** This subsection should be re-run once backend-dev/frontend-dev actually commit — a zero must-fix count here reflects absence of code, not a clean bill of health.

**Must-fix**
None — not applicable. No code exists yet to check against the standard checklist or the feature-specific risks named for this review (client-derived `reporterId`/`blockerFamilyId`, client-side-only blocked-family filtering, DM thread disappearing instead of staying visible per the resolved Open Question, coupled report/block actions, or category-wording drift between backend and ux-writer's microcopy). Watching for all five once code lands.

**Nice-to-have**
None — not applicable, same reason.

**Acceptance criteria spot-check**
- [ ] Report flow available on every announcement, comment, and DM (icon in the existing action row) — not assessable, no frontend code yet.
- [ ] Report categories short + foster-family-appropriate, ux-writer voice — not assessable; `### Microcopy` is also still a placeholder at review time.
- [ ] Reports persist `{reporterId, targetType, targetId, category, note?, createdAt}`, admin-queue-readable — not assessable, no backend route/schema/migration yet.
- [ ] Block flow available on the family profile page and from any post/comment by that family — not assessable, no frontend code yet.
- [ ] Blocked family invisible to blocker (feed/threads/DM-list/search) — not assessable yet, but flagging in advance: this bullet's literal "DMs vanish from the threads list" wording conflicts with the resolved Open Question (2026-07-08), which requires the thread + history to STAY visible to the blocker with only new inbound messages from the blocked family prevented. Implementation must follow the resolved OQ, not the literal AC text — will be must-fix if the thread is hidden/removed from the list.
- [ ] Block is one-way; blocked family not notified — not assessable, no backend code yet.
- [ ] Reporting and blocking are independent actions — not assessable, no backend code yet.

**Process note (not a code finding).** This worktree's local `refs/heads/master` is stale relative to `origin/master` — it's missing `c98e27a` (already merged via PR #72). Because `feat/moderation-report-block`'s tip *is* `c98e27a`, every `git diff master...HEAD` computed from this worktree will keep including that unrelated commit in scope until local `master` is updated (`git fetch && git branch -f master origin/master` from a checkout that isn't mid-feature, or equivalent). Doesn't block this feature, but worth a fetch before the next diff-based review so an unrelated commit doesn't get mistaken for in-scope changes.

## Design — Spec

### Visual

Scope: component anatomy + wireframe-level spec for the report modal, the block confirmation (profile + post/comment-by-family), the unblock affordance, and the DM-blocked-thread banner. No backend/frontend code exists yet on this branch (confirmed via `### Code review`), so this spec is written against the *current* shipped components (`AnnouncementCard.tsx`, `CommentList.tsx`, `MessageBubble.tsx`, `FamilyHeader.tsx`/`FamilyView.tsx`, `MessageThreadPage.tsx`) rather than against any in-flight frontend work.

**Three decisions made up front, stated before the anatomy so they aren't buried:**

1. **No `feedback.error`/`feedback.warning` anywhere in this feature's primary actions.** Report and Block are both framed (Problem statement, Launch copy) as calm, reviewed-by-people, non-punitive tools — not incident-response UI. Every primary/confirm button below uses `color.brand.primary.pressed` (this codebase's existing white-text-safe fill — see `FamilyHeader`'s "Edit page" button, `FamilyView`'s "Message this family" button, `RequestPlaydateModal`'s submit button, all already on `.pressed`). `feedback.error` is reserved for genuine failure states (a network error on submit) — same as `RequestPlaydateModal`'s `apiError` line — never for the report/block *topic* itself.
2. **Report and Block get deliberately different interaction weights, not a shared confirmation pattern.** Report needs real input (a category, an optional note) — a modal is the natural home. Block needs no new input; it's a reversible, silent, one-way toggle. The Problem statement's own success framing ("...block another family in **one tap** from their profile") is closer to a literal spec than flavor text, so Block ships as an immediate action + an inline undo affordance, not a confirmation dialog. See §5 for the full rationale and the tension this creates with a naive "everything consequential gets a confirm dialog" instinct.
3. **The dialog shell is reused, not reinvented.** `RequestPlaydateModal` (`frontend/src/pages/FamilyView.tsx`) is the only existing modal precedent in this codebase (`role="dialog" aria-modal="true"`, `bg-ink-lead/40` overlay, `max-w-md rounded-lg bg-surface-card shadow-lift p-6` card, top-right close control). `ReportModal` below reuses this shell exactly. See §6 for a flag that this is now the *third* modal-shaped consumer and worth extracting into a shared component.

#### 1. Component anatomy

**1.1 Action row addition — `ModerationMenuTrigger` + `ModerationMenu`**

One new icon-only control added to the existing right-hand action cluster on `AnnouncementCard` and `CommentList`, rendered only for content **not** authored by the viewer's own family (mirrors the existing `isAuthor` branch that today gates Edit/Delete — this is its else-branch, not a new condition). A kebab ("more"), not a permanently-visible flag icon — see §5.1 for why.

```
AnnouncementCard header, today:
┌───────────────────────────────────────────────────────────────────────┐
│ (Avatar) Anderson · 2h ago                                    [Open]  │  ← viewer (!isAuthor): nothing on the right but Open
│ (Avatar) Anderson · 2h ago                [Edit] [Delete]     [Open]  │  ← author: unchanged
└───────────────────────────────────────────────────────────────────────┘

AnnouncementCard header, after:
┌───────────────────────────────────────────────────────────────────────┐
│ (Avatar) Anderson · 2h ago                     (⋯)            [Open]  │  ← viewer: ModerationMenuTrigger added
│ (Avatar) Anderson · 2h ago                [Edit] [Delete]     [Open]  │  ← author: unchanged, untouched
└───────────────────────────────────────────────────────────────────────┘
```

`CommentList`'s `<li><header>` today renders literally nothing on the right for non-author comments (`{c.isAuthor && !isEditing && (...)}`  — no else branch) — same addition, same else-branch logic, no `[Open]` neighbor to worry about.

`ModerationMenu`, revealed panel anchored under the trigger:

```
        (⋯)  ← trigger, aria-expanded toggles
         └──────────────────────────┐
           │  Report                │  ← menuItem.report — always present
           │  Block the Andersons   │  ← menuItem.block — omitted if authorId/authorName is null
           └─────────────────────────┘   (removed-family content, per formatAuthor.ts) or if the
                                          row is a DM message (Block isn't specced for DMs — §9)
```
Panel: `color.surface.card` bg, `radius.8`, `shadow.lift`, `color.ink.lead` text, `12px`/`space.12` internal padding, each item full-width row with `color.surface.subtle` hover/focus fill (the reply-coach-ratified soft-pill treatment, not a new token).

**`MessageBubble` gap, flagged not silently patched:** unlike the other two, `MessageBubble.tsx` has no header/action-row at all today — just bubble + timestamp. Report still needs to reach individual DM messages (AC: "every announcement, comment, and DM"), so this is the first action affordance on that component, not a reuse of an existing row. To avoid a kebab sitting on every bubble in a long thread (noisy, works against the calm-tone mandate more than the feed case does), it's hover/focus-revealed:

```
Today:                              After (non-mine bubble only):
┌──────────────┐                    ┌──────────────┐(⋯) ← opacity-0 at rest,
│ message text │                    │ message text │      opacity-100 on
│ 10:32 AM     │                    │ 10:32 AM     │      hover/focus-within
└──────────────┘                    └──────────────┘      (same mechanism as
                                                             header-nav-redesign's
                                                             NavTrackItem tooltip)
```
`ModerationMenu` on a DM message has **only** `menuItem.report` — no Block item (Block is specced for "family profile page and from any post/comment by that family," not DMs; a user who wants to block someone they're DMing reaches it via the existing `Link to="/family/${userId}"` in `MessageThreadPage`'s header, then `FamilyProfileBlockControl` below).

**1.2 `ReportModal`**

Reuses the `RequestPlaydateModal` dialog shell. Three context-aware title variants (post/comment/message) — see §4 for the copy slots.

```
┌─ ReportModal ───────────────────────────────────────────────  (✕) ┐
│  Report this {post|comment|message}                                │  ← title
│                                                                     │
│  {category picker legend}                                          │  ← report.category.legend
│   ( category )  ( category )  ( category )                        │  ← role="radiogroup", wraps,
│   ( category )  ( category )                                       │    single-select
│                                                                     │
│  Add a note (optional)                                             │  ← report.note.label
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  {reassurance line — quiet, small}                                 │  ← report.reassurance (§4)
│                                                                     │
│                                          [ Cancel ]  [ Submit report ]│
└─────────────────────────────────────────────────────────────────┘

Post-submit (mirrors RequestPlaydateModal's `sent` boolean swap exactly):
┌─ ReportModal — confirmation state ─────────────────────────────── ┐
│                        Report received                             │  ← feedback.success text
│             {thank-you / what-happens-next line}                   │
│                             [ Done ]                                │
└─────────────────────────────────────────────────────────────────┘
```

Anatomy table:

| Part | Element | Notes |
|---|---|---|
| `modal.title` | `<h2>` | 3 variants (post/comment/message); Nunito 700. |
| `modal.close` | icon button, top-right | Reuses the existing `XIcon` component (`frontend/src/components/icons.tsx`) — `RequestPlaydateModal` predates it and uses a raw `&#x2715;` entity; new modals should use the real icon. `aria-label="Close"`. |
| `modal.categoryPicker` | `role="radiogroup"` of pill buttons | Reuses `ReactionBar`'s pill-toggle *visual* language (border, rounded-full, tinted active state) but **not** its `aria-pressed` semantics — this is a true single-select, needs `role="radio"` + `aria-checked` + full APG arrow-key nav (flagged for a11y-auditor in §7, since it's a real form control, unlike `ModerationMenu`'s deliberately-simplified disclosure). |
| `modal.categoryPicker` (selected state) | — | Every category uses the **same** tint on selection — `border-brand-primary bg-brand-primary/10 text-brand-primary` (`ReactionBar`'s `like` recipe) — regardless of which category. Deliberately not varying tint per category the way `ReactionBar` does per reaction type: no report category should read as "more serious" than another. |
| `modal.note` | `<textarea>`, optional | Reuses `RequestPlaydateModal`'s textarea treatment (`border border-[#EDE3D4]`, focus ring `brand-primary`). |
| `modal.reassurance` | `<p>` | `color.ink.muted`, small, Nunito 400 — same subordinate/footnote treatment as reply-coach's `chip.reasoning.body`. This is the named slot for the "reports go to our team, not the other family" line flagged in `### Launch copy` — ux-writer's call whether to use it verbatim. Optional small `ShieldIcon` prefix, not required. |
| `modal.actions.cancel` | text/ghost pill | Transparent, `ink-muted`, `surface.subtle` hover — reply-coach's secondary-pill pattern (see §5.3). |
| `modal.actions.submit` | primary pill | `brand-primary-pressed` fill, white text. **Disabled until exactly one category is selected** (note is optional, doesn't gate). Loading label swap mirrors `RequestPlaydateModal`'s `isSubmitting ? 'Sending...' : 'Send Request'` exactly. |
| `modal.confirmation` | swapped content | `feedback.success`-colored heading (mirrors `RequestPlaydateModal`'s "Request sent!" `text-feedback-success` treatment) + body + `Done` button that closes the modal. |
| `modal.error` | `role="alert"` | Same treatment as `RequestPlaydateModal`'s `apiError` line (`text-feedback-error text-sm`) — this is a legitimate use of the error token (a real failed request), distinct from decision 1 above (no error-red for the report *topic*). |

**1.3 `BlockAction` + `BlockUndoStrip` / `BlockedContentPlaceholder`**

One control, two presentation contexts (profile page vs. row-menu item), both firing the same immediate mutation with no confirmation dialog (see decision 2 above and §5.2).

*Profile-page context* (`FamilyView.tsx`, `!data.isOwner`):

```
┌─ FamilyView, not blocked ──────────────────────────────────────────┐
│  [ Message this family ]   ( Block this family )                    │
└──────────────────────────────────────────────────────────────────┘
   primary pill (unchanged)      secondary pill — BlockAction, new

→ tap (no dialog) → brief "Blocking…" disabled microstate → →

┌─ FamilyView, blocked ────────────────────────────────────────────────┐
│  [ Message this family ]*   ( Unblock the Anderson family )           │
│  You've blocked the Anderson family.  Undo                            │  ← BlockUndoStrip, transient
└────────────────────────────────────────────────────────────────────┘
  * fate of the Message button depends on the flagged DM-direction question — §7
```

*Row-menu context* (`ModerationMenu`'s `menuItem.block`): tapping it fires the same mutation immediately, closes the menu, and the **source row itself** becomes the confirmation — no separate strip, no toast:

```
┌─ AnnouncementCard/CommentList slot, in place of the blocked family's item ─┐
│  You've blocked the Anderson family — their posts are now hidden.  Undo    │
└────────────────────────────────────────────────────────────────────────┘
   BlockedContentPlaceholder — color.surface.subtle bg, radius.8, ink.muted text,
   "Undo" as a brand.primary text link (not a button pill — this is a link-weight action)
```

Ties the undo directly to what was just hidden (no ambiguity about "undo what," and no new floating-toast primitive needed). If left alone, the placeholder is simply gone on next load/refetch (blocked-family filtering takes over) — this placeholder only exists to bridge the *current* view's optimistic update.

**Copy clarity flag:** even when triggered from a single post's menu, this blocks the *family*, not that one post. `menuItem.block` and every copy slot around it must say "Block the {family} family" / "Block this family," never "Block this post" — a common real-world confusion point worth calling out explicitly for ux-writer.

**Edge case:** if `authorName`/`authorId` is null (`formatAuthor.ts`: "the family record has been removed"), `menuItem.block` is omitted entirely — nothing to persist a block against, no profile to route the confirmation/undo to. `menuItem.report` still renders; you can report content from a removed account.

**1.4 Family profile — `FamilyProfileBlockControl`**

Composition of `BlockAction` + a status read: the button itself *is* the status indicator (its label is "Block this family" or "Unblock the {name} family" — no separate badge needed on the button's own row). Positioned as the **secondary** action next to "Message this family," which stays primary-weighted. Uses the reply-coach-ratified secondary-pill treatment (transparent rest, `surface.subtle` hover, `ink.muted` text) — **not** `RequestPlaydateModal`'s older bordered-pill Cancel treatment (`border-[#EDE3D4]`). That pattern predates the reply-coach dispatch's design-lead-approved Option A resolution (2026-06-10, `### Visual` §5a in `[[features/reply-coach]]`) and hasn't been migrated; not something to replicate going forward.

**1.5 DM — `ThreadHeaderBlockedTag` + `BlockedThreadBanner`**

```
┌─ MessageThreadPage header ────────────────────────────────────────┐
│  ← All messages                                                    │
│  Conversation                                                      │
│  With The Andersons  ( Blocked )    ← ThreadHeaderBlockedTag, reuses │
└────────────────────────────────────────────────────────────────┘   FamilyHeader's kidCount-pill
                                                                       pattern verbatim (surface.card
                                                                       bg, shadow.lift, rounded-full)

│  (message history — completely unchanged; every bubble, both directions, renders exactly as today)
│  ...
```

Below the history, in place of (Variant A) or above (Variant B) `MessageComposer` — see §7 for why this forks:

```
Variant A — recommended, composer fully replaced:
┌────────────────────────────────────────────────────────────────┐
│  🛡  You've blocked the Anderson family. They can no longer       │
│      message you here. Manage this on their profile.              │
└────────────────────────────────────────────────────────────────┘

Variant B — fallback, if the blocker's own outbound stays open:
┌────────────────────────────────────────────────────────────────┐
│  🛡  New messages from the Anderson family won't reach you.       │
└────────────────────────────────────────────────────────────────┘
[ MessageComposer renders normally below, unchanged ]
```
(🛡 = existing `ShieldIcon`, `frontend/src/components/icons.tsx` — reused, not new.) Both variants: `color.surface.subtle` bg, `radius.8`, `ink.lead` text, `ink.muted`/`brand.primary` for the "their profile" link (routes to the existing `/family/${userId}` link already in this page's header). Deliberately **not** `feedback.warning`/`.error` — the whole point of the resolved Open Question ("must NOT read as deleted or gone") is that this is a calm status note, not an alert. B is never shown to the blocked family (B) — per AC, "the blocked family is not notified," so B's own composer/UI shows nothing different.

#### 2. Token usage

| Token | Applies to | Note |
|---|---|---|
| `color.surface.card` | `ModerationMenu` panel, `ReportModal`/dialog bg, `ThreadHeaderBlockedTag` pill bg | |
| `color.surface.subtle` | `ModerationMenu` item hover, `ReportModal` secondary-button hover, `BlockAction` secondary-button hover, `BlockedContentPlaceholder` bg, `BlockedThreadBanner` bg | Reused wholesale — zero new tokens needed for any of this feature's "quiet fill" surfaces. |
| `color.ink.lead` | menu/modal body text, banner text | |
| `color.ink.muted` | `report.reassurance`, `BlockUndoStrip`/`BlockedContentPlaceholder` body text, secondary-button label | |
| `color.brand.primary` | selected category pill tint (`/10` opacity + border), "Undo" link text | Non-text-bearing / link-weight uses only, per the token's own documented constraint. |
| `color.brand.primary.pressed` | `modal.actions.submit`, `FamilyHeader`-style filled buttons if any are reused | White-text-safe fill, matching every existing filled-CTA instance in this codebase. |
| `color.feedback.success` | `ReportModal` confirmation heading | Mirrors `RequestPlaydateModal`'s "Request sent!" treatment exactly. |
| `color.feedback.error` | `ReportModal`/`BlockAction` network-failure line only | Real errors only — never the report/block topic itself (decision 1). |
| `radius.8` | `ModerationMenu` panel, `BlockedContentPlaceholder`, `BlockedThreadBanner` | |
| `radius.16` (`radius.lg`) | `ReportModal` card | Matches `RequestPlaydateModal`'s `rounded-lg`. |
| `radius.9999` | all pill buttons (menu trigger's hit-circle, category pills, action pills) | |
| `shadow.lift` | `ModerationMenu` panel, `ReportModal` card | The system's only shadow token; no `shadow.heavy` used, per charter. |
| `size.hitTarget.min` (44px) | `ModerationMenuTrigger` | Icon-only control, independent of its ~20px glyph — exact same application as `NavTrackItem` in `[[features/header-nav-redesign]]`. |
| space scale (`4/8/12/16`) | internal padding/gaps throughout | Written as explicit px values below, not Tailwind class-suffix numbers — see the notation-drift note `[[features/header-nav-redesign]]`'s `### Frontend` flagged (`px-8` ambiguity); avoiding a repeat here. |

**Zero new color tokens proposed.** Every surface in this feature is a reuse of an already-ratified token, which is itself evidence for decision 1 (the palette already has everything needed for a calm, non-alarming surface — nothing here needed to reach for warning/error colors).

**New icon needed (not a design token, but new shared visual vocabulary):** `MoreIcon` — three horizontal dots, kebab-style, following `icons.tsx`'s existing conventions exactly (24×24 viewBox, `stroke="currentColor"`, `strokeWidth={2}`, `strokeLinecap/Linejoin="round"`). No SVG path specified here — frontend-dev's to draw, matching the existing file's style.

#### 3. States

*`ModerationMenuTrigger`*
- default — 44×44 hit target, transparent fill, `ink-muted` icon at ~20px.
- hover — `surface.subtle` fill, `ink-lead` icon (same recipe as `NavTrackItem`'s inactive hover).
- focus — `:focus-visible` ring, tooltip becomes visible (same mechanism as header-nav-redesign's `Tooltip`, including its `aria-hidden` + `group-hover`/`group-focus-visible` opacity reveal — and the same testing gotcha: `toBeVisible()` doesn't detect an `opacity` change; use `toHaveCSS('opacity', ...)` per that feature's `### E2E coverage` notes).
- expanded (`aria-expanded="true"`) — persists the hover/focus fill while `ModerationMenu` is open.
- disabled — n/a; always available on eligible (non-own, non-removed-author) content.
- loading/empty/error — n/a to the trigger itself.

*`ModerationMenu`*
- default — unmounted when closed (no layout reservation), same as header-nav-redesign's `Tooltip`.
- open — panel mounted, `menuItem.report` always present, `menuItem.block` conditionally present (§1.1, §1.3 edge case).
- item hover/focus — `surface.subtle` row fill.
- Escape — closes, **returns focus to the trigger** (bake this in from the start; this exact gap was a Blocking a11y finding on `AccountChip` in header-nav-redesign and had to be patched in after the fact — no reason to repeat that here).
- disabled/loading/empty/error — n/a; static, always-available options.

*`ReportModal`*
- default (unopened) — n/a.
- open — focus moves into the dialog on mount (`modal.close` or first category pill); full focus trap. Flagging for a11y-auditor: `RequestPlaydateModal`, the shell this reuses, doesn't visibly implement a trap or return-focus-on-close in what's shipped today — worth auditing both the new modal and retrofitting the old one, not just the new one.
- category selected — `modal.actions.submit` enables.
- submitting — `modal.actions.submit` disabled, label swaps to a loading state (mirrors `RequestPlaydateModal`'s `isSubmitting` pattern).
- confirmation — content swap, `Done` closes and returns focus to whatever opened the modal (the row, or the menu trigger).
- error — `role="alert"` line, form stays populated (nothing lost on a failed submit).
- disabled (category picker, pre-selection) — n/a; no item starts disabled, just unselected.

*`BlockAction`*
- default — "Block this family" (profile) / "Block the {name} family" (menu item), secondary pill.
- pending — disabled, "Blocking…" label, mirrors `del.isPending`'s disabled-during-mutation pattern already used for Delete.
- blocked — "Unblock the {name} family," same secondary weight (unblocking is also a considered action, not down-weighted further).
- unblocking (pending) — disabled, "Unblocking…" label.
- error — inline `feedback.error` line near the button (mutation failed; button returns to its pre-tap state, nothing silently left in a half-blocked visual state).
- loading (initial fetch of block status)/empty — n/a; the profile query this rides on already has its own loading/error handling in `FamilyView.tsx`.

*`BlockUndoStrip` / `BlockedContentPlaceholder`*
- default — appears immediately on successful block (profile: transient strip, ~6–8s or until navigation; row: persists in place until the current view is left/refetched).
- "Undo" tapped — reverses the block, strip/placeholder shows a brief "Unblocked" acknowledgment, then the original content/button state returns.
- untouched — auto-dismisses (strip) or persists as the durable record (placeholder), no further action needed — durability itself lives in the button's own "Unblock" state on the profile page, not in this transient affordance (v1 has no block-list screen, so the profile page is the only permanent record).
- disabled/loading/error — n/a; this is a passive confirmation, not an interactive form.

*`ThreadHeaderBlockedTag`*
- default — renders only when the thread partner is blocked; otherwise absent entirely (not a hidden/empty variant, just not in the tree — matches `UnreadBadge`'s "0 unread → doesn't render" precedent).
- no hover/focus/disabled — not interactive, informational pill only.

*`BlockedThreadBanner`*
- Variant A (composer replaced) / Variant B (composer stays) — see §7, genuinely unresolved.
- default — renders only when the partner is blocked; the history above it is always rendered normally regardless (per the resolved Open Question).
- no loading/empty/error of its own — derives from the same query that already loads the thread/partner data.

#### 4. Copy slots for ux-writer

Anatomy names the slot; ux-writer owns every string. Flagging explicitly: the `report.reassurance` slot is where the Launch-copy proposal ("Reports go to our team, not the other family — we review every one.") would land if picked up — not claimed here, just reserved.

| Slot | Where | Notes |
|---|---|---|
| `moderation.trigger.ariaLabel` | `ModerationMenuTrigger` `aria-label` + tooltip | "More actions" is a safe default; a more specific label ("Report or block") is also viable given there are only ever 1–2 items behind it — ux-writer's call. |
| `moderation.menu.report` | `menuItem.report` | |
| `moderation.menu.block` | `menuItem.block` | Must read as blocking the *family*, not the post — §1.3 flag. |
| `report.modal.title.post` / `.comment` / `.message` | `modal.title` | 3 context variants. |
| `report.category.legend` | `modal.categoryPicker` group label | e.g. "Why are you reporting this?" — placeholder only. |
| `report.category.*` | individual category pills | Count/wording is ux-writer's open question (flagged in the feature file's `## Open questions`); anatomy above assumes a plausible 4–6 option range for wrap layout only — adjust if the real count differs materially. |
| `report.note.label` / `.placeholder` | `modal.note` | |
| `report.reassurance` | `modal.reassurance` | See flag above. |
| `report.actions.cancel` / `.submit` / `.submitting` | `modal.actions` | |
| `report.confirmation.title` / `.body` / `.done` | `modal.confirmation` | |
| `block.action.default` / `.pending` / `.blocked` / `.unblocking` | `BlockAction` label states | Needs `{family name}` interpolation — see data-flow flag in §7. |
| `block.undo.strip` | `BlockUndoStrip` body + "Undo" link | |
| `block.placeholder.body` | `BlockedContentPlaceholder` body + "Undo" link | |
| `dm.blocked.tag` | `ThreadHeaderBlockedTag` | e.g. "Blocked." |
| `dm.blocked.banner.variantA` / `.variantB` | `BlockedThreadBanner` | Both written, only one ships — depends on §7's open question. |

#### 5. Flagged decisions for design-lead

1. **Kebab menu over a persistent Report icon.** A permanently-visible flag-style icon on every single post/comment/message, for every viewer, at all times, reads as more ambient-alarming for a warm community than a neutral "more options" affordance that doesn't editorialize about what's inside. Costs roughly one extra tap versus a literal reading of the Problem statement's "two taps," traded deliberately for tone. Flagging for sign-off rather than silently drifting from the stated framing.
2. **Block ships with no confirmation dialog.** The Problem statement's "one tap... from their profile" is treated as closer to a real constraint than flavor text. A `BlockConfirmDialog` variant was considered and rejected in favor of immediate-action + inline undo; if design-lead prefers the heavier gated pattern instead, it's a one-component swap (`BlockAction`'s tap handler opens a confirm dialog instead of firing directly) rather than a structural change to the rest of this spec.
3. **Secondary-pill precedent conflict, pre-existing, not introduced here.** `RequestPlaydateModal`'s bordered Cancel pill (`border-[#EDE3D4]`) and reply-coach's transparent + `surface.subtle`-hover pill are two different "secondary button" treatments currently live in the codebase. This spec follows the newer, design-lead-ratified one throughout. Worth a design-lead call on formally deprecating the older pattern now that a third and fourth consumer (`ReportModal`'s Cancel, `BlockAction`) are about to ship against the newer one.
4. **Category-picker semantics diverge from `ModerationMenu`'s.** The category picker is a real form control (`radiogroup`, full APG keyboard support expected) where `ModerationMenu` is a deliberately simplified static disclosure (no roving tabindex, matching `AccountChip`'s precedent). Both are correct for what they are — flagging so the difference reads as intentional, not inconsistent, if audited side-by-side.

#### 6. Handoff — frontend-dev

- **Genuinely open contract question, not a visual-only decision:** does the blocker's own composer stay usable in a thread with a blocked family, or does blocking fully close the channel both ways? The resolved Open Question in this feature file only states that the *blocked* family's new messages are prevented — it's silent on the *blocker's* own outbound. This determines which `BlockedThreadBanner` variant ships (§1.5) and whether "Message this family" stays visible on the blocked family's profile. Recommending Variant A (composer fully replaced, both directions closed) as the calmer, simpler default absent other input — flagging for backend-dev/tech-lead to confirm during aggregation rather than picking silently.
- **Optimistic UI is load-bearing here, not a nice-to-have.** The Problem statement's "immediate effects" requirement means `BlockedContentPlaceholder`'s swap-in, the profile button's Block→Unblock flip, and `ModerationMenu` closing on selection should all feel instant — don't gate any of them on a refetch round-trip.
- **Family-name interpolation:** `FamilyHeader.tsx` already correctly separates `family.name` (bare, e.g. "Anderson") from its own "The {name} family" construction — this is *not* the same bug header-nav-redesign hit (`AuthUser.name` had no separate field at all). But `AnnouncementDTO`/`CommentDTO`/`MessageDTO` as currently shipped only expose `authorName`/`authorId` (verified by reading `AnnouncementCard.tsx`/`CommentList.tsx`/`MessageBubble.tsx`) — confirm whether `authorName` is already the bare family name or something else before wiring `block.action.*`'s interpolation; this spec assumes it matches `FamilyHeader`'s convention but hasn't verified it against a live DTO.
- **Modal-shell extraction opportunity.** `RequestPlaydateModal` is the only existing modal precedent; `ReportModal` is a second, near-identical consumer (overlay + card + close button + form/confirmation swap). If design-lead's §5.2 disposition brings back a `BlockConfirmDialog` too, that's a third. Worth extracting a shared `Modal`/`Dialog` component at that point — not requesting it here, just flagging the threshold.

#### 7. Handoff — a11y-auditor

- Full focus-order spec for `ModerationMenu`: trigger → (open) → menu items in DOM order → Escape returns focus to trigger. Stated as a requirement from the start this time (§3), not left to be caught after the fact the way `AccountChip`'s equivalent gap was in header-nav-redesign.
- `ReportModal` needs a genuine focus trap + return-focus-to-opener-on-close. Flagging that `RequestPlaydateModal` (the shell being reused) doesn't visibly implement either in what's currently shipped — worth auditing both together rather than only the new instance.
- Category `radiogroup` needs full APG support (arrow keys, Home/End, single `Tab` stop into the group) — contrast this deliberately against `ModerationMenu`'s simplified disclosure (§5.4) so the difference doesn't read as an oversight.
- `modal.actions.submit`'s disabled-until-category-selected state should carry a reason accessible to AT users (e.g. `aria-describedby` on the legend/hint), not just a visual disabled look.
- `MessageBubble`'s hover-revealed trigger must stay keyboard-reachable (opacity-based reveal via `group-focus-within`, never `display:none`) — same pattern, and same `toBeVisible()`-vs-`opacity` testing gotcha, as header-nav-redesign's `Tooltip` (§3 note above) — flagging proactively rather than letting it get rediscovered.
- `BlockedContentPlaceholder` replaces content in a list without a page navigation — worth a call on whether a live-region announcement is warranted; not mandating a mechanism here, just flagging the question.

#### 8. Not designed here (out of scope, matching the feature file)

- Admin moderation queue UI.
- A block-list management screen — `FamilyProfileBlockControl` on the family's own profile page is the only unblock surface in v1, per this feature's explicit scope.
- Reporting a family directly (as opposed to a specific post/comment/DM) — `ModerationMenu` never appears on the family profile page itself; only `FamilyProfileBlockControl` does.
- A generic app-wide Toast/snackbar system — deliberately not introduced; this spec reuses the existing modal-swap (`RequestPlaydateModal`'s `sent` pattern) and adds one small inline-strip pattern (`BlockUndoStrip`) instead of a new global primitive.
- A DM-specific Block entry point — intentionally absent. Per the acceptance criteria's literal scope, blocking a family you're DMing happens by following the existing `/family/${userId}` link to their profile, then using `FamilyProfileBlockControl`.

### Microcopy

Report and block are meant to feel like quiet, low-drama tools — not a confrontation and not a courtroom. That shows up most in what these strings deliberately don't say: no accusatory language, no legal/clinical terms, no promise of urgency the v1 admin queue can't back up (it doesn't exist yet — [[features/moderation-report-block]] `## Out of scope`).

#### Category taxonomy — reasoning

The acceptance criteria rule out generic "spam / abuse / other" and ask for something short and foster-family-appropriate; one of the open questions asks where that lands between vague-enough-to-be-safe and specific-enough-to-be-useful-to-an-admin. My read: those two goals don't actually compete for the same real estate.

**The label a reporter taps stays vague on purpose** — plain, low-stakes, descriptive of what happened rather than a legal/clinical judgment call ("unkind," not "harassment"; "shares private details," not "privacy violation" or anything endangerment-adjacent). Handing a reporter a clinical/legal category the platform can't yet act on urgently would overpromise — it implies the tap triggers a response process that doesn't exist in v1 (no admin queue UI). **The specificity instead lives in the description in the third column below** — precise enough for an admin to triage against once the queue exists, and written so it can double as reporter-facing helper copy under each option if `ui-designer` wants it surfaced there (one string serving both audiences, not two written separately).

Four categories, not three and not six. Three do distinct, non-overlapping work; the fourth is a genuine catch-all so a report never gets forced into the wrong bucket just because the list ran out.

- `privacy` is the one category this specific community needs that a generic platform taxonomy wouldn't have. Foster-care confidentiality — a child's identity, case details, placement history — is a real and distinct axis of harm here, separate from tone. This is the clearest evidence the taxonomy is tailored, not generic.
- I deliberately left out a fifth "harassment / unwanted contact" category. Block already exists as the tool for an ongoing pattern of unwanted contact, and folding that into report would blur a line the acceptance criteria draw on purpose ("reporting and blocking are independent actions"). A single bad DM is `unkind` or `other`; a pattern of them is what block is for — report flags a piece of content, it doesn't manage a relationship.

**Stored values** (for backend-dev's `category` enum/Zod schema — the placeholder list this table reconciles against): `unkind` | `privacy` | `unrelated` | `other`. Single lowercase words, matching this codebase's existing enum convention (`ReactionType`: `like` / `love` / `hug` / `celebrate` / `support`; `CoachVerdict`: `ok` / `suggest` — see `backend/src/schemas/`). Deliberately not `spam` or `abuse` as *keys* either, not just as labels — keeping the internal vocabulary consistent with the softened taxonomy end to end.

| key | string | notes |
|---|---|---|
| `report.category.unkind` | Unkind or judgmental | Stored value `unkind`. Admin/reporter description: harsh, shaming, or dismissive tone about another family's fostering or parenting choices. Covers the "low-grade interpersonal friction" the Problem statement names as the core motivating case. |
| `report.category.privacy` | Shares private details | Stored value `privacy`. Admin/reporter description: identifying info about a child, case, or family situation that shouldn't be public. Foster-specific — see reasoning above. |
| `report.category.unrelated` | Doesn't belong here | Stored value `unrelated`. Admin/reporter description: off-topic, promotional, or unrelated to the community. Replaces generic "spam" with the impact rather than the mechanism. |
| `report.category.other` | Something else | Stored value `other`. Admin/reporter description: doesn't fit the other three — the optional note is the real signal on this one. |

#### Report

Covers the trigger icon (announcement/comment/DM action row), the report sheet, and its outcomes. `{contentType}` = `post` \| `comment` \| `message` — "post" matches the existing colloquial precedent (`announcement.forbidden`: "Only the author can change or delete this **post**." in [[features/announcements-feed]]) even though the data model and `targetType` say `announcement`; "message" matches the existing CTA precedent in the voice-rules skill ("Send a message"). DMs report at the individual-message level, the same granularity as a single comment. This `{contentType}` word is a display-layer concern only, decoupled from whatever literal `targetType` string backend-dev persists — frontend-dev maps one to the other at render time.

| key | string | notes |
|---|---|---|
| `report.trigger.aria` | Report this {contentType} | Maps to the icon-only trigger's `aria-label` in the existing action row (icon choice is `ui-designer`'s call — a flag glyph is the common pattern). Explicit content type rather than a bare "Report," since a screen-reader user may tab to the icon without having tracked the surrounding post/comment context first. |
| `report.sheet.title` | Report this {contentType} | Same string and substitution as the trigger; visible heading this time, not an `aria-label`. |
| `report.sheet.reassurance` | Reports go to our team, not to the other family — we review every one. | Adopted verbatim from marketing-lead's proposal in `### Launch copy`. Checked against Voice & Tone: plural "we," active voice, warm, no exclamation — passes as written, no edits needed. Placed directly under the sheet title, before the category list, since that's the moment hesitation ("will this start a confrontation?") is highest. I did **not** reuse or adapt this line for the block-confirmation dialog — see `#### Block` notes for why. |
| `report.category.label` | What's the issue? | Heading above the category list (table above). |
| `report.category.error.required` | Choose a category to continue. | Field-level validation error if Send is pressed with nothing selected — per the project's forms rule (field-level errors, not just form-level). |
| `report.note.label` | Add a note (optional) | Label for the free-text field. Character cap, if any, is a backend/frontend schema decision I'm not presuming here — the `note?` field in the persisted shape is already optional per the acceptance criteria. |
| `report.note.placeholder` | Anything that would help us understand what happened. | Placeholder only — doesn't replace the explicit label above. |
| `report.submit` | Send report | Primary pill CTA. "Send," not "Submit" — matches the imperative-CTA voice rule's own example ("Send a message"). Written to work whether `ui-designer` treats a category tap as instantly submitting the fast/no-note path (in which case this CTA governs only the "add a note" expanded state) or keeps an explicit send step for every path — either way this is the terminal action's label. |
| `report.cancel` | Cancel | Closes the sheet without sending. |
| `dialog.close.aria` | Close | Shared `aria-label` for a dismiss/X icon — reusable across the report sheet and the block-confirmation dialog rather than duplicated per surface. |
| `report.success` | Report sent — our team will take a look. | Echoes `report.sheet.reassurance`'s "our team" language so the promise made before sending is the one kept after. Em-dash confirmation pattern matches `family.save.success` / existing precedent. |
| `report.error` | We couldn't send that. Try again? | Mirrors `family.save.error` ("We couldn't save that. Try again?") verbatim in shape — same pattern, different verb, for a consistent error voice app-wide. |

#### Block

`{name}` matches the existing interpolation variable from `family.title.other` ("The {name} family") rather than introducing a new one.

| key | string | notes |
|---|---|---|
| `block.trigger.profile` | Block this family | Button on the family's own profile page. "This family" is unambiguous there — matches the acceptance criteria's "one tap from their profile." |
| `block.trigger.post` | Block {name} | Menu item in a post/comment's action row (plausibly the same overflow menu as report, since the acceptance criteria don't require block to have its own dedicated icon there the way report does). Explicit `{name}` here because a comment thread can hold contributions from multiple families — "this family" would be ambiguous outside the profile page. |
| `block.confirm.title` | Block the {name} family? | Confirmation dialog. Shared verbatim regardless of entry point — the action and its consequences are identical whether triggered from the profile or from a post/comment; only the *trigger* copy differs by context, not the confirmation. |
| `block.confirm.body` | You won't see their posts, comments, or messages. They won't be notified. You can unblock them any time from their profile. | Three short sentences, one idea each. The two reassurances doing the real work: no confrontation (not notified) and no permanence (reversible). This is this surface's version of marketing-lead's "reviewed by people, not a punishment system" goal — adapted, not reused verbatim, because nothing here is reviewed by anyone; block is instant and self-directed, so borrowing report's "we review every one" framing would be inaccurate on this surface. |
| `block.confirm.cta` | Block family | Primary pill CTA inside the confirmation dialog. |
| `block.confirm.cancel` | Cancel | |
| `block.success` | Blocked — you won't see the {name} family anymore. | |
| `block.success.viewProfile` | View their profile | Secondary action alongside the success confirmation. This is the only discoverability path to Unblock in v1 per `## Out of scope` ("v1 surfaces unblock only on the previously-blocked family's profile, which the blocker can navigate to via the block UI confirmation"). |
| `block.error` | We couldn't block that family. Try again? | Same error-voice pattern as `report.error` / `family.save.error`. |

#### Unblock (blocked-family profile state)

Where the family's profile page renders differently once you've blocked them — reached via `block.success.viewProfile`.

| key | string | notes |
|---|---|---|
| `profile.blocked.banner` | You've blocked the {name} family. | Replaces the normal profile chrome for the blocker's own view of this family. |
| `profile.blocked.helper` | They can't see your posts or message you. You won't see theirs. | Two short sentences — a reminder for someone revisiting this profile a while after blocking. |
| `profile.blocked.unblock.cta` | Unblock | Single tap, no confirmation dialog. Mirrors the low-friction spirit the acceptance criteria set for block itself ("one tap"), and the risk is symmetric either direction — re-blocking is just as cheap as unblocking, so a confirmation step here would be friction without a matching safety benefit. |
| `profile.unblock.success` | Unblocked — the {name} family can see your posts and message you again. | |
| `profile.unblock.error` | We couldn't unblock that family. Try again? | Same error-voice pattern. |

#### DM — blocked-thread banner

Per the resolved open question (2026-07-08): thread and message history stay visible to the blocker; only new incoming messages from the blocked family are prevented going forward. This needs to read as "you've limited this conversation," not "this conversation is gone."

| key | string | notes |
|---|---|---|
| `dm.blocked.banner.title` | You've limited this conversation with the {name} family. | Leads with what changed (voice rule: lead with what changed for the user, not the mechanism). "Limited," not "ended" or "blocked" — keeps the frame on the conversation continuing in reduced form, not disappearing. |
| `dm.blocked.banner.body` | Your message history stays here. You just won't get new messages from them. | Reassurance first (directly answers "is this thread gone?"), then the actual change. Matches the resolved open question exactly: only new *incoming* messages from the blocked family are stopped — this does not claim the blocker's own outgoing is affected, since nothing in the feature asks for that. |
| `dm.blocked.threadList.tag` | Blocked | Optional — a small inline tag on the thread row in the inbox list, if `ui-designer` wants one there. Not required by the acceptance criteria; included so the copy already exists if the visual spec calls for it. |

#### Empty/error states not otherwise covered

No list-style empty state applies in this feature: the admin moderation queue and the block-list management screen are both `## Out of scope`, so there's no user-facing list surface that could render empty. Every error state that does apply (report send, block, unblock) is covered above, each following the same "We couldn't ___ that. Try again?" pattern for a consistent error voice across the three actions.

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy

**Framing:** trust & safety, not growth — this copy is written to reassure, not to sell. No new public/marketing page exists or is proposed for report/block: both are in-app, authenticated-only actions a logged-out visitor never encounters.

**Release note** (internal changelog — 78 words)

> Your comfort in this community matters, so we've built two new tools: report and block. Report any post, comment, or DM in two taps — it goes straight to our team, no confrontation required. Block a family in one tap, from their profile or any of their posts: their content stops appearing — feed, threads, new messages — and they're excluded from search. Past conversations stay in your inbox; they're not notified. Reporting and blocking are independent — neither triggers the other.

**Social post** — Not written, by design. A public/social announcement puts a spotlight on moderation tooling for a platform serving foster families; that reads as either alarming ("something happened here") or glib ("now you can block people!") for a feature whose whole point is quiet, low-drama care. Recommend skipping rather than writing a softened version — flagging for marketing-lead to confirm rather than deciding unilaterally.

**Email subject + first line** — Not written. No email touchpoint in the acceptance criteria: report confirmation is in-app only, and blocks are silent by design (the blocked family is not notified). Nothing in this feature should trigger an email send.

**Landing-page block** — Not written. No public page exists or is warranted — report/block are authenticated-only, in-app surfaces; a logged-out visitor never sees them, so there's no landing surface to write for.

**Proposal, not copy** (flagging for ux-writer/design — not requesting, not claiming the section): a short in-app "Community guidelines" line near the report-category picker and the block-confirmation dialog could reinforce that these tools are reviewed by people, not a punishment system. Rough idea only, for whoever picks this up: *"Reports go to our team, not to the other family — we review every one."* This belongs in `### Microcopy` if it goes anywhere.

### SEO

**N/A in v1.** Report and block are in-app, authenticated-only actions — an icon added to the existing action row on announcements/comments/DMs, and buttons on the existing family profile page. No new route, public or authenticated, is introduced; the entire surface lives inside views that already exist (feed, thread, DM list, family profile). Documented explicitly, per role convention, rather than left blank.

**Route audit (why N/A):**
- Report: icon in the *existing* action row on announcements, comments, and DMs — acceptance criteria explicitly says "not a new surface."
- Block: button on the *existing* family profile page, plus from post/comment action rows.
- The visibility effects of a block (feed/thread/DM-list/search filtering) change *data returned to* existing authenticated routes; they don't create new ones.
- Out of scope items (admin moderation queue UI, block-list management screen) would themselves be authenticated-only if/when built — neither introduces a public route either.

**Fields (per role checklist, all N/A):**
- `title`: N/A — no page.
- `meta.description`: N/A — no page.
- `og.{title, description, image, type, url}`: N/A — nothing to share; no OG image needed.
- `twitter.{card, title, description, image}`: N/A.
- `schema`: N/A — no JSON-LD; no page exists to attach Article/Organization/Person schema to.
- `sitemap`: no entry added; `public/sitemap.xml` unchanged.

**Authenticated-views flag:** every surface this feature touches (feed, thread, DM list, family profile) is already `noindex` by standing convention; this feature only adds/removes actions and rows within that surface, it doesn't change indexability posture.

**Fast-follow worth flagging (out of scope for this dispatch):** a public `/help/trust-and-safety` (or `/help/reporting`) explainer — what report/block do, response-time expectations, how to reach an admin for anything they don't cover — would be a reasonable indexable page for prospective foster families vetting the platform, and the kind of page some partner-org/app-store review processes expect. Not specced here (no title/meta/schema drafted); if marketing-lead wants to pursue it, it should get its own feature file rather than ride along on this one.

### Growth
*(filled by growth-analyst)*
