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

**Post-audit fixes** (2026-09-05, responding to a11y-auditor's 3 blocking findings in `### Accessibility` above — on top of `182e6f6`, not a rebuild):

1. **Contrast (1.4.3).** Swapped the 3 flagged literal-text `text-brand-primary` sites to `text-ink-lead`, exactly as a11y-auditor verified: the selected-category label in `ReportModal.tsx` (kept `border-brand-primary`/`bg-brand-primary/10` — only the *text* use was failing; borders pass 1.4.11), `BlockUndoStrip.tsx`'s "Undo" link, and `BlockedContentPlaceholder.tsx`'s "Undo"/"View their profile" links. No new token — `ink.lead` was already used elsewhere in all three files. Did not try `.pressed` (the audit's own per-background math shows it still fails on `surface.subtle` and the category pill's tint) and did not touch `ReactionBar.tsx`'s "like" label, which the audit flagged as a *plausible* pre-existing instance of the identical bug but explicitly out of this audit's scope.
2. **Keyboard focus loss.** Traced the same chain a11y-auditor traced: `ModerationMenu`'s Block menuitem unmounts on click, and once the mutation resolves, the entire row is replaced by `BlockedContentPlaceholder` in all three callers (`AnnouncementCard.tsx`, `CommentList.tsx`, `AnnouncementDetail.tsx`) — there's no original DOM node left to hand focus back to. Fixed once, at the shared landing point, rather than in each of the three callers: `BlockedContentPlaceholder`'s container is now `tabIndex={-1}` and calls `.focus()` on mount, the same programmatic-focus-target convention this codebase already uses in `Layout.tsx`'s `<main id="main" tabIndex={-1}>` / `useFocusMainOnRouteChange`. `FamilyProfileBlockControl` left untouched, as instructed — confirmed it never had this bug (same `<button>` node before and after).
3. **Missing status announcement.** Added `role="status"` to `ReportModal.tsx`'s confirmation container, matching `BlockUndoStrip` / `BlockedContentPlaceholder` / `FamilyProfileBlockControl`'s unblock-ack one-to-one — the exact fix a11y-auditor's own "Fix:" line specified. Deliberately scoped to just that: did not additionally move DOM focus onto the confirmation, since (a) a `role="status"` live region is announced by AT without needing focus, which is the substance of "no reliable way to learn it succeeded," and (b) the sibling confirmations this now matches don't move focus either (they mount beside an already-focused, still-present button). Flagging this scoping call explicitly rather than deciding it silently — revisit if a future pass wants focus management here too.

Verified after the fix: `npm run test:frontend` — 212/212 pass (same count as before; no tests added or removed, only component internals changed). `npm run typecheck --workspace frontend` — clean. `frontend/src/tests/a11y.test.tsx` re-run in isolation — 11/11 pass, matching a11y-auditor's own pre-fix baseline exactly.

**Tests:** 212/212 frontend tests pass, 42/42 files. New/changed this feature: `ModerationMenu.test.tsx`, `ReportModal.test.tsx`, `FamilyProfileBlockControl.test.tsx`, `BlockedContentPlaceholder.test.tsx`, `ThreadHeaderBlockedTag.test.tsx`, `BlockedThreadBanner.test.tsx`, `MessageBubble.test.tsx` (new — this component had no test file before), `MessageThread.test.tsx` (new — same), plus additions to `AnnouncementCard.test.tsx`/`CommentList.test.tsx`, plus a `handlers.moderationBlocksList([])` mock added to the 3 pre-existing `FamilyView.test.tsx` cases so `FamilyProfileBlockControl`'s new query doesn't leave them making an unhandled request. `frontend/src/tests/msw-server.ts` gained 4 new handler factories (`moderationBlocksList`/`moderationCreateBlock`/`moderationDeleteBlock`/`moderationCreateReport`) for qa-engineer/e2e-test-writer to reuse.

**Quality gates:** `npm run test:frontend` — 212/212 pass. `npm run typecheck --workspace frontend` — clean. `npm run build --workspace frontend` — clean (256KB JS / 74KB gzip).

**Open for qa-engineer / e2e-test-writer / a11y-auditor:**
- No Playwright e2e spec added under `frontend/e2e/` — that's e2e-test-writer's file per the org chart, not written here.
- The native-radio-input radiogroup and the hand-rolled `ReportModal` focus trap are both reasoned engineering choices (see above) but haven't been run through an actual screen reader or `axe-core` — worth a11y-auditor's pass specifically on this feature rather than assuming the reasoning holds.
- The `deleteBlock` dual-resolution gap documented above is a real, if narrow, correctness risk if any future call site passes a raw user id instead of a canonical family id to unblock — worth qa-engineer adding a regression test for the exact "block from a post, then Undo, then confirm truly unblocked" path if one doesn't already exist in `### Test plan`.

### Test plan

**Scope of this audit.** This is a TDD project — backend-dev and frontend-dev already wrote substantial real tests as their own work landed (`### Backend`/`### Frontend`'s claimed counts). This section's job is not to duplicate that from scratch: it re-runs the claimed numbers live, reads a representative sample of the actual test files to confirm they meaningfully assert what they claim, and adds new tests only where a genuine gap was found. Every number below came from a command run today (2026-09-05) in this worktree, not copied from the Backend/Frontend subsections.

**Live re-run of claimed counts.**

| Command | Result | Matches claim? |
|---|---|---|
| `deno test` (from `supabase/functions/`) | **49/49 pass** — 20 `admin` (pre-existing regression check, untouched) + 5 `community` + 20 `moderation` + 4 `search` | Yes — exact match to `### Backend`, re-verified live. |
| `npm run test:frontend` | **212/212 pass, 42/42 files** | Yes — exact match to `### Frontend`, re-verified live. |
| `npm run typecheck` (both workspaces) | clean, 0 errors | Matches. |
| `npm run test:backend` | 147/147 pass | **Unrelated to this feature.** This is the legacy Express + better-sqlite3 `backend/` workspace; moderation/report/block lives entirely in `supabase/functions/` per `### Backend`'s own "Stack note." Run only to confirm zero regression in the untouched legacy suite. |
| `deno coverage` (built into the Deno CLI — no new dependency) | `moderation/index.ts` **85.2%** lines / 100% functions / 84.5% branches; `community/index.ts` **90.3%** / 100% / 73.1%; `search/index.ts` **87.8%** / 100% / 69.2% | All three clear the 80%-line-coverage target. `announcement/index.ts` and `message/index.ts` don't appear in the report at all (0% instrumented) — see Gap #3. |
| `vitest run --coverage` (frontend) | **not measurable this pass** | `@vitest/coverage-v8` isn't installed in this workspace (pre-existing gap, not introduced by this feature). Installing a new dependency solely for this audit is outside qa-engineer's remit without tech-lead sign-off (`[[standards/engineering-standards]]`: "no new dependency without justification"). Flagging as a P2 follow-up for tech-lead; the 212/212-across-42-files count plus the depth of files read below is the substitute evidence this pass produced instead. |

**Representative sample read in full**, per the "confirm claims are real, not just plausible-sounding" instruction: `supabase/functions/moderation/index.test.ts`, `community/index.test.ts`, `search/index.test.ts`; `frontend/.../moderation/components/ReportModal.tsx` + `.test.tsx`, `FamilyProfileBlockControl.test.tsx`, `ModerationMenu.test.tsx`, `BlockedContentPlaceholder.test.tsx`; plus targeted reads of the moderation-specific `describe` blocks inside `AnnouncementCard.test.tsx`/`CommentList.test.tsx` and the 4 new handler factories in `frontend/src/tests/msw-server.ts`. Every one of these meaningfully asserts what `### Backend`/`### Frontend` claim, not a rubber stamp — concretely: `community`/`search`'s tests assert the *exact* `.not("id","in","(...)")` call args and that the call is skipped entirely with zero blocks, not just a 200 status; `CommentList.test.tsx` asserts blocking hides *every* comment by that author in the list, not just the row clicked from; `ModerationMenu.test.tsx` asserts the Block item is omitted for DM targets and removed authors, and that `onBlocked` receives the server-resolved *canonical* family id rather than the raw `authorId`, matching the dual-resolution fix `### Frontend` describes finding.

**Gap #1 — CLOSED live. DM historical-visibility split and RLS-driven unblock reversibility were unexercised by any committed test.** `moderation/index.test.ts`'s own header comment (and `community`'s/`search`'s) already says so outright: the RESTRICTIVE policies "are NOT exercised by these tests... should be verified against a real/staging project before this ships." True and honestly flagged, but it left this feature's single most novel design decision — the resolved DM Open Question's exact mechanism, `blocks.created_at <= messages.created_at` — with zero automated *or* manual-live confirmation beyond a human reading the SQL.

This repo has no local Postgres/pgTAP harness (no `supabase/config.toml`, nothing wired into CI). Rather than treat that as a dead end, I found a long-running local Supabase Postgres stack already available in this sandbox (`supabase_db_supabase_test` — a real `public.ecr.aws/supabase/postgres` container with genuine `auth.uid()`/RLS support) and ran an ad hoc, uncommitted probe against it — same "temporary, uncommitted, deleted after the run" precedent a11y-auditor already used elsewhere in this feature (`### Accessibility` "Build audit"). Method: applied all 9 real migration files, in order, byte-for-byte (adding only the baseline `ALTER DEFAULT PRIVILEGES` grants a real hosted Supabase project already has outside any migration file, since this is a raw Postgres image rather than a provisioned project), inside one `BEGIN...ROLLBACK` transaction so nothing persists in the shared instance regardless of outcome (confirmed: `\dt public.*` shows zero tables both before and after — a clean rollback). Simulated two families via real `auth.users` rows and `SET ROLE authenticated; SET request.jwt.claim.sub = '<uuid>'` — Postgres's own standard local-RLS-testing recipe, matching the exact GUC this image's `auth.uid()` reads.

Results, all executed live, all passing:
1. Two DM messages, one dated before a block's `created_at` and one after: **while blocked**, the receiver sees exactly the pre-block message; the post-block one is hidden. Confirms the split for real.
2. The blocked sender can still `INSERT` a brand-new message with **zero RLS rejection** (contract E: sender never told they're blocked) — and that same new message is correctly invisible to the receiver.
3. Announcements/comments by the blocked author are hidden **uniformly**, historical included (matches the migration's documented no-carve-out decision — deliberately different from the DM case).
4. The blocked family's `families` profile row **stays directly fetchable** by the blocker even while blocked (confirms "no RLS policy on `families`" doesn't accidentally also break the only v1 unblock affordance).
5. **Unblock round trip**: deleting the block row restores full visibility across messages, announcements, *and* comments in the same session — block → hidden → unblock → visible again, not just one direction.
6. `is_admin()` bypass holds for both RESTRICTIVE policies regardless of any block in place.

Framed honestly: this is a one-time, ad hoc, manually-run verification, not a permanent CI-run regression test (no harness exists to make it one without a larger infra investment — see "New tests added," below, for why I didn't force that through unilaterally). It does satisfy, for the first time, the "verify against a real/staging project before this ships" gate that `### Backend` and every fake-client test file's header named as outstanding.

**Gap #2 — FOUND: a real, low-severity bug, tracked as an intentionally-failing test.** Per the coverage checklist ("every form has a smoke test asserting the validation error path"), I checked whether `ReportModal`'s two named validations (category-required, note-length-1000) are actually *fired*, not just inferred from a disabled button. `note`-over-1000 genuinely is. `category`-required is **not**: the existing test only proves the submit button stays `disabled` until a category is picked — nothing ever actually triggers `handleSubmit`, so `errors.category` never renders in any pre-existing test. I added one (`ReportModal.test.tsx`, `fireEvent.submit(form)` bypassing the disabled attribute, the same way a future regression or a stray programmatic submit would) — and it **fails**, for a real reason: React Hook Form supplies `null` (not `undefined`) for an unselected native radio-group field at submit time, and Zod's `required_error` only fires on `undefined`, so the field falls through to Zod's raw default enum message ("Expected 'unkind' | 'privacy' | 'unrelated' | 'other', received null") instead of ux-writer's "Choose a category to continue." Low severity — structurally unreachable via mouse/keyboard today (the submit button is disabled exactly when this would fire, and the note field is a `<textarea>` so there's no Enter-key implicit-submit path either) — but a real defect in the defense-in-depth path, and exactly the kind of thing that would surface a confusing raw validation string to a screen-reader user if that path is ever exercised. Left the test **red on purpose** (per the global TDD rule: tests should fail until the implementation satisfies them) rather than rewriting it to assert the wrong string. Suggested fix for frontend-dev: `z.preprocess((v) => v ?? undefined, z.enum(REPORT_CATEGORIES, { required_error: ... }))`, or an explicit `.nullable()` + `.refine()`. Not fixed here — `ReportModal.tsx` is frontend-dev's file; qa-engineer's writer-ownership is test files only.

**Gap #3 — documented, not closable within qa-engineer's remit.** `message/index.ts`'s 5 endpoints (`POST /message`, `GET /message/threads`, `GET /message/threads/:userId`, `POST /message/threads/:userId/read`, `GET /message/unread/count`) have **zero** Deno test coverage — confirmed by `deno coverage`'s own report (the file doesn't appear in it at all; `announcement/index.ts` is in the same state). Not new to this feature (`### Backend` calls both files "documentation-only... zero runtime changes" here), but it means the coverage-target bar ("every endpoint has an integration test") is unmet for the DM surface at the routing/validation layer. Root cause, concretely: unlike `admin/index.ts`, `community/index.ts`, `moderation/index.ts`, and `search/index.ts` — all refactored to export a testable `handleRequest(req, supabase)` (confirmed by grep: each has `export async function handleRequest`) — `message/index.ts` and `announcement/index.ts` still run everything inline inside `Deno.serve(async (req) => {...})`, which can't be imported/invoked as a plain function for a fake-client unit test without that refactor first. That's a source-code change to files I don't own (writer-ownership is `**/*.test.ts` only); flagging for backend-dev/tech-lead as a concrete, scoped follow-up (the pattern to copy already exists in the other four files) rather than attempting it myself mid-audit. Partially mitigated: the actual security-critical behavior of `message/index.ts` (block-aware visibility) is exactly what Gap #1's live probe verified, independent of this Deno-test-harness gap — what's missing here is coverage of the plainer stuff (self-send 400, unknown-recipient 404, UUID validation on `:userId`, unread-count/grouping logic), lower risk but still a real, named gap.

**New tests added this pass.**
- `supabase/functions/moderation/index.test.ts` — 1 new test: a full `POST /blocks` → `GET /blocks` (shows it) → `DELETE /blocks/:id` → `GET /blocks` (empty again) round trip through one shared fake client, closing "round-trip, not just one direction" at the API-contract layer (complements Gap #1's live-Postgres round trip, which proves the same property at the actual content-visibility layer). **PASS.**
- `frontend/src/features/moderation/components/ReportModal.test.tsx` — 1 new test, described in Gap #2. **FAIL (intentionally — a real bug, not a test bug).**
- Considered and **deliberately not added**: a permanent text-regression test asserting the RESTRICTIVE policies' exact SQL wording, to guard against a future silent weakening (e.g. `<` instead of `<=`). Built it, and it worked, using `Deno.test({ permissions: { read: [...] } })` to scope filesystem access to just that one test — but Deno's per-test `permissions` option can only *narrow* an already-granted ambient permission, never *escalate* from zero, and this repo's `deno test` convention runs with no flags at all. Making it pass for real would need either a global `--allow-read` (breaks the plain `deno test` command for everyone else) or a new `deno.json` `tasks.test` entry (a shared-tooling convention change that `[[teams/engineering]]`'s charter routes through tech-lead first, not through a QA audit). Deleted rather than land something that either breaks the standard command or quietly changes shared config underneath the team. Recommending it as a P2 for tech-lead to adopt formally if wanted.

**Acceptance criteria.**

| # | Criterion | Test type | File | Assertion | Status |
|---|---|---|---|---|---|
| 1 | Report available on every announcement/comment/DM, existing action row | Unit/component (RTL) | `frontend/src/features/moderation/components/ModerationMenu.test.tsx` | Report menu item always renders regardless of target type or author state | **PASS** (verified live) |
| 1 | " | Unit/component (RTL) | `AnnouncementCard.test.tsx`, `CommentList.test.tsx` | trigger renders for non-own content, absent for own | **PASS** (verified live) |
| 1 | " | Unit/component (RTL) | `MessageBubble.test.tsx` | trigger renders on DM bubbles | file exists, counted in the 212/213 total; not individually re-read this pass — **presumed pass, not independently verified** |
| 1 | " | E2E | `frontend/e2e/moderation-report-block.spec.ts` (not yet written) | open Report from a feed post, a comment, and a DM bubble; submit; assert confirmation, once per surface | **NOT YET IMPLEMENTED** — named below for e2e-test-writer |
| 2 | Report categories short, foster-family-specific, not generic spam/abuse/other | Integration | `moderation/index.test.ts` | `POST /reports` rejects `category: "spam"` with 400; only `unkind\|privacy\|unrelated\|other` accepted | **PASS** (verified live) |
| 2 | " | Unit/component | `ReportModal.test.tsx` | renders exactly ux-writer's 4 category labels | **PASS** (verified live) |
| 2 | " | — | — | voice/appropriateness itself is a copy-review call (ux-writer/design-lead), not an automated assertion | N/A |
| 3 | Reports persist `{reporterId,targetType,targetId,category,note?,createdAt}`, admin-queue-readable | Integration | `moderation/index.test.ts` | server-derives `reporterId`/`createdAt`, ignores client-supplied values; stores `note: null` when omitted | **PASS** (verified live) |
| 3 | " (admin-readability) | — | `20260904000000_moderation_reports_blocks.sql`, `"admin has full access to reports"` policy | reviewed (text) | **reviewed, not independently re-executed live** — my probe fixtured `messages`/`announcements`/`blocks`, not `reports` |
| 4 | Block available on profile page and from any post/comment by that family | Unit/component | `FamilyProfileBlockControl.test.tsx` | "Block this family" → tap → immediate block, no dialog | **PASS** (verified live) |
| 4 | " | Unit/component | `ModerationMenu.test.tsx` | "Block {name}" menu item fires the mutation, hands back the canonical family id | **PASS** (verified live) |
| 5 | Blocked family invisible: feed/comments vanish, search excludes | Live DB probe (ad hoc, see Gap #1) | — | announcements/comments by the blocked author return 0 rows while blocked | **PASS** (verified live) |
| 5 | " (community/search) | Integration | `community/index.test.ts`, `search/index.test.ts` | exact `.not("id","in","(blocked-ids)")` filter applied when blocks exist, skipped when none | **PASS** (verified live) |
| 5 | " (DM threads — superseded by the resolved Open Question, not the literal AC text) | Live DB probe (ad hoc, see Gap #1) | — | history stays visible; only messages postdating the block are hidden; thread does not vanish | **PASS** (verified live) |
| 5 | " (frontend reactivity) | Unit/component | `CommentList.test.tsx` | blocking swaps *every* comment by that author in the current list, not just the clicked row | **PASS** (verified live) |
| 6 | Block is one-way; blocked family not notified | Live DB probe (ad hoc, see Gap #1) | — | blocked sender's `INSERT` always succeeds (no rejection); the message is invisible to the receiver | **PASS** (verified live) |
| 6 | " (blocked family can't discover the block) | — | `blocks`' only non-admin policy, scoped to `blocker_family_id` | reviewed (text: structurally sound, same shape as every other owner-scoped policy in this codebase) | **reviewed, not independently re-executed live** |
| 7 | Reporting and blocking are independent actions | Integration | `moderation/index.test.ts` | fake client throws if either handler reaches for the other table; a report and a block each succeed independently in the same test file | **PASS** (verified live) |

**E2E scenarios named for e2e-test-writer** (Playwright, `frontend/e2e/moderation-report-block.spec.ts` — not yet written; per `[[teams/engineering]]`'s decomposition heuristic, qa-engineer names scenarios, e2e-test-writer implements):
1. `report-flow-per-surface` — open Report from a feed post, a comment, and a DM bubble in turn; pick a category, add a note, submit; assert the confirmation state each time.
2. `block-from-profile-and-undo` — visit a family's profile, tap Block, assert the immediate flip to "Unblock" + undo strip with no confirmation dialog, tap Undo, assert reversion.
3. `block-from-post-and-reload` — block a family from a feed post's menu, assert the row becomes a placeholder with Undo, **reload the page**, assert the family's content is still absent. This is the one scenario no component test can cover — it needs a real network round trip through the actual server-side filtering, not a mocked query cache.
4. `blocked-family-invisibility-sweep` — after blocking a seeded family: their feed posts are gone, their comments are gone from a thread that still shows other families' comments, they're excluded from a community-search hit, and their DM thread is still present in the inbox list with full history but the composer stays enabled (Variant B).
5. `unblock-restores-visibility` — the UI-level round trip: block, confirm gone from feed/search, unblock from the profile page, confirm reappearance on next load (not just optimistic UI) — the UI counterpart to Gap #1's live-DB round trip.

**Not done, flagged rather than skipped silently:**
- Frontend line-coverage percentage (no `@vitest/coverage-v8` installed — see table above).
- `message/index.ts`/`announcement/index.ts` routing-layer tests (Gap #3 — needs a `handleRequest`-export refactor first, outside qa-engineer's remit).
- A permanent, CI-runnable regression test for the RESTRICTIVE policies' exact SQL wording (built, ran, deleted — see "New tests added" above).
- A real screen-reader spot-check of the new live regions — `### Accessibility`'s territory, already flagged there as not yet done.

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

**Method.** Audited the actual shipped code (commits `435ca75`, `182e6f6`), not the spec prose — read every component frontend-dev's `### Frontend` subsection names (`ModerationMenu.tsx`, `ReportModal.tsx`, `BlockUndoStrip.tsx`, `BlockedContentPlaceholder.tsx`, `FamilyProfileBlockControl.tsx`, `ThreadHeaderBlockedTag.tsx`, `BlockedThreadBanner.tsx`, `contentType.ts`, `api/moderation.ts`, `hooks/useBlock.ts`) plus every file they're wired into (`AnnouncementCard.tsx`, `CommentList.tsx`, `MessageBubble.tsx`, `MessageThread.tsx`, `FamilyView.tsx`, `AnnouncementDetail.tsx`, `icons.tsx`, `tailwind.config.js`). Contrast computed by hand per the WCAG formula (`L = 0.2126R + 0.7152G + 0.0722B` on linearized sRGB channels, contrast `= (L_lighter+0.05)/(L_darker+0.05)`) against the *actual* hex values in `frontend/tailwind.config.js` (confirmed byte-for-byte identical to `[[standards/design-system]]`'s token table — no drift). This is a genuine **Phase 3+ build audit**, not a spec-only pass (contrast with header-nav-redesign's audit, which had zero code to run against at the time): I ran the existing axe-core harness (`vitest-axe`, `frontend/src/tests/a11y.test.tsx`) against the real pages, and additionally wrote and ran a temporary, uncommitted probe test exercising interactive/open states the default suite doesn't reach (open `ModerationMenu`, open `ReportModal` in its default/category-selected/confirmed/error states, `FamilyProfileBlockControl`'s fresh-block and already-blocked states, `BlockedContentPlaceholder`'s default and post-undo states, `BlockedThreadBanner`+`ThreadHeaderBlockedTag` blocked=true) — deleted after the run, not committed; see **Build audit** below for both results.

**Summary: 21 items reviewed, 3 blocking.** (1) three link/label text spots use `color.brand.primary` as literal text color, all failing 1.4.3 (~3.1–3.6:1, need 4.5:1) — a design-system-token-misuse, not a new-token problem, but the exact "reuse hides a failure" pattern this audit was asked to check for. (2) blocking a family from a post/comment/DM's row-level `ModerationMenu` drops keyboard focus to `document.body` with no recovery. (3) `ReportModal`'s success confirmation has no live-region marking, unlike every other confirmation in this same feature. Everything else below is non-blocking or confirmed-compliant. Returning `status: failed` for the contrast finding per convention (new-token-shaped fix needed before ship); the other two blocking items are frontend-only fixes (focus management, one `role` attribute) that don't need a design-lead/ui-designer loop.

#### Contrast

| Pair | Ratio | Context | Verdict |
|---|---|---|---|
| `brand.primary` #4D9463 text on `brand.primary`/10 over `surface.card` (≈#EDF4EF) | **3.28:1** | `ReportModal.tsx` selected category-pill label (`text-brand-primary` on `bg-brand-primary/10`) | **FAIL AA** (needs 4.5:1, normal text, `text-sm font-medium` — not "large text") |
| `brand.primary` #4D9463 text on `surface.warm` #FFFBF5 | **3.56:1** | `BlockUndoStrip.tsx` "Undo"/"Undoing…" link | **FAIL AA** |
| `brand.primary` #4D9463 text on `surface.subtle` #F4ECDF | **3.13:1** | `BlockedContentPlaceholder.tsx` "Undo" + "View their profile" links | **FAIL AA** |
| `brand.primary` #4D9463 border/fill (non-text) on the same three backgrounds | 3.1–3.7:1 | Selected-pill border, focus rings (`ModerationMenu` trigger, category pills, textarea) | PASS 1.4.11 (≥3:1) — only the *text* use fails, borders/rings are fine |
| `feedback.success` #3F8A52 text on `surface.card` #FFFFFF | **4.23:1** | `ReportModal.tsx` "Report sent — our team will take a look." | **FAIL AA**, narrowly — see note below, non-blocking |
| `feedback.error` #B83B3B text on `surface.card` #FFFFFF | 5.63:1 (reused from header-nav-redesign's own audit — identical pair) | `role="alert"` lines (`ReportModal`, `FamilyProfileBlockControl`) | PASS AA |
| `ink.muted` #5E534B on `surface.subtle` #F4ECDF | 6.37:1 | `BlockedContentPlaceholder`/`BlockUndoStrip` body copy | PASS AA |
| `ink.lead` #1F1B18 on `surface.card` / `surface.subtle` | 17.1:1 / 14.6:1 | `ModerationMenu` panel items, `ReportModal` labels/title, `FamilyProfileBlockControl`'s "You've blocked..." card, `BlockedThreadBanner` | PASS AA+AAA |

**Blocking #1 — `color.brand.primary` used as literal text color, three sites, all fail 1.4.3.** `[[standards/design-system]]` already restricts this exact token to "**non-text-bearing contexts** (borders, icon fills, focus rings, active nav text, calendar-free swatches)" and documents that the identical luminance value fails 1.4.3 (~3.26:1) — that rule exists *specifically* because of `[[features/brand-contrast-fix]]`. `### Visual` §2's token table classifies the "Undo" links and the category-pill's selected-state text as "**link-weight** uses" and treats them as exempt — but link text is still text for 1.4.3 purposes (1.4.1 Use of Color is the SC that gives links special treatment, and only for *distinguishing* them from body text, not for exempting their own contrast). So `ui-designer`'s "zero new color tokens" claim is true at the token level and irrelevant here: the failure is a **misapplication** of an existing, already-restricted token, in three sites, not a new hex value. **A blind swap to `brand.primary.pressed` does not fully fix this** — I checked all three backgrounds: `.pressed` passes on `surface.warm` (4.71:1, fixes `BlockUndoStrip`) but still fails on `surface.subtle` (4.14:1, `BlockedContentPlaceholder`) and on the category-pill's tinted background (4.35:1, `ReportModal`). The simplest zero-new-token fix that passes on all three surfaces is `ink.lead` (14.6–17.1:1 everywhere) with the underline retained as the non-color "this is a link" cue; if `ui-designer` wants to keep a brand-colored accent, it needs a shade verified against each of these three specific backgrounds individually, not just white. Routing to design-lead per role convention (`status: failed` below) since this needs a fix from `ui-designer` before ship, not something I can patch. **Side note, out of this audit's scope but worth a `/sanity-check design` pass:** `ReportModal.tsx`'s own comment says this is "`ReactionBar`'s `like` recipe" — if `ReactionBar.tsx` uses the identical `text-brand-primary` class on its active "like" label, it likely has this exact same bug already shipped, unrelated to this feature.

**Non-blocking — `feedback.success` on white, ~4.23:1, narrow AA miss.** `ReportModal.tsx`'s confirmation heading (`font-semibold text-feedback-success`, no explicit size class → inherits 16px body) computes just under the 4.5:1 floor. Not flagging as blocking because this is an **exact, unmodified reuse** of `RequestPlaydateModal`'s pre-existing "Request sent!" treatment (`frontend/src/pages/FamilyView.tsx`) — not a new decision this feature's designers made. Worth fixing at the shared-pattern level (both modals together) rather than patching only the new one and creating a fresh inconsistency between the two dialogs `### Visual` decision 3 explicitly says should mirror each other.

#### Keyboard

- **PASS — icon-only triggers have a real `aria-label`, not a `title`.** `ModerationMenu.tsx`'s trigger button carries `aria-label="More actions"` as a genuine attribute; `MoreIcon` itself is `aria-hidden` via the shared `baseProps` in `icons.tsx`. The exact gap that blocked `AccountChip` in header-nav-redesign does **not** recur here — confirmed by reading the component, not just trusting the spec.
- **PASS — `ReportModal` focus management, built correctly from the start.** Focus moves to the close button on mount (`closeButtonRef.current?.focus()`), Escape closes, and closing (Escape, overlay click, Cancel, or "Done" after confirmation) always routes through the same `onClose` prop, which `ModerationMenu` wires to `triggerRef.current?.focus()` — focus reliably returns to the kebab that opened it, exactly as `### Visual` §7 asked. The hand-rolled Tab-wrap trap is also correctly implemented: I traced the boundary logic specifically — `focusable[0]` is always the close button and `focusable[last]` is always Submit-or-Cancel (both fixed DOM-order elements, not one of the `sr-only` radio inputs), so the trap's start/end checks work correctly regardless of the native-radiogroup Tab-collapsing behavior sitting in the middle of that NodeList.
- **PASS — no Escape double-handling.** `ModerationMenu`'s own document-level Escape listener is scoped to `open` and unmounts in the same render pass that mounts `ReportModal` (both state updates are batched from one click handler), so there's no race between the menu's Escape handler and the modal's.
- **PASS — `MessageBubble`'s hover-revealed trigger stays keyboard-reachable.** `opacity-0 ... group-focus-within:opacity-100`, never `display:none` — confirmed, matches the header-nav-redesign `Tooltip` precedent this was explicitly asked to follow.
- **Blocking #2 — focus is dropped to `document.body` after blocking from a row-level `ModerationMenu`.** Traced the full call chain: in `AnnouncementCard.tsx`, `CommentList.tsx`, and `AnnouncementDetail.tsx`, the Block menuitem's `onClick` in `ModerationMenu.tsx` calls `setOpen(false)` (unmounting the currently-focused `role="menuitem"` button) and then fires `blockMutation.mutate(...)`; nothing in that handler, nor in any of the three callers' `onBlocked` callbacks (`setBlockedFamilyId` / the `blockedFamilies` map setter), ever calls `.focus()` on anything afterward — contrast with the Escape-key path, which explicitly does. Once the mutation resolves and the row is replaced by `<BlockedContentPlaceholder>`, nothing there grabs focus either. A keyboard-only user who blocks a family from a feed post, a comment, or a DM message loses their tab position entirely and must re-tab from the top of the page to find the row's "Undo." **This does not affect `FamilyProfileBlockControl`** (the profile-page Block button): that path is correct, because it's the *same* `<button>` DOM node before and after (its label just changes "Block this family" → "Blocking…" → "Unblock"), so focus is never lost. Fix: after a successful row-level block, move focus to `BlockedContentPlaceholder`'s own container (e.g. `tabIndex={-1}` + `.focus()` on mount) or its "Undo" control, mirroring what the profile path already does implicitly.
- **Non-blocking — `role="menu"`/`role="menuitem"` without the matching APG keyboard model.** `ModerationMenu`'s panel uses these roles but only supports Tab between items (no arrow-key/Home/End navigation) — a deliberate simplification per `### Visual` §5.4 ("matching `AccountChip`'s precedent"). I checked that precedent directly: `Navbar.tsx`'s actual account-chip menu uses `aria-expanded` but **doesn't use `role="menu"`/`role="menuitem"` at all** — so this is new ARIA usage in this feature, not literally inherited. Not a numbered SC failure (4.1.2 only requires the role be programmatically correct, not that its full expected interaction model be implemented) but worth a consistency pass: either drop the menu/menuitem roles (plain buttons match the actual behavior) or implement arrow-key nav to match the declared role.
- **Non-blocking — `BlockUndoStrip`'s 7s auto-dismiss removes an interactive control with no extend/pause.** Not a 2.2.1 Timing Adjustable violation since the equivalent action (Unblock) stays permanently available via the main button regardless of the strip — but if a keyboard user's focus is on the "Undo" button exactly when the timer fires, focus drops to `document.body` (same class of bug as Blocking #2, narrower window). Cheap fix: on dismiss, check `document.activeElement` and redirect to the main Block/Unblock button if focus was inside the strip being removed.

#### Semantics

- **PASS — category `radiogroup` satisfies the full APG ask via native semantics, not a hand-rolled widget.** Confirming frontend-dev's own flagged uncertainty (`### Frontend`): the `<fieldset>`/`<legend>` wrapping native `sr-only` `<input type="radio">`s sharing `name="category"` (via RHF's `register`) gets the group's accessible name from the `<legend>`, per-item accessible names from each `<label htmlFor>`, and real arrow-key/single-Tab-stop behavior from the platform, with zero custom code. This is equivalent to (and more robust than) a hand-rolled `role="radiogroup"` + `role="radio"` + manual keydown handler. Genuinely satisfies `### Visual` §7's ask despite the different mechanism.
- **PASS — live regions used correctly almost everywhere.** `BlockUndoStrip` (`role="status"`), `BlockedContentPlaceholder` (`role="status"`, both its pre- and post-undo states), `FamilyProfileBlockControl`'s unblock acknowledgment (`role="status"`), and every validation/API error (`role="alert"` in `ReportModal` and `FamilyProfileBlockControl`) are all correctly marked. See Blocking #3 below for the one place this pattern was *not* applied.
- **Non-blocking — newly-inserted (not merely updated) `role="status"` regions have a known cross-AT reliability caveat.** `BlockUndoStrip`, `BlockedContentPlaceholder`, and the unblock acknowledgment are all whole new DOM subtrees mounting with content already inside them, rather than text changing inside an already-present live region — some screen readers announce the latter more reliably than the former. Using `role="status"` is still the right call (strictly better than nothing) — flagging as worth a real NVDA/VoiceOver spot-check once test credentials exist, matching frontend-dev's own "hasn't been run through an actual screen reader" flag.
- **Non-blocking — category-picker's selected state relies entirely on color.** Selected vs. unselected pills differ only by border hue, background tint, and text hue (`border-brand-primary bg-brand-primary/10 text-brand-primary` vs. `border-ink-muted/20 text-ink-lead`) — the native radio's own visual "dot" is hidden (`sr-only`), so there's no non-color indicator (checkmark, weight change) for the selected state. Likely still distinguishable by lightness/saturation for most color-vision deficiencies, but worth a quick 1.4.1 (Use of Color) check; a small checkmark icon would be a cheap, safe addition.

#### Screen-reader

- **Blocking #3 — `ReportModal`'s success confirmation has no live-region marking and moves no focus.** `{sent ? <div><p className="font-semibold text-feedback-success">Report sent — our team will take a look.</p>...</div> : ...}` — plain `<p>`, no `role="status"`/`aria-live`, and the confirmation `<div>` isn't focused on mount. This is the **one** confirmation in this entire feature that doesn't follow the pattern the rest of it gets right (see Semantics PASS above — `BlockUndoStrip`, `BlockedContentPlaceholder`, and the unblock acknowledgment all correctly use `role="status"`). Compounding it: the element that had focus (the Submit button) is unmounted in the same swap, so focus falls to `document.body` with nothing to redirect it — a screen-reader-only user who submits a report has no reliable way to learn it succeeded. This is a WCAG 4.1.3 Status Messages (AA) gap. Fix: add `role="status"` to the confirmation container, matching the sibling components' own established pattern one-to-one.
- **PASS — DM-blocked-thread banner never implies the composer is disabled (explicit focus area for this audit).** Checked `MessageThread.tsx`'s render order and `MessageComposer`'s own props: the composer renders completely unmodified, with no conditional `disabled` prop tied to `isPartnerBlocked`, no grayscale/opacity treatment, and it sits *below* `BlockedThreadBanner`, never obscured by it. `BlockedThreadBanner.tsx`'s copy is scoped precisely to inbound ("You just won't get new messages from them") and never claims anything about the blocker's own outbound. Matches the resolved Variant B contract exactly.
- **Non-blocking — `moderation.trigger.ariaLabel` shipped as a generic, non-differentiated "More actions" everywhere.** Every kebab trigger across every feed card, every comment row, and every DM bubble carries the identical accessible name (hardcoded in `ModerationMenu.tsx`; confirmed `### Microcopy` never actually filled the `moderation.trigger.ariaLabel` slot `### Visual` §4 reserved for it — ux-writer's landed `report.trigger.aria` = "Report this {contentType}" was written for the earlier single-icon design and wasn't re-applied once the design converged on one shared "more actions" kebab, and frontend-dev's own subsection notes this gap explicitly). Functionally reachable (DOM order still lets a screen-reader user work out which row a button belongs to), but dozens of identical "More actions, button" announcements in one feed/comment list is a real degraded browse-by-control-type experience — ux-writer's own stated reasoning for `report.trigger.aria`'s specificity ("a screen-reader user may tab to the icon without having tracked the surrounding post/comment context first") applies just as much to this kebab as it did to the icon it replaced. Recommend filling the reserved slot, e.g. "More actions for this {contentType}."
- **Non-blocking — `ReportModal`'s submit button `aria-describedby` goes stale once enabled.** `aria-describedby={submitHintId}` is wired unconditionally, so a screen-reader user who tabs back to the button *after* selecting a category still hears "Choose a category above to send your report" for a button that's already enabled and ready. Trivial fix: make the description conditional on `!selectedCategory`, or rephrase it to be accurate in both states.
- **Non-blocking edge case — cross-tab block + `refetchOnWindowFocus`.** `useBlock.ts` deliberately does not invalidate DM query keys on block (correct, per the resolved Open Question). But `moderationKeys.blocks` *is* invalidated, and TanStack Query's default `refetchOnWindowFocus: true` means a `MessageThreadPage` left open in one tab could have `ThreadHeaderBlockedTag`/`BlockedThreadBanner` newly mount on refocus after a block happens in another tab, with no live-region marking on either. Narrow, not the primary path — flagging for completeness only.

#### WCAG 2.2-specific check

- **Target size (2.5.8, AA, ≥24×24 CSS px): PASS.** `ModerationMenuTrigger` is a fixed 44×44 (`h-11 w-11`) everywhere it's used (`AnnouncementCard`, `CommentList`, `MessageBubble`), matching `[[standards/design-system]]`'s `size.hitTarget.min` token. Checked the inline "Undo"/"Undoing…" and "View their profile" links in `BlockUndoStrip`/`BlockedContentPlaceholder` too — these have no explicit padding and are visually small, but they qualify for 2.5.8's own explicit **Inline** exception (the target is "in a sentence... constrained by the line-height of non-target text") since they sit inline inside a running sentence. Correctly exempt, not a violation.

#### Build audit (axe-core)

Ran `frontend/src/tests/a11y.test.tsx` (existing `vitest-axe` harness, `color-contrast` rule disabled per that file's own documented jsdom limitation — contrast is audited by hand above instead) against the 11 pages it covers, four of which now render new moderation UI at rest: `FamilyView` (`FamilyProfileBlockControl`), `Feed` (`AnnouncementCard`'s `ModerationMenu`), `AnnouncementDetail` (same), `MessageThread` (`MessageBubble`'s `ModerationMenu`, `ThreadHeaderBlockedTag`, `BlockedThreadBanner`). **Result: 11/11 pass, 0 violations.**

That suite only renders default/closed states, so I additionally wrote a temporary probe (`frontend/src/tests/_tmp-a11y-audit-moderation.test.tsx`, deleted immediately after this run — not committed, not for qa-engineer/e2e-test-writer to keep) covering the interactive states it misses: open `ModerationMenu` panel; `ReportModal` with no category selected, with a category selected, in its "sent" confirmation state, and in its network-failure state; `FamilyProfileBlockControl` immediately after a fresh block (undo strip visible) and in the already-blocked state; `BlockedContentPlaceholder` before and after Undo; `BlockedThreadBanner`+`ThreadHeaderBlockedTag` with `blocked=true`. **Result: 9/9 pass, 0 violations.** Axe's structural checks (roles, names, ARIA usage, form labeling) are clean across every state I could construct — the three blocking findings above (contrast, focus management, missing live region) are exactly the classes of issue this jsdom-based harness cannot detect (no real layout for contrast; no assertion on `document.activeElement`/live-region timing by default), which is why the manual audit above still mattered.

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

**Framing.** Per `### Launch copy`: "trust & safety, not growth — this copy is written to reassure, not to sell." That framing carries over here. The primary metric below is a community-health signal, not an acquisition/activation lever — no signups, session-time, or DAU framing, consistent with `[[teams/marketing]]` Growth philosophy's "one primary metric per feature."

**Primary metric — moderation-flow completion rate.**

Plain English: *of the times a family starts a report or a block, how often does it actually go through — instead of erroring out or getting abandoned partway?* One number: `(reports successfully submitted + blocks successfully confirmed) ÷ (report flows opened + block taps initiated)`, read weekly.

Reported as one blended headline with the two component rates (report-completion, block-completion) shown alongside for diagnosis — same pattern `[[features/reply-coach]]` `### Growth` uses (headline acceptance rate + a separate no-action bucket), so a regression in one flow (e.g. the category-picker causing report abandonment) isn't masked by the other flow staying strong (block is a single tap and will naturally run close to 100%).

Why this metric and not the other candidate named in the dispatch brief ("time-from-friction-to-resolution"): resolution — someone actually reviewing and actioning a report — requires the admin queue, which is explicitly `## Out of scope` in v1. There's no resolved state to time against yet, so that metric isn't answerable given what shipped. Block's own "resolution" is a single tap that completes in well under a second, so timing it wouldn't diagnose anything either. Completion rate is the metric that's actually measurable against this feature's real shape, and it maps directly onto the Problem statement's own success condition ("producing visible, immediate effects") — this is a usability/friction signal on the tool itself, not a demand signal; the goal is not to make more people report or block each other.

**Measurement reality for v1, flagged honestly rather than glossed over.** The numerator (successful reports/blocks) is free — `count(*)` against the `reports`/`blocks` tables backend-dev already shipped (`supabase/migrations/20260904000000_moderation_reports_blocks.sql`). The denominator (flow *started* — `ReportModal` opened, Block tapped before the mutation resolves) isn't logged anywhere today: this codebase has no analytics pipeline beyond `coach_events`-style aggregate tables (per `[[features/reply-coach]]` `### Growth` §3), and no such table shipped for moderation this round (backend-dev has already returned for this dispatch). So, per this dispatch's own instruction not to assume new infrastructure gets built unprompted:
- **v1 interim proxy (zero new infra, usable today):** server-side non-2xx rate on `POST /moderation/reports` and `POST /moderation/blocks`, from existing Edge Function logs — mirrors `[[features/reply-coach]]` `### Growth` §8's own v1 "sanity signal" (endpoint hit count, no new instrumentation). This catches the "erroring out" half of the metric, not the "opened-then-silently-abandoned" half.
- **Fast-follow, not built here (noting the pattern, not requesting it unprompted):** a `moderation_events`-style aggregate table — `id, family_id, action ('report'|'block'), stage ('opened'|'completed'), target_type, created_at`, no report/block content, same aggregate-only shape as `coach_events` — would close the gap and make the real completion rate computable. That's backend-dev's call on a future dispatch, not assumed here.

**Guardrail metrics** (existing platform metrics only, per `[[teams/marketing]]` charter — none invented; both are also the guardrails `[[features/reply-coach]]` `### Growth` §2 already tracks, reused rather than duplicated):
1. **DM open rate must not regress.** The block filter on `messages` is a RESTRICTIVE RLS policy gating the whole thread (SELECT + UPDATE) once `blocks.created_at <= messages.created_at` — a boundary bug there could over-hide legitimate inbound messages from families who were never blocked. Check this first if it drops.
2. **Comment-publish rate must not regress.** Same shape of risk on the `announcements`/`comments` RESTRICTIVE policies (feed/thread visibility) — an over-broad exclusion would read as reduced engagement, not increased safety.

**Experiment: n/a — no A/B.** A randomized holdback means deliberately withholding report or block from a control cohort to measure a lift. That's a reasonable design for an assistive nudge (`[[features/reply-coach-live]]`'s planned 50/50 holdback — control just sees no suggestion chip), but not for a safety mechanism: a control-group family that gets unwanted contact or wants to stop seeing another family's posts, and finds Block missing because they drew the wrong hash bucket, is a real and asymmetric harm with no comparable research upside. Measure via plain before/after comparison against the guardrails above instead.

**Feature flag: n/a — ships to all.** Per `[[teams/marketing]]` charter: "Feature flags only when the rollout actually needs gating; otherwise ship to everyone." Checked what a flag would actually buy here rather than adding one by default:
- No external cost exposure to stage against — unlike `[[features/reply-coach-live]]`'s per-call Anthropic spend (the actual reason that feature phases its rollout), report/block are reads/writes against Supabase tables already provisioned; there's no meter to watch climb.
- No case for a %-rollout blast-radius reduction: this isn't a UI change where "10% see the new thing" produces a useful comparison — it's a safety floor, and the families who need it most right now (the ones currently dealing with unwanted content) are exactly who a %-gate would arbitrarily exclude for no safety benefit.
- The one real pre-ship gate here isn't flag-shaped: `### Backend` already flags that the two new RESTRICTIVE RLS policies have no local pgTAP harness and "should be verified against a real/staging project before ship." Treat that staging verification as the actual go/no-go, not a rollout percentage.

**Phase 2+ follow-up:** not yet applicable — `status: building` this dispatch, not shipped. Once shipped, the follow-up log line should source the v1 interim proxy above (Edge Function non-2xx rate + `reports`/`blocks` row counts) until the `moderation_events` fast-follow lands.

**Flagged for whoever runs `[[features/reply-coach-live]]`'s growth pass:** `[[features/reply-coach]]` `### Growth` §2 and §8 name the counter-metric source as "existing `moderation_reports` table" and flag that it "requires... a column linking a report back to the composer-instance it was authored from." The table that actually shipped here is named `reports` (not `moderation_reports`), and covers all three `target_type`s generically (`announcement` / `comment` / `message`, per `supabase/migrations/20260904000000_moderation_reports_blocks.sql`) rather than being comment-specific — filter `target_type = 'comment'` for that counter-metric. The composer-instance/session linkage column reply-coach's growth section wants does not exist on this table. Both the name mismatch and the missing column are real gaps — worth fixing at the top of that dispatch's growth pass rather than rediscovering them there.
