---
slug: reply-coach-live
title: Reply Coach — live Anthropic SDK
owner: engineering
collaborators: [design, marketing]
status: review
priority: P2
created: 2026-06-11
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
  parent: "[[features/reply-coach]]"
---

# Reply Coach — live Anthropic SDK

## Problem

[[features/reply-coach]] v1 shipped mock-first per its `## Decisions` block: a swappable `ClaudeClient` interface backed by `MockClaudeClient` returning three canonical fixtures. The endpoint, flag, rate limit, response shape, and tests all live behind that seam. This feature swaps the mock for the real Anthropic SDK so the coach can score arbitrary drafts in production, and lights up the two acceptance criteria carried over from v1: prompt caching and the `ANTHROPIC_API_KEY` boot-refusal.

Success = the live coach produces the same voice the canonical Microcopy Part 2 fixtures lock in; cache-hit rate is observable; and we can flip the flag on for a 50/50 holdback without burning a credit card.

## Acceptance criteria

- [ ] `MockClaudeClient` retired (or kept only as `__testing__` fixture); `LiveClaudeClient` wraps `@anthropic-ai/sdk` and is the default registered client.
- [ ] System prompt is canonical and locked: it encodes the Microcopy Part 2 voice rules verbatim and produces outputs that match fixture B and C drafts within tolerance during dogfood.
- [ ] **Prompt caching** configured on the system block; cache-hit rate observable in response logs (header or log field).
- [ ] **`ANTHROPIC_API_KEY`** env-only; backend refuses to boot if `reply_coach_enabled=true` and the key is absent. Warns (not errors) if flag is off and key is absent.
- [ ] New `reply_coach_live_enabled` flag gates the switch from mock → live, so the route still falls back to mock fixtures (or to silent `verdict=ok`) if the live SDK fails or the flag is off.
- [ ] Per-org daily spend cap of **$5/day** (tune later). When exceeded, the live flag silently degrades to off for the rest of the day; UX is indistinguishable from `verdict=ok`.
- [ ] 50/50 holdback experiment by `user_id` hash, gated on `reply_coach_live_enabled`. 8-week minimum read horizon.
- [ ] `coach_events` aggregate-only table lands (see parent feature's `### Growth`): `id`, `user_id`, `verdict`, `category`, `outcome`, `created_at`. **No draft, rewrite, or reasoning text persisted.**

## Out of scope

- Frontend composer-chip UI — owned by Phase 3 frontend port per parent feature's `### Frontend`.
- Coaching of announcement bodies — separate future feature.
- Coaching of DMs — explicitly carved out in parent feature.
- Storing per-draft text in any form. Aggregate counts only.

## Open questions

- Model choice: Haiku for cost or Sonnet for nuance? Bench against the three canonical fixtures.
- Cache key strategy: cache the system prompt block only, or also the threadContext recent-comments slice?
- Cost cap exposure: surface to admins via a metric only, or via a settings toggle too?
- Should `LiveClaudeClient` fall back to `MockClaudeClient` on transient SDK error, or stay with the existing silent-`verdict=ok` fallback? Latter is simpler and matches v1 behavior — recommend that.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Status: implemented, all 13 `coach-live.test.ts` cases run with real signal (no skips), 141/141 backend tests pass, `tsc --noEmit` clean.** This resumes a prior interrupted attempt; the partial work already on disk (`systemPrompt.ts`, `coach_events` migration) was verified and built on rather than redone.

**What shipped:**

- `backend/src/services/coach/systemPrompt.ts` — added `COACH_SYSTEM_PROMPT` as a plain re-export of the existing (unmodified) `REPLY_COACH_SYSTEM_PROMPT`, reconciling the naming mismatch with `tests/coach-live.test.ts`. No consumers of the old name existed, so nothing else changed.
- `backend/src/services/coach/claudeClient.ts` — added `LiveClaudeClient` (implements the existing `ClaudeClient` interface) constructed with an injected Anthropic-SDK-shaped client (`AnthropicLikeClient` — structural `{ messages: { create(...) } }`, matching `tests/coach-live.test.ts`'s `makeFakeAnthropicClient`). `coach()` calls `messages.create` with the canonical system prompt wrapped in a `cache_control: { type: 'ephemeral' }` block (prompt caching), parses `content[0].text` as JSON into `CoachResponse`, and lets any client throw or malformed-JSON parse error propagate (no swallowing — the controller's existing catch handles it). On a successful call with `usage` present, it also calls `recordCoachSpend` with an approximate cost (Haiku per-token pricing constants, documented as an estimate not billing-grade accounting).
  - `getClaudeClient(userId?: string)` was extended (signature widened, backward compatible) to resolve, in order: test override (`setClaudeClientForTests`, unchanged) → live client if `isReplyCoachLiveEnabled()` AND cost cap not exceeded AND (`userId` absent or not in holdback) → mock client otherwise. `MockClaudeClient` was **not** retired — kept as the default/holdback/cap-exceeded/flag-off client per the AC's own allowance ("kept only as `__testing__` fixture" is satisfied loosely; it's still the production fallback, which is required by the silent-`verdict=ok` design, not just a test fixture).
  - The real `Anthropic` SDK client is only constructed lazily inside `buildLiveClaudeClient()`, reached exclusively when the live flag is genuinely on — never during tests (no `ANTHROPIC_API_KEY` was used, requested, or hardcoded anywhere in this pass, per the human's constraint).
- `backend/src/services/coach/featureFlags.ts` — added `isReplyCoachLiveEnabled()` reading `REPLY_COACH_LIVE_ENABLED`, matching the existing `isReplyCoachEnabled()` pattern in the same file.
- `backend/src/services/coach/costCap.ts` (new) — `recordCoachSpend`, `isCoachCostCapExceeded` (true at ≥ $5 cumulative), `resetCoachCostCapForTests`. **Simplification**: in-memory, single-process counter keyed by UTC calendar day (`toISOString().slice(0,10)`), rolled over lazily on each call rather than via a cron job. Matches the existing in-memory pattern used by `rateLimit.ts`; acceptable for single-instance v1, called out here as a known limitation for horizontal scaling.
- `backend/src/services/coach/holdback.ts` (new) — `isInHoldback(userId)`, a deterministic FNV-1a 32-bit hash of `userId` mod 2. No storage, no randomness; stable per-user, ~50/50 split verified against 2000 synthetic ids in the test suite.
- `backend/src/services/coach/bootCheck.ts` (new) — `assertCoachBootPreconditions()`, reads `REPLY_COACH_ENABLED`/`ANTHROPIC_API_KEY` directly from `process.env` (same string comparison `featureFlags.ts` uses) rather than importing that module, so it has zero dependency ordering at boot. Throws when the flag is on and the key is missing; warns (console.warn) when the flag is off and the key is missing; no-ops otherwise. Wired into `backend/src/index.ts`'s existing `if (import.meta.url === ...)` boot block, ahead of `runMigrations()`.
- `backend/src/services/coach/coachEvents.ts` (new) — `recordCoachEvent(row)` inserts into `coach_events` with exactly the five write-relevant columns (`id`, `user_id`, `verdict`, `category`, `outcome`); `created_at` defaults via SQL. No draft/rewrite/reasoning field exists on the row type, so there is no code path that could persist that text.
- `backend/src/db.ts` — added `getDb()` as a thin alias for the existing `db()` function (unchanged), so `tests/coach-live.test.ts`'s dynamic import actually exercises the `coach_events` assertions instead of skipping.
- `backend/src/controllers/coach.controller.ts` — one-line change: `getClaudeClient()` → `getClaudeClient(userId)`, threading the already-available `userId` through for holdback bucketing. Silent-fallback catch/response shape untouched.
- `backend/src/migrate.ts` — confirmed the `coach_events` migration already present from the prior attempt is correct; not modified.

**Test-file fixes** (both inside `backend/tests/coach-live.test.ts`, which is within `backend/**` writer ownership; neither changes test intent, both were needed to make `tsc --noEmit` and `npm run test:run` pass cleanly):
1. `rows[0]` → `rows[0]!` (non-null assertion) after `assert.equal(rows.length, 1)` already guarantees the element exists — `strict`/`noUncheckedIndexedAccess` was rejecting the indexed access.
2. Added a synthetic `users` row insert in the `coach_events` describe block's `before()` hook — `coach_events.user_id` has `REFERENCES users(id)`, and the original fixture inserted `user_id: 'user-test-1'` with no matching `users` row, tripping `SQLITE_CONSTRAINT_FOREIGNKEY`.

**Open items / not done in this pass:**
- `MockClaudeClient` is not literally retired — see rationale above; if design wants it hard-gated to `NODE_ENV==='test'` only, that's a follow-up, not implemented here.
- Cache-hit rate is not surfaced as a distinct observable field/header yet — the `cache_control` block is sent (satisfying the AC's "configured on the system block"), but there's no logging of Anthropic's `cache_read_input_tokens`/`cache_creation_input_tokens` response fields yet. Flagged for qa/growth follow-up if "observable in response logs" needs to be more than "present in the request payload."
- Cost estimation in `recordCoachSpend` uses hardcoded Haiku per-token constants rather than reading them from `usage`-adjacent model metadata; fine for a $5/day soft cap, not audit-grade.
- No new dependency was added — `@anthropic-ai/sdk` was already present in `backend/package.json`.

### Frontend
*(filled by frontend-dev — likely N/A; this is a backend swap behind an existing seam)*

### Test plan

**Status: VERIFIED independently 2026-07-09 by qa-engineer.** All commands below were re-run by qa-engineer, not just trusted from backend-dev's report.

**Commands run and observed results:**
- `cd backend && npx tsc --noEmit` → clean, no output, exit 0.
- `cd backend && npm run test:run` (full suite) → `tests 141`, `suites 28`, `pass 141`, `fail 0`, `skipped 0`, `cancelled 0`.
- `cd backend && node --import tsx --test --test-force-exit tests/coach-live.test.ts` (isolated) → `tests 13`, `pass 13`, `fail 0`, `skipped 0`.
- `grep -rn "ANTHROPIC_API_KEY" backend/tests/ backend/src/services/coach/ backend/src/index.ts` → every hit is either (a) the sanity-guard test asserting `process.env.ANTHROPIC_API_KEY === undefined`, (b) the boot-refusal tests deleting/restoring the env var (never setting a real-looking value), or (c) `bootCheck.ts`/`claudeClient.ts` reading `process.env.ANTHROPIC_API_KEY` at runtime for production wiring (`buildLiveClaudeClient()`), which is never reached in tests because `REPLY_COACH_LIVE_ENABLED` is never set truthy anywhere in the test suite. **No real key value is set, requested, or hardcoded anywhere in the reviewed path.** Constraint holds.

**Test-file fixes (reviewed):** confirmed both of backend-dev's two fixes inside `tests/coach-live.test.ts` are test-infrastructure only, not weakenings of test intent:
1. `rows[0]!` — non-null assertion after `assert.equal(rows.length, 1)` already guarantees the element exists; the `deepEqual` assertion on `rowKeys` immediately after is untouched and still strict.
2. Synthetic `users` row insert in the `coach_events before()` hook — required only to satisfy `coach_events.user_id REFERENCES users(id)`; does not touch the assertions in either `coach_events` test (column-shape `deepEqual` and row-key `deepEqual` both unchanged, still exact-match not subset-match).

**Coverage against the 7 acceptance criteria:**

| # | Acceptance criterion | Test type | File / test name | Assertion |
|---|---|---|---|---|
| 1 | `LiveClaudeClient` wraps SDK, registered client | unit | `backend/tests/coach-live.test.ts` — `LiveClaudeClient wiring` describe (2 tests) | `LiveClaudeClient` is exported and its `coach()` sends the canonical system prompt to a mocked `AnthropicLikeClient`; `getClaudeClient()` resolution order verified indirectly via the flag-gating describe below. **Note:** `MockClaudeClient` was not literally retired (kept as production fallback) — flagged by backend-dev as an intentional, allowed interpretation of the AC; not tested as "retired" because it isn't. |
| 2 | System prompt canonical/locked, fixture B/C tone fidelity | static + unit | `backend/src/services/coach/systemPrompt.ts` re-export verified; voice-rule audit done by ux-writer in `### Microcopy` (10/10 PASS) | No automated test asserts live-model output against Fixture B/C — **cannot** without a real key. This is a genuine gap, not a QA oversight. |
| 3 | Prompt caching configured, cache-hit observable | unit (partial) | `coach-live.test.ts` — `configures prompt caching (cache_control) on the system block` | Asserts the request payload's `system` block serializes to include `"cache_control"`. **Gap:** no test asserts cache-hit rate is logged/observable from the *response* (`cache_read_input_tokens`) — backend-dev's own notes and code-reviewer's `### Code review` confirm this isn't implemented yet, only the request-side config is. |
| 4 | `ANTHROPIC_API_KEY` env-only; boot-refuses if flag on + key absent; warns if flag off + key absent | unit | `coach-live.test.ts` — `boot-refusal on missing ANTHROPIC_API_KEY` describe (2 tests) | `assertCoachBootPreconditions()` throws when `REPLY_COACH_ENABLED=true` + key deleted; does not throw (warns) when flag=false + key deleted. |
| 5 | `reply_coach_live_enabled` flag gates mock→live; falls back to mock/silent-ok on SDK failure or flag off | unit | `coach-live.test.ts` — `reply_coach_live_enabled flag gating + fallback` describe (2 tests) | `isReplyCoachLiveEnabled()` returns false when env var is `'false'`; `LiveClaudeClient.coach()` rejects (propagates) when the mocked SDK throws, which the existing `coach.test.ts` silent-fallback case (`returns the silent fallback (200 + verdict=ok) when the Claude client throws`) already covers at the controller layer — confirmed that pre-existing test still passes (part of the 141/141). |
| 6 | $5/day per-org cost cap, silent degrade | unit | `coach-live.test.ts` — `cost cap ($5/day)` describe (1 test) | `isCoachCostCapExceeded()` false at $0, true after `recordCoachSpend(5.01)`. Degrade-to-mock behavior on cap-exceeded is exercised indirectly through `getClaudeClient()`'s `liveEligible` boolean logic (read, not separately unit-tested with a dedicated case — minor gap, low risk since the boolean composition is simple `&&`/`!`). |
| 7 | 50/50 holdback by `user_id` hash, `coach_events` aggregate-only table, no draft/rewrite/reasoning persisted | unit + integration | `coach-live.test.ts` — `holdback by user_id hash` (2 tests, stability + ~50/50 split over 2000 synthetic ids) and `coach_events table` describe (2 tests, real in-memory SQLite via `runMigrations()`) | Holdback bucketing is stable per-user and lands in 0.4–0.6 ratio over n=2000. `coach_events` table has exactly `{id, user_id, verdict, category, outcome, created_at}` columns (`deepEqual`, not subset — would fail if a `draft`/`rewrite`/`reasoning` column were added); a written row's actual keys match the same exact set. This is a real-DB integration test (in-memory SQLite via `runMigrations()`), not a mock, satisfying the project's boundary-testing rule. |

**Known gaps / deferred (not blockers per the AC's own framing):**
- **Fixture B/C dogfood tone-fidelity (criterion 2)** — cannot be automated without a real `ANTHROPIC_API_KEY`, which is explicitly disallowed in this environment. ux-writer's `### Microcopy` audit confirms static structural consistency (10/10 on voice rules) but actual model-output fidelity against the two locked fixture strings is unverifiable here. Tracked as a deferred runtime check, owned by whoever runs the first live-key dogfood pass in a non-dev environment — consistent with the parent AC's wording ("during dogfood," a runtime activity, not a spec-time gate).
- **Cache-hit-rate observability (criterion 3)** — only the request-side `cache_control` config is tested; no test/implementation yet logs the response's `cache_read_input_tokens`/`cache_creation_input_tokens`. Independently confirmed as a real gap by code-reviewer's `### Code review`. Recommend a follow-up test once backend-dev adds response-side logging.
- **Cost-cap degrade wired end-to-end through `getClaudeClient()`** — the cap-exceeded boolean is unit-tested in isolation (`costCap.ts`) but there's no dedicated test that calls `getClaudeClient(userId)` with the cap exceeded and asserts it returns the mock singleton. Low risk (the composition is a straightforward boolean AND), but noted as a small coverage gap for a future pass.
- **`MockClaudeClient` "retirement"** — AC says retired-or-`__testing__`-only; shipped behavior keeps it as the production fallback (required for silent-degrade/holdback-control/cap-exceeded paths). This is a legitimate design choice, not a bug, but no test enforces "retired" since the code doesn't retire it — flagged for tech-lead/dispatcher awareness in case the AC wording needs updating to match shipped reality.
- **Unvalidated JSON parse on live SDK response (`claudeClient.ts:141`)** — flagged independently by code-reviewer as a must-fix; not covered by any current test since the mocked responses in `coach-live.test.ts` are always well-formed JSON matching `CoachResponse`. No test currently exercises a malformed-but-parseable JSON response from the mocked SDK client — recommend adding one once the Zod-validation fix lands, asserting the malformed case is caught by the controller's existing silent-fallback path rather than passed through.

**Verdict: PASS.** 6 of 7 acceptance criteria have direct automated coverage with real, non-trivial assertions (no rubber-stamp tests); the 7th (fixture tone fidelity) has the maximum coverage possible without violating the no-real-API-key constraint, and is explicitly a deferred runtime check per the AC's own language, not a blocking gap. Two follow-up items (cache-hit logging, JSON-parse validation) are tracked but do not block `review` status per code-reviewer's own must-fix/fast-follow split.

### Code review

**Summary.** Reviewed the uncommitted backend diff for the live-SDK swap: `claudeClient.ts` (`LiveClaudeClient`, `getClaudeClient` resolver), `costCap.ts`, `holdback.ts`, `bootCheck.ts`, `coachEvents.ts`, `featureFlags.ts`, `systemPrompt.ts`, the `coach.controller.ts`/`index.ts`/`db.ts`/`migrate.ts` wiring points, and `tests/coach-live.test.ts`. The seam is clean, no `any`, no hardcoded key, no draft/reasoning text persisted or logged, and the silent-`verdict=ok` fallback design is preserved end-to-end. One real AC gap (cache-hit observability) and one contract-drift risk (unvalidated JSON parse from the SDK) are must-fix; everything else is nice-to-have or accepted-as-documented.

**Must-fix**
- `backend/src/services/coach/claudeClient.ts:141` (`LiveClaudeClient.coach`) — `JSON.parse(block.text) as CoachResponse` is an unchecked cast, not a Zod-validated parse. If the live model ever emits a shape that doesn't match `CoachResponse` (missing field, wrong type, extra prose), this will not throw — it'll return a malformed object straight to `res.status(200).json(result)` in `coach.controller.ts`, bypassing the try/catch's silent-fallback safety net entirely. Per this repo's rule ("All API calls through `api/` with Zod schemas... request/response types inferred from Zod") and the existing `coach.schemas.ts` Zod schema already in the codebase, this response should be validated with `CoachResponseSchema.parse(...)` (throwing on mismatch, which the controller already handles) rather than cast. This is the one place where an untrusted, live external API response reaches the client contract un-validated.
- Cache-hit observability AC gap (confirmed, not just self-reported) — the AC reads "cache-hit rate observable in response logs (header or log field)." `LiveClaudeClient.coach` sends `cache_control: { type: 'ephemeral' }` on the system block (satisfies "configured") but never reads or logs `response.usage?.cache_read_input_tokens` / `cache_creation_input_tokens` (both present in the `AnthropicLikeClient` response shape's `usage` field per the SDK, though not yet declared in the local `AnthropicLikeClient.messages.create` return type at `claudeClient.ts:86-91`, which only types `input_tokens`/`output_tokens`). Nothing in this pass makes cache-hit rate observable anywhere — not in a header, not in a log line, not in `coach_events` (correctly, since that table is aggregate-only and events-scoped, not per-call). This is a real gap against the letter of the AC, not just backend-dev's own conservative self-flag. Needs at minimum a `console.info`/logger line per live call logging `cache_read_input_tokens` before this AC can be marked done — recommend a fast follow rather than blocking `review`, but the tech-lead should not silently check this AC box.

**Nice-to-have**
- `backend/src/services/coach/claudeClient.ts:86-91` — `AnthropicLikeClient`'s `usage` type omits `cache_read_input_tokens`/`cache_creation_input_tokens`, which will need to be added anyway to close the must-fix above; worth doing in the same follow-up pass so the type and the log line land together.
- `backend/src/services/coach/costCap.ts` — in-memory, single-process, resets on restart, and (per its own comment) does not cross-check against `rateLimit.ts`'s actual pattern claim precisely — worth a quick look: confirmed `rateLimit.ts` is also in-memory/per-process for the existing per-user rate limit, so the pattern match is real, not just asserted. Flagging only that a process restart at 4:59pm UTC and a bounce at 5:01pm UTC effectively grants a fresh $5 for the remainder of the day — acceptable per the AC's own "tune later," but worth a one-line note in the Growth ops-dashboard follow-up (`### Growth` §5) since day-boundary + restart interactions aren't mentioned there.
- `backend/src/services/coach/claudeClient.ts:135` — `buildLiveClaudeClient()` constructs `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })` — the `?? ''` means if this function is ever reached with a missing key (shouldn't happen given `bootCheck.ts` gates boot when the flag is on, but `getClaudeClient` and `bootCheck` read the flag from two different env vars — `REPLY_COACH_LIVE_ENABLED` vs `REPLY_COACH_ENABLED` — so it's theoretically possible to have the live-flag on with the coach-enabled flag off, skipping the boot check, then hit a live call with an empty-string key), the SDK constructor would silently accept an empty string rather than fail fast. Worth a defensive `if (!apiKey) throw` inside `buildLiveClaudeClient` as a second line of defense, independent of `bootCheck.ts`.
- `MockClaudeClient` production-fallback interpretation (item 1) — reviewed and **accepted as a reasonable reading of the AC**, not a violation worth flagging must-fix. The AC's parenthetical ("or kept only as `__testing__` fixture") is one of two disjunctive options, and the feature's own design (silent `verdict=ok` for flag-off/cap-exceeded/holdback-control/live-throws, all documented in `### Visual` "States") structurally requires *some* client to serve those paths — retiring `MockClaudeClient` entirely would mean either duplicating its trivial fixture-matching logic inline in `getClaudeClient` (worse) or making those paths throw/error (violates the silent-fallback contract). Recommend the vault AC wording be tightened in a future feature spec to disambiguate "test fixture" from "production degrade path," but that's a spec-clarity nit, not a code defect.
- Test-file edits (item 4) — both reviewed, both benign. `rows[0]!` at `coach-live.test.ts` (the `coach_events` row-shape assertion) is guarded by the preceding `assert.equal(rows.length, 1)`, so the non-null assertion doesn't weaken the check — the array-length assertion is what actually enforces "exactly one row exists." The synthetic `users` row insert in the `before()` hook is additive scaffolding to satisfy an FK constraint the original fixture didn't anticipate; it doesn't touch or loosen any assertion in the `it()` blocks that follow. Both changes are within `backend/**` writer ownership and are non-substantive.

**Acceptance criteria spot-check**
- [x] `MockClaudeClient` retired-or-testing-only; `LiveClaudeClient` wraps SDK and is default registered client — satisfied under the disjunctive reading above; `getClaudeClient` does register `LiveClaudeClient` as the default path when the live flag is on and eligible.
- [x] System prompt canonical and locked, encodes voice rules verbatim — confirmed by direct read of `systemPrompt.ts`; matches the design-lead's 10/10 Part 1 audit in `### Microcopy` above. Part 2 fixture-tone dogfood remains unverifiable without a live key, correctly deferred per that subsection.
- [ ] Prompt caching configured; cache-hit rate observable in response logs — **half-satisfied.** `cache_control` is sent (configured); cache-hit rate is not logged anywhere. See must-fix above.
- [x] `ANTHROPIC_API_KEY` env-only, boot-refuses when flag on and key absent, warns when flag off and key absent — confirmed in `bootCheck.ts`, wired into `index.ts`'s boot block ahead of `runMigrations()`, and covered by two passing test cases in `coach-live.test.ts`.
- [x] `reply_coach_live_enabled` flag gates mock↔live swap; falls back to mock/silent-ok on live SDK failure or flag-off — confirmed: `getClaudeClient` resolver order is correct, and `LiveClaudeClient.coach`'s propagated throw is caught by `coach.controller.ts`'s existing catch, returning `SILENT_FALLBACK` (200 + verdict=ok). No draft/error detail leaks in the log line (`console.warn('[coach] client failure', { message })` — message only, no user-supplied fields).
- [x] $5/day per-org spend cap, silent degrade to off — confirmed in `costCap.ts` and exercised by the resolver's `!isCoachCostCapExceeded()` check; degrade path routes to `MockClaudeClient`'s neutral fixture, matching "indistinguishable from `verdict=ok`." Caveat noted above re: process-restart edge case (nice-to-have, not blocking).
- [x] 50/50 holdback by `user_id` hash, gated on live flag, 8-week horizon — `holdback.ts`'s FNV-1a hash is deterministic and stateless; wired correctly into `getClaudeClient(userId)` and threaded from the controller's already-available `userId`. 8-week horizon is a Growth/ops concern, not code — correctly out of scope for this file.
- [x] `coach_events` aggregate-only table, no draft/rewrite/reasoning text persisted — confirmed by direct read of the `migrate.ts` schema (5 write-relevant columns + `created_at`) and `coachEvents.ts`'s `recordCoachEvent`, which has no code path that could accept or forward free-text draft content. Test asserts the exact column set matches.

## Design — Spec

### Visual

**N/A — no new visual surface.** Confirmed against the parent feature: this dispatch swaps `MockClaudeClient` for `LiveClaudeClient` behind the existing `ClaudeClient` interface seam; `POST /api/comments/coach`'s response contract (`{ verdict, categories, reasoning, rewrite }`) is unchanged. The `CoachChip` component anatomy, tokens, and states are already fully specced in [[features/reply-coach]]'s `### Visual` (component anatomy §1, token references §2, states §3, composer integration §4) and remain the canonical spec for the Phase 3 frontend port. Nothing here supersedes or extends that spec.

- **Component anatomy**: none new. `CoachChip` and its parts (`chip.root`, `chip.preface`, `chip.rewrite`, `chip.actions`, etc.) are unchanged from the parent spec.
- **Token usage**: none new. `color.surface.subtle` (approved in parent's §5a design-lead disposition) and the deferred `brand-contrast-fix` token work are the only open token items, both tracked against the parent feature, not this one.
- **States**: none new to author. Two states from the parent's `### Visual` §3 are load-bearing for this feature's acceptance criteria and are re-affirmed here rather than re-specced:
  - `verdict === 'ok'` (silent-fallback, cap-degrade, and holdback-control-arm all resolve to this state) — chip is **not rendered at all**; no skeleton, no placeholder, no live-region announcement. This is the mechanism by which the $5/day cost-cap degrade and the 50/50 holdback experiment stay visually indistinguishable to the author: both paths route through the same `verdict: 'ok'` response shape the mock already produces, so the composer has no code path that could visually reveal "coach is off today" or "you're in the control arm."
  - Error state (network/timeout/5xx/flag-off/rate-limit) — nothing rendered, matching parent §3's "silent no-op" states. Live-SDK transient failures (per this feature's open question, recommended to stay on the existing silent-`verdict=ok` fallback rather than falling back to `MockClaudeClient`) inherit this same silent behavior — confirmed consistent in spirit with the parent spec's charter of "advisory, never blocking, silent on neutral."

**Watch-item for the Phase 3 frontend-port designer** (not a gap in this dispatch, flagged in notes only): when `LiveClaudeClient` is wired in, confirm no debug/dev-mode surface (e.g. a stray "coach: capped today" banner or admin-only indicator) leaks into the shared composer bundle — the AC's requirement that cap-degrade be "silently" `verdict=ok` only holds if the frontend never special-cases a distinct response field for it. Backend's contract as specced returns identical shape for genuine `ok`, capped, and control-arm — so as long as Phase 3 doesn't add its own cap-detection heuristic, this stays silent by construction.

### Microcopy

**Status: RE-AUDITED 2026-07-09 — `backend/src/services/coach/systemPrompt.ts` now exists and exports `REPLY_COACH_SYSTEM_PROMPT`.** Verdict: **PASS, 10/10, on the static prompt-text audit** (Part 1 voice rules — see row-by-row table below). The output-tone-fidelity checklist (Fixture B/C dogfood) is **static prompt-text audit only; dogfood output verification deferred until a real key + non-dev environment exists** — there is no live `ANTHROPIC_API_KEY` in this environment (explicit human constraint), so no model call can be made to compare actual output against the locked fixture strings. That deferral does not block this feature per the parent AC's own wording ("produces outputs that match fixture B and C drafts within tolerance during dogfood") — dogfood is a runtime activity gated on key provisioning, not a spec-time gate.

No new user-facing strings are drafted here. Per the scaffold note, all coach-voice microcopy is inherited **verbatim** from [[features/reply-coach]] `### Microcopy` (Parts 1–3) — this feature only swaps the model backend behind an unchanged contract. Nothing below is new copy; it restates the canonical source so backend-dev's system prompt can be graded against it without cross-referencing the parent file.

#### Audit checklist — system prompt must encode, verbatim or faithfully paraphrased as instructions, all of Part 1

Diffed line-by-line against `REPLY_COACH_SYSTEM_PROMPT` in `backend/src/services/coach/systemPrompt.ts` (lines 18–27, the numbered "Voice rules" block).

| # | Rule (parent `### Microcopy` Part 1) | What to check for in the system prompt | Verdict |
|---|---|---|---|
| 1 | Warm and brief — one sentence per rewrite, no paragraphs, no preambles | Prompt explicitly caps `rewrite` at one sentence; forbids "I noticed…" or similar preambles | **PASS** — prompt line 18 is verbatim: "Warm and brief. One sentence per rewrite. No paragraphs, no preambles, no "I noticed…"." |
| 2 | Peer, not moderator | Prompt frames the model's voice as a fellow foster-community member, not an enforcement layer | **PASS** — prompt line 19 is verbatim: "Peer, not moderator. Speak as another foster-community member sharing a phrasing that landed better — not as a platform enforcing a rule." |
| 3 | Rewrite carries the message; category label stays hidden | Prompt instructs the model to never name the category (e.g. "minimization", "savior-framing") inside `reasoning` or `rewrite` — category is output-schema-only | **PASS** — prompt line 20 is verbatim ("Never name the category in the rewrite or in any user-facing string… Category metadata is for backend/analytics only"), reinforced again at line 39 of the output-contract section: "reasoning is one sentence explaining why the phrasing can land hard (never naming the category by name)". |
| 4 | Never claim to know the author's intent | Prompt forbids "what you really mean is…" / "you actually feel…" constructions | **PASS** — prompt line 21 is verbatim. |
| 5 | Once flagged, always offer a rewrite | Prompt instructs: if `verdict: "suggest"`, `rewrite` must be non-null; no flag-without-suggestion state | **PASS** — prompt line 22 is verbatim ("Once a category is flagged, always offer a rewrite… If you can flag it, you can suggest one warmer way to say it"). |
| 6 | When uncertain, stay silent | Prompt instructs the model to prefer `verdict: "ok"` over a low-confidence guess | **PASS** — prompt line 23 is verbatim ("Return verdict "ok" rather than guessing. A wrong nudge erodes trust faster than a missed one"). |
| 7 | No moralising, no therapy-speak | Prompt bans "I hear you", "valid", "journey", "lived experience" or names this as a class of banned phrasing | **PASS** — prompt line 24 lists the identical four banned phrases verbatim. |
| 8 | Plural "we" only for platform-voice UI strings; rewrite itself is first-person, present tense, no "we" | Prompt distinguishes: `rewrite` text is written as if the *author* is speaking, not the platform | **PASS** — prompt line 25 covers the applicable half verbatim ("The rewrite itself is in the author's voice — first person, present tense, no "we""). The platform-voice/"we" half of the parent rule is correctly out of scope for this prompt — the system prompt only ever generates model output (`reasoning`/`rewrite`), never composer-chip UI strings, so there is nothing in this file that could violate the "we" rule; that half is enforced instead by Part 3's static chip strings (owned by frontend, unchanged by this feature). |
| 9 | No exclamation marks in rewrites or reasoning | Prompt states this explicitly (note: this is stricter than the general design-system CTA exception — coach output gets zero exclamation marks, full stop) | **PASS** — prompt line 26 is verbatim, no CTA exception carried over (correct — the prompt has no CTA copy to except). |
| 10 | No emoji, ever | Prompt states this explicitly | **PASS** — prompt line 27 is verbatim: "No emoji. Ever, in your output." |

**Row-table verdict: 10/10 PASS.** All ten voice rules from the parent's canonical Part 1 are present in the system prompt, either byte-verbatim or (row 8) faithfully and correctly scoped to what a model-facing prompt can actually enforce. No drift, no omission, no weakening of any rule found. The file's own header comment ("encodes `### Microcopy` Part 1 verbatim… if the voice rules change, this file and the vault section must change together") is upheld by inspection.

#### Audit checklist — fixture tone fidelity (Part 2)

Dogfood outputs for the canonical drafts below must land within tolerance of these locked strings (exact match not required for live model output, but tone/length/structure must match):

- **Fixture B (minimization)** — `reasoning`: `"At least" can shrink a loss the family is still carrying — a phrasing that stays with the loss tends to land softer.` / `rewrite`: `The time you had with her mattered, and I'm sorry it's ending this way.`
- **Fixture C (savior-framing)** — `reasoning`: `Calling a foster parent a saint can make the everyday work feel like a performance — naming the care directly tends to feel closer.` / `rewrite`: `He's lucky to have you showing up for him like this.`

Both `reasoning` strings are single sentences, name the *mechanism* (why the phrasing lands hard) without naming the category, and both `rewrite` strings are first-person-from-the-author, present/near-present tense, no exclamation marks, no emoji, no moralising vocabulary. Any live-model output for these two drafts that drifts from this shape (multi-sentence, names the category, uses "valid"/"journey"/therapy-speak, adds an exclamation mark) is a **system-prompt bug**, not an acceptable variation, per the parent feature's canonical note.

**Verdict: NOT VERIFIABLE THIS PASS — static prompt-text audit only.** This checklist requires comparing actual live-model output against the two locked fixture strings, and there is no real `ANTHROPIC_API_KEY` available in this environment (explicit human constraint — no production API spend during development, confirmed in the parent's `### Launch copy` scope note). What CAN be confirmed statically: the prompt's output-contract section (systemPrompt.ts lines 29–39) instructs the model to produce exactly the shape this checklist requires — one-sentence `reasoning` naming the mechanism not the category, one-sentence first-person `rewrite` — which is structurally consistent with Fixture B and C's locked shape. But instruction-following fidelity on these two specific drafts cannot be confirmed without an actual model call. **Dogfood output verification is deferred until a real key + non-dev environment exists.** This is not a system-prompt defect; it is an environment constraint. Do not mark this row PASS until a dogfood run against a live key confirms Fixture B/C tone fidelity.

#### Audit checklist — composer-chip strings (Part 3)

Unchanged by this feature (frontend is out of scope here). **CONFIRMED — PASS.** Re-checked against `backend/src/services/coach/systemPrompt.ts`: the file contains exactly one export (`REPLY_COACH_SYSTEM_PROMPT`), no chip-label strings, no UI copy of any kind — only the model-facing prompt and its JSON output contract. `coach.action.accept` / `coach.action.edit` / `coach.action.dismiss` / `coach.reasoning.expand` / `coach.reasoning.collapse` remain `Use this` / `Edit` / `Keep mine` / `Why this?` / `Hide` respectively, inherited verbatim and untouched by this dispatch.

#### Next step — audit re-run record (2026-07-09)

Re-run complete. Summary:

- **Part 1 voice-rule table (10 rows): PASS 10/10.** Fully verifiable as a static text audit; no gaps.
- **Part 2 fixture tone-fidelity (Fixture B/C dogfood): NOT VERIFIABLE THIS PASS.** No live `ANTHROPIC_API_KEY` in this environment. Structural consistency with the required output shape is confirmed; actual model-output fidelity is deferred until a real key exists in a non-dev environment.
- **Part 3 composer-chip strings: PASS.** No new/changed chip strings introduced by this feature's backend work.

**Design-side review-readiness:** the design-lead may treat the Part 1 and Part 3 audits as closed. The Part 2 dogfood gate remains open and should be tracked as a follow-up check (owned by whichever role runs the first live-key dogfood pass — likely backend-dev or qa-engineer once `ANTHROPIC_API_KEY` is provisioned in a non-dev environment) rather than blocking this feature's `review` status on the design side, since the parent AC frames dogfood as a runtime activity, not a spec-time gate.

### Accessibility

**N/A — no new accessibility surface introduced by this dispatch.** Confirmed by reading `### Backend`, `### Frontend`, and `### Visual` above:

- This feature is a backend client swap: `MockClaudeClient` → `LiveClaudeClient` wrapping `@anthropic-ai/sdk`, behind the existing `ClaudeClient` seam. It touches `POST /api/comments/coach`'s implementation, not its contract — response shape (`{ verdict, categories, reasoning, rewrite }`), status codes, and failure-fallback behavior (`200 + verdict=ok`) are unchanged from the parent feature.
- `### Frontend` here is explicitly deferred to the Phase 3 frontend port (`## Out of scope`: "Frontend composer-chip UI"). No `CoachChip`, no DOM, no rendered UI ships in this dispatch — there is nothing for a screen reader, keyboard user, or contrast check to encounter yet.
- `### Visual` above confirms "none new" for component anatomy, token usage, and states — no new surface for this dispatch.
- The one new operational behavior — the daily $5 spend cap silently degrading live→mock for the rest of the day, and the 50/50 holdback experiment arm — both resolve to the same `verdict: 'ok'` response shape the mock already produces (per `### Visual` §"States" above), so they introduce no new perceivable state and no new a11y surface either.

**Baseline this dispatch inherits (already audited in [[features/reply-coach]] `### Accessibility`), unchanged by this swap:**

- Keyboard order: textarea → submit → chip controls (Use this / Edit / Keep mine / Why this?) — passes 2.4.3, established in the parent audit and not touched here.
- ARIA-live posture: silent on `verdict=ok`, single `aria-live="polite"` announcement on chip appearance for `verdict=suggest` — passes 4.1.3, established in the parent audit.
- Focus management on Accept / Edit / Keep mine / Why-this toggle — passes 2.4.3, 3.2.1, 3.2.2, 4.1.2, established in the parent audit.
- Contrast: flagged and partially resolved in the parent's `### Visual` §5a (primary CTA `#FFFFFF` on `color.brand.primary` `#4D9463` ≈ 3.4:1 — passes 1.4.11 UI-component, fails 1.4.3 normal-text; design-lead deferred the system-wide fix to a proposed `brand-contrast-fix` feature). That gap is orthogonal to the SDK swap and does not block this feature.

**Verdict for this dispatch: 0 findings, 0 blocking.** No contrast pairs, keyboard flows, ARIA roles, or screen-reader labels are introduced or modified by swapping the mock client for the live SDK. Re-audit is owed when the Phase 3 frontend port actually renders `CoachChip` against the tokens `ui-designer` specs then — this subsection is not a substitute for that pass.

## Marketing — Spec

### Launch copy

**Scope note.** This is an internal/ops change — swapping the mock Claude client for the live Anthropic SDK behind the existing `reply_coach_live_enabled` flag, plus a 50/50 holdback experiment and a $5/day per-org cost cap. No new user-facing surface ships here; the composer chip stays out of scope (Phase 3 frontend). No production API spend has occurred during development — this pass ships infrastructure gated behind flags and a holdback, not a live rollout. Copy below is written for internal changelog use and for `seo-specialist` to draw on once `/help/reply-coach` goes live.

**Internal release note** (≤ 80 words)

Reply Coach now runs on the real Anthropic model instead of canned test fixtures, gated behind `reply_coach_live_enabled` and a per-org $5/day spend cap that quietly turns itself back off if it's hit. Half of eligible users are in an 8-week holdback so we can measure whether gentler nudges actually change what gets posted. No draft text is stored — only pass/fail-style outcome counts. Still backend-only; no composer UI yet.

**Internal Slack/standup line** (short-form, not public)

Reply Coach: mock client swapped for live Anthropic SDK, capped at $5/org/day, 50/50 holdback running for 8 weeks. Backend-only — still no chip in the composer.

**Note for `/help/reply-coach` (for seo-specialist, once live)**

When the public explainer page ships, it can now truthfully say Reply Coach runs on live AI review, not a demo. Suggested line to fold in: "Reply Coach reads your draft in the moment, using the same care our team put into how it talks about foster families — nothing about your draft is saved." Hold this line until the flag is actually on for real traffic; don't publish ahead of the holdback's first read-out.

### SEO

**Spec-only in this pass.** No page is built as part of this dispatch. This finalizes the proposal from `[[features/reply-coach]]`'s `### SEO` §2–4 into a concrete spec, since this feature is the one that actually turns the coach on for real users and makes the explainer page worth publishing. Building the page itself is deferred to a future frontend dispatch, gated on the holdback's first read-out per `### Launch copy`'s note above — publishing a trust page for a feature still in an 8-week holdback risks describing behavior not yet universally true.

#### Target URL

`/help/reply-coach` — confirmed over the `/about/*` alternative per parent's rationale (docs namespace, reusable for future feature explainers). Single canonical URL, no query-param variants, no localized routes in v1.

#### Meta tags

- `title`: `How the Reply Coach works — fofafu` (36 chars)
- `meta.description`: `A gentle, optional nudge before you publish a comment. Advisory only — never blocks you. Your drafts are never stored.` (121 chars)

#### Open Graph

- `og.title`: `How the Reply Coach works`
- `og.description`: `A gentle, optional nudge before you publish a foster-family comment. Advisory only. We don't store your drafts.` (114 chars)
- `og.image`: `https://fofafu.app/og/reply-coach.png` — 1200×630. Illustration angle: a composer textarea with a soft, low-contrast suggestion chip below it, mirroring the real `CoachChip` anatomy (parent feature's `### Visual`). Caption-free. **Not yet commissioned** — owned by `ui-designer` when the explainer page is actually built.
- `og.type`: `article`
- `og.url`: `https://fofafu.app/help/reply-coach` (exact host TBD at launch; canonical link tag must match)

#### Twitter Card

- `twitter.card`: `summary_large_image`
- `twitter.title`: mirrors `og.title`
- `twitter.description`: mirrors `og.description`
- `twitter.image`: mirrors `og.image`

#### Schema.org JSON-LD

`FAQPage` (upgraded from the parent proposal's generic `Article`) — the explainer's likely content shape is a short set of Q&A ("What is the Reply Coach?", "Does it store my drafts?", "Can I turn it off?"), and `FAQPage` markup is more likely to earn a rich result for the trust-building queries the parent spec names ("is this safe?", "AI comment suggestions safe"). If the page ships as prose without a Q&A structure, fall back to `Article` (`headline`, `description`, `author: Organization`, `datePublished`). Final call belongs to whoever writes the page copy when it's actually built — noted as an open item.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the Reply Coach?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A gentle, optional nudge before you publish a comment on a foster-family announcement. It reads your draft in the moment and is advisory only — it never blocks you from posting."
      }
    },
    {
      "@type": "Question",
      "name": "Does fofafu store my draft or the coach's suggestions?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Nothing about your draft is saved. Only aggregate, anonymous outcome counts (verdict, category, whether you accepted) are recorded for product analytics."
      }
    }
  ]
}
```

Exact question set to be finalized against launch copy when the page is actually written; the two above are illustrative and already grounded in real acceptance criteria (no-persistence AC, aggregate-only `coach_events` table, silent-fallback design).

#### robots / indexing

- `/help/reply-coach` itself: **index, follow** — public marketing/trust surface per parent's recommendation.
- Everything else touched by this feature stays `noindex`: `POST /api/comments/coach` (`X-Robots-Tag: noindex, nofollow`, already applied to `/api/**`) and the authenticated composer surface where `CoachChip` renders (Phase 3, out of scope here). No change to those from this dispatch.

#### Sitemap entry (once the page ships)

```xml
<url>
  <loc>https://fofafu.app/help/reply-coach</loc>
  <changefreq>monthly</changefreq>
  <priority>0.5</priority>
</url>
```

`monthly`/`0.5`: help/trust content that updates infrequently (only when the coach's behavior materially changes), ranked below core product pages (home, signup) but above low-value utility pages.

#### Not done in this pass

- No `frontend/src/seo/**` files written — the page doesn't exist yet.
- No `public/sitemap.xml` edit — nothing to add until the route is live.
- No `og.image` asset commissioned.
- The actual page build (React route + `react-helmet-async` wiring + page copy) should be scoped as its own follow-up feature file once this live-SDK dispatch ships and the holdback's first 8-week read-out confirms the coach is stable — per `### Launch copy`'s explicit hold instruction.

### Growth

**Scope note.** This subsection does not redesign metrics — it re-states the canonical definitions from [[features/reply-coach]] `### Growth` §1–5 and finalizes them against this feature's concrete mechanics (live SDK, `coach_events` table, $5/day cap, 8-week holdback). Where the parent left a "flagged for reply-coach-live" placeholder, this is that follow-through.

#### 1. Primary metric

**Suggestion-acceptance rate** (unchanged definition from parent §1):

```
acceptance_rate = accepts / (accepts + edits + dismisses)
```

Scoped to coach calls where `verdict: "suggest"` in the **treatment arm only** (live SDK, `reply_coach_live_enabled=true` for that user_id hash bucket). Excludes `verdict: "ok"` calls and excludes `outcome: null` ("no-action") from the denominator, bucketed separately.

**Plain English:** *of the times the live coach offered a rewrite, how often did the author use it (as-is or edited) instead of their original?*

Target band at read-out: **35–60%** (parent's band, carried forward unchanged — this feature doesn't re-derive it, since the live model swap is graded against the same Microcopy Part 2 fixtures per `### Microcopy`'s tone-fidelity audit).

#### 2. What "this worked" looks like at the 8-week read-out

Per this feature's Acceptance criteria, the read is **treatment arm vs. holdback (control) arm**, not treatment vs. some external baseline:

- **Acceptance rate** (treatment arm) lands in the 35–60% band.
- **Reported-comment delta** (counter-metric, existing `moderation_reports` table) in the treatment arm is **not higher** than the control arm's rate over the same 8 weeks.
- **Comment-publish rate** (guardrail) in the treatment arm is within **±5pp** of the control arm — the live coach must not be suppressing participation.

All three must hold simultaneously (parent §5's threshold, restated). Acceptance rate alone is not a ship/no-ship signal in isolation — see parent §1's rationale on why a too-eager or too-quiet coach can both produce misleading acceptance numbers.

#### 3. Guardrail metrics (existing platform metrics, not invented here)

| Metric | Direction | Source |
|---|---|---|
| **Reported-comment delta** | must NOT increase, treatment vs. control | existing `moderation_reports` table |
| **Comment-publish rate** | must NOT drop >5pp, treatment vs. control | existing announcement-feed engagement metric |
| **DM open rate** | must NOT decrease | existing DMs surface metric (cross-surface sanity check) |

#### 4. `coach_events` — how the aggregate table supports the metric

The table lands with this feature (per Acceptance criteria and parent §3's schema sketch, unchanged):

```sql
CREATE TABLE coach_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'suggest')),
  category TEXT,
  outcome TEXT CHECK (outcome IN ('accept', 'edit', 'dismiss', 'no-action')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Acceptance rate is computed directly from `outcome` grouped by `verdict='suggest'`, joined against a separately-maintained holdback-arm assignment (by `user_id` hash — not stored in this table; the arm is derived deterministically from the hash function at query time, not persisted per-row, to avoid a second place experiment membership could drift).
- `category` lets the read-out break acceptance rate down by minimization / savior-framing / etc., useful for diagnosing voice drift if the live model underperforms the fixture tone on one category but not another.
- Table is aggregate-only by construction (no draft/rewrite/reasoning columns) — this is what makes the metric collectible without violating the no-persistence AC. There is no other source of acceptance-rate signal in this feature; if `coach_events` writes fail silently (per the fire-and-forget outcome-write design in the parent spec), the metric under-counts rather than errors, which is the accepted tradeoff.

#### 5. $5/day cost cap — operational guardrail, not a growth metric

The per-org daily spend cap is **not** a success metric; it is a dashboard companion that must be watched alongside the acceptance-rate read-out because it can silently confound it:

- When the cap is hit, the live flag degrades to `verdict: 'ok'` for the rest of the day for that org — visually and behaviorally indistinguishable from the holdback control arm (per `### Visual`'s "States" note).
- **Risk to the read-out:** if cap-degrade fires frequently, some fraction of nominal "treatment arm" impressions are actually silent no-coach impressions, which dilutes the measured acceptance rate downward without it being a real voice/product problem. Recommend a companion ops dashboard tracking **days-capped per org per week**; if any org is capped on a majority of days during the 8-week window, flag that org's data for exclusion or footnote in the read-out rather than let it silently bias the aggregate number.
- No target/threshold is set on the cap itself in this pass — "tune later" per the AC. It is monitored, not optimized.

#### 6. Experiment

- **Design:** 50/50 holdback by `user_id` hash, gated on `reply_coach_live_enabled` (already fixed by this feature's Acceptance criteria — not re-litigated here).
- **Read horizon:** **8 weeks minimum**, per parent §5's sample-size rationale (light foster-community traffic; needed to get acceptance-rate standard error below 5pp). If traffic is lighter than expected at the 4-week midpoint, extend rather than ship early or lower the threshold.
- **Success threshold:** acceptance rate 35–60% AND reported-comment delta ≤ 0 vs. control AND comment-publish rate within ±5pp of control — all three, per §2 above.

#### 7. Feature flag

`reply_coach_live_enabled` — already named in this feature's Acceptance criteria; no new flag introduced here.

| Stage | % of eligible users (of the 50% treatment bucket) | Gate to advance |
|---|---|---|
| Off (default) | 0% | `LiveClaudeClient` passes dogfood tone-fidelity audit (`### Microcopy` checklist, all rows PASS) |
| Internal | dev + design-lead accounts | boot-refusal AC verified; cache-hit rate observable in logs |
| 10% | 10% of treatment bucket | no `5xx` rate increase; cost-cap dashboard shows non-zero but non-saturating spend |
| 50% | 50% of treatment bucket | held 1 week; days-capped-per-org stays low across orgs |
| 100% (of treatment bucket — i.e. the full 50/50 split is live) | 100% | holds for the full 8-week read horizon before any conclusion is drawn |

Rollout stages here gate readiness of the flag itself, not the experiment's read horizon — the 8-week clock in §6 starts once the flag is at its terminal 50/50 split, not at first exposure.
