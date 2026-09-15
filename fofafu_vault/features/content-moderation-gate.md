---
slug: content-moderation-gate
title: Content Moderation Gate
owner: engineering
collaborators: []
status: building
priority: P2
created: 2026-09-10
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Content Moderation Gate

## Problem

[[features/moderation-report-block]] gives the community an after-the-fact escape valve (report, block), and [[features/reply-coach]] gently nudges authors away from phrasing that reads as harsh but is usually well-meaning — both are deliberately soft, dismissible tools. Neither one stops genuinely guideline-violating content (harassment, hate speech, threats, spam, doxxing) from ever reaching the feed in the first place: today it publishes immediately, and the only recourse is someone reading it and reporting it afterward.

Using the Claude API as a content classifier (per Anthropic's [content moderation guide](https://platform.claude.com/docs/en/about-claude/use-case-guides/content-moderation)), the platform should catch clearly-inappropriate content at write time — before it's ever published — and require the author to revise it. This is a firm gate, not a suggestion: unlike reply-coach's dismissible "want a softer version?" nudge, there is no "post anyway." The two systems are deliberately kept separate (confirmed with the user 2026-09-10) — reply-coach keeps softening well-meaning-but-harsh tone; this catches the narrower, more severe band of actual violations.

Success = harmful content never reaches the feed/thread in the first place, false positives on ordinary foster-family conversation are rare enough that the gate doesn't feel like an obstacle, and the two systems (this + reply-coach) never contradict or duplicate a prompt on the same piece of content.

## Acceptance criteria

- [ ] Applies to both feed/announcement posts and comments on submit, before the content is persisted or visible to anyone else.
- [ ] Content is classified against a defined set of community-guideline violation categories (harassment, hate speech, threats/violence, spam, doxxing/PII exposure, illegal content — final taxonomy is foster-family-appropriate and owned by ux-writer, mirroring how [[features/moderation-report-block]]'s report categories were defined).
- [ ] If flagged, the author sees a clear, non-punitive message explaining the content may not be appropriate for the community and must revise it before they can submit — no override/"post anyway" path.
- [ ] If not flagged, publish proceeds with no visible interruption — silent on clean content, matching reply-coach's proven "silent unless needed" pattern.
- [ ] Flagged content is never persisted or visible to any other user, even transiently (gate happens before the write, not a publish-then-takedown).
- [ ] Classifier inputs/outputs are not retained beyond what's operationally necessary — same privacy bar as reply-coach ("coach inputs are NOT persisted").
- [ ] Gated behind a feature flag, defaulting off, following the `reply_coach_enabled`/`reply_coach_live_enabled` precedent.

## Out of scope

- Any change to [[features/reply-coach]] or [[features/reply-coach-live]] — both stay exactly as they are (advisory, dismissible, tone-only). Confirmed explicitly with the user rather than assumed.
- Admin review queue for flagged/blocked content — this is a pure prevention gate, not a queue-based moderation system (mirrors [[features/moderation-report-block]]'s "admin tool is out of scope" precedent).
- Editing or moderating already-published content — this only runs at write time, before publish. After-the-fact handling is [[features/moderation-report-block]]'s job.
- DM message content — tentatively out of scope pending the open question below; do not build DM coverage without resolving it first.

## Open questions

- Does this cover DM messages too, or only the public feed/comments surface named above? The user's own phrasing ("feed/comment etc") didn't clearly settle this, and DMs are a different privacy context than public content — needs a product call, not an engineering default.
- Fallback behavior if the classification call fails or times out: fail-open (let the post through, matching reply-coach's silent-200 precedent — favors availability) or fail-closed (block until classification succeeds — favors safety, but a Claude API outage would stop everyone from posting)? This is a real tradeoff, not a default to pick silently.
- Exact violation-category taxonomy and the user-facing rewrite-prompt copy — ux-writer's call, likely informed by Anthropic's content-moderation guide's suggested category structure.
- Should any aggregate, non-content signal (e.g. "how often does this fire") be tracked for tuning/abuse-pattern purposes, given there's no admin queue to surface individual flags to? If so, same aggregate-only shape as `coach_events`, per growth-analyst.
- Where does this live technically — its own Edge Function, or a shared classification seam alongside `reply-coach-live`'s `ClaudeClient`/`LiveClaudeClient`? An implementation-strategy question for backend-dev/tech-lead, not a product one.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Scope note.** Third pass on this section. First attempt hit an account-wide rate limit with zero output. Second attempt (`e4e7733`) built `supabase/functions/_shared/moderation.ts` — the classifier module itself, `evaluateContent()`, fully tested (11/11 `deno test`, independently re-verified by the dispatcher) — but ran out of turns before wiring it into a real call site or writing this section. This pass does three things: wires `evaluateContent()` into the two real call sites (it had zero callers before now), fixes a taxonomy mismatch ux-writer's landed `### Microcopy` exposed, and writes up all four original decisions plus the wiring/contract details below.

#### (a) Fail-open on classifier unavailability

**Decision: fail-open.** A classifier throw or timeout lets the write through rather than blocking it. Fully implemented and documented in `supabase/functions/_shared/moderation.ts:65-81` (the doc comment directly above `CONTENT_MODERATION_POLICY`) and exercised by both branches in `moderation.test.ts` (lines 144-177) — fail-closed is also fully implemented and tested even though it isn't the shipped default, so the rejected alternative's exact behavior stays visible if this is ever revisited.

**Why:** matches reply-coach's silent-fallback precedent, and more importantly bounds the failure mode. An Anthropic API outage degrades this feature back to pre-launch behavior (nothing caught this narrow violation band before this feature existed either) rather than stopping every post/comment on the platform. [[features/moderation-report-block]]'s after-the-fact report/block flow remains a second line of defense during any such window. The policy is exported as a single named constant (`CONTENT_MODERATION_POLICY`, `moderation.ts:86`) rather than hardcoded per call site, so it's one grep away and trivially flippable.

Load-bearing structural guarantee, worth restating because it's this feature's core "no override" AC: fail-open/fail-closed governs **only** the classifier-unavailable branch. A `flagged: true` classifier result is unconditionally `allowed: false` regardless of policy — there is no code path in `evaluateContent()` that lets a genuine positive flag resolve to `allowed: true`. `moderation.test.ts:121-135` locks this down explicitly (`"flagged content is never allowed under fail-open either (no override path)"`).

#### (b) DM coverage — decision: out of scope for this pass

**Decision: DMs are not wired to this gate.** `../_shared/moderation.ts`'s header comment (lines 4-6) forward-referenced this decision since wave 2a; this is that decision, made concrete:

- **Different privacy context.** A DM is a private 1:1 conversation the platform doesn't otherwise read or classify; a feed post/comment is public-by-construction the moment it's written. Running every DM through a third-party classifier (even one with the "not retained beyond operational necessity" bar this feature already holds) is a materially bigger privacy commitment than gating public content, and isn't something this pass should default into without an explicit product call — this mirrors the feature file's own `## Out of scope` framing ("tentatively out of scope pending the open question below; do not build DM coverage without resolving it first") and Open Question #1, which is still unresolved.
- **No urgent forcing function.** [[features/moderation-report-block]] already gives DM participants a block/report escape valve (the sibling feature this branch is named after), so DMs aren't going ungoverned in the meantime — they just don't get the write-time gate.
- **Low cost to extend later if resolved "yes".** `evaluateContent()` is content-shape-agnostic (takes a `string`, returns a verdict) — wiring it into `supabase/functions/message/index.ts`'s send-message path would be the same three-line pattern used below in `announcement/index.ts`, no classifier/module changes needed. `### Growth`'s `moderation_gate_events.surface` column is already designed for this (`CHECK (surface IN ('post', 'comment'))`, explicit note: "if DM coverage resolves to yes, add 'dm' to the CHECK constraint in a follow-up migration rather than guessing now").
- **Not touched this pass, structurally enforced.** `message/index.ts` is not imported by, and does not import, `_shared/moderation.ts` — confirmed via grep, zero references either direction.

This resolves Open Question #1 for engineering's purposes (a scope decision, not a product reversal — if the product call changes, the extension path above is cheap).

#### (c) Technical seam — own module, independent of reply-coach/reply-coach-live

**Decision: `supabase/functions/_shared/moderation.ts`, a standalone module — not a shared seam with `../coach/index.ts`'s (reply-coach's) Anthropic client.** Already implemented in wave 2a; documented here for the record since Open Question #5 asked for this explicitly.

- Own Anthropic client singleton (`anthropicSingleton`, `moderation.ts:176`), own system prompt (`MODERATION_SYSTEM_PROMPT`), own env var (`CONTENT_MODERATION_GATE_ENABLED`, distinct from `REPLY_COACH_ENABLED`/`REPLY_COACH_LIVE_ENABLED`), own test-injection hook (`setModerationClassifierForTests`, structurally identical in shape to coach's `setClaudeClientForTests` but a separate function, separate module-level variable).
- **Why separate, not shared:** this feature's own Problem statement is explicit that "the two systems... never contradict or duplicate a prompt on the same piece of content," and the hard constraint on this work was to leave reply-coach/reply-coach-live's code and behavior untouched. A shared client/prompt seam would couple the two systems' request lifecycles (e.g. a shared rate limit, a shared prompt-injection surface, a shared timeout budget) in exactly the way the Problem statement rules out. Confirmed again this pass: zero imports either direction between `_shared/moderation.ts` and `coach/index.ts`.
- **What IS reused, by design:** the *shape* of the seam — a swappable classifier function behind a test-injection hook, an uncached env-var flag read on every call (no in-memory caching, so a flag flip takes effect without a redeploy) — read only as reference from `coach/index.ts` and the dead-code Express-era `backend/src/services/coach/{claudeClient,featureFlags}.ts`. Nothing imported from, or written back into, either.
- **Stack (open question (d)):** Supabase Edge Functions + Deno, matching the rest of this migration-in-progress backend (per `CLAUDE.md` Phase 5) rather than a separate runtime. `npm:@anthropic-ai/sdk@0.32` via Deno's npm compat, same major version `coach/index.ts` uses (not literally shared, independently specified) so behavior parity with the existing Anthropic integration in this codebase is predictable. No new dependency introduced — `@anthropic-ai/sdk` and `@supabase/supabase-js` are both already used elsewhere in `supabase/functions/`.

#### Wiring — the two real call sites (this pass's primary deliverable)

`evaluateContent()` had zero callers before this pass. Wired into `supabase/functions/announcement/index.ts` at exactly the two insert paths this feature's AC #1 names:

- **POST `/announcement`** (`announcement/index.ts:160-163`, immediately before the `announcements` insert at `:164-167`)
- **POST `/announcement/:id/comments`** (`announcement/index.ts:243-246`, immediately before the `comments` insert at `:247-249`)

Both follow the identical pattern:

```ts
if (isContentModerationGateEnabled()) {
  const outcome = await evaluateContent(content, CONTENT_MODERATION_POLICY);
  if (!outcome.allowed) return moderationBlockedResponse(outcome.categories);
}
// ...existing insert unchanged...
```

**Ordering guarantee (### Code review watch-list #1, this feature's sharpest named risk, addressed directly):** the `evaluateContent()` call is `await`-ed and resolved to a verdict *before* the `.insert(...)` call is ever reached in the same synchronous control-flow block — there is no code path where the row is inserted first and conditionally deleted after. A blocked verdict `return`s immediately, so the insert statement below it is never executed for that request. This isn't a convention being followed by discipline; it's the only path through the `if` block. `announcement/index.test.ts`'s three flagged/blocked tests assert this directly by never queuing a fake response for the `announcements`/`comments` table and confirming the fake client's insert recorder stays empty (see Test coverage below) — if a future edit reordered this into insert-then-delete, those tests would fail loudly (either a "no fake response queued" throw, from an unexpected read/insert call, or a non-empty insert recorder).

**Default-off (AC #7):** the gate check is nested entirely inside `if (isContentModerationGateEnabled())` — when the flag is unset or anything other than the literal string `"true"`, `evaluateContent()` is never called at all and both endpoints fall straight through to their pre-existing insert behavior, byte-for-byte unchanged from before this feature.

**Response contract — confirmed against both already-built sides, not changed.** `frontend/src/api/announcements.ts`'s `ModerationBlockedPayload` Zod schema (wave 1, lines ~101-105) and this module's own `ModerationOutcome`/`ClassifierResult` (wave 2a) already independently agreed on `categories: string[]` (plural array) with `code` — not HTTP status — as the discriminator. `moderationBlockedResponse()` (`announcement/index.ts:118-124`) returns exactly:

```json
{ "error": "Content flagged by the moderation gate and was not published.", "code": "content_flagged", "categories": ["harassment", "threats-violence"] }
```

at HTTP 422 (distinct from the endpoint's existing 400s, which are shape/length validation, not content-policy rejection — `code` is what the frontend actually switches on per its own doc comment, so the exact status is a free choice). `error` is a structural, non-PII string for logs/fallback only — it never contains post/comment content and is not the string rendered in `ModerationBlockNotice` (that's ux-writer's `### Microcopy` §4 strings, owned and rendered entirely on the frontend). No changes were made to either Zod schema or to `ClassifierResult`/`ModerationOutcome` — this pass only had to confirm the two already-built sides agree, which they do.

#### Taxonomy fix — two mismatches, not one

`MODERATION_CATEGORIES` (`moderation.ts:40-48`) previously had 6 values in snake_case; ux-writer's landed `### Microcopy` §1 specced 7 in kebab-case. Fixed to the exact 7 kebab-case slugs: `harassment`, `hate-speech`, `threats-violence`, `spam`, `doxxing-pii`, `illegal-content`, `explicit-content`. This was a casing mismatch, not just a missing 7th value — `hate_speech` ≠ `hate-speech` as literal strings, so even the 6 overlapping categories would have silently fallen through to `ModerationBlockNotice`'s generic `default` message once frontend wires a real `category` prop, defeating ux-writer's per-category copy work without ever throwing an error. Also updated: the classifier's system prompt category list and per-category descriptions (`moderation.ts:155-161`, now kebab-case, `explicit-content` added with ux-writer's child-safety rationale folded in), the JSON-shape description's "must only contain values from this exact set" line (unchanged in structure, now resolves against the corrected constant), and `moderation.test.ts`'s stale "6, no duplicates" assertion — now asserts exactly 7 values in the exact order/casing ux-writer specced, so a future taxonomy drift is a deliberate test update, not silent breakage.

`isClassifierResult()`'s runtime shape guard (`moderation.ts:178-186`) still only checks `categories` is a `string[]`, not that each value is a member of `MODERATION_CATEGORIES` — pre-existing behavior, unchanged this pass; out of this task's 3-item scope.

#### Test coverage — what this pass covered, and what it didn't

`deno test --allow-env --allow-read` from `supabase/functions/`: **36/36 passing** (11 `_shared/moderation.test.ts`, 20 `admin/index.test.ts` — untouched, pre-existing — and 5 new in `announcement/index.test.ts`). Type-check clean for every file `deno test` traverses.

New in `announcement/index.test.ts` (first test file this Edge Function has ever had — it had zero coverage of any kind before this pass, a pre-existing gap, confirmed via repo search):
- POST `/announcement`: flag off (classifier never called, insert proceeds), flag on + clean (classifier called once with the exact submitted content, insert proceeds, 201), flag on + flagged (insert never called, 422 with the exact `{error, code, categories}` shape).
- POST `/announcement/:id/comments`: flag off (unaffected), flag on + flagged (insert never called, same response contract as the post path).

Deliberately **not** covered — a pre-existing gap this pass didn't backfill wholesale, flagged for qa-engineer's next wave rather than silently left implicit: GET/PATCH/DELETE on announcements or comments, reactions, pagination, ownership/403 checks — none of that touches the moderation gate, so it was out of this pass's narrow scope. `announcement/index.test.ts`'s `makeFakeSupabase()` fixture is written to be reusable for that extension (mirrors every chain method `handleRequest` calls, not just the ones the 5 tests above exercise), so qa-engineer's work extends this file rather than duplicating its fixture.

**Refactor required to make any of this testable, noted for transparency:** `announcement/index.ts` previously ran its entire routing table inline inside `Deno.serve(async (req) => {...})`, with no way to invoke it against a fake client. Extracted into `export async function handleRequest(req: Request, supabase: SupabaseClient): Promise<Response>`, with `Deno.serve` now guarded behind `if (import.meta.main)` (`announcement/index.ts:331-345`) — this is not a new pattern invented for this feature; it's the exact structure `../admin/index.ts` already established (`handleRequest` + `import.meta.main` guard), copied 1:1 for consistency. Zero behavior change: same routes, same branches, same responses, for every path this feature doesn't touch.

**One pre-existing type bug found and fixed, in-scope:** `deno check` on the new test file surfaced a latent bug in `authorLookup()` (`announcement/index.ts`) — inferring `Map<K, V>` from an `any`-typed source resolves `V` to `unknown` rather than `any`, which nothing had caught before because no test file had ever imported this module (so `deno check` never traversed it). Fixed with an explicit type argument on the `Map` constructor — a type-only, zero-runtime-behavior change, in a file already in this pass's writer ownership. Confirmed via `git blame` this line predates this feature entirely (`55b950f`, 2026-07-13).

**One pre-existing, unrelated, out-of-scope failure found and deliberately left alone:** running `deno check` across every function directory as extra diligence (beyond `deno test`'s own reachable-file checking) surfaced a type error in `coach/index.ts` (`cache_control` not present in the installed Anthropic SDK's `TextBlockParam` type). Confirmed via `git blame`/`git diff master...HEAD` this predates this feature entirely (commit `55b950f`, 2026-07-13, byte-identical to `master`, zero diff on this branch) and is invisible to `deno test` today because `coach/` has no test file. This is a reply-coach file — explicitly out of this feature's hard constraint ("do not touch reply-coach/reply-coach-live files or behavior") — left untouched and flagged here rather than fixed.

#### Not done this pass (deferred, not forgotten)

- **`moderation_gate_events` table/migration.** `### Growth`'s schema (§5) is fully specced but no migration file exists yet — not part of this pass's 3-item scope (wiring, taxonomy, contract confirmation). The `outcome` column's session-timeout resolution mechanism (§5's "backend-dev's call on exact mechanism") is also still open. Next backend wave.
- **DM coverage**, per decision (b) above — resolved to "out of scope," not implemented; see the extension path noted there if the product call changes.
- No changes to `coach/index.ts`, `backend/src/services/coach/**`, or any reply-coach/reply-coach-live behavior — confirmed via `git diff master...HEAD --stat` scoped to those paths (empty).

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage

**Blocked on `### Backend` / `### Frontend` — not yet landed.** Checked twice in this session (08:3x and again ~08:5x, with a fresh re-read of this file immediately before each check and productive prep work in between) via `git diff master...HEAD --stat` and a repo-wide grep for `moderation-gate|classify|classification`: zero backend or frontend files for this feature exist yet, and both subsections above are still their unfilled placeholder text. This is not a failure — it's the expected outcome when e2e-test-writer is fanned out in parallel with backend-dev/frontend-dev rather than strictly after them (2-level dispatch, all specialists spawned in one block per `protocols/dispatch.md` §2).

No spec was written against guessed selectors/copy/flag names — that would produce a spec that either can't run or gives false confidence. Prep done so the spec can land immediately once code is available:

| Scenario (from Acceptance criteria) | Planned spec | Status |
|---|---|---|
| Flagged post on `/feed` composer blocks publish, shows the required non-punitive message, no override path | `frontend/e2e/content-moderation-gate.spec.ts` | pending (backend classifier + frontend blocking UI not landed) |
| Flagged comment on `/post/:id` composer blocks publish, same message contract, no override path | `frontend/e2e/content-moderation-gate.spec.ts` | pending (same) |
| Clean post on `/feed` composer publishes with no visible interruption | `frontend/e2e/content-moderation-gate.spec.ts` | pending (same) |
| Clean comment on `/post/:id` composer publishes with no visible interruption | `frontend/e2e/content-moderation-gate.spec.ts` | pending (same) |

**Target surfaces confirmed by reading source (no route change, per `### SEO`'s finding too):**
- Feed composer: `frontend/src/features/feed/components/AnnouncementComposer.tsx`, mounted on `/feed`. Current selectors: `getByLabel("What's going on?")` (textarea), `getByRole('button', { name: 'Post', exact: true })` (submit). Errors currently surface via `serverError` → `<p role="alert">`.
- Comment composer: `frontend/src/features/feed/components/CommentForm.tsx`, mounted on `/post/:id` (`AnnouncementDetailPage`). Current selectors: `getByLabel('Add a comment')` (textarea), `getByRole('button', { name: 'Comment', exact: true })` (submit). Same `role="alert"` error-surfacing pattern.
- Auth/seed pattern already in `frontend/e2e/utils/login.ts` (`loginAs(page, email)` against dummy families from `backend/scripts/seed-dummy.ts`) — reusable as-is, no new fixture needed for login.

**Two dependencies to flag for backend-dev/frontend-dev before I can write real assertions (not inventable by e2e-test-writer):**
1. **Deterministic flagged/clean fixtures.** Live Claude classification is non-deterministic input→output for E2E purposes. `reply-coach`'s precedent (`backend/src/services/coach/claudeClient.ts`'s `MockClaudeClient`) solved this with exact-match canonical strings (e.g. `"At least you got to keep her for a while."` → fixture B). This feature needs the equivalent: at least one canonical string that reliably classifies as flagged and one that classifies as clean, stable across runs, so the Playwright specs aren't asserting against live-model variance.
2. **Flag visibility to the e2e environment.** Per AC, the gate is "gated behind a feature flag, defaulting off" (`reply_coach_enabled` precedent). The Playwright `webServer` in `frontend/playwright.config.ts` points at a real target Supabase project (no local backend to toggle env vars against per-test) — the flag needs to default **on** in whatever environment `npm run test:e2e` targets, or the flagged/clean specs can't exercise the gate at all. Same shape of dependency reply-coach's live SDK follow-up will eventually hit.

Will re-check and write real specs the moment `### Backend`/`### Frontend` land (still within this feature's building phase — tech-lead should re-spawn e2e-test-writer once those subsections are filled, rather than treating this `skipped` as terminal).

### Code review

**Summary.** No backend or frontend code exists on `feat/content-moderation-gate` at review time — the branch (and `origin/feat/content-moderation-gate`, confirmed via `git fetch` + `git rev-parse FETCH_HEAD`) contains only the `313cac1` vault-scaffold commit. Re-checked 4 times across this session (~08:3x–08:47) via `git log master..HEAD --oneline`, `git diff master...HEAD --stat`, and a fetch-vs-local comparison, with a fresh re-read of this file before each check; `### Backend` and `### Frontend` are still unfilled placeholders. e2e-test-writer independently hit and logged the same gap (two checks ~20min apart, per the log). This is the expected shape of the 2-level parallel-spawn model (`protocols/dispatch.md` §2 — code-reviewer is fanned out alongside backend-dev/frontend-dev, not strictly after them), not a failure by anyone. There is no diff to line-review. Rather than finalize a review against nothing, the rest of this entry pre-loads the risk areas this dispatch's review scope specifically named, so a fast, targeted re-review can happen the moment code lands.

**Must-fix**
None — no diff exists to contain one. (Not a claim that the feature is fine; see watch-list below for what still needs confirming against real code.)

**Nice-to-have**
None — same reason.

**Review-readiness watch-list (for the re-review once `### Backend`/`### Frontend` land)**

1. **Transient-persistence ordering — the sharpest risk in this feature.** Current pre-gate `backend/src/controllers/announcement.controller.ts` inserts synchronously with no gate at all (`createAnnouncement` L97–107, `createComment` L191–204: `db().prepare('INSERT ...').run(...)` runs immediately). A Claude classification call is `await`-based, and Node's single-threaded event loop interleaves *other* requests during an `await`. If the implementation inserts the row before awaiting the classifier and deletes it afterward on a flagged verdict, that's a real transient-visibility window (another request could read it mid-await) — not a style nit, a direct violation of this feature's own AC ("gate happens before the write, not a publish-then-takedown"). Note that `db().transaction()` (used in `auth.controller.ts`) would *not* protect against this either, since better-sqlite3 transactions are synchronous and can't span an `await`. **Check for:** the classifier call resolves to a non-flagged verdict strictly *before* the `INSERT` executes; no insert-then-conditionally-delete pattern anywhere on this path.
2. **Fail-open vs. fail-closed is an open question, not a locked decision.** The spec's `## Open questions` explicitly calls this "a real tradeoff, not a default to pick silently." If backend code lands having picked one (most likely fail-open, mirroring `coach.controller.ts`'s `SILENT_FALLBACK` shape), confirm the spec was updated (open question resolved / a decision recorded) to say which one and why. A silent pick with no spec update is a process gap for the tech-lead, not something to wave through as "matches reply-coach precedent" — the spec itself says not to default silently here.
3. **No-override guarantee.** Unlike `coach.controller.ts`'s advisory silent-fallback (200 + `verdict: 'ok'`, correct for reply-coach's dismissible nudge), a flagged verdict here must hard-block the write server-side with no bypass — no `?force=`-style param, no second-submit, no client-only check that a modified client could skip. Needs both a backend enforcement check and a frontend UX check once code exists.
4. **Ephemeral-input bar.** `coach.controller.ts`'s no-persistence argument is structural: the failure-path logger writes only `{ message }`, never `req.body`; `coach_events` has no free-text column at all. This feature should match that bar exactly — no log call on this path should touch post/comment content. `### Growth` (landed after this watch-list was drafted) specs a `moderation_gate_events` table for exactly this purpose, column-for-column no-content-ever by design — confirm the shipped migration matches that shape (no draft/reasoning/rewrite column snuck in) rather than a looser table.
5. **Feature-flag naming.** `### Growth` names the flag concretely: `content_moderation_gate_enabled` / env var `CONTENT_MODERATION_GATE_ENABLED` / `isContentModerationGateEnabled()` alongside `featureFlags.ts`'s existing `isReplyCoachEnabled()`/`isReplyCoachLiveEnabled()` (uncached `process.env.X === 'true'`, default-off-if-unset). Check the shipped flag matches this exact name — a drift here (e.g. a differently-cased or differently-worded flag) wouldn't break anything functionally but would break `grep`-ability across the three sibling gates, which `### Growth` explicitly calls out as the reason to hold the line on naming.
6. **Contract surface.** Once `### Backend` lands, cross-check any new endpoint's response shape against whatever Zod schema `### Frontend` consumes — standard contract-drift check, not yet possible with nothing committed.

**Acceptance criteria spot-check**
- [ ] Applies to both feed/announcement posts and comments on submit, before persisted/visible — no code to check.
- [ ] Classified against a defined violation-category taxonomy — no code to check; taxonomy is ux-writer's open call per spec.
- [ ] Flagged → clear non-punitive message, no override path — no code to check; see watch-list #3.
- [ ] Not flagged → silent, no visible interruption — no code to check.
- [ ] Flagged content never persisted/visible even transiently — no code to check; see watch-list #1 (highest-risk AC here).
- [ ] Classifier inputs/outputs not retained beyond operational necessity — no code to check; see watch-list #4.
- [ ] Gated behind a feature flag, default off — no code to check; see watch-list #5.

## Design — Spec

### Visual

**Scope note (read this first).** This is a retry after an account-wide rate-limit killed the first attempt before any output landed — `### Visual` was still the unfilled placeholder going in. In the interim, the parallel-spawn race meant `frontend-dev` built and wired a real `ModerationBlockNotice` component (`frontend/src/features/feed/components/ModerationBlockNotice/{ModerationBlockNotice.tsx,ModerationBlockNotice.test.tsx,index.ts}`, integrated into `AnnouncementComposer.tsx` and `CommentForm.tsx`) before this subsection — or `### Frontend` itself, still an unfilled placeholder as of this pass — existed. So this does two things instead of one: **(0)** a design review of the shipped component against `[[standards/design-system]]` tokens and `[[features/reply-coach]]`'s `CoachChip` precedent, and **(1)** the anatomy/token/state documentation the skill asks for, written retroactively to match what's actually built rather than proposed green-field. Net verdict up front: **endorse — no must-fix deviations.** Two should-fix polish items, one visual-confirmation flag, and two design-system.md doc-accuracy proposals below, none blocking.

#### 0. Design review — disposition: ENDORSE

Read `ModerationBlockNotice.tsx` (67 lines), its test (3 cases — assertive live region, no dismiss control, focus-on-mount, all exercising real behavior, not placeholders), and both integration sites (`AnnouncementComposer.tsx`, `CommentForm.tsx`) line by line against the token table and against `[[features/reply-coach]]`'s `### Visual` (the only prior "silent unless needed" precedent in this codebase).

**What's right, specifically:**

- **Silent-unless-needed, verified.** `{blocked && <ModerationBlockNotice ... />}` at both mount points (`AnnouncementComposer.tsx:75`, `CommentForm.tsx:70`) — `blocked` starts `false` and only ever flips `true` inside the mutation's `onError` branch when `getModerationBlock(err)` matches. On the clean-content path the component never mounts, not even a zero-height placeholder. Matches the Acceptance Criteria's "silent on clean content, matching reply-coach's proven pattern" exactly, and matches `CoachChip`'s `verdict === 'ok'` → render-nothing rule structurally (a real conditional mount, not a CSS visibility toggle — see the repeat-attempt point below for why that distinction matters).
- **Every token used resolves to an existing entry; none invented.** `bg-surface-card`, `border-feedback-warning`, `shadow-lift`, `rounded-lg` (`radius.16`), `text-ink-lead`, `text-ink-muted`, `text-feedback-warning`, `focus-visible:ring-brand-primary` all trace to `tailwind.config.js` entries that mirror `[[standards/design-system]]`'s table byte-for-byte. The only literal color in the whole file is `currentColor`, inherited from the shared icon `baseProps`, not authored here.
- **Deliberate, justified escalation over `CoachChip`'s posture — not an inconsistency.** `role="alert"` (implicit assertive live region) plus moving focus to the notice on mount is a real escalation over `CoachChip`'s `aria-live="polite"` treatment (`[[features/reply-coach]]` `### Accessibility` §2: "Avoid `aria-live='assertive'` — the coach is advisory and must not interrupt"). That reasoning runs in reverse here: this gate is *not* advisory — the feature's own `## Problem` statement calls it "a firm gate, not a suggestion," with no dismiss path. Escalating to assertive + focus-move is the correct call, and the component's own doc comment (`ModerationBlockNotice.tsx:28-41`) states this reasoning explicitly rather than leaving it implicit. (One small attribution nuance on this — see the a11y-auditor note in §7.)
- **No override control, confirmed by both source and test.** `queryByRole('button')` is asserted absent. Matches "no override/'post anyway' path" in the Acceptance Criteria and is the one place this component *must* diverge from `CoachChip`'s three-button action row — it does, by omission rather than a disabled/greyed-out button (a disabled button would have implied a reachable-but-blocked action; there is none).
- **Icon choice reuses, doesn't reinvent.** `ShieldIcon` (`frontend/src/components/icons.tsx:202`) already exists in the shared icon set (also used for the admin nav link in `Navbar.tsx`) — same protective/shield metaphor, no new icon asset. It's `aria-hidden` via the shared `baseProps`, so it's decorative reinforcement only; heading + body text carry 100% of the accessible message, same division of labor as `CoachChip`.
- **Focus-ring convention matches what's already shipped, not a one-off pick.** `focus-visible:ring-2 focus-visible:ring-brand-primary` is the exact recipe already used in `Navbar.tsx:139,180`, `FamilyView.tsx:132`, `TimePicker.tsx:44`, and `SlotForm.tsx:81,144`. `CoachChip`'s spec (`[[features/reply-coach]]` `### Visual` §5.4) explicitly flagged "no `color.focus.ring` token exists" and deferred it to a11y-auditor's future cross-platform pass — that pass evidently landed as a consistent shipped convention (5 sites, one recipe) without ever being promoted into the token table. See proposal in §6.
- **Alert-card-on-card precedent already exists, near byte-for-byte.** `AdminPage/MessagesView.tsx:68-73`'s "You are viewing a private conversation…" notice uses `role="alert"` + `rounded-lg border border-feedback-warning bg-surface-card p-3 ... shadow-lift` — the same recipe `ModerationBlockNotice` uses. This isn't a copy of a spec; it's independent consistency with an existing shipped pattern, which is the strongest form of token conformance available short of a written rule. §6 covers the doc-accuracy gap this reveals.
- **Draft preserved; notice clears itself on the next attempt.** Not this component's own code, but directly relevant to whether the gate *feels* non-punitive per the Acceptance Criteria: both composers skip `reset()` on a moderation block (textarea keeps the author's words) and flip `setBlocked(false)` at the top of the next submit attempt (`AnnouncementComposer.tsx:52-53`, `CommentForm.tsx:52-53`) — before the network round-trip even starts. Because `{blocked && <Notice/>}` is a real conditional mount, each fresh block is a genuine unmount→remount, which correctly re-fires the mount-time focus effect and re-triggers the `role="alert"` announcement on a second flagged attempt, not just the first. Worth confirming for the record since a persisted-instance-plus-visibility-flag approach would have silently broken this.

No must-fix deviations found. The items in §5 are calibrated below that bar on purpose — not inflating severity to have something to report.

#### 1. Component anatomy — `ModerationBlockNotice` (documented for the record; matches shipped code)

```
┌─ notice.root — <div role="alert" tabIndex={-1}>, focus-on-mount ───────┐
│  🛡  Let's revise this before posting                                   │  ← notice.icon + notice.heading
│      This doesn't look like it fits our community guidelines yet.      │  ← notice.body
│      Take another look and try again — nothing here has been posted   │
│      or shared with anyone.                                            │
└──────────────────────────────────────────────────────────────────────┘
```

| Part | Element | Notes |
|---|---|---|
| `notice.root` | `<div role="alert" tabIndex={-1}>` | Implicit assertive live region. Not in natural tab order (`tabIndex={-1}`); reachable only via the `ref.current?.focus()` mount effect. Only element in the component with a focus-visible treatment. |
| `notice.icon` | `<ShieldIcon aria-hidden>` | Decorative reinforcement; contributes no accessible name. `mt-0.5` baseline nudge — see §5.1. |
| `notice.textGroup` | `<div className="text-sm">` | Sets the shared type size for heading + body; no independent tokens of its own. |
| `notice.heading` | `<p>` | `font-semibold` + `color.ink.lead`. Deliberately a `<p>`, not a real `<h*>` — matches `CoachChip.rewrite`'s precedent of carrying emphasis by weight, not by a heading element, so a transient alert doesn't pollute screen-reader heading navigation. |
| `notice.body` | `<p>` | `color.ink.muted`, default (400) weight. Wraps freely, no clamp/truncate. `mt-0.5` gap from heading — see §5.1. |

No dismiss, accept, edit, or "why?" control exists anywhere in the anatomy — confirmed against the component's own test, not just the source. This is the one place the anatomy *must* differ from `CoachChip`'s four-control row, and it does, correctly.

#### 2. Token references

| Property | Token | Source |
|---|---|---|
| Background | `color.surface.card` | `ModerationBlockNotice.tsx:56` |
| Border (1px) | `color.feedback.warning` | `:56` — signals "needs attention before this can go out," distinct from `color.feedback.error`'s codebase-wide "something failed" usage (form validation, delete/decline, unread badges — confirmed by grepping every other `feedback-error` site in `frontend/src`) |
| Icon fill | `color.feedback.warning` | `:60` — non-text graphical object; WCAG 1.4.11 (≥3:1) applies, not 1.4.3. `#D27A2A` on `#FFFFFF` ≈ 3.2:1 — passes. |
| Elevation | `shadow.lift` | `:56` — the only shadow token in the system |
| Radius | `radius.16` (`rounded-lg`) | `:56` |
| Padding | `space.12` (`p-3`), all sides | `:56` |
| Icon↔text gap | `space.8` (`gap-2`) | `:56` |
| Heading | `color.ink.lead` + Nunito 600 (`font-semibold`) | `:62` — "weight, not size, carries hierarchy" |
| Body | `color.ink.muted` + Nunito 400 (default) | `:63` — secondary text, used sparingly per charter, appropriate for one supporting sentence |
| Focus ring | `color.brand.primary`, `ring-2`, `focus-visible` only | `:56` — matches the 5-site shipped convention, see §6 |
| Composer gap (`AnnouncementComposer` mount) | `space.4` (`mt-1`) | `AnnouncementComposer.tsx:75` |
| Composer gap (`CommentForm` mount) | `space.8` (inherited `space-y-2`) | `CommentForm.tsx:56,70` — no override needed |

Both `mt-0.5` instances inside the component (icon baseline nudge, heading→body gap) are **not** on this list — they're off the `4/8/12/16/…` scale. See §5.1.

#### 3. Cross-check against `[[features/reply-coach]]`'s `CoachChip` — "silent unless needed"

| Dimension | `CoachChip` (advisory) | `ModerationBlockNotice` (firm gate) | Consistent? |
|---|---|---|---|
| Renders on clean content | Nothing | Nothing | Yes |
| Card surface tokens | `surface.card` / `radius.16` / `shadow.lift` | Same three | Yes |
| Type tokens | `ink.lead` (primary) / `ink.muted` (secondary), weight-not-size | Same | Yes |
| Disabled state | None in v1 (absent, not greyed) | None (absent, not greyed) | Yes |
| Loading state | None — chip simply isn't there yet | None — composer's existing "Posting…" submit-button label already covers the wait | Yes |
| Live-region assertiveness | `aria-live="polite"` (recommended) — advisory, must not interrupt | `role="alert"` (assertive) + focus-move | **Deliberately escalated**, correctly — see §0 |
| Dismiss / accept / edit controls | Three controls + a "why?" toggle | None | **Deliberately fewer**, correctly — no override exists |
| Padding | `space.16` | `space.12` | Reasonable — single-message inline notice, not a multi-control card; not a token violation either way |

Two rows diverge; both divergences are named, reasoned, and match the Acceptance Criteria rather than contradicting the precedent.

#### 4. States

| State | Behavior | Note |
|---|---|---|
| default (clean) | Not rendered | The "silent" state — no skeleton, no reserved space |
| default (flagged, first appearance) | Full anatomy renders; focus moves to `notice.root`; `role="alert"` announces heading + body once | |
| hover | N/A | No interactive elements inside the notice (confirmed by test); the notice itself isn't a hover target |
| focus | `notice.root` only, via mount effect; `focus-visible:ring-2 ring-brand-primary` | No child is focusable — nothing else to spec |
| disabled | N/A | Nothing to disable; there is no control, by design (no override path) |
| loading | N/A on this component | Classification happens inside the same request the submit button's existing "Posting…" label already covers; no separate affordance needed — same disposition as `CoachChip`'s "no loading state on the chip" |
| empty | N/A | The absence of the notice *is* the empty/clean state |
| error (classifier/network failure) | **Not this component** | A classifier outage is a different, pre-existing surface: `getModerationBlock()` (`api/announcements.ts:107`) only matches the `content_flagged` shape; anything else falls through to the existing generic `serverError` `<p role="alert">` path already in both composers. Flagging the boundary explicitly so a11y-auditor and qa-engineer don't audit this component for a state it was never meant to own — that path is also where Open Question #2 (fail-open/fail-closed) will land once resolved. |
| flagged, repeat attempt | Unmounts then remounts (not a visibility toggle) | Re-fires the mount-time focus effect and the `role="alert"` announcement on every new blocked submission, including a second consecutive one — verified by reading the state flow in both composers (see §0) |

#### 5. Should-fix / visual-confirmation items — none blocking

1. **`mt-0.5` (2px) used twice.** `ModerationBlockNotice.tsx:60` (icon baseline nudge) and `:63` (heading→body gap). `[[standards/design-system]]`'s Space tokens are explicit: "`4/8/12/16/24/32/48/64/96` px. No half-units. No magic numbers." 2px is off that scale. **Fix:** swap both to `mt-1` (`space.4`) — a 2px visual delta, imperceptible, but keeps the file on-scale. For the record, not an excuse: the same sub-scale (2px) spacing drift already exists in two other, unrelated places (`Home.tsx:53`'s `mt-0.5`, `Navbar.tsx:126,236`'s `gap-0.5`) — pre-existing, not introduced here. Not fixing those two in this pass (out of this feature's scope); that's the design charter's own sanity-sweep's job ("grep `frontend/src` for hex/scale drift").
2. **Card-on-card, same fill, at both mount points.** `ModerationBlockNotice`'s `bg-surface-card` sits directly inside an ancestor that is *also* `bg-surface-card` — `AnnouncementComposer.tsx:61`'s `<form>` and `AnnouncementDetail.tsx:61`'s `<article>` (which wraps `CommentForm`). Both tokens are individually correct — nothing to rename — but the only differentiator between the two same-fill surfaces is the 1px amber border plus the notice's own (deliberately light, per charter, "never heavy") `shadow.lift`. This is a legitimate bordered-callout pattern, and the subtlety arguably reinforces the "non-punitive," unshouty tone the feature explicitly asks for — but it's a visual judgment call source-reading alone can't fully settle. Flagging as **worth a real render check** before ship (the repo already requires before/after screenshots for any UI-touching PR per `engineering-standards.md`); if it reads too faint in practice, the cheapest fallback is a faint tint (e.g. `bg-feedback-warning/5`) rather than a new token.
3. **Spec-hygiene note, not a component issue.** `### Frontend` above is still the unfilled placeholder even though the code it should describe already exists and is exactly what this review was performed against. Not mine to fill; noting it so the aggregation pass doesn't read the placeholder as "nothing built."

#### 6. Two design-system.md doc-accuracy proposals (table corrections, not new tokens — design-lead to promote)

1. **Ratify `color.focus.ring` = `color.brand.primary`, applied as Tailwind `ring-2`, `focus-visible` only (never plain `:focus`).** `[[features/reply-coach]]`'s `### Visual` §5.4 flagged "no `color.focus.ring` token exists" and deferred it to a11y-auditor's future cross-platform pass. That pass evidently happened in practice — the exact recipe is already shipped identically in five places (`Navbar.tsx:139,180`, `FamilyView.tsx:132`, `TimePicker.tsx:44`, `SlotForm.tsx:81,144`) plus now `ModerationBlockNotice.tsx:56` — but was never promoted into the token table, so the next IC has to re-derive it from grep instead of reading it. Proposing the table entry now that the evidence is unambiguous.
2. **Broaden `color.feedback.warning`'s `Use` column beyond "toasts."** Three shipped surfaces already use it as an inline alert/notice border+text or a pending-emphasis label, not a toast: `AdminPage/MessagesView.tsx:70` (private-conversation notice), `PlaydatesPage.tsx:298` ("Needs your response" label), and now `ModerationBlockNotice.tsx:56,60`. None of these are misuse — the color is applied correctly and consistently — the table just undersells its actual scope. Proposing: "toasts, inline alert/notice cards, pending-emphasis labels."

Neither proposal changes a value or introduces a new hex — both are table-accuracy corrections surfaced here per `[[standards/design-system]]`'s ownership rule ("ui-designer proposes... design-lead promotes").

#### 7. Handoff

- **ux-writer:** `MODERATION_BLOCK_COPY` (`ModerationBlockNotice.tsx:17-20`) is explicitly marked placeholder pending your string table (naming already anticipates `coach.suggest.preface`-style keys). The anatomy in §1 is written against generic `notice.heading` / `notice.body` slots, not the placeholder strings themselves, so your landed copy drops in without touching this section — just confirm the two-sentence body still wraps as one paragraph with no clamp (§1 assumes that). Category metadata is deliberately never surfaced (`categories` is accepted but unused in `api/announcements.ts`'s `ModerationBlockedPayload` type) — matches `CoachChip`'s "category metadata is for backend/analytics only" voice rule; flag it if your taxonomy work assumes otherwise.
- **a11y-auditor:** §0, §3, and §4 above are written with your audit in mind — the assertive-vs-polite escalation reasoning, focus-management verification (including the repeat-attempt remount behavior), and the explicit "this is not the classifier-failure state" boundary are pre-loaded so you're auditing against stated intent rather than reverse-engineering it. One attribution nuance to resolve as your own finding rather than inherit: the component's doc comment (`ModerationBlockNotice.tsx:35`, "per a11y-auditor's ask") credits this role for the assertive-vs-polite decision, but `### Accessibility` on this feature is still unfilled — nothing's actually been asked of you yet on this specific feature. I independently re-derived and endorsed the same reasoning by analogy from `[[features/reply-coach]]` `### Accessibility` §2 in §0 above, so the decision holds up either way; just ratify it as your own audit finding rather than let the citation stand unearned. The two proposals in §6 are yours to weigh in on too, especially #1 (focus ring) since it's squarely your territory.

### Microcopy

**Resolves Open Question #3.** Final taxonomy, blocking-message copy per category, rewrite-prompt copy, and supporting labels below. Category list is stated plainly up top for backend-dev, since it's a coordination dependency (technical `category` values should mirror these slugs verbatim — see §5).

**Precedent check, done before writing anything (not assumed).** The task pointed at [[features/moderation-report-block]]'s `### Microcopy` for "the report-category precedent." Read it fresh: it is still the unfilled scaffold placeholder (`*(filled by ux-writer)*`), and that feature's own frontmatter is `status: drafting`. A repo-wide grep for `report|category|block` across `frontend/src` and `backend/src` turns up nothing for that feature either — no report UI, no category strings, no backend routes — despite this branch's recent commit messages (`182e6f6`, `435ca75`) claiming "report + block UI" and "design/microcopy specs" landed. Whatever those commits actually touched, it isn't reflected in the vault file or the source tree as read directly. I'm not fabricating a precedent that doesn't exist. Instead I mirrored the *design principle* [[features/moderation-report-block]]'s own Acceptance Criteria states explicitly ("Report categories are short and foster-family-appropriate — not generic 'spam / abuse / other'") and pulled real, verified precedent from [[features/reply-coach]]'s shipped `### Microcopy` (Part 1's voice-rule table, and the rule that category metadata is backend/analytics-only, never named verbatim in a user-facing string) — that file's status is `review` with real shipped code behind it, confirmed by reading it directly.

#### 1. Final taxonomy

Seven categories, not six. Growth's working list (harassment, hate speech, threats/violence, spam, doxxing/PII, illegal content — six) is confirmed and kept as-is for those six; I'm deliberately adding a seventh, **explicit-content**, and flagging that addition loudly rather than folding it in quietly:

- None of the existing six cleanly cover ordinary sexual/explicit material (as distinct from the most extreme illegal case, which `illegal-content` already catches).
- Anthropic's content-moderation-guide category structure this feature's Problem section points to includes sexual/explicit content as a standard category in essentially every general-purpose taxonomy of this shape.
- This platform has an elevated child-safety stake most platforms don't: family/child profiles and posts are the core content type. That's a foster-family-specific reason to hold this line explicitly rather than skip it.
- Growth's own schema note makes this safe to add: `moderation_gate_events.category` is `TEXT`, nullable, **no `CHECK` constraint**, specifically "so the taxonomy can land or change without a migration." This is exactly the case that clause anticipated.

If design-lead or tech-lead wants to cut it, that's a one-line removal from the tables below — nothing downstream depends on exactly seven.

| Slug (verbatim, for backend) | User-facing label (short) | Internal definition (not shown to the author) |
|---|---|---|
| `harassment` | Targeting a person | Attacks, demeans, or targets a specific person or family, rather than describing the author's own experience. |
| `hate-speech` | Language about a group | Demeans people based on group identity — race, religion, ethnicity, disability, sexual orientation, national origin — rather than an individual dispute. |
| `threats-violence` | Talk of harming someone | Threatens or describes harming a person, family, or child, including figurative/"joking" threats. |
| `spam` | Repeated or promotional content | Bulk, promotional, or off-topic content not meant for genuine community participation. |
| `doxxing-pii` | Sharing private details | Exposes another person's identifying or contact information without consent, including a child-in-care's identifying details. |
| `illegal-content` | Content that may be against the law | Describes or promotes activity that is illegal (e.g. regulated goods, non-consensual imagery). |
| `explicit-content` | Sexual or explicit content | Sexual or explicit material not appropriate for a family caregiving community, including any content sexualizing minors. **(Addition beyond growth's working list — see rationale above.)** |

Slugs are kebab-case, matching the real shipped precedent in `backend/src/services/coach/claudeClient.ts` (`categories: ['savior-framing']`) rather than inventing a new casing convention. Categories are not designed to be mutually exclusive (e.g. the worst `illegal-content` cases may also be `explicit-content`) — the taxonomy exists to pick a helpful message and to bucket analytics, not to run a formal single-label classifier.

No DM-specific category or copy is drafted. DM coverage is still Open Question #1, tentatively out of scope; if it resolves to "yes," this same taxonomy and string table extend to that surface without new categories — flagging that as a likely small follow-up, not a redesign.

#### 2. Voice decision: category is never named verbatim to the author

Mirrors [[features/reply-coach]]'s Part 1 rule #3 ("Rewrite carries the message; category label stays hidden... Category metadata is for backend/analytics only, never surfaced in a user-facing string"), adapted to this feature's shape: unlike reply-coach's single generic advisory chip, this gate's blocking message **does** vary by category (per Acceptance Criteria and this feature's own task framing — a specific, actionable message beats one generic fallback, per [[features/moderation-report-block]]'s "not generic 'spam/abuse/other'" principle). What carries over from reply-coach is narrower but still real: the literal category word (`harassment`, `hate speech`, `doxxing`, etc.) never appears in the string shown to the author. Each category gets distinct, descriptive, non-clinical copy instead — different content, same non-accusatory register, so a false positive doesn't feel like being formally labeled something ugly. `ModerationBlockNotice.tsx`'s existing placeholder already independently arrived at this same principle ("Deliberately does NOT name a violation category to the author") — confirming, not overriding it.

Every sentence below is written with "This" (the content) as the subject, never "You" — keeps the message about the draft, not an accusation of the person, on the theory that a support-community member who gets flagged in error shouldn't feel accused.

#### 3. Composition worksheet (not consumed directly — see §4 for the actual strings)

Each category's blocking body is two sentences: **explanation** (why this reads as a problem) + **rewrite-prompt** (what to try instead), followed by a shared reassurance clause repeated verbatim in every entry (there is deliberately no runtime string-concatenation in the component — each `body.*` value in §4 is the fully-composed final string). Documented separately here so a future edit to just the "why" or just the "try this" half doesn't require re-deriving the whole sentence:

| Category | Explanation | Rewrite-prompt |
|---|---|---|
| `harassment` | This reads like it's about a specific person rather than your own experience. | Try telling it from your side of things instead. |
| `hate-speech` | This includes language that puts people down for who they are — their race, religion, or background, for example. | Try describing what happened without generalizing about a group. |
| `threats-violence` | This describes hurting someone, even if you didn't mean it that way. | Try leaving out language about harming anyone. |
| `spam` | This looks like repeated or promotional content rather than something for the community. | Try sharing something specific to your family instead. |
| `doxxing-pii` | This includes details that could identify someone who hasn't agreed to share them here — a name, address, or contact information, for example. | Try leaving those details out, especially about a child in care. |
| `illegal-content` | This may describe something that isn't allowed under the law. | Try rewriting it without that detail. |
| `explicit-content` | This includes sexual or explicit content, which isn't a fit for this community. | Try rewriting it without that detail. |
| `default` (fallback) | This doesn't look like it fits our community guidelines yet. | Take another look and try again. |

Shared reassurance clause, appended to every row above: **"— nothing here has been posted or shared with anyone."** Directly reinforces the Acceptance Criterion that flagged content is never persisted or visible, even transiently — this is load-bearing, not filler, keep it in every variant. If this clause is ever edited, it must be updated identically across all eight `body.*` entries in §4 below.

#### 4. String table (canonical — these are the exact strings to ship)

| key | string |
|---|---|
| `moderationGate.blocked.heading` | Let's revise this before posting |
| `moderationGate.blocked.body.harassment` | This reads like it's about a specific person rather than your own experience. Try telling it from your side of things instead — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.hate-speech` | This includes language that puts people down for who they are — their race, religion, or background, for example. Try describing what happened without generalizing about a group — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.threats-violence` | This describes hurting someone, even if you didn't mean it that way. Try leaving out language about harming anyone — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.spam` | This looks like repeated or promotional content rather than something for the community. Try sharing something specific to your family instead — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.doxxing-pii` | This includes details that could identify someone who hasn't agreed to share them here — a name, address, or contact information, for example. Try leaving those details out, especially about a child in care — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.illegal-content` | This may describe something that isn't allowed under the law. Try rewriting it without that detail — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.explicit-content` | This includes sexual or explicit content, which isn't a fit for this community. Try rewriting it without that detail — nothing here has been posted or shared with anyone. |
| `moderationGate.blocked.body.default` | This doesn't look like it fits our community guidelines yet. Take another look and try again — nothing here has been posted or shared with anyone. |
| `moderationGate.category.label.harassment` | Targeting a person |
| `moderationGate.category.label.hate-speech` | Language about a group |
| `moderationGate.category.label.threats-violence` | Talk of harming someone |
| `moderationGate.category.label.spam` | Repeated or promotional content |
| `moderationGate.category.label.doxxing-pii` | Sharing private details |
| `moderationGate.category.label.illegal-content` | Content that may be against the law |
| `moderationGate.category.label.explicit-content` | Sexual or explicit content |

`moderationGate.category.label.*` is not currently wired to render anywhere in the shipped component (per §2, the category is never printed in the blocking notice) — these exist for `### Growth`'s category-breakdown dashboard read-outs and for any future "why was this flagged?" expand affordance, so a human-readable name exists the moment one is needed without a fresh ux-writer round-trip. `moderationGate.blocked.body.default` is the exact text of the pre-existing placeholder in `ModerationBlockNotice.tsx` — reused deliberately as the graceful-degradation fallback for a null/unrecognized `category` (e.g. a classification error under a fail-closed policy, if Open Question #2 resolves that way) rather than discarded.

**Voice-rule self-check** (against `[[standards/design-system]]` Voice & Tone + the `microcopy-voice` skill's `voice-rules.md`): plural "we" implied throughout ("our community guidelines"), never "I" — pass. Active voice, short-to-medium sentences, one main clause each — pass. No exclamation marks anywhere — pass (there's no CTA in this component per its no-override design, so the CTA exception doesn't apply). No emoji — pass. Warm, not saccharine, not moralizing (no "valid," "journey," or therapy-speak, matching reply-coach's banned-phrasing rule even though that rule was written for a different feature) — pass. Category never named verbatim — pass, confirmed by re-reading every string above for the literal words "harassment," "hate," "threat," "spam," "dox," "illegal," "sexual/explicit" — none appear outside the taxonomy table in §1, which is developer/analytics-facing, not rendered in-product.

#### 5. For backend-dev — the technical contract this copy assumes

Stated plainly per the coordination ask: the seven `category` slugs in §1's left column (`harassment`, `hate-speech`, `threats-violence`, `spam`, `doxxing-pii`, `illegal-content`, `explicit-content`) are the canonical values I need threaded through as the classifier's output and into `moderation_gate_events.category` — mirroring the precedent in [[features/reply-coach]], where backend's `claudeClient.ts` fixtures mirror ux-writer's Microcopy strings byte-for-byte rather than the reverse. I expect (not dictate — this is your contract to build, I'm only naming what the copy above needs) a single nullable `category: string | null` field on whatever response shape the gate returns to the frontend, singular rather than reply-coach's plural `categories: string[]` — this gate produces one hard verdict per submission, not a list of simultaneous advisory nudges. `null` is the correct value both for `verdict: 'ok'` and for any blocked-without-a-resolved-category edge case (timeout under fail-closed, if Open Question #2 lands there) — the frontend's `default` string in §4 covers that gap so nothing renders blank.

#### 6. Handoff to frontend-dev — exact change needed in the already-built component

Read `frontend/src/features/feed/components/ModerationBlockNotice/ModerationBlockNotice.tsx` directly before writing this. Today `MODERATION_BLOCK_COPY` is `{ heading: string, body: string }` — flat, one variant, explicitly marked PLACEHOLDER with an instruction to "swap verbatim, don't paraphrase." Swap-in shape:

```ts
export const MODERATION_GATE_CATEGORIES = [
  'harassment', 'hate-speech', 'threats-violence', 'spam', 'doxxing-pii', 'illegal-content', 'explicit-content',
] as const;
export type ModerationGateCategory = typeof MODERATION_GATE_CATEGORIES[number];

export const MODERATION_BLOCK_COPY = {
  heading: "Let's revise this before posting",
  body: {
    harassment: "…",
    'hate-speech': "…",
    'threats-violence': "…",
    spam: "…",
    'doxxing-pii': "…",
    'illegal-content': "…",
    'explicit-content': "…",
    default: "…",
  },
} as const;
```

(Full strings are §4 above, byte-for-byte — literally copy them in, do not paraphrase, per the component's own existing instruction to itself.)

- `ModerationBlockNoticeProps` needs one new field: `category?: ModerationGateCategory | null`.
- Render logic: resolve `body` as `MODERATION_BLOCK_COPY.body[category ?? 'default']` — guard against an unrecognized/future string too (`?? MODERATION_BLOCK_COPY.body.default` as a second fallback), so a taxonomy drift between backend and frontend degrades to the generic message instead of rendering `undefined`.
- `heading` stays a flat string — unchanged, no branching needed there.
- **This breaks an existing test, on purpose, and it's not mine to fix (outside `### Microcopy` writer-ownership):** `ModerationBlockNotice.test.tsx` currently does `expect(notice).toHaveTextContent(MODERATION_BLOCK_COPY.body)` — that stops compiling once `.body` is an object, not a string. The fix is straightforward (render with a `category` prop and assert against `MODERATION_BLOCK_COPY.body[<that category>]`, plus one new case for the `default`/no-category fallback) but it's frontend-dev's or qa-engineer's file to touch, not mine. Flagging it here so it isn't a surprise red build in the next wave.

#### 7. Not drafted this pass

- No DM-specific copy (see §1) — Open Question #1 unresolved, Out of scope for now.
- No override/"post anyway" copy — the Acceptance Criteria are explicit that no such path exists; nothing above implies one.
- No admin-queue/report-detail copy — Out of scope per this feature's own scaffold ("mirrors moderation-report-block's 'admin tool is out of scope' precedent").
- No public community-guidelines page copy — `### SEO` already declined to mint that page this pass pending this exact taxonomy; now that the taxonomy exists, that page is unblocked for a future dispatch, but writing its copy here would be scope creep beyond `### Microcopy`'s brief for *this* feature.

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy

**Scope note.** This is a pre-ship draft, matching [[features/reply-coach-live]]'s precedent: launch copy is written now, during `building`, so voice work isn't a bottleneck once the feature is ready — but nothing below is published anywhere yet. The feature is default-off behind its own flag (per `## Acceptance criteria`), and several open questions in the feature file are still unresolved — DM coverage, fail-open vs. fail-closed on classifier timeout, and, most relevant here, the exact violation-category taxonomy and in-app rewrite-prompt copy, which is ux-writer's call in `### Microcopy`, not mine. The "what a flagged author sees" line below is a release-note-level gloss on the *experience* (a firm, non-punitive ask to revise, no override) for internal/changelog use — it is not the in-app string itself, and should not be quoted as such. Re-check this draft against ux-writer's actual taxonomy and against `### SEO`'s finding (no public page proposed this pass) before any of it is used publicly.

**Internal release note** (≤ 80 words)

We've added a quiet check that runs before a post or comment publishes, catching the narrow band of real violations — harassment, threats, doxxing, spam — before anyone ever sees them, instead of relying on someone reporting it afterward. If something's flagged, the author gets a plain, non-punitive note asking them to revise before it can go out; there's no "post anyway." Everything else publishes exactly as it does today. Flagged drafts are never stored or shown to anyone else.

**Internal Slack/standup line** (short-form, not public)

Content Moderation Gate: write-time Claude-classifier check on feed posts + comments, catching harassment/threats/doxxing/spam before publish — no override if flagged, silent if clean. Feature-flagged off by default. Deliberately separate from [[features/reply-coach]] (which stays a soft, dismissible tone nudge) — this is a firm gate for the narrower, more severe band. DM coverage, fail-open/closed behavior, and final taxonomy still open.

**Not done in this pass**

- No social post, email subject/line, or landing-page block — no email touchpoint exists for this feature, and per `### SEO`'s finding there's no public page or public rollout to announce yet. The microcopy-voice skill's landing-block guidance ("only for features significant enough to warrant a landing update") doesn't apply until the flag is live and the open questions above resolve.
- No public help-center or community-guidelines copy drafted, for the same reason `### SEO` gave for not minting a page this pass: writing around a taxonomy that's still ux-writer's open call risks drifting from what actually ships.
- No exact in-app "please revise" string is asserted anywhere above — that string belongs to ux-writer's `### Microcopy`, written independently of this subsection.

### SEO

**Applicability finding: N/A — no new public page/route.** This subsection documents the reasoning rather than forcing meta/OG/schema/sitemap artifacts that don't apply, per role convention ("Public pages only").

#### 1. Surface audit

Per `## Acceptance criteria`, this feature "applies to both feed/announcement posts and comments on submit" — i.e. it inserts a classification gate into the existing composer submit paths on:

- `/feed` (`frontend/src/pages/Feed.tsx`) — announcement composer
- `/post/:id` (`frontend/src/pages/AnnouncementDetail.tsx`) — comment composer

Both routes are confirmed in `frontend/src/App.tsx` to already be wrapped in `<RequireAuth>`:

```
<Route path="/feed" element={<RequireAuth><FeedPage /></RequireAuth>} />
<Route path="/post/:id" element={<RequireAuth><AnnouncementDetailPage /></RequireAuth>} />
```

No new route, page component, or URL is added. The feature adds a write-time check (classify → block-with-revise or silently proceed) inside forms that already exist on already-authenticated pages. There is no new content, template, or component surfaced to unauthenticated visitors or search crawlers.

Cross-checked against `## Out of scope`: no admin review queue (which would at least be an authenticated internal page, but explicitly excluded), no DM coverage (tentative, and DMs are `/messages/*`, also `RequireAuth`-gated in the current router even if this were in scope), and no change to already-published-content pages. Nothing in scope or in the open questions implies a new indexable surface.

#### 2. Meta / OG / Twitter / schema.org / sitemap

Not produced — none apply. `title`, `meta.description`, `og.*`, `twitter.*`, `schema`, and `sitemap` are all N/A for this feature. There is no canonical URL to mint because there is no page.

#### 3. Authenticated-views flag (role convention: "Authenticated views are noindex by default")

`/feed` and `/post/:id` were already authenticated, pre-existing routes before this feature and remain so. This feature does not change their auth posture, indexability, or robots directives — whatever `noindex`/robots convention the frontend already applies to `RequireAuth`-wrapped pages (per `[[standards/marketing-standards]]` "Authenticated views are noindex unless flagged otherwise") continues unmodified. If the backend classification call lives behind a dedicated endpoint (e.g. `POST /api/posts/:id/moderate` or similar, per the open technical-seam question in the feature body), that endpoint is API-only (JSON, session-gated) and should inherit the same `noindex`/`X-Robots-Tag` posture as other authenticated `/api/**` routes — flagging this for `backend-dev`/`code-reviewer` to confirm at implementation time, consistent with the precedent set in [[features/reply-coach]]'s SEO subsection for its sibling endpoint `POST /api/comments/coach`.

#### 4. Considered and rejected: a public trust/transparency page

[[features/reply-coach]]'s SEO subsection proposed a future `/help/reply-coach` explainer page because that feature is a positive, publicizable trust signal. This feature is a moderation/safety gate, which is arguably also publicizable ("we proactively screen for harassment and hate speech before it's ever posted"). I considered proposing an analogous `/help/community-guidelines` or `/help/content-moderation` page here.

**Rejected for this dispatch** — not because the idea has no merit, but because:
- It is not named anywhere in this feature's `## Problem`, `## Acceptance criteria`, or `## Out of scope` — proposing it here would be forcing an artifact onto a spec that doesn't ask for one, which the role brief explicitly warns against.
- The final violation-category taxonomy is an **open question** owned by `ux-writer`, not yet resolved. Any public-facing copy describing "what gets flagged" would need to wait on that taxonomy anyway, so drafting page metadata now would be premature and likely to drift.
- No existing route or page (`/help/*`, `/about/*`, or otherwise) currently exists in `frontend/src/pages/` for community guidelines — confirmed via repo search — so this would be new scope, not a refinement of something already planned.

If a public trust page is wanted later, it belongs in its own feature file (per `CLAUDE.md`: "No TODOs without a feature file"), not bootstrapped inside this one's SEO subsection.

#### 5. Frontend SEO wiring (Phase 3+)

None required for this feature. No `react-helmet-async` block to add — the composer components this gate touches are sub-components of already-`noindex` authenticated pages.

### Growth

**Naming note (surfaced, not silently resolved).** `.claude/agents/marketing/growth-analyst.md`'s general convention is kebab-case flags (`ff-user-profile-v2`). This feature's own Acceptance criteria names a different, already-doubly-precedented pattern instead: `reply_coach_enabled` / `reply_coach_live_enabled` — snake_case, `<name>_enabled`, backend env-var-backed. Following the feature spec's explicit instruction over the generic role convention here: the codebase precedent wins, because it's the pattern the two shipped/building features closest to this one (`reply-coach`, `reply-coach-live`) already use for this exact kind of backend gate, and introducing a third naming scheme would make flag-checks harder to `grep` for, not easier.

**For backend-dev — read this first, even if you finish before this subsection exists:**
- **Flag:** `content_moderation_gate_enabled` (env var `CONTENT_MODERATION_GATE_ENABLED`, boolean string — same read pattern as `featureFlags.ts`'s `isReplyCoachEnabled()` / `isReplyCoachLiveEnabled()`; add `isContentModerationGateEnabled()` alongside them). Defaults off, per Acceptance criteria.
- **Aggregate table:** `moderation_gate_events` — full schema in §5 below. No raw content, no classifier reasoning text, ever, matching the "classifier inputs/outputs are not retained" acceptance criterion.

#### 1. Primary metric — gate republish rate

```
gate_republish_rate = republished / (republished + abandoned)
```

Computed over `moderation_gate_events` rows where `verdict = 'blocked'`, restricted to rows older than the session-timeout window (§5) — a just-created blocked row hasn't had a chance to resolve yet and would wrongly count toward "abandoned" if included too early.

**Plain English:** *when someone's post or comment gets stopped by the gate, how often do they revise it and get it published anyway — versus just giving up?*

This is the one number that defines "this worked" because, unlike reply-coach's dismissible nudge, there is no "post anyway" path (per Acceptance criteria) — the only two outcomes for a blocked author are "successfully revise" or "abandon." A gate tuned correctly for a narrow, severe-violation band (harassment, hate speech, threats/violence, spam, doxxing/PII exposure, illegal content — not the broad "harsh but well-meaning" band reply-coach handles) should see **most** gated authors revise and get through, because the Problem statement's own success bar is "false positives... rare enough that the gate doesn't feel like an obstacle." A low republish rate is the earliest, cheapest-to-observe signal that the classifier is over-flagging ordinary foster-family conversation, or that the rewrite-prompt copy (ux-writer's territory, open question #3) isn't giving people a workable path to fix their post.

**Target band:** ≥ 70% at every rollout stage before advancing (§4) — an initial hypothesis, not a derived number (this is a first-of-its-kind gate with no prior baseline to carry forward the way reply-coach-live carried reply-coach's 35–60% band). Revisit once the first ≥400-event sample lands at the 10% stage (§3). Below 50% halts the rollout at its current stage regardless of guardrail health — a hard stop, not a "watch and see."

**Known blind spot, stated up front** (mirrors reply-coach-live's own acceptance-rate caveat): this metric cannot distinguish "false positive who gave up in frustration" from "genuine bad actor who correctly got stopped and left" — both show up as `abandoned`. There is no admin queue (per Out of scope) to disambiguate with ground truth. That's an accepted limitation of the no-queue design, not a metric flaw to fix later — it's exactly why the guardrails below exist as a second, independent check.

#### 2. Guardrail metrics (existing platform metrics, not invented here)

| Metric | Direction | Source |
|---|---|---|
| **Post/comment publish rate** (platform-wide, all submissions, not just gated ones) | must NOT drop >5pp vs. the 4-week pre-flag baseline | existing announcement-feed engagement metric (same one reply-coach-live guardrails against) |
| **Reported-comment rate** (on published content, once [[features/moderation-report-block]] ships) | must NOT increase | existing `moderation_reports` table |

Rationale for the second guardrail: if this gate is working, content that would have drawn a report should increasingly get caught before publish instead — so the report rate on what *does* get published should hold flat or fall, never climb. A climbing report rate alongside a healthy republish rate would suggest the classifier's taxonomy (open question #3) is missing a violation category entirely, rather than being too strict.

#### 3. Experiment

**Not a randomized A/B holdback** — a deliberate departure from reply-coach-live's 50/50 holdback design, worth stating explicitly rather than defaulting to the precedent: withholding this gate from a control group means intentionally leaving flagged harassment, threats, hate speech, or doxxing live in that group's feed for the life of the experiment. Reply-coach's downside-of-being-wrong is a missed *tone* suggestion; this feature's downside-of-being-off is *exposure to the exact harm the feature exists to prevent*. A safety gate is not an A/B-testable growth lever in the same sense a nudge is. (The role template asks for A/B "if applicable" — here it isn't, and the reason is load-bearing enough to state rather than silently omit.)

**Instead: a staged percentage rollout with a sample-size gate at each stage**, not a permanent control group — see §4.

- **Sample size per stage:** ≥ 400 `moderation_gate_events` rows with `verdict = 'blocked'` observed at a stage before evaluating whether to advance. (≈400 gives a ±5pp margin of error at 95% CI on the republish-rate proportion estimate, conservatively assuming p≈0.5; fewer than that and a stage's republish-rate read is too noisy to act on.)
- **Success threshold to advance a stage:** republish rate ≥ 70% **AND** both §2 guardrails hold, simultaneously — same "all must hold" framing as reply-coach-live §2, for the same reason: a healthy republish rate alone doesn't rule out a classifier that's silently suppressing overall participation, or missing a violation category the guardrails would catch.

#### 4. Feature flag — `content_moderation_gate_enabled`

| Stage | % of users | Gate to advance |
|---|---|---|
| Off (default) | 0% | ships behind flag per Acceptance criteria; classifier taxonomy (open question #3) finalized and reviewed by ux-writer |
| Internal / dogfood | dev + team accounts | fail-open/fail-closed behavior (open question #2, once resolved) verified end-to-end; spot-check confirms no raw content or classifier reasoning lands in `moderation_gate_events` or application logs |
| 10% | 10% of users | ≥400 blocked-event sample reached; republish rate ≥70%; both guardrails hold |
| 50% | 50% of users | held **minimum 2 weeks** (longer than reply-coach-live's 1-week hold — a miscalibrated gate here fully blocks a legitimate post outright, a more severe failure mode than a missed advisory nudge); republish rate and guardrails re-verified at the larger sample; category breakdown (§5) reviewed for any single category dominating flags disproportionately, a sign that one category's threshold is miscalibrated rather than the gate overall |
| 100% | 100% | full rollout; `moderation_gate_events` becomes a permanent ops/tuning dashboard from here, not a time-boxed read-out — there's no holdback arm to eventually "graduate," per §3 |

If republish rate drops below 50% at any stage, or either guardrail breaks, roll the flag back one stage (or to off) rather than pausing in place — matches the hard-stop framing in §1.

#### 5. Aggregate tracking — `moderation_gate_events` (resolves Open Question #4)

**Answering Open Question #4 directly: yes** — aggregate, non-content signal should be tracked, for exactly the reason the question names: no admin queue exists to surface individual flags to, so this table is the *only* tuning/abuse-pattern visibility this feature will ever have. Shape mirrors `coach_events` deliberately, column for column where the concepts line up:

```sql
CREATE TABLE moderation_gate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  surface TEXT NOT NULL CHECK (surface IN ('post', 'comment')),
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'blocked')),
  category TEXT,
  outcome TEXT CHECK (outcome IN ('republished', 'abandoned')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- **One row per gate check, both verdicts** — including `verdict = 'ok'` (clean, silent-publish) checks, not just blocked ones. Deliberate, mirroring `coach_events` (which also records every `verdict='ok'` call, not only `'suggest'`): without the clean-verdict rows there's no denominator for a flag rate, and no way to see total submission volume trending over time.
- **`surface`**: `'post' | 'comment'` only, matching this feature's actual scope (Acceptance criterion #1). Does **not** include `'dm'` — DM coverage is still open (open question #1); if that resolves to "yes," add `'dm'` to the `CHECK` constraint in a follow-up migration rather than guessing now.
- **`verdict`**: reuses `coach_events`'s exact `'ok'` term for the pass state — a literal terminology mirror, not just a shape mirror. Uses `'blocked'` rather than `coach_events`'s `'suggest'` for the fail state, deliberately different, because this gate has no dismissible-suggestion state to name — `'blocked'` says what actually happens (no "post anyway" path, per Acceptance criteria).
- **`category`**: nullable, populated only when `verdict = 'blocked'`, from whatever taxonomy ux-writer lands (open question #3 — harassment, hate speech, threats/violence, spam, doxxing/PII exposure, illegal content is the Acceptance criteria's working list, not yet final). **No `CHECK` constraint on the values** — same choice `coach_events.category` made — so the taxonomy can land or change without a migration.
- **`outcome`**: nullable; `NULL` for `verdict='ok'` rows (nothing to resolve). For `verdict='blocked'` rows: starts `NULL` at insert, `UPDATE`d to `'republished'` if the same author's revised content on the same draft clears the gate and publishes within the session-timeout window. Rows still `NULL` past that window are treated as `'abandoned'` **at query time** (`outcome IS NULL AND created_at < now() - session_timeout`), not written as `'abandoned'` by a cron job — the same lazy-rollover simplification `costCap.ts` used for the day-boundary counter in reply-coach-live, accepted there as fine for v1. Session-timeout window: suggest **30 minutes**. (Backend-dev's call on exact mechanism — client-side draft-session token vs. same-user-same-surface-within-window heuristic; this subsection owns the *semantics* of `outcome`, not the plumbing that resolves it.)
- **No content, ever.** No draft text, no classifier reasoning, no rewrite-suggestion column exists on this row shape — there is no code path that could persist it, matching the acceptance criterion ("classifier inputs/outputs are not retained beyond what's operationally necessary") and `coach_events`'s "no draft, rewrite, or reasoning text persisted" bar exactly.
- **Write timing:** after the classification decision is made, using only structural metadata — never blocks or delays the actual publish/gate response. If the event write fails, the gate decision still stands and the metric silently under-counts rather than erroring — same accepted tradeoff reply-coach-live's Growth §4 already made for `coach_events`.
- **Dependency flag (not mine to resolve, noted for whoever picks up open question #2):** this schema assumes the fail-open/fail-closed decision doesn't introduce a third classification outcome. If classification errors or times out and the answer is fail-open (matching reply-coach's precedent, which this feature's own open question already leans toward), that failure path is just another `verdict='ok'` row, same as `coach_events` treats a silent-fallback `verdict=ok`. If fail-closed is chosen instead, this table's `verdict` `CHECK` may need a third value for "classification never resolved" — flagging the interaction, not resolving it.
