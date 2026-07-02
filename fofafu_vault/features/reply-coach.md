---
slug: reply-coach
title: Reply Coach
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-06-03
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Reply Coach

## Problem

Foster-family announcement threads carry weight other community feeds don't. A well-meaning comment ("at least you got to keep her", "real parents", "you're a saint", "such a lucky kid") can re-traumatize a foster parent, bio family member, or former-foster-youth reading the thread. Moderation-after-the-fact doesn't help — the harm has already been read.

The Reply Coach uses the Claude API to gently nudge an author before they publish a comment that's likely to land badly. It is **advisory, never blocking**: it offers a softer rewrite the author can accept, edit, or dismiss. It is silent on neutral comments. It does not moderate opinions — only phrasings known to harm in foster contexts.

Success = the coach reduces reported/edited-after-publish comments without making the composer feel paternalistic or slow.

## Acceptance criteria

- [ ] `POST /api/comments/coach` accepts a draft comment (+ optional thread context) and returns `{ verdict, categories, reasoning, rewrite }` per the contract in `fofafu_vault/plans/PHASE_2.md`.
- [ ] Endpoint is gated by `reply_coach_enabled` feature flag (defaults `false`); when off, returns `404` so the frontend can no-op cleanly.
- [ ] Anthropic prompt caching is configured on the system block; cache-hit rate observable in response logs.
- [ ] Per-user rate limit: 60 coach calls per hour; returns `429` past the limit.
- [ ] On Claude API failure (timeout, 5xx, key missing), endpoint returns `200` with `{ verdict: "ok" }` so the composer never blocks publish.
- [ ] Coach inputs are NOT persisted; request bodies are scrubbed from any structured log line.
- [ ] `ANTHROPIC_API_KEY` is env-only; backend logs a warning (not an error) if absent and the flag is off, and refuses to boot if absent and the flag is on.

## Out of scope

- Frontend composer-chip UI (Phase 3 owns this; this feature ships the backend endpoint only).
- DMs — v1 coaches public announcement comments only.
- Coaching of announcement bodies (post composer) — separate future feature.
- Storing or analyzing rejection/acceptance signals beyond aggregate counts (Growth section will define).
- Model fine-tuning — prompt engineering only.

## Decisions

- **Mock first** *(2026-06-03)*. v1 ships a swappable `ClaudeClient` interface returning canned responses (one neutral, one minimization, one savior-framing fixture at minimum). The real `@anthropic-ai/sdk` integration + `ANTHROPIC_API_KEY` plumbing + prompt caching lands as a follow-up feature (`reply-coach-live`) once this PR is in. Rationale: keeps the first PR free of API-key plumbing and live-call cost while still landing the endpoint, flag, rate limit, response shape, and tests.
  - All acceptance criteria still apply EXCEPT the prompt-caching AC and the `ANTHROPIC_API_KEY` boot-refusal AC — both move to the live-SDK follow-up.
  - Tests run fully offline against the mock; no network calls.

## Open questions

- Final list of categories (initial six are in `fofafu_vault/plans/PHASE_2.md` — confirm during spec).
- Reasoning string returned to the client: included in v1 response or held back until UI design lands?
- Default rate limit (60/hour proposed) — tune after dogfood pass.
- Cache-hit metadata in the response body vs. server logs only? *(deferred to the live-SDK follow-up)*

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Mock-first v1.** Endpoint, flag, rate limit, fixtures, failure path, and tests all ship now. Live Anthropic SDK + key plumbing + prompt caching + boot-refusal AC defer to `reply-coach-live` per `## Decisions`.

#### Files

Added:

- `backend/src/schemas/coach.schemas.ts` — Zod schemas `CoachInput`, `CoachThreadContext`, `CoachResponse`, `CoachVerdict`. Inferred TS types co-exported.
- `backend/src/services/coach/featureFlags.ts` — `isReplyCoachEnabled()` reads `process.env.REPLY_COACH_ENABLED === 'true'`. Per-call (no caching) so tests flip without restart. First flag module in the repo; future flags extend this file.
- `backend/src/services/coach/claudeClient.ts` — `ClaudeClient` interface (`coach(input): Promise<CoachResponse>`), `MockClaudeClient` implementation, singleton `getClaudeClient()`, and `setClaudeClientForTests(client)` swap hook. Canonical fixtures A/B/C are byte-mirrored from `### Microcopy` Part 2.
- `backend/src/services/coach/rateLimit.ts` — Per-user rolling-hour limiter (`consumeCoachCall(userId)`), 60 calls/user/hour, in-memory `Map<userId, number[]>`. Returns `{ allowed, retryAfterSeconds }`. `resetCoachRateLimitForTests()` clears state between tests.
- `backend/src/controllers/coach.controller.ts` — `coachComment(req, res)`. Defense-in-depth flag check, rate-limit check, try/catch around the client call. Logs only `err.message` at `console.warn` level on failure — never `req.body`, never the draft, never `threadContext`.
- `backend/src/routes/coach.routes.ts` — `coachRouter` with middleware order: `requireCoachEnabled` (404 short-circuit before auth) → `authenticate` → `validate(CoachInput, 'body')` → `coachComment`. Returning 404 ahead of auth means anonymous probes can't fingerprint flag state.
- `backend/tests/coach.test.ts` — 12 cases, all passing. Covers neutral fixture, both suggest fixtures, unrecognised-draft fallback, threadContext acceptance, malformed body 400, empty draft 400, flag-off 404 (with and without auth), missing-auth 401, 60-call rate limit + 429 + Retry-After header, and silent-fallback 200 on client throw.

Modified:

- `backend/src/routes/index.ts` — added `coachRouter` import; mounted at `/comments/coach` BEFORE the existing `/comments` mount so Express matches the specific path first.

#### Contract (route, request, response)

```
POST /api/comments/coach
Authorization: Bearer <jwt>            // existing session JWT, same scheme as /api/comments
Content-Type: application/json

Body:
{
  "draft": string,                     // 1..4000 chars, required
  "threadContext"?: {                  // optional, ignored by mock; pass-through ready for live
    "postTitle": string,               // <=500 chars
    "recentComments": Array<{          // <=10 items
      "author": string,                // <=200 chars
      "body": string                   // <=4000 chars
    }>
  }
}

200 OK
{
  "verdict": "ok" | "suggest",
  "categories": string[],              // [] when verdict=ok
  "reasoning": string,                 // "" when verdict=ok
  "rewrite": string | null             // null when verdict=ok
}
```

Other status codes:

- `400` — Zod validation failure (missing/empty draft, oversized field, malformed shape). Standard `{ error, fields }` shape from `validate.middleware.ts`.
- `401` — Missing or invalid JWT (when flag is on).
- `404` — `REPLY_COACH_ENABLED !== 'true'`. Returned BEFORE auth so an anonymous probe also gets a clean 404.
- `429` — Per-user limit exceeded. Body `{ error: 'Rate limit exceeded' }` + `Retry-After: <seconds>` header.
- `200 + verdict=ok` — Returned on Claude client throw (live SDK timeouts, 5xx). The composer never blocks.

Frontend Zod schema (in `### Frontend`) already mirrors this exactly — `verdict`, `categories`, `reasoning`, `rewrite` field names and types match.

#### Flag behavior

- `REPLY_COACH_ENABLED=true` → route serves normally.
- Anything else (unset, empty, `"false"`, `"1"`, etc.) → 404 from a pre-auth middleware. No log line, no metric — the route is functionally absent.
- The frontend caches the 404 per session (see `### Frontend` → "Failure handling"), so a flag-off deployment costs one probe per session.
- Tests flip the env var between cases; the module reads `process.env` on every call by design.

#### Rate-limit behavior

- 60 calls per user per rolling 60-minute window. Keyed on `req.userId` (JWT sub).
- Implementation: `Map<userId, number[]>` of unix-ms timestamps; on each call, drop stamps older than `now - WINDOW_MS`, then check length.
- Past the limit: `429` + `Retry-After: <seconds-until-oldest-stamp-ages-out>`.
- In-memory only — single-instance v1. Horizontal scaling (post-`reply-coach-live`) swaps to a shared store without changing the call site.
- Mounted at the app level: the generic `express-rate-limit` 200/15min IP budget still applies on top of this per-user budget.

#### Fixture matching rules

The mock matches `input.draft` against the three canonical strings exact-equal (case- and whitespace-sensitive):

| draft (verbatim) | fixture |
|---|---|
| `Praying for your family this week.` | A — `verdict: 'ok'`, empty categories/reasoning, `rewrite: null` |
| `At least you got to keep her for a while.` | B — `verdict: 'suggest'`, `categories: ['minimization']`, reasoning + rewrite per Microcopy Part 2 |
| `You're such a saint for taking him in.` | C — `verdict: 'suggest'`, `categories: ['savior-framing']`, reasoning + rewrite per Microcopy Part 2 |
| anything else | Fixture A (silent) |

Exact match is deliberate. Fuzzy matching would paper over future system-prompt regressions when `reply-coach-live` lands and the live system prompt is graded against the same strings.

#### Privacy / logging

- The controller logs only `err.message` on client failure. It never logs `req.body`, `input.draft`, `input.threadContext`, the user's id, or the response.
- No DB writes. No file writes. Drafts and thread context exist only on the request stack during the handler.
- The app-level error handler (`backend/src/index.ts`) doesn't inspect bodies, so no scrub middleware was needed at the route level.

#### Deferred to `reply-coach-live`

These ACs from the feature file are explicitly NOT shipped here and move to the live-SDK follow-up:

- Anthropic SDK integration (`@anthropic-ai/sdk` dependency add).
- `ANTHROPIC_API_KEY` env wiring.
- `ANTHROPIC_API_KEY` boot-refusal when flag is on.
- Anthropic prompt caching on the system block + cache-hit observability in response logs.
- System prompt content (voice rules + few-shot examples).
- Cache-hit metadata in response body vs. server logs (open question).

The `ClaudeClient` interface is the seam for that work — `LiveClaudeClient implements ClaudeClient` plugs in where `MockClaudeClient` sits today, with no controller changes.

#### Tests

`npm run -w backend test` → **94/94 passing** (12 new coach cases; no regressions in the existing 82).

#### Retry 2026-06-10

Narrow patch in response to tech-lead's APPROVED-WITH-COMMENTS disposition on `### Code review`. No widened scope, no controller logic change.

1. **MF-2a (fixture B reasoning, verbatim).** Tightened the minimization fixture test from `assert.ok(typeof reasoning === 'string' && length > 0)` to `assert.equal(reasoning, …)` against the canonical Microcopy Part 2 string (mirrored byte-for-byte from `backend/src/services/coach/claudeClient.ts:30`).
2. **MF-2b (fixture C reasoning, verbatim).** Added `assert.equal(reasoning, …)` to the savior-framing fixture test against the canonical Microcopy Part 2 string (mirrored byte-for-byte from `claudeClient.ts:38`). Existing `verdict === 'suggest'` / `categories === ['savior-framing']` / `rewrite === "He's lucky to have you showing up for him like this."` assertions were already present and untouched.
3. **QA gap #1 (oversized draft).** New case `rejects oversized drafts (4001 chars) with 400` exercises the `z.string().max(4000)` boundary one byte over the cap; expects 400 from the validate middleware.
4. **QA gap #2 (threadContext > 10).** New case `rejects threadContext.recentComments with more than 10 items (11) with 400` exercises the `z.array(…).max(10)` boundary; expects 400.
5. **NTH-3 (rate-limit-consume comment).** One-line clarifying comment in `coach.controller.ts` above `consumeCoachCall(userId)` documenting that the slot is consumed before the try/catch by design so upstream failures count against the user's quota. No logic change; no signature change.

**MF-1 (`console.warn` / logger util) NOT addressed here** per tech-lead disposition (b) — deferred to a separate `chore/backend-logger-util` feature; the existing `// eslint-disable-next-line no-console` marker remains as the known-deviation tag.

`npm run -w backend test` → **96/96 passing** (94 prior + 2 new oversized/threadContext-cap cases; the two MF-2 additions tightened assertions on existing tests rather than adding new ones, so the count rises by exactly 2). `npm run -w backend typecheck` → clean.

### Frontend

**Implementation deferred to Phase 3 frontend port.** This dispatch ships backend-only per `## Out of scope`. The notes below are a forward-looking spec so the Phase 3 port can wire the composer chip without re-deriving the contract.

**Where it lives.** The coach surfaces inside the announcement comment composer at `frontend/src/features/feed/components/CommentForm.tsx`. A new sibling component `CoachChip/` (PascalCase folder, co-located: `CoachChip.tsx`, `CoachChip.test.tsx`, `useCoach.ts`, `index.ts`) renders directly below the textarea inside `CommentForm`'s root layout, not as a portal/modal. The chip is part of the form's flow but never inside the `<form>`'s submit path. No new page or route is introduced; this is composer-local only.

**Trigger.** `useCoach(draft)` hook owns the call. Debounce: fire-and-forget `POST /api/comments/coach` ~600ms after the last keystroke (tune in Phase 3) and again on textarea `blur`. Drafts shorter than ~20 characters are skipped client-side to avoid noisy calls. In-flight requests are cancelled (AbortController) when the draft changes. Submission is **never gated** on the coach response — the publish button remains enabled and reactive to the user, not to coach state.

**API layer.** Add a typed wrapper `frontend/src/api/coach.ts` with a Zod schema mirroring the backend contract exactly:

```ts
// field names MUST match backend response
const coachResponseSchema = z.object({
  verdict: z.enum(['ok', 'suggest']),
  categories: z.array(z.string()),
  reasoning: z.string(),
  rewrite: z.string().nullable(),
});
```

Request body: `{ draft: string, threadContext?: { postTitle: string, recentComments: Array<{ author: string, body: string }> } }`. `recentComments` is built from the last 3 already-rendered comments in `CommentList` props (no extra fetch). The wrapper lives under `api/` per the rules — never inline `fetch`.

**Server state vs UI state.**
- **Do NOT** use TanStack Query for the coach result. Drafts are transient and ephemeral; there is no cache key worth invalidating, and stale cache hits would mislead the author after they keep typing. Use plain `useState` inside `useCoach` for `{ status, result }` and an `AbortController` ref for cancellation.
- No Zustand store. The chip's open/dismissed state is local to one composer instance and dies with the form.
- Server state that already exists (the announcement, comment list) continues to flow through TanStack Query unchanged.

**UX shape.**
- `verdict === 'ok'` → render nothing. No banner, no green check, no toast, no a11y live-region announcement. The composer must feel silent on neutral drafts.
- `verdict === 'suggest'` → render the `CoachChip` below the textarea: a soft, low-contrast card with the `rewrite` string as the primary visible content. Below it, three controls (visual treatment owned by `ui-designer` / `ux-writer`, surfaced in `### Visual` and `### Microcopy`):
  - **Accept** — replaces the textarea value (via RHF `setValue('body', rewrite, { shouldDirty: true })`) and dismisses the chip.
  - **Edit** — replaces the textarea value but keeps focus in the textarea so the author can keep typing; dismisses the chip.
  - **Dismiss** — closes the chip without touching the draft. Sets a dismissed-for-this-draft flag so the same `rewrite` doesn't re-surface until the draft text materially changes.
- `categories` and `reasoning` are NOT surfaced in the primary chip in v1 (per `## Open questions` lean: rewrite-first, "why" on expand). A future "why?" expand affordance can read them; for the Phase 3 port, accept them in the schema and ignore them in render.

**Failure handling — never blocks publish.**
- Network error, timeout, 5xx, abort: silent no-op. No chip, no toast, no console output (use the project logger util at debug level only).
- `404` (flag off): silent no-op — treat exactly like a successful `verdict=ok`. The hook caches the 404 result per session so subsequent debounces skip the call entirely when the flag is off.
- `429` (rate-limited): silent no-op for the rest of that draft; do not retry, do not surface to the user.
- The submit button on `CommentForm` is wired to the form's own validity (RHF + Zod), never to coach state.

**Form integration.** `CommentForm` already uses React Hook Form + Zod per the project rules; the coach hook reads `watch('body')` to feed the debounce input and uses `setValue('body', ...)` from `Accept`/`Edit`. Field-level validation errors on the comment textarea continue to render as today and are unrelated to the chip.

**Styling.** Tailwind utilities only, `cn()` for the chip's conditional states (visible / dismissed / accept-pending). No inline styles, no CSS modules. Visual tokens (color, radius, spacing) come from `fofafu_vault/standards/design-system.md` via the existing tokens module — frontend-dev does not pick palette here.

**Testing (Phase 3).** Co-located `CoachChip.test.tsx` + `useCoach.test.ts`. Mock at the network boundary with MSW:
- Renders nothing when API returns `verdict: 'ok'`.
- Renders chip with `rewrite` string when `verdict: 'suggest'`.
- `Accept` replaces the textarea value and hides the chip.
- `Dismiss` hides the chip without mutating the draft.
- `404` from the API renders nothing and does not block the submit button.
- Submit button remains clickable during an in-flight coach request.

**Out of this dispatch.** No `frontend/` files are written, edited, or scaffolded as part of `reply-coach`. The Phase 3 frontend port will own all code, tests, and final UX micro-decisions against the design-lead's tokens and microcopy that land in the sections below.

### Test plan

**Scope.** Mock-first v1 only. The two deferred ACs from `## Decisions` (prompt caching, `ANTHROPIC_API_KEY` boot-refusal) are explicitly out of scope here and re-routed to `reply-coach-live`'s test plan. Everything else in `## Acceptance criteria` has at least one corresponding case in `backend/tests/coach.test.ts` and is exercised by `npm run -w backend test`.

#### 1. Coverage — AC → test mapping

All test names below are quoted verbatim from `backend/tests/coach.test.ts` under the `reply-coach feature` `describe` block. The file holds 12 cases; the snapshot at the bottom of this plan confirms all 12 pass.

| Acceptance criterion | File | Test name(s) | Type | Asserts |
|---|---|---|---|---|
| `POST /api/comments/coach` accepts draft (+optional threadContext) and returns the `{ verdict, categories, reasoning, rewrite }` contract | `backend/tests/coach.test.ts` | `returns the neutral fixture for a benign draft (verdict=ok)`; `returns the minimization fixture for the canonical "at least" draft`; `returns the savior-framing fixture for the canonical "saint" draft`; `falls back to verdict=ok for any unrecognised draft`; `accepts optional threadContext without changing the verdict` | integration (real Express app, real auth, in-memory SQLite) | 200 + all 4 response fields, types and values, for each fixture; default branch returns ok-shape; threadContext is accepted without 400 |
| Endpoint gated by `reply_coach_enabled`; off → `404`; off-before-auth so anonymous probes can't fingerprint flag state | `backend/tests/coach.test.ts` | `returns 404 when the feature flag is off (and skips auth)`; `returns 404 when the flag is off even without auth` | integration | flag-off returns 404 with a valid JWT *and* with no JWT — confirms the route is functionally absent and the middleware ordering (`requireCoachEnabled` before `authenticate`) is correct |
| Per-user rate limit: 60 calls / rolling hour; over → `429` + `Retry-After` | `backend/tests/coach.test.ts` | `rate-limits at 60 calls per user per rolling hour (61st returns 429)` | integration | calls 1–60 succeed (200), call 61 returns 429, response carries a `Retry-After` header |
| On Claude API failure → `200` with `{ verdict: "ok" }` (composer never blocks) | `backend/tests/coach.test.ts` | `returns the silent fallback (200 + verdict=ok) when the Claude client throws` | integration (stub client injected via `setClaudeClientForTests`) | even with `draft` exactly matching the minimization fixture, a throwing client yields 200 + verdict=ok + empty categories + null rewrite |
| Coach inputs are NOT persisted; bodies scrubbed from log lines | covered structurally — see "Coverage gaps" §2.6 | (no test) | n/a | controller only logs `err.message`; no DB write path exists; flagged as a structural review item, not a test gap |
| Anthropic prompt caching configured + cache-hit observable | **deferred to `reply-coach-live`** per `## Decisions` | n/a | n/a | n/a in v1 |
| `ANTHROPIC_API_KEY` env-only; warn-if-absent-and-flag-off; refuse-boot-if-absent-and-flag-on | **deferred to `reply-coach-live`** per `## Decisions` | n/a | n/a | n/a in v1 |

Tests not bound to a single AC but covering contract surface:

| Concern | Test name | What it locks down |
|---|---|---|
| Schema validation — required field | `rejects malformed bodies with 400` | Zod `CoachInput` rejects missing `draft` with a 400 from `validate.middleware.ts` (matches `400` listed in the contract) |
| Schema validation — empty draft | `rejects empty drafts with 400` | `z.string().min(1)` is enforced; empty body fails before reaching the client |
| Auth gate when flag-on | `requires auth (401 without JWT) when the flag is on` | The `authenticate` middleware fires when flag is on, returning 401 (not 404) — matches the contract |

#### 2. Coverage gaps and risks

Each gap below is paired with a disposition: **ship-as-is** (current shape is intentional), **patch-now** (add a test before this PR merges), or **defer-to-live** (re-evaluate when `reply-coach-live` lands).

1. **Oversized draft (`draft.length > 4000`)** — disposition: **patch-now (low cost)**. Zod schema declares `z.string().min(1).max(4000)`. The 400 path is covered by the `min` case but not the `max` case. Adding a single integration case asserting a 4001-char draft returns 400 is one line and locks the upper bound. Not blocking; nice-to-have before merge.
2. **`threadContext.recentComments` cap (>10 items)** — disposition: **patch-now (low cost)**. Schema enforces `.max(10)`. No test exercises an 11-item array. Recommend a single case asserting 400. The spec contract documents `<=10`; without a test, future schema-shape drift wouldn't be caught.
3. **`threadContext` field-length caps (`postTitle` >500, `author` >200, `body` >4000)** — disposition: **defer-to-live**. Three more cases for theoretical inputs the mock ignores anyway. Worth wiring when the live SDK actually forwards them and the upstream's own limits matter; until then the schema enforces them and the typecheck has read the schema.
4. **Rate-limit window rollover** — disposition: **ship-as-is**. The 60→429 boundary is tested. Boundary on the *other* side (61st call succeeds after the oldest stamp ages out of the rolling window) would require `vi.useFakeTimers()` or threading a `now` argument through the controller. `rateLimit.ts` already accepts `now` as an arg (`consumeCoachCall(userId, now)`) — a unit test against the limiter directly (no Express) could assert rollover without time travel. Recommend adding `backend/tests/coachRateLimit.test.ts` in `reply-coach-live` when horizontal scaling forces re-validation; not worth blocking v1.
5. **Concurrent rate-limit increments** — disposition: **ship-as-is**. Node single-threaded event loop + the limiter's pure-functional `consumeCoachCall` (no `await` between read and write to the bucket) means there's no realistic interleaving in a single instance. The horizontal-scaling case is explicitly a `reply-coach-live` problem per `### Backend` ("In-memory only — single-instance v1. Horizontal scaling swaps to a shared store without changing the call site"). No test needed in v1.
6. **No-persistence / log-scrub guarantee** — disposition: **ship-as-is (structural)**. There is no DB write path in `coach.controller.ts`, no file write, no append to any logger that takes `req.body`. The only `console.warn` in the failure path logs `{ message: err.message }` only — verified by reading the controller. A test that asserts "the draft does not appear in stdout" is brittle (it asserts a negative about the world); the structural argument is stronger. **If we want defensive coverage**: a test that injects a throwing client with a unique sentinel string in the draft and asserts the captured `console.warn` payload does not contain the sentinel would lock down the no-leak invariant cheaply. Recommended but not blocking.
7. **`Retry-After` header value sanity** — disposition: **ship-as-is**. Current test asserts the header is *present* but not that the integer value is plausible (`>=1`, `<=3600`). The implementation in `rateLimit.ts` uses `Math.max(1, …)` and caps at the window width by construction, so the upper bound is sound. Optional tightening: assert `Number(over.headers.get('retry-after')) >= 1`.
8. **`setClaudeClientForTests` exposure to production** — disposition: **ship-as-is with a structural note**. The hook lives in the production module (`backend/src/services/coach/claudeClient.ts`) and is exported alongside `getClaudeClient`. There is no conditional `if (process.env.NODE_ENV === 'test')` guard around the export. In practice this is fine — calling it from a production code path would be the bug, not the export's existence — but if `code-reviewer` flags this we'd accept a narrow patch that makes the symbol no-op outside of test (e.g. `if (process.env.NODE_ENV !== 'test') return;`). Not a defect in v1; flagging for awareness.
9. **Auth-vs-flag ordering test for the `429` path** — disposition: **ship-as-is**. We have flag-off + auth-on, flag-off + auth-off, and auth-off + flag-on (the 401). We do not separately test `flag-on + over-rate-limit` for an *unauthenticated* request. By the middleware chain (`requireCoachEnabled` → `authenticate` → `validate` → `consumeCoachCall`) an unauth request never reaches the limiter, so the case collapses to the existing 401 test. Confirmed by reading `coach.routes.ts`.

**Recommendation roll-up:** items #1 and #2 are cheap wins worth landing in this PR if a follow-up commit is welcome; everything else is either structurally covered or correctly deferred. Net assessment: the suite as shipped covers all in-scope ACs and the contract boundaries. No blocking gaps.

#### 3. Test-harness notes

**Mock client substitution.** Tests swap the client via `setClaudeClientForTests(client | null)` exported from `backend/src/services/coach/claudeClient.ts`. It mutates a module-level `cached: ClaudeClient | null` — calling with `null` reverts to the default `MockClaudeClient` lazy singleton (verified). The hook is exposed from production source, not a test-only build. Pragmatic and low-risk in this codebase (single test target, no dynamic-import boundary that could leak it to a runtime caller), and matches the existing pattern of `testInbox`/`resetCoachRateLimitForTests`. See gap #8 above.

**Rate-limit reset.** `resetCoachRateLimitForTests()` (in `backend/src/services/coach/rateLimit.ts`) calls `buckets.clear()` on the module-level `Map<string, number[]>`. Called from `resetDb()` in `coach.test.ts` `beforeEach`, so every test starts at zero calls consumed. Verified by reading the limiter source.

**`process.env.REPLY_COACH_ENABLED`.** Read on every call by design (`featureFlags.ts` does no caching), so flipping the env var between cases is sufficient — no module re-import needed. `resetDb()` restores `REPLY_COACH_ENABLED='true'` after each case so flag-off tests don't pollute later ones.

**App lifecycle.** Single `buildApp()` instance reused across tests with a per-test `runMigrations()` + `closeDb()` cycle and an `:memory:` SQLite DB. The HTTP server lazy-listens on a random port and is closed in `after()`. No port conflicts; no leaked handles (`--test-force-exit` is set in `package.json` as a belt to suspenders).

**Auth helper.** `register(userA)` does register → verify-email-via-`testInbox` → login and returns a JWT. The same helper is used by every test that needs auth — no shortcut that bypasses auth setup.

**No network calls.** The mock client is pure and synchronous-async; the silent-fallback test injects a throwing stub. Confirmed offline-clean.

#### 4. Phase 3 frontend test plan (forward-looking, canonical)

Restated in qa-engineer voice from `### Frontend` → "Testing (Phase 3)" as the canonical plan the Phase 3 port will execute. Co-located with the components per project rules. MSW at the network boundary — never `vi.mock('axios')` style module-level mocks.

| # | File | Test name (suggested) | Type | Asserts |
|---|---|---|---|---|
| 1 | `frontend/src/features/feed/components/CoachChip/CoachChip.test.tsx` | `renders nothing when API returns verdict: 'ok'` | unit (RTL) | `queryByRole('region', { name: /suggested rewrite/i })` is null; no DOM nodes from the chip |
| 2 | same | `renders the chip with the rewrite string when verdict: 'suggest'` | unit (RTL) | rewrite string is visible; `Use this` / `Edit` / `Keep mine` / `Why this?` buttons present |
| 3 | same | `Accept replaces the textarea value and hides the chip` | unit (RTL) | `getByRole('textbox')` value matches `rewrite` after click; chip unmounts |
| 4 | same | `Edit replaces the textarea value and keeps focus in the textarea` | unit (RTL) | value updated; `document.activeElement` is the textarea |
| 5 | same | `Dismiss hides the chip without mutating the draft` | unit (RTL) | textarea value unchanged; chip unmounts |
| 6 | same | `dismissed-for-this-draft flag clears when draft text materially changes` | unit (RTL, hook-level) | after dismiss + small whitespace tweak the chip stays hidden; after a non-trivial edit it re-surfaces for a new suggest response |
| 7 | same | `chip never traps focus` | unit (RTL) | tabbing through the chip's controls eventually advances focus out of the chip; reverse-tabbing returns up to the submit button (per `### Accessibility` §1 keyboard order) |
| 8 | same | `chip live-region announces once per mount, not on prop changes` | unit (RTL) | mount under `verdict='suggest'` produces one announcement; changing the `rewrite` string within the same mount does NOT add a second announcement (per `### Accessibility` §2) |
| 9 | `frontend/src/features/feed/components/CoachChip/useCoach.test.ts` | `404 from the API renders nothing and does not block the submit button` | unit (hook, MSW returning 404) | hook reports no chip; submit button next to it stays enabled |
| 10 | same | `submit button remains clickable during an in-flight coach request` | unit (RTL, MSW with delayed response) | submit button is not disabled while a coach request is pending |
| 11 | same | `429 silently no-ops for the rest of the draft` | unit (hook, MSW returning 429) | no chip, no error surface; no retry on next debounce tick |
| 12 | same | `network error silently no-ops` | unit (hook, MSW with `res.networkError`) | no chip, no toast, no thrown error |
| 13 | same | `caches the 404 result per session` | unit (hook, MSW returning 404 once + assertion on subsequent fetch calls) | second debounce tick after a 404 does NOT hit the network (hook short-circuits) |
| 14 | same | `aborts an in-flight request when the draft changes` | unit (hook, MSW with delayed handler + AbortController spy) | the in-flight request is aborted; only the latest draft's response is applied |

Additions over `### Frontend`'s existing bullets: #6 (dismissed-flag clears on material change), #7 (focus trap), #8 (live-region one-shot), #13 (404 caching), #14 (abort on draft change). All trace back to commitments already made in `### Frontend` and `### Accessibility`; the QA plan elevates them to test surface.

**E2E (Playwright).** No E2E for v1. When the Phase 3 frontend ships, a single Playwright case is recommended: `composer.spec.ts` types the minimization draft, asserts the chip appears with the canonical rewrite, clicks `Use this`, asserts the textarea contains the rewrite, clicks submit, asserts the comment is posted. Lives at `frontend/e2e/composer.spec.ts`. Out of scope here.

#### 5. Run commands

```
# from repo root
npm run -w backend test          # node:test, in-memory SQLite, ~25s wall, 94/94 pass
npm run -w backend typecheck     # tsc -p tsconfig.json --noEmit, no output on success
```

**No lint script** in `backend/package.json` (confirmed). ESLint is not wired for this workspace yet — `eslint .` would fail with no config. If `code-reviewer` wants a lint sweep, that's a separate `chore/eslint-backend` feature, not a blocker for this dispatch.

**Frontend commands deferred** to the Phase 3 frontend port. When the chip ships, the expected sweep is `npm run -w frontend test` (Vitest+RTL), `npm run -w frontend typecheck`, and `npm run -w frontend lint` if wired.

#### 6. Test-count snapshot (2026-06-04)

Ran `npm run -w backend test` from this dispatch:

```
ℹ tests 94
ℹ suites 13
ℹ pass 94
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~25500
```

Of the 94, the `reply-coach feature` suite contributes 12 (all passing). No regressions in the previous 82.

`npm run -w backend typecheck`: clean, no output, exit 0.


### Code review

**Summary.** Reviewed the mock-first reply-coach backend: `coach.schemas.ts`, `featureFlags.ts`, `claudeClient.ts`, `rateLimit.ts`, `coach.controller.ts`, `coach.routes.ts`, `routes/index.ts`, and `tests/coach.test.ts`. Scope: 7 new files + 1 modified route mount (~200 lines of production code, ~190 lines of tests). All 10 high-stakes invariants from the dispatch prompt were audited individually. No security issues or blocking bugs found. Two must-fix items identified: a logger-utility rule violation and missing verbatim reasoning-string assertions. Four nice-to-have items. Verdict: **approve-with-comments** — must-fix items are low-effort and should land before the PR is merged.

**Must-fix**

- MF-1: `backend/src/controllers/coach.controller.ts:52` — `console.warn` used for the client-failure log line. Project rules require a logger util, not `console.*`. No logger util exists in the backend yet — this is the first controller to introduce `console.warn` in a non-startup path, and it added `// eslint-disable-next-line no-console` rather than creating or using a util. The pre-existing `index.ts` and `email.service.ts` also use `console.*`, so this is systemic. Correct fix: (a) create `backend/src/utils/logger.ts` (thin wrapper over `console` for now, swappable later) and use it here and at the pre-existing sites, or (b) formally declare `console.*` as the accepted logger for this phase and update `rules.md`. Silently suppressing with ESLint is not acceptable. The logged payload is safe (`{ message }` only, never the draft) — this is a rule-compliance gap, not a privacy bug.

- MF-2: `backend/tests/coach.test.ts:85` and `:98` — The minimization fixture test asserts reasoning only as `typeof string && length > 0` (not verbatim). The savior-framing fixture test does not assert `reasoning` at all. `### Microcopy` Part 2 marks these strings **canonical** ("any drift between the live model's outputs and these fixtures is a bug in the system prompt"). If the reasoning strings in `claudeClient.ts` drift from the spec, the tests will not catch it. Fix: add `assert.equal(res.body['reasoning'], '<exact-string>')` for both fixtures B and C. The exact strings are already locked in `claudeClient.ts` — this is a one-line add per test.

**Nice-to-have**

- NTH-1: `backend/src/controllers/coach.controller.ts:41` — `const input = req.body as CoachInput;` casts away the type boundary. Safe at runtime because `validate(CoachInput, 'body')` runs immediately before and replaces `req.body` with the Zod-parsed value, but it bypasses TypeScript's narrowing. Consider a typed interface `CoachAuthRequest extends AuthRequest { body: CoachInput }` so the controller accepts a narrowed type without a cast. Pre-existing pattern in the repo — not new debt, flag for a global tidy pass.

- NTH-2: `backend/src/services/coach/claudeClient.ts:82` — `setClaudeClientForTests` is exported from a production source file with no guard. Not imported anywhere in production code (confirmed by grep). Recommend either a `process.env.NODE_ENV !== 'test'` early-return or moving the function to a co-located `claudeClient.__testing__.ts` file to make the intent explicit. The qa-engineer flagged the same gap (#8). Ship-as-is is defensible for v1; naming it here so tech-lead can decide before it becomes a pattern.

- NTH-3: `backend/src/controllers/coach.controller.ts:34` (rate-limit consume before try/catch) — The rate-limit slot is consumed before the client call. A failing client call (timeout, 5xx) burns a user's quota even though the composer never blocked. Intentional and consistent with standard rate-limiter semantics, but undocumented. A one-line comment ("consumed before the client call — failures count against the quota by design") would prevent a future contributor from moving the call into the `try` block thinking they're being safe.

- NTH-4: `backend/tests/coach.test.ts:172` — The `Retry-After` test asserts the header is *present* but not that its integer value is `>= 1`. The implementation uses `Math.max(1, ...)` so the floor holds, but adding `assert.ok(Number(over.headers.get('retry-after')) >= 1)` is a one-liner that locks the contract against future drift.

**Acceptance criteria spot-check**

- [x] `POST /api/comments/coach` accepts draft + optional threadContext, returns `{ verdict, categories, reasoning, rewrite }` — confirmed; all four fields present in every fixture path, validated by Zod schema, locked by integration tests.
- [x] Endpoint gated by `reply_coach_enabled` (defaults `false`); off → `404` — confirmed; `isReplyCoachEnabled()` returns `false` for any value other than the exact string `'true'`; gate runs before auth; two integration tests cover flag-off with and without JWT.
- [ ] Anthropic prompt caching configured on system block — **deferred to `reply-coach-live`** per `## Decisions`. Not reviewed here.
- [x] Per-user rate limit: 60 calls / rolling hour; `429` + `Retry-After` past limit — confirmed; timestamp-based rolling window; keyed on JWT `sub` (`req.userId`), not IP; `Retry-After` header set; integration test exercises the 60 → 61 boundary.
- [x] On Claude API failure → `200` with `{ verdict: "ok" }` — confirmed; `try/catch` wraps the client call; catch returns `SILENT_FALLBACK`; integration test injects a throwing stub.
- [x] Coach inputs NOT persisted; bodies scrubbed from log lines — confirmed structurally: no DB writes, no file writes, no log call touches `req.body` or any user-supplied field; failure-path `console.warn` logs only `{ message }`; app-level error handler uses `_req` (unused); no request-logging middleware mounted.
- [ ] `ANTHROPIC_API_KEY` env-only; warn/refuse-boot AC — **deferred to `reply-coach-live`** per `## Decisions`. Not reviewed here.

**Audit invariant confirmation**

1. Log scrubbing — PASS. No log call in new code or existing middleware touches `req.body`, draft, threadContext, or userId. Error handler uses `_req` (unused). The one `console.warn` in the failure path logs `{ message }` only. No morgan or structured-request-log middleware is mounted.
2. Flag-gating correctness — PASS. `requireCoachEnabled` runs before `authenticate`; default is genuinely `false` (any value other than the string `'true'`); response is `404` (not 403). Two tests verify flag-off with and without JWT.
3. Rate-limit correctness — PASS. Rolling window (timestamp filter per call, not a fixed bucket). Keyed on `req.userId` (JWT sub — not IP). `Retry-After` derived from oldest-stamp calculation with `Math.max(1, ...)` floor. No concurrency hazard: Node.js single-threaded event loop; no `await` between the read and write to the bucket.
4. Silent fallback on client failure — PASS. `try/catch` wraps `await getClaudeClient().coach(input)`. Catch returns `200 + SILENT_FALLBACK`. Logs only `err.message`. Integration test confirms end-to-end.
5. Auth requirement — PASS. Middleware order: `requireCoachEnabled` → `authenticate` → `validate` → `coachComment`. Anonymous request with flag on → 401. Integration test confirmed. Controller has a defense-in-depth `userId` guard.
6. Response shape consistency — PASS. Backend `CoachResponse`: `{ verdict: 'ok'|'suggest', categories: string[], reasoning: string, rewrite: string|null }`. Frontend schema in `### Frontend` mirrors exactly field-for-field. No drift.
7. Mock fixture fidelity — PASS (with MF-2 caveat on reasoning test coverage). Draft strings, rewrite strings, categories, and verdicts match `### Microcopy` Part 2 verbatim (confirmed character-level). Reasoning strings also match the spec but are not asserted verbatim by the tests — see MF-2.
8. Writer-ownership boundary — PASS. `git diff` and `git status` confirm backend-dev wrote only the `### Backend` subsection and the backend source files. `### Test plan` content is qa-engineer's (log entry at 14:05). No kanban files touched.
9. Project rules — PARTIAL. No `any` introduced. `tsc --noEmit` clean. No inline business logic in the controller. No commented-out code. No unlinked TODOs. `console.warn` rule violation — see MF-1.
10. Test-only surface area — PASS (with NTH-2 caveat). `setClaudeClientForTests` has no import site in production code (confirmed by grep). Package has no public `exports` field. See NTH-2 for the recommended structural improvement.

**Test gates**

`npm run -w backend test`: **94/94 passing** (12 new coach cases; 82 pre-existing with no regressions). Run confirmed in this review session.

`npm run -w backend typecheck`: **clean**, no output, exit 0. Run confirmed in this review session.

No lint script is configured for the backend workspace (confirmed by qa-engineer §5 and by inspection of `backend/package.json`). ESLint is not wired. Pre-existing gap, not introduced by this feature.

**Tech-lead disposition** *(2026-06-10)*

- **MF-1 (console.warn / logger util):** Disposition: **(b) defer to a separate `chore/backend-logger` feature**. Rationale: `console.*` is systemic across the backend (`index.ts`, `email.service.ts`, and now this controller); landing a `backend/src/utils/logger.ts` plus migrating all existing call sites as part of `reply-coach` would scope-creep a Phase 2 feature PR into a cross-cutting backend tidy. Action requested of the dispatcher: scaffold `features/backend-logger-util.md` (P2 chore) as a Backlog card on engineering. Until that lands, the existing `// eslint-disable-next-line no-console` comment in `coach.controller.ts:51` is accepted as a known-rule-deviation marker — explicit, greppable, removed when the logger util replaces it. NOT updating `rules.md` — the rule is right; the codebase needs to catch up.
- **MF-2 (reasoning strings not asserted verbatim):** Disposition: **patch-now, routed back to backend-dev**. Rationale: cheap, on-feature, and the spec marks Microcopy Part 2 strings as canonical — without verbatim assertion the canonical contract is unenforced. Tech-lead role file forbids writing code, so the patch returns to backend-dev (one `assert.equal` for fixture B's reasoning, one for fixture C — exact strings already locked in `claudeClient.ts:30` and `:38`). Gating `requested_status: review` on this.
- **QA patch-now gaps (oversized draft + threadContext>10):** Disposition: **patch-now, routed back to qa-engineer** alongside MF-2. Two added cases (4001-char `draft` → 400; 11-item `recentComments` → 400). Schema already enforces both caps; missing coverage means future schema drift wouldn't be caught.
- **NTH-1..4:** Accepted as not-blocking; carry into Review for follow-up tidy. NTH-3 (rate-limit-consume comment) is the cheapest of the four — one comment line in the controller; bundle with the MF-2 patch if backend-dev is touching the file anyway.

## Design — Spec

### Visual

**Implementation deferred to Phase 3 frontend port** (matches `### Frontend`'s posture). This subsection is the spec the Phase 3 port reads to wire `CoachChip` against `fofafu_vault/standards/design-system.md` tokens — no code, no screenshots.

#### 1. Component anatomy — `CoachChip`

The chip is a single card stacked below the comment textarea inside `CommentForm`. Anatomy from top to bottom:

```
┌─────────────────────────────────────────────────────────────┐
│  ▸ {coach.suggest.preface}                                  │  ← eyebrow row (mono kicker)
│                                                             │
│  {rewrite}                                                  │  ← primary content (one sentence)
│                                                             │
│  [ Use this ]  Edit   Keep mine        Why this?            │  ← controls row
│                                                             │
│  ── (only when expanded) ───────────────────────────────────│
│  {reasoning}                                                │  ← collapsed by default
└─────────────────────────────────────────────────────────────┘
```

Parts, named for the Phase 3 port:

| Part | Element | Notes |
|---|---|---|
| `chip.root` | `<aside>` (NOT inside `<form>`'s submit path) | Card surface. Holds focus-visible ring on internal controls, not on root. |
| `chip.preface` | `<p>` mono eyebrow | Renders `coach.suggest.preface` (or `coach.suggest.preface.alt` if a second suggestion ever stacks — out of scope for v1). |
| `chip.rewrite` | `<p>` body | The rewrite string. Primary visible content. Wraps freely; no clamp. |
| `chip.actions` | `<div role="group">` | Holds the three action controls + the reasoning toggle. Order left-to-right: Use this, Edit, Keep mine, (spacer), Why this?. |
| `chip.action.accept` | pill button | `coach.action.accept`. Primary visual weight. |
| `chip.action.edit` | text button | `coach.action.edit`. Secondary visual weight. |
| `chip.action.dismiss` | text button | `coach.action.dismiss`. Tertiary visual weight. |
| `chip.reasoning.toggle` | text button with chevron | `coach.reasoning.expand` / `coach.reasoning.collapse`. Right-aligned; visually separated from the action group. |
| `chip.reasoning.body` | `<p>` muted | Renders `reasoning` string when expanded. Separated from the actions by a hairline divider (single `1px` muted line — uses `color.ink.muted` at low opacity, see `### 4 — flagged gaps`). |

No avatar, no icon, no close-X (Keep mine IS the close). No chevron-only collapsed state — the toggle always carries its label.

#### 2. Token references

Pulled from `fofafu_vault/standards/design-system.md`. All token names below are exact.

**Surface & frame**

| Property | Token | Notes |
|---|---|---|
| Background | `color.surface.card` | The composer sits on `color.surface.warm`; the chip needs to lift off it. |
| Radius | `radius.16` | Matches the card-tier radius in the system (the `4 / 8 / 16 / 9999` scale). |
| Elevation | `shadow.lift` | The only shadow token in the system; charter forbids `shadow.heavy`. |
| Padding | `space.16` all sides | From the `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96` scale. |

**Type & ink**

| Element | Token | Notes |
|---|---|---|
| `chip.preface` | `color.ink.muted` + JetBrains Mono 400 (eyebrow tier) | Mono per charter rule "Mono = taxonomy" — the preface labels the chip's purpose, it's a kicker not body. |
| `chip.rewrite` | `color.ink.lead` + Nunito 500 (body) | The rewrite is the message; it gets full ink weight. Weight 500 (not 700) per "weight, not size, carries hierarchy". |
| `chip.reasoning.body` | `color.ink.muted` + Nunito 400 | Subordinate to the rewrite; reads as a footnote. |
| `chip.reasoning.toggle` (label) | `color.ink.muted` + Nunito 500 | Affords a tap target without competing with `Use this`. |

**Action controls**

| Control | Fill | Text | Radius | Notes |
|---|---|---|---|---|
| `chip.action.accept` | `color.brand.primary` | white (`#FFFFFF`) | `radius.9999` (pill) | Single primary CTA per charter: "Pill-only CTAs. … brand-primary fill, white text. No outline variant." |
| `chip.action.edit` | none (transparent) | `color.ink.lead` | `radius.9999` (still a pill hit-target) | Text-on-surface pill; see `### 4 — flagged gaps`. |
| `chip.action.dismiss` | none (transparent) | `color.ink.muted` | `radius.9999` | Lowest visual weight of the three — affirms author's draft without shouting. |
| `chip.reasoning.toggle` | none | `color.ink.muted` | `radius.9999` | Right-aligned; visually a peer of `Keep mine` in weight but spatially separated. |

**Spacing inside the chip**

- `space.8` between `chip.preface` and `chip.rewrite`.
- `space.16` between `chip.rewrite` and `chip.actions`.
- `space.12` between adjacent buttons inside `chip.actions`.
- `space.16` between `chip.actions` and the reasoning divider when expanded.
- `space.12` between the divider and `chip.reasoning.body`.

**Sizing (closes a11y-auditor flag #5 — target size)**

- `chip.action.accept`: minimum tap target `40 × 40` px (vertical padding `space.8`, horizontal padding `space.16` on the pill). Exceeds WCAG 2.5.8 minimum of 24×24.
- `chip.action.edit`, `chip.action.dismiss`, `chip.reasoning.toggle`: minimum tap target `40 × 40` px (vertical padding `space.8`, horizontal padding `space.12`). Pill hit-area exists even though the resting fill is transparent.

**Contrast (closes a11y-auditor flag #4 — contrast)**

Computed pairs against the current palette values in `fofafu_vault/standards/design-system.md`:

| Pair | Foreground | Background | Ratio | WCAG 2.2 AA |
|---|---|---|---|---|
| Rewrite text | `color.ink.lead` (`#1F1B18`) | `color.surface.card` (`#FFFFFF`) | ~16.8:1 | Pass (normal text 4.5:1) |
| Preface eyebrow | `color.ink.muted` (`#5E534B`) | `color.surface.card` (`#FFFFFF`) | ~7.6:1 | Pass (normal text 4.5:1) |
| Reasoning body | `color.ink.muted` (`#5E534B`) | `color.surface.card` (`#FFFFFF`) | ~7.6:1 | Pass (normal text 4.5:1) |
| Primary CTA label | `#FFFFFF` | `color.brand.primary` (`#4D9463`) | ~3.4:1 | **Fails normal-text 4.5:1; passes UI-component 3:1.** See note below. |

Note on the primary CTA pair: `#FFFFFF` on `#4D9463` is `~3.4:1`, which clears WCAG 1.4.11 (Non-text Contrast, 3:1 for UI components) but not 1.4.3 (Contrast Minimum, 4.5:1 for text). This is a **pre-existing system-level issue with `color.brand.primary`** that affects every primary CTA in fofafu, not a chip-specific gap. Flagged to `design-lead` in `### 4` so it is resolved at the token tier — not by silently lightening or darkening the brand color for this one chip.

#### 3. States

| State | What changes |
|---|---|
| `verdict === 'ok'` | Chip is **not rendered at all**. No skeleton, no placeholder, no live-region announcement. The composer is silent. (Matches `### Frontend` UX shape.) |
| `verdict === 'suggest'` — first surfacing | Full chip anatomy rendered. `chip.reasoning.body` is collapsed; `chip.reasoning.toggle` shows `coach.reasoning.expand`. No entrance animation in v1 (see `### 6 — out of scope`). |
| `Why this?` expanded | Hairline divider + `chip.reasoning.body` revealed below `chip.actions`. Toggle label flips to `coach.reasoning.collapse`. Chip height grows in place; no scroll-into-view. |
| `Why this?` collapsed (return) | Divider + reasoning body removed; toggle label back to `coach.reasoning.expand`. State is per-chip-instance and resets when the underlying suggestion changes. |
| Accept-pending micro-state | The 1–2 frame settle between `Use this` press and the chip leaving: `chip.action.accept` stays at its rest fill (no `:active` darken token exists), the textarea above receives the rewrite via RHF `setValue`, then the chip unmounts. Goal is "the textarea changed, the chip is gone" — no spinner, no fade. Phase 3 may add a subtle opacity dip if it feels abrupt; no token required. |
| Dismissed-pending (`Keep mine`) | Chip unmounts immediately; the dismissed-for-this-draft flag (see `### Frontend`) prevents the same `rewrite` from re-surfacing until the draft text materially changes. No visual residue, no toast. |
| Hover (`chip.action.accept`) | Slight darkening of `color.brand.primary`. No darken token exists in the system today — see `### 5 — flagged gaps`. |
| Hover (`chip.action.edit`, `chip.action.dismiss`, `chip.reasoning.toggle`) | Background fills with a low-opacity `color.ink.muted` wash (pill-shaped) to confirm hit area. Same token gap noted in `### 5`. |
| Focus-visible | Standard outline ring on the focused control (any of the four buttons). No focus state on `chip.root`. Ring color and offset to be defined alongside the platform-wide focus token — out of scope here; flagged for `a11y-auditor`. |
| Disabled | **No disabled state in v1.** The chip never renders disabled controls; if the hook is in-flight or has failed, the chip is simply absent. |
| Loading | **No loading state on the chip.** Per `coach.state.loading` microcopy: "nothing rendered — coach runs in background; chip appears only when a suggestion is ready." The composer textarea itself is unaffected. |
| Empty | N/A — the absence of a suggestion IS the empty state, handled by `verdict === 'ok'`. |
| Error | **Nothing rendered.** Per `coach.state.error` and `### Frontend`'s failure-handling: silent no-op on network error, timeout, 5xx, abort, 404, or 429. |

#### 4. Composer integration sketch

How `CoachChip` sits inside `CommentForm`:

```
┌─ CommentForm ──────────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  <textarea>                                          │  │
│  │  Praying for your family this week.                  │  │  ← RHF-bound, watch('body') feeds useCoach
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│        ↕ space.12  (gap from textarea to chip)             │
│                                                            │
│  ┌─ CoachChip (only when verdict === 'suggest') ────────┐  │
│  │  ▸ One way to say it:                                │  │
│  │                                                      │  │
│  │  The time you had with her mattered, and I'm sorry…  │  │
│  │                                                      │  │
│  │  [ Use this ]  Edit   Keep mine        Why this?     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│        ↕ space.16  (gap from chip to submit row)           │
│                                                            │
│                                              [ Post ]      │  ← submit button, never gated on coach state
└────────────────────────────────────────────────────────────┘
```

Integration rules:

- The chip is a **sibling** of the textarea, not a child of it; never absolutely-positioned, never a portal, never a modal.
- When `verdict === 'ok'` (or no response yet), the gap above the submit row collapses to `space.12` (chip slot is `display: none`, not invisible-but-spaced).
- The submit button's row uses the existing `CommentForm` submit treatment (already-shipped) — no new token, no new layout.
- Field-level RHF/Zod errors on the textarea continue to render in their existing slot above the chip; the chip never replaces validation feedback.
- The chip's width matches the textarea's width (full composer width minus the form's horizontal padding) — no narrower-card pattern.

#### 5. Flagged gaps for design-lead

I am **not** silently adding new tokens. The following gaps need a design-lead decision before Phase 3 ports the chip:

1. **Secondary / tertiary button treatment.** The system today has a single CTA spec (`color.brand.primary` fill, white text, pill). The chip's three-action row needs two lower-weight pill variants for `Edit` and `Keep mine`. Two options:
   - **Option A (preferred):** add `color.surface.subtle` (a single low-contrast fill — a muted derivative of `color.surface.warm`) and use it for hover/active backgrounds of text-pill buttons. Rationale: keeps "pill-only CTAs" charter intact, adds the smallest possible token surface, reusable wherever a chip needs a soft pill.
   - **Option B:** explicitly carve a charter exception for "ghost pills" in chip-internal action rows. No new token; the rule changes.
2. **Primary CTA hover darken AND text-contrast.** `color.brand.primary` (`#4D9463`) has no `.hover` / `.pressed` variant, and white-on-`#4D9463` is `~3.4:1` — passes WCAG 1.4.11 (UI component) but fails 1.4.3 (normal text). This is a **system-wide** issue, not chip-specific. Proposal: either darken `color.brand.primary` to `~#3F7E54` (lifts text contrast to ~4.7:1 and gives the hover state room to derive from rest), or introduce `color.brand.primary.pressed` as a darker token used both for hover and as the surface white text actually computes contrast against. Defer the call to `design-lead`.
3. **Hairline divider color.** The reasoning expand uses a 1px divider. No `color.border.hairline` token exists. Phase 3 will use `color.ink.muted` at ~12% opacity unless the design-lead introduces a divider token. Rationale: avoids a new token for a single use; if more chips/cards need dividers, promote to a token then.
4. **Focus ring token.** Out of scope for me — flagging it because the chip has four focusable controls and the system has no `color.focus.ring` defined. Defer to `a11y-auditor`'s pass.

None of these block the spec; they are decisions the design-lead can take during aggregation or punt to a follow-up. Items 1 and 2 are the only ones with system-wide implications.

#### 5a. Design-lead disposition (2026-06-10)

Light editorial addendum from the design-lead aggregator pass — closes the four gaps `ui-designer` flagged in §5. No specialist subsection rewritten.

1. **Secondary / tertiary pill variant — APPROVED Option A.** New token `color.surface.subtle` (`#F4ECDF`) added to `fofafu_vault/standards/design-system.md` (§ Tokens — Color). Used as the hover/active fill for `chip.action.edit`, `chip.action.dismiss`, and `chip.reasoning.toggle`. Charter rule "Pill-only CTAs" stays intact — these remain pills; the new token only fills the hit area on hover. Rest state is still transparent. Reusable wherever a chip needs a soft pill.
2. **Primary CTA hover darken AND text-contrast — ACCEPTED FOR THIS FEATURE; SYSTEM-WIDE FIX DEFERRED.** The `#FFFFFF` on `color.brand.primary` (`#4D9463`) pair at ~3.4:1 clears WCAG 1.4.11 (UI component, 3:1) which is the criterion that applies to the pill control as a whole. The 1.4.3 failure (4.5:1 for normal text) is real, but it is a **system-wide property of `color.brand.primary`** affecting every primary CTA in fofafu — coupling this feature to a brand-token revision would balloon scope and require a re-audit of every shipped surface. Disposition: ship the chip as specced; design-lead to request a new feature `brand-contrast-fix` (proposed action for the next dispatcher pass — to introduce `color.brand.primary.pressed` `~#3F7E54` as both hover state and the surface white text is computed against, then propagate). Tracked in design-lead's return notes.
3. **Hairline divider colour — ACCEPTED AS ONE-OFF.** Phase 3 implements the reasoning-panel divider as `color.ink.muted` at ~12% opacity inline (Tailwind `border-[#5E534B]/[0.12]` or equivalent). No new `color.border.hairline` token until a second consumer appears; promote then.
4. **Focus ring token — DEFERRED to a11y-auditor for the Phase 3 frontend port.** a11y-auditor's §4 already flagged this for the cross-platform focus pass; the chip inherits whatever ring token lands there. No chip-local override.

Net: one new token (`color.surface.subtle`) and one new feature request (`brand-contrast-fix`) emerge from this dispatch. The chip spec is unblocked for the Phase 3 port.

#### 6. Out of scope (intentionally NOT specified)

- **Motion / timing.** No entrance/exit animations, no easing curves, no durations. The chip appears and disappears in one frame. If Phase 3 wants to polish this, it does so against a future motion-token addition — not against guesses here.
- **Dark-mode tokens.** The design system does not yet define a dark palette; I am not inventing one for this chip. When `color.surface.card.dark` etc. land, the chip inherits them by token name.
- **The `/help/reply-coach` explainer page** (referenced in `### SEO`). That is a separate visual surface; this subsection covers `CoachChip` only.
- **Sample OG image** (also referenced in `### SEO`) — commissioned later if/when the explainer page ships.
- **Multi-suggestion stacking.** `coach.suggest.preface.alt` (`Or maybe:`) is in the microcopy table but v1 only ever returns one rewrite per draft. The chip anatomy supports a single suggestion only; stacking is a later feature.
- **Mobile-narrow layout.** Tailwind responsive utilities will handle text wrapping naturally; no separate compact-mode spec is provided. If the chip needs to wrap actions onto two rows below ~360px, Phase 3 makes that call.

### Microcopy

The coach's voice is the feature. These rules and strings are **canonical** — the mock fixtures freeze them now, and `reply-coach-live` must match this voice when the live Claude API ships.

#### Part 1 — Voice rules (become the live system-prompt constraints)

1. **Warm and brief.** One sentence per rewrite. No paragraphs, no preambles, no "I noticed…".
2. **Peer, not moderator.** Speak as another foster-community member sharing a phrasing that landed better — not as a platform enforcing a rule.
3. **The rewrite carries the message; the label stays hidden.** Never name the category in the rewrite or in any user-facing string ("this sounds like minimization" is forbidden). Category metadata is for backend/analytics only.
4. **Never claim to know the author's intent.** No "what you really mean is…", no "you actually feel…". Offer a phrasing; don't translate a person.
5. **Once a category is flagged, always offer a rewrite.** Silence after a flag would feel like a black box. If the model can flag it, the model can suggest one warmer way to say it.
6. **When uncertain, stay silent.** Return `verdict: "ok"` rather than guessing. A wrong nudge erodes trust faster than a missed one.
7. **No moralising. No therapy-speak.** Avoid "I hear you", "valid", "journey", "lived experience" — they read as performance.
8. **Plural "we" only when speaking as the platform** (composer-chip UI strings). The rewrite itself is in the author's voice — first person, present tense, no "we".
9. **No exclamation marks** in rewrites or reasoning. (CTAs may use them per the team charter; coach output may not.)
10. **No emoji.** Ever, in coach output.

#### Part 2 — Canonical mock fixtures

These three fixtures are what `MockClaudeClient` returns. They are also the sample outputs the design-lead audits before the flag flips on.

**Fixture A — Neutral (verdict=ok, silent)**

| field | value |
|---|---|
| `draft` | `Praying for your family this week.` |
| `verdict` | `ok` |
| `categories` | `[]` |
| `reasoning` | `""` |
| `rewrite` | `null` |

**Fixture B — Minimization**

| field | value |
|---|---|
| `draft` | `At least you got to keep her for a while.` |
| `verdict` | `suggest` |
| `categories` | `["minimization"]` |
| `reasoning` | `"At least" can shrink a loss the family is still carrying — a phrasing that stays with the loss tends to land softer.` |
| `rewrite` | `The time you had with her mattered, and I'm sorry it's ending this way.` |

**Fixture C — Savior framing**

| field | value |
|---|---|
| `draft` | `You're such a saint for taking him in.` |
| `verdict` | `suggest` |
| `categories` | `["savior-framing"]` |
| `reasoning` | `Calling a foster parent a saint can make the everyday work feel like a performance — naming the care directly tends to feel closer.` |
| `rewrite` | `He's lucky to have you showing up for him like this.` |

#### Part 3 — Composer-chip microcopy (Phase 3 wires these verbatim)

| key | string |
|---|---|
| `coach.suggest.preface` | `One way to say it:` |
| `coach.suggest.preface.alt` | `Or maybe:` |
| `coach.action.accept` | `Use this` |
| `coach.action.edit` | `Edit` |
| `coach.action.dismiss` | `Keep mine` |
| `coach.reasoning.expand` | `Why this?` |
| `coach.reasoning.collapse` | `Hide` |
| `coach.state.ok` | *(nothing rendered)* |
| `coach.state.error` | *(nothing rendered — silent fallback)* |
| `coach.state.loading` | *(nothing rendered — coach runs in background; chip appears only when a suggestion is ready)* |

Notes on the chip labels (these override the backend section's placeholder `Accept` / `Edit` / `Dismiss` labels):

- `Use this` over `Accept` — `Accept` reads as approving the coach; `Use this` reads as the author choosing the phrasing.
- `Keep mine` over `Dismiss` — affirms the author's draft instead of waving the coach away. Reinforces "advisory, never blocking".
- `Why this?` over `Why this suggestion?` — shorter, matches the chip's tight footprint, doesn't presuppose the user disagrees.

#### Out-of-band strings (admin / settings — for the live-SDK follow-up)

| key | string |
|---|---|
| `settings.coach.label` | `Reply coach` |
| `settings.coach.help` | `We'll quietly offer a softer phrasing when a comment might land hard. You can always post your original.` |
| `settings.coach.toggle.on` | `On` |
| `settings.coach.toggle.off` | `Off` |

---

**Canonical note:** These voice rules and rewrite strings are canonical. `reply-coach-live` must match this voice when the live Claude API ships. Any drift between the live model's outputs and these fixtures is a bug in the system prompt, not a new direction.

### Accessibility

**Scope.** Phase 1 / spec audit. The backend-only dispatch has no built page to run `axe-core` against; this audit binds the Phase 3 frontend port so the chip lands accessible the first time it renders. All WCAG references are to **WCAG 2.2 Level AA**.

#### 1. Keyboard order (WCAG 2.4.3 Focus Order)

Intended tab order inside `CommentForm` when `verdict === 'suggest'`:

1. Comment textarea (`body`)
2. Submit button (existing CommentForm control)
3. Coach chip controls, in source order:
   1. **Use this** (Accept)
   2. **Edit**
   3. **Keep mine** (Dismiss)
   4. **Why this?** / **Hide** (expand/collapse toggle)

**Verdict: passes 2.4.3.** The chip is placed AFTER the submit button on purpose, and this is the correct ordering for two reasons:

- **Submit must never be gated on coach state** (per `### Frontend`: "advisory, never blocking"). A keyboard user tabbing from the textarea must reach Submit before any coach control — otherwise the coach is effectively in the publish path for keyboard users, breaking the advisory guarantee.
- **The chip is supplementary content for the textarea**, not a step in form completion. Source order = `textarea → submit → chip` matches the visual reading order top-to-bottom (chip renders below the textarea but is read after the form's primary action), which is acceptable under 1.3.2 Meaningful Sequence as long as the chip's relationship to the textarea is conveyed semantically (see §3).

**Escape hatches.** The chip has no modal behavior — there is no focus trap, no overlay, no scroll lock. `Esc` is not required to dismiss; users either tab past, click `Keep mine`, or keep typing (which eventually triggers a new coach call and replaces or hides the chip per the dismissed-for-this-draft flag in `### Frontend`).

**No tab traps.** Tab past `Why this?` (or `Hide`) returns focus to the next interactive element on the page (e.g., the next comment's actions, or the page chrome). Confirmed against `### Frontend`: the chip is not a portal/modal, just a sibling block below the textarea.

#### 2. ARIA-live posture (WCAG 4.1.3 Status Messages)

Two states matter:

- **`verdict === 'ok'`** → render nothing, announce nothing. Per `### Frontend`: "The composer must feel silent on neutral drafts." Adding any live-region output here would violate 4.1.3's intent (status messages are for meaningful state changes) and would be chatty under repeated keystrokes. **Correct as specced.**
- **`verdict === 'suggest'`** → the chip appears. A screen-reader user must be able to perceive it without polling the DOM, but the announcement must not fire on every keystroke.

**Recommendation: render the chip as `role="region"` with `aria-label="Suggested rewrite"`** (or equivalent localized string — defer the exact label to `ux-writer`; see §6) **and** wrap the dynamic chip mount in an `aria-live="polite"` container that announces only on the **absent → present** transition (not on text changes within the chip, not on category metadata updates, not on every debounced coach call).

Implementation note for Phase 3: the live-region announcement should fire exactly once per chip appearance — debounce at the React level so that a coach call returning a different `rewrite` for the same chip session re-renders the content silently. A new chip session (after dismissal + materially-changed draft) may announce again. Avoid `aria-live="assertive"` — the coach is advisory and must not interrupt.

**Verdict: passes 4.1.3 if implemented as above.** Flag for Phase 3: write a test that asserts the live-region container fires once per chip-mount, not on every prop change.

#### 3. Focus management (WCAG 2.4.3, 3.2.1, 3.2.2, 4.1.2)

| Action | Effect on textarea value | Focus destination | Justification |
|---|---|---|---|
| `Use this` (Accept) | Replaced with `rewrite` | Return to textarea, caret at end | Author's next action is almost always to keep typing or submit; returning focus to the next interactive element would be a 3.2.2 surprise. |
| `Edit` | Replaced with `rewrite` | Stay in textarea (focus is moved INTO the textarea on click) | Already specced in `### Frontend`. Confirms 3.2.1 — predictable. |
| `Keep mine` (Dismiss) | Untouched | Return to textarea | Dismissal is an affirmation of the existing draft; focus should land where editing continues. Moving to the next page element would surprise the user (3.2.2). |
| `Why this?` / `Hide` | Untouched | Stay on the toggle button | Standard disclosure pattern per 4.1.2 (Name, Role, Value) — focus does not move when an `aria-expanded` toggle is operated. |

**Implementation hint for Phase 3:** the `Use this` and `Keep mine` handlers should call `textareaRef.current?.focus()` after their state update, then set the selection range to the end of the value. The chip's unmount must not steal focus from anywhere else — only the buttons that are clicked move focus.

**Verdict: passes 2.4.3, 3.2.1, 3.2.2, 4.1.2.**

#### 4. Contrast (WCAG 1.4.3, 1.4.11) — **flag for `ui-designer`**

`### Visual` is being written in parallel by `ui-designer` and was not yet present at audit time. The known constraint from `### Frontend` is "a soft, low-contrast card with the `rewrite` string as the primary visible content."

**Soft, low-contrast card is the risk surface.** WCAG 2.2 AA requires:

| Element | Required ratio | Token pair to validate |
|---|---|---|
| Rewrite string (assumed 16px regular) — body text | **4.5:1** against the chip surface | `card.surface` (or whatever the soft-card token resolves to) × `ink.primary` |
| Reasoning string under `Why this?` (12–14px regular) — body text under 18px / 14px bold threshold | **4.5:1** against the chip surface | `card.surface` × `ink.muted` (or equivalent secondary-text token) |
| Action button labels (`Use this` / `Edit` / `Keep mine` / `Why this?`) at typical pill sizing | **4.5:1** for text under 18px; **3:1** for the UI-component boundary (button border or background-vs-surrounding) | label-on-pill pair AND pill-on-card pair |
| Focus ring on each chip control | **3:1** against the adjacent surface (1.4.11 Non-text Contrast) | focus-ring token × `card.surface` AND × page background |

**Action for `ui-designer`:** when `### Visual` lands, list the exact token pair for each row above and the computed WCAG ratio. If `ink.muted` × `card.surface` falls below 4.5:1 (a real risk for "soft, low-contrast" treatments), the reasoning string must move to a higher-contrast token even if the visual feel softens. The rewrite string itself is the primary content — it MUST hit 4.5:1; this is non-negotiable.

**Verdict: deferred — pending `### Visual` token list.** This is the one place I'd block on if tokens land failing. Per the role conventions, a contrast failure on a new token pair is `status: failed` with the failing pair in `notes`. Since no tokens are committed yet, I am returning `status: success` with this row open as a **non-blocking flag for `ui-designer` to close before Phase 3 ships**.

#### 5. Target size (WCAG 2.5.8 Target Size — Minimum)

WCAG 2.2 AA 2.5.8 requires **24×24 CSS pixels** for pointer targets (with documented exceptions for inline text links, user-agent-default controls, and equivalent alternatives — none of which apply here).

Targets to validate when `### Visual` lands:

- `Use this` pill — required 24×24 minimum.
- `Edit` pill — required 24×24 minimum.
- `Keep mine` pill — required 24×24 minimum.
- `Why this?` / `Hide` toggle — required 24×24 minimum; if rendered as a text-only affordance without a button-shaped hit area, expand the click target to satisfy 2.5.8 (padded button, not bare text link).

**Recommendation:** size the three primary pills at a minimum **32px tall** with adequate horizontal padding so localized strings ("Use this", "Keep mine", "Why this?") never crush the hit target below the minimum. The `Why this?` toggle should match the pill height; do not render it as inline text under the rewrite.

**Verdict: deferred — pending `### Visual` spacing tokens.** Flag for `ui-designer`: include a spacing/sizing line in `### Visual` so this can be confirmed without re-derivation.

#### 6. Hidden category metadata (WCAG 1.3.1 Info and Relationships)

Per `### Microcopy` voice rule #3: category labels are **never user-visible** ("this sounds like minimization" is forbidden). The audit confirms this maps cleanly to screen-reader behavior:

- `categories: ["minimization"]` (or `["savior-framing"]`) **must not** surface via `aria-label`, `aria-describedby`, `aria-labelledby`, hidden `<span class="sr-only">`, or any other accessible-name source on the chip or its controls.
- The rewrite string IS the accessible content for the chip's primary region. `reasoning` becomes accessible content only after the user activates `Why this?` (the expanded panel can carry the reasoning string as visible text; no hidden semantics needed).
- The chip's `aria-label` should reference the **preface microcopy** (`coach.suggest.preface` → "One way to say it:") not the category. Suggested accessible name: the preface string, with the rewrite as the region's first readable content.

**Verdict: passes 1.3.1.** This is consistent with both the voice rules and the user-facing strings table — there is no a11y reason to expose categories, and doing so would betray the voice. Confirmed.

#### 7. Silent failure modes (WCAG 4.1.3, 3.3.1)

Per `### Frontend`: network errors, `404` (flag off), `429` (rate-limited), aborts → **silent no-op**. No chip, no toast, no console output beyond debug-level logger.

The only screen-reader concern would be if the chip ever announced a "loading" or "checking your comment…" status — a user told something is coming and then never delivered would be left in a partial state (a 4.1.3 anti-pattern).

**Confirmed against `### Microcopy` Part 3:**

- `coach.state.loading` → *(nothing rendered — coach runs in background; chip appears only when a suggestion is ready)*
- `coach.state.error` → *(nothing rendered — silent fallback)*

**Verdict: passes 4.1.3 and 3.3.1.** The current spec is right: never announce a loading state, so silent failure is fully consistent. If a future iteration adds a visible "checking…" indicator, this row MUST be re-audited — at that point a failure path needs an a11y-visible recovery message, not silent dismissal.

#### Summary

| # | Area | WCAG criteria | Verdict | Blocking? |
|---|---|---|---|---|
| 1 | Keyboard order | 2.4.3, 1.3.2 | Passes as specced | No |
| 2 | ARIA-live posture | 4.1.3 | Passes if chip mount uses one-shot `aria-live="polite"` | No (Phase 3 impl detail) |
| 3 | Focus management | 2.4.3, 3.2.1, 3.2.2, 4.1.2 | Passes as specced | No |
| 4 | Contrast | 1.4.3, 1.4.11 | **Deferred** — pending `### Visual` tokens | Non-blocking flag — close before Phase 3 ships |
| 5 | Target size | 2.5.8 | **Deferred** — pending `### Visual` spacing tokens | Non-blocking flag — close before Phase 3 ships |
| 6 | Hidden categories | 1.3.1 | Passes; consistent with voice rule #3 | No |
| 7 | Silent failure modes | 4.1.3, 3.3.1 | Passes as specced | No |

**Total findings: 7. Blocking: 0.** Two non-blocking flags (#4 contrast, #5 target size) are queued for `ui-designer` to close once `### Visual` tokens land. No spec changes required to existing subsections.

**Phase 3 build-time audit deferred.** When the Phase 3 frontend port lands the `CoachChip/` component, run `axe-core` against `CommentForm` with a stubbed coach response per Fixture B and Fixture C, and record results as a `### a11y — Build audit` subsection per the role file's loop step 3.

## Marketing — Spec

### Launch copy

**Release note (in-app changelog, v1 ship).**

Reply Coach is a quiet second set of eyes on the comment composer. If a phrase tends to land badly in foster-family conversations — minimizing language, "real parents," savior framing — the coach offers a softer rewrite you can take, edit, or ignore. It never blocks you from posting, and it never speaks up on neutral drafts. Drafts you type are not stored — the coach reads them in the moment and forgets them. We built it specifically for the way foster families talk, not as a generic moderator.

**Landing-page block (public marketing surface, post-Phase 3).**

Headline: A gentler second look before you post.

Body: Foster-family threads carry weight other feeds don't, and a comment that means well can still land hard. Reply Coach offers a quieter rewrite when a phrase tends to sting, so you can decide before you hit publish.

CTA pill: See how it works

**Internal dev-log release note.**

Shipped `POST /api/comments/coach` behind the `reply_coach_enabled` flag (mock client, advisory verdicts, 60/hr rate limit, no draft persistence); live SDK + key plumbing follow in `reply-coach-live`.

### SEO

**TL;DR — N/A in v1.** The feature ships a single auth-walled API endpoint and no public surface. There is nothing for search engines to crawl, no canonical URL to set, no OG image to render. This subsection documents that explicitly so future contributors don't re-derive it.

#### 1. Endpoint surface

- `POST /api/comments/coach` is gated behind session auth and the `reply_coach_enabled` flag. It is not a page, returns JSON only, and is never linked from any public route.
- Default backend posture for `/api/**` already returns `X-Robots-Tag: noindex, nofollow` (confirm during backend implementation; if not present, add it for this route specifically). No `sitemap.xml` entry. No canonical URL.
- The Phase 3 composer chip (see `### Frontend`) is rendered inside an authenticated comment composer — also `noindex` by inheritance.

#### 2. Future explainer page (proposal, Phase 3 or later — NOT shipping with this feature)

When the live-SDK follow-up (`reply-coach-live`) lands and the coach is on for real users, we will want a public, indexable explainer page so foster-family communities, partner orgs, and curious press can understand what the coach is and what we do with drafts. Proposed slug:

- **Route:** `/help/reply-coach` (preferred — lives under a `/help/*` namespace we can reuse for future feature explainers and keeps the URL semantically clear that it's a docs page, not marketing).
- **Alternate considered:** `/about/reply-coach` — rejected because `/about/*` should stay reserved for org-level pages (mission, team), not per-feature docs.

**Recommendation: index it.** Pros outweigh cons:
- Pro: builds trust with foster-parent prospects who research "is this safe?" before signing up; addresses likely organic queries like *"foster family community moderation"*, *"AI comment suggestions safe"*, *"what does the reply coach do with my drafts"*.
- Pro: gives partner organizations a single URL to link when vetting fofafu.
- Con: surfaces a small attack surface for adversarial prompt-discovery; mitigated by the page describing *behavior*, not the prompt itself.

If the explainer ships, also add a `<link rel="canonical">` and reference it from the in-app coach chip's "Learn more" affordance (Phase 3 microcopy decision — flag for `ux-writer`).

#### 3. Meta / OG fields (conditional on explainer page shipping)

These are **proposals only**, not for v1. If/when `/help/reply-coach` is built, propose:

- `title`: `How the Reply Coach works — fofafu` *(54 chars)*
- `meta.description`: `A gentle, optional nudge before you publish a comment. Advisory only — never blocks you. Your drafts are not stored.` *(127 chars)*
- `og.title`: `How the Reply Coach works`
- `og.description`: `A gentle, optional nudge before you publish a foster-family comment. Advisory only. We don't store your drafts.` *(140 chars)*
- `og.image`: 1200×630 — illustration angle: a composer textarea with a soft, low-contrast suggestion chip below it (mirrors the actual Phase 3 UI). Caption-free. Owned by `ui-designer` if/when commissioned.
- `og.type`: `article`
- `og.url`: `https://fofafu.app/help/reply-coach` *(exact host TBD at launch)*
- `twitter.card`: `summary_large_image`
- `twitter.title`, `twitter.description`, `twitter.image`: mirror the OG values.

For v1 (this dispatch): **none of the above applies.** No meta tags, no OG image, no `react-helmet-async` wiring.

#### 4. schema.org

- **v1:** N/A.
- **If the explainer page ships:** `FAQPage` is the right fit — the page will likely answer 4–6 questions (*"What is it? When does it trigger? Does it block my comment? What do you do with my drafts? Can I turn it off? Why are you using AI for this?"*). JSON-LD lives inline in the page head; one `Question`/`Answer` pair per FAQ entry. `HowTo` was considered and rejected — the coach is not a procedure the user performs.

#### 5. Sitemap impact

- **v1:** none. `public/sitemap.xml` is unchanged.
- **If the explainer page ships:** add `/help/reply-coach` with `changefreq: monthly`, `priority: 0.4` (informational, not a conversion page).

#### 6. Frontend SEO wiring (Phase 3+)

Nothing to wire for v1. When `reply-coach-live` and/or the explainer page land, the Phase 3 frontend will add a `react-helmet-async` block to the explainer page only. The composer chip itself never sets any document-level meta — it's a sub-component of an already-`noindex` authenticated page.

#### Authenticated-views flag

Per role conventions: **this entire feature surface is `noindex` by default in v1.** Documented here so the next dispatcher pass on `reply-coach-live` knows the explainer page is the first (and only) public SEO surface to consider.

### Growth

**TL;DR — v1 (this dispatch) has nothing to measure yet.** The endpoint runs against `MockClaudeClient`, so any acceptance-rate number is a measurement of the fixture set, not of the model. This subsection defines the framework that `reply-coach-live` and the Phase 3 frontend port will wire into; it also draws a clear line at what does NOT ship now so the next dispatcher pass doesn't re-derive it.

#### 1. Primary metric (canonical, for `reply-coach-live`)

**Suggestion-acceptance rate**, defined as:

```
acceptance_rate = accepts / (accepts + edits + dismisses)
```

over a **7-day rolling window**, scoped to coach calls that returned `verdict: "suggest"`. Excludes `verdict: "ok"` calls (silence is not a choice the user made) and excludes calls where the user neither accepted, edited, nor dismissed before navigating away (`outcome: null` — bucketed separately as "no-action" for diagnosis but not in the denominator).

**Plain English:** *of the times the coach offered a rewrite, how often did the author choose to use it (as-is or edited) instead of keeping their original?*

Target band at first live read: **35–60%**. Below 35% suggests the rewrites don't sound like the author (voice drift — escalate to design); above 75% may signal over-suggestion (users grabbing rewrites reflexively to dismiss the chip — counter-metric below catches this). No hard ship-gate threshold for v1 of the live cutover; the metric establishes a baseline.

**Why acceptance rate alone is insufficient.** Acceptance is a *behaviour* metric and is symmetric under two bad failure modes: (a) the coach is *too eager* — flagging neutral drafts that don't need help, where authors accept just to make the chip go away; (b) the coach is *too quiet* — never flagging anything, in which case the denominator is tiny and the rate is noisy. The counter-metric below disambiguates (a); the no-action bucket flags (b). Treat acceptance rate as the headline only when both guardrails are green.

#### 2. Counter-metric / guardrails

| Metric | Direction | Source |
|---|---|---|
| **Reported-comment delta** (counter-metric) | must NOT increase | existing `moderation_reports` table — comments authored from a composer instance where the coach was shown, 7-day delta vs. a no-coach baseline cohort |
| **Comment-publish rate** (guardrail) | must NOT decrease materially (>5pp drop is a regression) | existing announcement-feed engagement metric — comment publishes per active commenter per week |
| **DM open rate** (guardrail) | must NOT decrease | existing DMs surface metric — included as a cross-surface sanity check that the coach isn't making the broader product feel paternalistic |

Both guardrails are **existing platform metrics** per the role conventions — none are invented for this feature. Reported-comment delta is the counter-metric because the feature's stated goal in `## Problem` is *"reduce reported/edited-after-publish comments"*; if acceptance is high but reports don't fall, the coach is being accepted but not helping.

#### 3. Aggregate-only signal store

**v1 (this dispatch): no store ships.** Recommended deferral to `reply-coach-live`. Rationale:

- Aggregate counts collected against `MockClaudeClient` are noise — the fixture distribution does not reflect real draft distribution.
- The ACs explicitly forbid persisting draft text (*"Coach inputs are NOT persisted; request bodies are scrubbed from any structured log line"*). The store proposed below honours that, but standing it up now means writing a table that has nothing real to record for the duration of v1.
- Better: land the schema with the live-SDK PR so the first row written is also the first row with real signal.

**Schema sketch (for `reply-coach-live` to land — flagged for the live-SDK PR's backend-dev):**

```sql
CREATE TABLE coach_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  verdict     TEXT NOT NULL CHECK (verdict IN ('ok', 'suggest')),
  category    TEXT,                          -- first category only; NULL when verdict='ok'
  outcome     TEXT CHECK (outcome IN ('accept', 'edit', 'dismiss', 'no-action')),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_coach_events_user_created ON coach_events(user_id, created_at);
CREATE INDEX idx_coach_events_verdict_outcome ON coach_events(verdict, outcome);
```

**What is NOT in this table (must stay out, per ACs):**

- No `draft` text.
- No `rewrite` text.
- No `reasoning` text.
- No `thread_context` payload.
- No raw Claude API response body.

The table records *that* a coach call happened and *how the author responded* — nothing about *what was said*. The `category` field stores the model's classification label only (e.g. `"minimization"`, `"savior-framing"`) — these are taxonomic, not user content.

**Write paths (for `reply-coach-live`):**

1. Backend writes one row per coach call at endpoint exit (verdict + category, outcome=NULL).
2. Frontend writes the outcome via a separate lightweight `POST /api/comments/coach/outcome` endpoint (or PATCH on the original row's id, returned in the v1 response) when the user clicks Accept / Edit / Dismiss, or after a 60s no-action timeout fires `outcome=no-action`.
3. The outcome write is fire-and-forget — failures are silently dropped (we'd rather lose a data point than block the composer).

#### 4. Feature flag

| Flag | Scope | Owner | Status |
|---|---|---|---|
| `reply_coach_enabled` | v1 (this dispatch) — gates `POST /api/comments/coach` existence | already exists per ACs | rollout plan below |
| `reply_coach_live_enabled` | `reply-coach-live` — gates the live SDK call path | flagged for the follow-up feature's growth section | n/a for v1 |

**v1 rollout plan for `reply_coach_enabled`** (mock-only, no API cost, no PII leakage risk):

| Stage | % users | Gate to advance |
|---|---|---|
| Off (default) | 0% | merged + smoke-tested on staging |
| Internal | dev + design-lead accounts only | mock fixtures audited against `### Microcopy` Part 2 |
| 10% | 10% by `user_id` hash | endpoint hit count > 0 (sanity that flag isn't accidentally off); no `5xx` rate increase |
| 50% | 50% | same gates as above, held for 1 week |
| 100% | 100% | held for 1 week; no surge in support tickets referencing the chip |

**Why fast rollout is safe for v1 specifically:** the mock client has no per-call cost, no rate-limit risk against an upstream, and the chip is hidden behind the Phase 3 frontend port. Effectively the v1 flag controls a JSON endpoint that nothing consumes yet. The 50% and 100% stages here are forward-leaning — they de-risk the `reply-coach-live` rollout, which uses the same flag-shape but with real Claude API calls.

**Forward-looking note for `reply-coach-live`:** `reply_coach_live_enabled` is the right cutover seam (separate flag from `reply_coach_enabled`, ANDed: the endpoint requires `reply_coach_enabled=true` to exist at all and `reply_coach_live_enabled=true` to call the live SDK instead of the mock). Rollout there should be much more conservative (off → 5% → 25% → 50% holdback experiment — see §5).

#### 5. Experiment design

**v1 (this dispatch): no experiment.** Mock outputs are deterministic per draft; A/B testing fixture responses measures nothing.

**`reply-coach-live` (forward-looking, flagged for that feature's growth section):**

- **Design:** 50/50 holdback by `user_id` hash, gated by `reply_coach_live_enabled`. Treatment group hits the live Claude API; control group sees no chip (the endpoint returns `verdict: "ok"` unconditionally for control users — same shape as flag-off, same silent UX).
- **Read horizon:** **8 weeks minimum.** Foster-community traffic is light; weekly comment-publish counts per active user are in the low-double-digits range. Counter-metric (reported-comment delta) is even sparser. An 8-week window is needed to get the standard error on acceptance rate below 5pp at the expected suggest-rate share of total drafts.
- **Success threshold:** acceptance rate between 35–60% AND reported-comment delta ≤ 0 (no regression) AND comment-publish rate within ±5pp of control. All three must hold; acceptance rate alone is not sufficient (see §1).
- **Sample size note:** if traffic is lighter than expected at the 4-week midpoint, extend rather than ship — do not reduce the threshold.

#### 6. Cost cap

**v1: N/A** — mock client has no upstream API cost.

**`reply-coach-live` (canonical target, so the live-SDK PR doesn't re-derive):**

- **Per-day org-level Anthropic API spend cap: $5/day** (tune upward as confidence grows). When the daily cumulative spend across all users exceeds the cap, the `reply_coach_live_enabled` flag silently degrades to off for the rest of the calendar day (UTC) — the endpoint reverts to returning `verdict: "ok"` for live-flag users, falling back to the same silent UX as control/flag-off.
- **Why silent degradation:** surfacing a "coach unavailable" state to the author would teach users to notice the chip's absence, which is the opposite of the *"silent on neutral drafts"* design contract. Better to degrade indistinguishably from the neutral case.
- **Implementation seam:** a small counter (in-memory is fine for v1 of live; promote to a Redis/SQLite counter when there's more than one backend node) incremented at endpoint entry with the estimated request token cost from the Anthropic SDK's response usage block. Cap-exceeded check happens before the SDK call; if exceeded, skip the call and return mock-style `verdict: "ok"`.

#### 7. Reporting cadence

**v1: nothing to report.** No standup digest entry for `reply-coach` until `reply-coach-live` ships and the signal store has at least one full 7-day window of data.

**`reply-coach-live` onward:** weekly digest line appended to `fofafu_vault/log/standups/YYYY-WW.md` under the Marketing section, format:

```
- coach: acceptance <NN%> (Δ <±NN%> wow); reports Δ <±NN>; publish rate <NN%>; flag at <NN%>
```

Generated by aggregating the previous 7 days of `coach_events` rows; growth-analyst owns the weekly cron / one-shot script that produces this line.

#### 8. Adoption tracking (post-ship, v1)

Per role conventions, growth-analyst owns the post-ship adoption number. For v1 (mock-only, backend-only), the only observable surface is the endpoint itself, so:

- **Sanity signal:** count of `POST /api/comments/coach` requests per day, scoped to non-404 responses (i.e. responses where `reply_coach_enabled=true` for the requesting user). Source: existing backend access logs — no new instrumentation needed.
- **Expected behaviour in v1:** this count will be **zero** until the Phase 3 frontend port lands the composer chip. That zero is the correct reading and not a regression.
- **What to actually watch in v1:** confirm the flag is not accidentally off in staging by manually hitting the endpoint after each deploy. If a real client (a Phase 3 preview branch, a curl smoke test) starts hitting it and we see 404s, the flag has drifted off — that's the only alert worth wiring for v1.
- **Adoption proper** (users-shown-chip / weekly-active-commenters) is a Phase 3 + `reply-coach-live` joint metric and is out of scope for v1.

#### 9. Out of scope for v1 (explicit)

- No experiment infrastructure (deferred to `reply-coach-live` per §5).
- No `coach_events` table migration (deferred per §3).
- No `reply_coach_live_enabled` flag (deferred — that's a `reply-coach-live` deliverable).
- No spend cap enforcement (no spend exists in v1 per §6).
- No standup digest line for this feature this week or next (per §7).

#### Flagged for marketing-lead

- The `reply-coach-live` follow-up feature's growth section will need to (a) land the `coach_events` table migration, (b) introduce `reply_coach_live_enabled`, (c) wire the $5/day cost cap with silent degradation, (d) start the 8-week 50/50 holdback experiment, and (e) begin the weekly standup digest line. All five are canonicalised here so the follow-up's growth-analyst pass is a re-statement, not a re-derivation.
- Counter-metric (reported-comment delta) requires the `moderation_reports` table to have a column linking a report back to the composer-instance it was authored from. If it doesn't today, that's a small schema add the `reply-coach-live` backend pass needs to include — flag for tech-lead during that dispatch.
