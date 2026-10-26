---
slug: comment-classification-pipeline
title: Comment Classification Pipeline
owner: engineering
collaborators: [design]
status: drafting
priority: P2
created: 2026-10-24
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
  parent: "[[features/reply-coach-live]]"
---

# Comment Classification Pipeline

## Problem

[[features/reply-coach]] runs one Claude call on a draft comment and only nudges on tone. It cannot tell a question from an update from a venting post, so it applies the same check to all of them. It also has no safeguard for foster-care confidentiality (a child's name, case details, photos) and no way to stop a comment that is clearly unsafe. Success means every draft is classified before publish and gets the guardrail that fits its category. The coach nudges first. If the author posts without changing the flagged text, the comment is blocked.

## Design decisions (settled 2026-10-24)

- **Prompt chaining, not an agent loop and not MCP.** The category list is fixed and each category maps to a fixed handler. Routing is a plain `switch` in code, not an LLM decision.
- **Tool calling is the structured-output mechanism** for each stage, with `tool_choice: auto` plus strict tool schemas (or structured outputs). Forced `tool_choice` is not accepted on the newer models (see [[features/coach-verdict-tool]] out-of-scope note).
- **Runs before publish.** Coach-first: the first flag is a nudge in the composer. If the author submits again without changing the flagged text, the post is blocked.
- **`question` means anything a user wants to ask the community.** No topic restriction and no curated source set, so a question is never refused for being off-topic. In v1 the `question` handler is moderation only; source references are a follow-up feature (see Out of scope).
- **Hard block, edit-only.** A blocked draft has no override and no appeal in v1. The author must change the flagged text.
- **Enforced server-side.** `POST /announcement/:id/comments` is where comments are inserted, so the block is enforced there, not only in the composer. `/coach` returns a short-lived signed verdict token (HMAC over user id, hash of the normalized draft, verdict, expiry). The comment POST verifies the token instead of calling the model again, so the nudge and the block can never disagree. A POST with no valid token runs the pipeline itself (fail-open on model error).
- **Models (settled 2026-10-26):** `claude-haiku-5-5` for classify and moderation; a flagged-as-blocking or low-confidence verdict gets a second opinion from `claude-sonnet-5-5` before it can block, because a hard block makes false positives costly.
- **Home (settled 2026-10-26):** the pipeline lives in a new shared module under `supabase/functions/_shared/`, used by both `coach` (nudge) and `announcement` (enforce). No new edge function.
- **Fail-open on model errors.** A classifier outage, timeout, refusal, or invalid output never blocks a post. Only the deterministic pre-checks and a completed model verdict can block.

## Pipeline

```
draft
 ├─ 0. deterministic pre-checks (PII regex, length, blocklist) — no LLM
 ├─ 1. classify (small model, tool → schema)
 │     category: question | update | support | celebration | crisis | other
 │     flags: pii, child_identifying, medical_legal_advice, hostile
 │     confidence
 ├─ 2. route (switch)
 │     question → source references (allowlisted ids only)
 │     update   → privacy guardrail
 │     support  → existing reply-coach tone check
 │     crisis   → resources + admin flag
 │     other    → moderation only
 └─ 3. moderation filter (all categories) → verdict
```

## Acceptance criteria

- [ ] Stage 1 classifier returns `{category, flags, confidence}` through a tool whose `input_schema` is validated with Zod; `tool_choice` is `auto` and a missing or invalid tool call is treated as a failure, not parsed from text.
- [ ] Every draft is classified before publish; the composer shows the nudge on the first flagged submit.
- [ ] A second submit with the flagged text unchanged is blocked with a clear, warm message (copy owned by ux-writer). Editing the flagged text clears the block and re-runs the check.
- [ ] The block is enforced in `POST /announcement/:id/comments` via the signed verdict token; a direct API call with flagged text is rejected the same way as the composer.
- [ ] `update` drafts are checked for child-identifying information and case details; `support` drafts reuse the existing coach tone check.
- [ ] A `crisis` classification shows support resources and flags the comment for an admin; it is not silently blocked.
- [ ] Moderation filter runs on every category.
- [ ] Any model failure falls back to publishing, logs a categorized error (reuse `CoachErrorCategory`), and is covered by tests.
- [ ] Per-stage feature flag and cost cap, reusing the coach's flag/cap mechanics.
- [ ] Fixture-based test suite for classification and for each handler, written before implementation.

## Out of scope

- Source references for `question` drafts (follow-up feature; with open-ended questions there is no curated set yet, and model-generated URLs are never shown).
- Override or appeal flow for blocked drafts.
- After-publish auto-hiding (stays out of scope in [[features/moderation-report-block]]).
- An MCP server or an agent loop for the `question` handler.
- Admin queue UI for flagged `crisis` comments (the data lands; the UI is separate).
- Direct messages. Comments only in v1.

## Open questions

- ~~Curated source set for `question`~~ **Resolved (2026-10-24):** questions are open-ended, no curated set. References are deferred.
- ~~Block UX~~ **Resolved (2026-10-24):** hard block, edit-only.
- ~~Slicing~~ **Resolved (2026-10-24):** slice 1 = stage 0 pre-checks + stage 1 classifier + coach-first/block-on-unchanged; each category handler is a later feature.
- ~~Model per stage~~ **Resolved (2026-10-26):** Haiku 5.5 with a Sonnet 5.5 second opinion before a block. The coach still pins `claude-3-5-haiku-20241022`; moving it is a separate chore.
- ~~Home~~ **Resolved (2026-10-26):** shared module in `supabase/functions/_shared/`, used by `coach` and `announcement`.
- Rate limit, cost cap and holdback state in `coach` are per-isolate memory, so the cost cap is only approximate. Acceptable for slice 1, or does it need a table first?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

**Spec pass 2026-10-26 (no production code or tests written yet).** Slice 1 only: stage 0 pre-checks + stage 1 classifier + coach-first / block-on-unchanged. Per-category handlers (question refs, update privacy, etc.) are later features; the composer only needs to render whatever the server returns. Grounded in: `frontend/src/features/feed/components/{CommentForm.tsx,CommentForm.test.tsx}`, `CoachChip/{CoachChip.tsx,useCoach.ts,index.ts}` + tests, `frontend/src/api/{coach.ts,announcements.ts,edgeClient.ts}`, `frontend/src/tests/{msw-server.ts,setup.ts,render.tsx,a11y.ts}`, `[[features/reply-coach]]` (Frontend / Microcopy Part 3 / Accessibility).

#### 1. Shared contract as consumed (producer = backend-dev; any drift is a consumer-side fix)

- `POST /coach` request unchanged (`CoachRequest` in `frontend/src/api/coach.ts`). Response = existing `{verdict, categories, reasoning, rewrite}` plus `classification: {category, flags, confidence}`, `verdictToken`, `expiresAt`.
- `POST /announcement/:id/comments` body `{content, verdictToken?}`. Outcomes: `201` CommentDTO; `422 {error:'comment_flagged', ...verdict fields, verdictToken, expiresAt}`; `422 {error:'comment_blocked', ...verdict fields}`; anything else (network, 4xx/5xx, malformed 422) = generic failure.
- Assumption to confirm with backend: "...verdict fields" on the 422 bodies includes `classification` (the composer needs `category` to pick crisis copy and `flags` to pick nudge copy). If `classification` is absent on a 422, the client falls back to the generic nudge copy.
- The client never hashes and never judges token expiry. It only decides "is this token bound to the text currently in the box" (section 4); the server decides validity and expiry. Clock skew therefore cannot cause a false block.

#### 2. Composer state machine

Seven phases. `phase` is a **derived value** (pure function `deriveComposerPhase` in `CommentGate/composerPhase.ts`), not a stored enum. Stored facts are each bound to the normalized text they were produced for, so invalidation by editing is automatic and cannot desync.

| Phase | Meaning | Visible UI | Submit button |
|---|---|---|---|
| `idle` | No current verdict for this text (empty, short, verdict ok, coach 404/flag off, coach failed silently) | nothing (same as today) | enabled |
| `checking` | `/coach` request in flight | **nothing rendered, nothing announced** (reply-coach a11y §7: never announce loading) | enabled (never gated on coach state, as shipped) |
| `nudged` | A flagged verdict is current for this exact normalized text and a token is held | One panel at a time (ux-writer `### Microcopy` "Where the strings render"): `GateNotice kind="nudge"` when `flags` is non-empty (it **replaces** `CoachChip` even if a `rewrite` came back); `GateNotice kind="crisis"` when `category==='crisis'`; `CoachChip` only for a tone-only `suggest` with no flags | enabled |
| `blocked` | Server answered `comment_blocked` for this exact normalized text | `GateNotice kind="blocked"` (edit-only: no override, no appeal, no "post anyway") | `aria-disabled="true"`, click is a no-op that re-announces |
| `editing` | A verdict/block/error existed, the normalized text has since changed; old facts dropped; debounce pending | nothing (prior notice removed) | enabled |
| `submitting` | Comment mutation pending | textarea `readOnly` (not `disabled`, focus kept). Button label: `pipeline.submit.checking` ("Checking…") + `aria-busy="true"` when the POST carried **no token** (the server runs the model itself, so the author is waiting on a check); "Posting…" (existing) when a token was sent (server only verifies the HMAC). After ~3 s without a response, show the visible `pipeline.submit.checking_slow` line beside the button (not announced; a11y to confirm) | `disabled` (existing) |
| `error` | Network/5xx/other non-gate failure | existing `role="alert"` serverError line in the same slot; draft untouched | enabled (retry) |

Precedence when several facts are live: `submitting` > `blocked` > `error` > `nudged` > `checking` > `editing` > `idle`.

Transitions (event -> effect):

| From | Event | To | Notes |
|---|---|---|---|
| idle/editing | debounce fires (600 ms, draft >= 20 normalized chars) or blur | checking | existing `useCoach` rules unchanged |
| checking | response, verdict ok, no flags | idle | token (if any) is stored but a non-flagged verdict is not "nudged" |
| checking | response flagged (`verdict==='suggest'` or `classification.flags.length>0` or `category==='crisis'`) | nudged | store `{forNormalized, token, expiresAt, classification, rewrite, reasoning}` |
| checking | 404 / 429 / network / abort / zod parse failure | idle | silent, as shipped; 404 still cached per session (`seen404`) |
| checking | draft changes | editing -> checking | in-flight request aborted (existing) and stale responses ignored (see section 4) |
| nudged | normalized text changes | editing | token and verdict dropped |
| nudged | whitespace-only change | nudged | normalization absorbs it (matches server) |
| nudged | "Use this" / "Edit" | editing | rewrite applied via `setValue` (existing), re-check follows |
| nudged | "Keep mine" | nudged (chip hidden) | verdict and token **kept**; see risk R1 |
| any but submitting | Comment clicked | submitting | `coach.cancel()` first so a late `/coach` reply cannot flip state mid-submit |
| submitting | 201 | idle | invalidate `feedKeys.comments`, `reset({content:''})`, drop all facts (existing behavior) |
| submitting | 422 `comment_flagged` | nudged | adopt verdict + new token bound to the text that was sent; focus -> textarea |
| submitting | 422 `comment_blocked` | blocked | focus -> textarea; token kept but unused |
| submitting | other failure | error | draft, verdict and token kept so a retry sends the same token |
| blocked | normalized text changes | editing | **this is the "editing clears the block" rule**; then debounce -> checking -> (idle or nudged) |
| blocked | whitespace-only change | blocked | same normalization as server |
| blocked | Comment clicked | blocked | no network call; live region re-announces; focus -> textarea |
| error | text changes | editing | error line cleared |
| error | Comment clicked | submitting | retry |

A `checking` result can produce `nudged` but never `blocked`; only a POST outcome blocks. That keeps "nudge and block can never disagree" because both come from the server.

The `crisis` category: `GateNotice kind="crisis"` shows support resources and never disables or hides submit. If the draft is published (201) after a crisis verdict, the resources notice stays mounted after the form reset until the next edit or until the user leaves the page (otherwise the resources vanish at the moment the person posts). That persistence is a default for ux-writer/a11y to confirm.

#### 3. Ownership

| Concern | Owner |
|---|---|
| RHF field `content`, Zod `Schema` (min 1, max 2000, unchanged), textarea ref/focus helpers, mutation, submit handler | `CommentForm` |
| Debounce, abort, 404 cache, dismissed-rewrite memory, `/coach` call, **verdict fact + token store** | `useCoach` (extended; existing return fields untouched) |
| `blocked` / `error` / `editing` facts, `deriveComposerPhase`, announcement text selection | new `useCommentGate` in `CommentGate/` |
| Tone rewrite card (Use this / Edit / Keep mine / Why this?) | `CoachChip` unchanged |
| Flag nudge, blocked message, crisis resources (no rewrite controls) | new `GateNotice` |

No TanStack Query for `/coach` (same rationale as reply-coach: ephemeral, no cache key). TanStack Query stays for the comment mutation and the `feedKeys.comments` invalidation. No Zustand store: all of this is one composer instance's UI state and dies with the form. Keep the mutation's default `retry: 0` (an automatic retry of a POST after a 5xx could double-post).

#### 4. Verdict token: storage, sending, invalidation

- Stored in `useCoach` in a `useRef`-backed fact (mirrored to state only where a render depends on it): `{ forNormalized, token, expiresAt, verdict, category, flags, confidence, rewrite, reasoning }`. In memory only: never in Zustand, localStorage, the URL or logs.
- Normalization: extract the existing private `normalize` from `useCoach.ts` (`text.trim().replace(/\s+/g, ' ')`) into `frontend/src/utils/normalizeDraft.ts` and reuse it everywhere. It must stay byte-for-byte equivalent to the server's rule (trim + collapse whitespace, no case folding, no Unicode normalization). A shared vector list (`'  a  b '` -> `'a b'`, `'a\n\nb'`, tab, NBSP ` `) goes into the frontend unit test and is mirrored in backend tests so the two cannot drift silently.
- API: `useCoach` returns `tokenFor(currentDraft): string | undefined`, which is the stored token only when `normalizeDraft(currentDraft) === forNormalized`. Called in the submit handler and passed through mutation variables, so the token sent is bound to the exact content sent.
- Invalidation: (a) `tokenFor` returns `undefined` on any normalized mismatch, so a stale token is never sent; (b) an effect on the normalized draft clears the verdict fact and the `blocked`/`error` facts when it changes; (c) a response whose `forNormalized` no longer equals the latest draft (tracked in a `latestDraftRef`) is discarded; (d) 201 clears everything. A new token from a 422 `comment_flagged` replaces the old one via `useCoach.adoptVerdict(verdict, sentContent)`, so the `/coach` path and the POST path share one store.
- Raw `content` is what is POSTed (not the normalized string); the server normalizes for its own hash.
- Short drafts (< 20 normalized chars) never call `/coach`, so they carry no token; a flagged short draft (e.g. a PII regex hit) is caught by the 422 `comment_flagged` path on first submit. That path must work with no prior nudge. Do not lower `MIN_DRAFT_LENGTH`; the cost lever stays server-side.

#### 5. API layer changes

`frontend/src/api/edgeClient.ts` (modify): `EdgeErrorShape` and `EdgeApiError` gain an optional `body?: unknown`; `edgeRequest` passes the parsed JSON body when `!res.ok`. Today the 422 payload (verdict, token) is dropped because only `.error` survives. Optional field, so every existing `new EdgeApiError({status, error})` and `err.message` call site (MessageComposer, SlotForm, ReportModal, etc.) is unaffected.

`frontend/src/api/coach.ts` (modify):

```ts
export const CoachCategory = z.enum(['question','update','support','celebration','crisis','other']).catch('other');
export const CoachClassification = z.object({
  category: CoachCategory,            // unknown future category degrades to 'other' instead of failing the parse
  flags: z.array(z.string()),
  confidence: z.number(),
});
const VerdictFields = z.object({
  verdict: z.enum(['ok','suggest']),
  categories: z.array(z.string()),
  reasoning: z.string(),
  rewrite: z.string().nullable(),
  classification: CoachClassification.optional(),
});
export const CoachResponseSchema = VerdictFields.extend({
  verdictToken: z.string().optional(),
  expiresAt: z.string().optional(),
});
```

New fields are `.optional()` so the existing msw fixtures in `CommentForm.test.tsx` and `useCoach.test.ts` (which return only the four old fields) still parse, and a frontend deployed ahead of the function degrades to today's behavior. `VerdictFields` is exported for reuse. `CoachRequest` and `coachComment` signature unchanged.

`frontend/src/api/announcements.ts` (modify):

```ts
export interface CreateCommentInput { content: string; verdictToken?: string }
export class CommentGateError extends EdgeApiError {
  kind: 'flagged' | 'blocked';
  verdict: z.infer<typeof VerdictFields>;
  verdictToken?: string;
  expiresAt?: string;
}
export async function createComment(announcementId: string, input: CreateCommentInput): Promise<CommentDTO>
```

`createComment` catches `EdgeApiError` with `status === 422`, `safeParse`s `err.body` against a discriminated union on `error` (`'comment_flagged'` requires `verdictToken` + `expiresAt`; `'comment_blocked'` does not), and rethrows `CommentGateError`. Anything that fails to parse is rethrown as the original `EdgeApiError` (generic failure, draft preserved). Because `CommentGateError extends EdgeApiError`, any caller still doing `err instanceof EdgeApiError ? err.message` keeps working; `CommentForm` checks `CommentGateError` first. The body only includes `verdictToken` when defined (do not send `verdictToken: undefined`). `feedKeys` untouched.

#### 6. Error handling that preserves the draft

- The draft is held by RHF and only reset in the mutation's `onSuccess` (as shipped). 422, network error, 5xx, parse error and token expiry never reset or unmount the form.
- `edgeRequest` calls `JSON.parse` on the response text, so a non-JSON 5xx body throws a `SyntaxError` (not an `EdgeApiError`). `CommentForm` already maps non-`EdgeApiError` to `'Could not post.'`; keep that fallback. Gate-related copy must not show raw server strings like `comment_flagged`.
- While `submitting` the textarea is `readOnly` so text typed during the request cannot be wiped by the post-success `reset`.
- Token expired between nudge and resubmit: the server ignores it, re-runs the pipeline and answers `comment_flagged` with a fresh token. The user sees the nudge again rather than a block. Accepted; no client clock logic.
- Fail-open stays server-side. The client never blocks on its own: `blocked` is entered only from a 422 `comment_blocked`.

#### 7. Keyboard, focus, aria-live (hand-off to a11y-auditor)

Defaults proposed by frontend; a11y-auditor owns the final call in `### Accessibility`.

- Focus never moves into a notice. Notices that arrive from typing (debounced or blur-triggered `/coach`) do not touch focus. After a 422 from a button click, focus returns to the textarea with the caret at the end, reusing `focusTextareaAtEnd()` in `CommentForm.tsx`. The notices have no focus-stealing controls, so the author can keep editing immediately.
- Announcement: reuse the one-shot pattern already in `CoachChip.tsx` (an `aria-live="polite"` `sr-only` div whose `textContent` is set on mount, never `assertive`). `GateNotice` mounts the same way, one announcement per absent -> present transition. The live-region text is ux-writer's short status string (`pipeline.a11y.nudge` / `.block` / `.crisis`), not a copy of the visible panel, and the visible panel itself is not a live region, so nothing is read twice. Region labels are `pipeline.a11y.region.{nudge,block,crisis}`. Polite vs alert for `block` is a11y-auditor's decision (ux-writer deferred it too); default here is polite. For `blocked`, a repeat click on the aria-disabled button re-announces by clearing and re-setting the live region text, because a silent no-op after a button press would fail 4.1.3. The `checking` phase announces nothing.
- `GateNotice` is a labeled region (`<aside role="region" aria-label=...>`, same as `CoachChip`'s "Suggested rewrite"). The label strings come from ux-writer.
- The textarea gets `aria-describedby={noticeId}` while a notice is shown, and `aria-invalid="true"` while `blocked`, so a screen reader landing back in the textarea hears why.
- The blocked submit button uses `aria-disabled="true"` plus `aria-describedby` to the notice (not `disabled`) so it stays discoverable and explains itself.
- Category and flag names (`pii`, `child_identifying`, `crisis`, ...) are never rendered or placed in any accessible name (same rule as reply-coach voice rule 3 / a11y §6). Flags may only select which ux-writer string to show.
- Existing drift to settle: `[[features/reply-coach]]` `### Accessibility` §1 specifies tab order textarea -> submit -> chip, but the shipped `CommentForm.tsx` renders `CoachChip` before the submit row (lines 94-96 vs 97-106), i.e. textarea -> chip controls -> submit. `GateNotice` goes in the same slot. Blocked and nudge notices have no tab stops; the crisis resources do (links), so a11y should rule on the order for that case.
- Target size and contrast: reuse `CoachChip` classes (`h-10` controls, `bg-surface-card`, `text-ink-lead`, `text-ink-muted`). No new colors.

#### 8. Visuals

No redesign (ui-designer not routed). `GateNotice` reuses `CoachChip`'s card: `rounded-lg bg-surface-card p-4 shadow-lift`, `font-mono text-xs text-ink-muted` eyebrow, `text-ink-lead` body, `cn()` for variant classes. The blocked variant is distinguished by copy and eyebrow text, not color alone; any accent would use the existing `feedback-*` tokens only if design signs off. Strings (nudge per flag, blocked, crisis, resources list and links) come verbatim from ux-writer's `### Microcopy`, via one `CommentGate/gateCopy.ts` constants module; no copy is invented in code, and no phone numbers or URLs are hard-coded until ux-writer supplies them. Screenshots: Phase 3 captures `docs/screenshots/comment-classification-pipeline/before.png` against the unmodified composer first, then `after.png` per state (nudge, blocked, crisis), and records in this section whether they were captured live. Nothing captured in this spec pass because no UI changed.

#### 9. Files

Create (all under `frontend/src/`):
- `utils/normalizeDraft.ts`, `utils/normalizeDraft.test.ts` (shared vectors)
- `features/feed/components/CommentGate/composerPhase.ts` + `composerPhase.test.ts` (table-driven: every row of the transition table)
- `features/feed/components/CommentGate/useCommentGate.ts` + `useCommentGate.test.ts`
- `features/feed/components/CommentGate/GateNotice.tsx` + `GateNotice.test.tsx` (3 kinds, live region one-shot, no category text in DOM, axe)
- `features/feed/components/CommentGate/gateCopy.ts`, `crisisResources.ts` (ux-writer content), `index.ts`

Modify:
- `api/edgeClient.ts` (+ case in `api/edgeClient.test.ts`: error carries parsed `body`)
- `api/coach.ts` (schema above)
- `api/announcements.ts` (`createComment`, `CommentGateError`; new `announcements.test.ts` cases for 201 / 422 flagged / 422 blocked / malformed 422 / 500)
- `features/feed/components/CoachChip/useCoach.ts` (verdict/token fact, `tokenFor`, `adoptVerdict`, `cancel`, `status`, `latestDraftRef` stale guard, import `normalizeDraft`); `suggestion` shape deliberately unchanged so the existing `useCoach.test.ts` `toEqual({rewrite, reasoning})` assertions still pass; export `normalize`-using tests stay green
- `features/feed/components/CoachChip/index.ts` (no change expected unless new exports are wanted)
- `features/feed/components/CommentForm.tsx` (submit guard for blocked, `coach.cancel()`, token in mutation variables, `CommentGateError` branch in `onError`, `readOnly` while submitting, aria wiring, render `GateNotice`)
- `features/feed/components/CommentForm.test.tsx` (new cases below)
- `tests/msw-server.ts` (handler factories below; also fix the stale comment at line 91 that still lists coach as legacy Express)

#### 10. MSW handlers needed

`server.listen({ onUnhandledRequest: 'error' })` (`tests/setup.ts`) means every new test that types >= 20 chars must register a `/coach` handler, or the run fails. Add to `handlers` in `tests/msw-server.ts` (inline `server.use(http.post(...))` stays fine for one-offs, as the current tests do):
- `coachOk()`; `coachSuggest(overrides?)` (tone, with `rewrite`, `verdictToken`, `expiresAt`, `classification`)
- `coachFlagged({ flags, token })` (flag, no rewrite); `coachCrisis()`; `coachWithToken(token)` for bound-token assertions
- `commentCreated(content?)` -> 201 CommentDTO
- `commentFlagged422({ token, flags, category })`; `commentBlocked422()`
- `commentServerError()` (500 `{error:'boom'}`); `commentNetworkError()` (`HttpResponse.error()`); `commentNonJson500()` (exercises the `SyntaxError` path)
- Request-capture helper to assert the POST body does/doesn't contain `verdictToken`, and that the token equals the one `/coach` issued for the same normalized text.

#### 11. Test cases the frontend needs (qa-engineer owns the plan; listed so the files above are justified)

Phase table coverage in `composerPhase.test.ts`; in `CommentForm.test.tsx`: coach flagged -> nudge -> unchanged submit sends token -> 422 blocked -> blocked notice, button aria-disabled, no second request on click; edit blocked text -> notice gone -> new `/coach` call -> new token; whitespace-only edit stays blocked; short flagged draft -> 422 flagged with no prior nudge -> nudge + token kept -> second submit sends that token; crisis shows resources and submit stays enabled; 500 and network error keep the textarea value and send the same token on retry; `readOnly` while pending; stale `/coach` reply for an older draft is ignored; token never sent after text changed; existing 5 tests untouched and green; axe checks for nudge, blocked, crisis; live region fires once per mount.

#### 12. Risks and open questions

- **R1 "Keep mine" semantics.** Today "Keep mine" means "post it anyway". ux-writer already settled that flag nudges have no dismiss control (`### Microcopy` section 1), so `GateNotice` has none and replaces `CoachChip` whenever `flags` is non-empty. Still open: does a tone-only `suggest` with no flags also hard-block on unchanged resubmit? Client behavior is identical either way (server decides), but if yes, `CoachChip`'s "Keep mine" would mislead and needs a copy change. Needs tech-lead/backend confirmation.
- **R9 Copy gaps and drift against ux-writer's `### Microcopy`.** (a) `pipeline.a11y.nudge` says "Your comment hasn't posted yet", which is accurate for a nudge that arrives from the 422 on submit but slightly off when the nudge appears while typing (from `/coach`, before any post attempt). Either ux-writer adds a typing-time variant or confirms the string. (b) No generic block body exists: a `comment_blocked` whose `classification.flags` is empty (e.g. a stage 0 deterministic length/blocklist hit) has no string; ask for `pipeline.block.generic.body`. Until then the client falls back to the `pipeline.block.title` + `pipeline.block.how` lines only. (c) ux-writer's `pipeline.submit.checking_slow` says "the client must time out and fail open"; the client **cannot** safely abort the POST on a timeout, because the comment may already be inserted and a retry would double-post. Fail-open is the server's job; the client shows the slow line and keeps waiting. (d) `{{CRISIS_RESOURCES}}` is a placeholder the product owner must fill; `crisisResources.ts` must not ship containing `{{`, and a unit test asserts that. Crisis handling is blocked on that content. (e) I agree to widen `Could not post.`: network failure (a `TypeError` from `fetch`) -> `pipeline.error.network`; 5xx or non-`EdgeApiError` -> `pipeline.error.generic`; 4xx `EdgeApiError` other than the two gate 422s keep showing the server message as today. (f) Flag precedence for which body shows when several fire: ux-writer recommends `child_identifying`, `pii`, `medical_legal_advice`, `hostile`; engineering owns the final order, so it lives in one constant in `gateCopy.ts` and is for tech-lead to confirm; `pipeline.flag.multiple` is appended when more than one fired.
- **R2 Crisis on the POST path.** Crisis is non-blocking, so the author only sees resources if `/coach` ran first (>= 20 chars and not dismissed by a failure). A short crisis draft submitted straight away would publish with no resources shown unless the server answers 422 `comment_flagged` once for crisis with no token. Ask backend. The client already handles a `comment_flagged` with `category==='crisis'`.
- **R3 Normalization drift** between `normalizeDraft.ts` and the Deno shared module. Failure mode is soft (token ignored, user re-nudged instead of blocked) but silently defeats the block. Mitigated by shared vectors in both test suites.
- **R4 No client-side "would this block?" signal.** The client infers "flagged" from `verdict`, `classification.flags` and `category`. If backend adds a different gating rule, the nudge may not show even though a resubmit would block. Suggest backend add an explicit boolean; until then the 422 is the source of truth and the worst case is a block with no prior nudge.
- **R5 Edge Function not yet deployed with new fields:** handled by `.optional()` on new schema fields; once deployed, tighten to required in a follow-up.
- **R6 Rate limit / cost cap are per-isolate** (feature Open question): a 429 or 5xx from `/coach` leaves `idle`, so under heavy load nudges appear inconsistently; the POST path still enforces.
- **R7 Pre-existing:** `edgeRequest` has no 422-aware path and does `JSON.parse` unguarded; only the `body` passthrough is added here, not a general rework. Draft loss on navigation away from `AnnouncementDetail.tsx` (which mounts `CommentForm`) is pre-existing and out of scope.
- **R8 Scope creep guard:** DMs (`MessageComposer.tsx`) are out of scope for v1 and must not be wired to the gate.

Status of Phase 3 assets: none captured in this pass (spec only).

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

Spec pass, 2026-10-26. Scope is slice 1: nudge, block, crisis, checking, error and screen-reader strings for the comment composer. Strings sit beside the shipped [[features/reply-coach]] `### Microcopy` (Part 3, `coach.*` keys) and use the same platform "we" voice. Nothing here edits `coach.*` keys.

Conventions for this table:

- `max` is a character cap for the UI slot, set about 10% above the written string. If a string does not fit, flag it to the ux-writer; do not truncate.
- `{{...}}` marks a placeholder that must be replaced by the product owner. Nothing in this table is a real hotline, number or URL.
- No string quotes, paraphrases or names any part of the author's draft. Screen-reader announcements included.
- Every string is written to be reviewed alone, so some sentences repeat across flags on purpose.

#### Where the strings render

| surface | file | note |
|---|---|---|
| Nudge, block and crisis panels | new component beside `CoachChip/` inside `CommentForm.tsx`, below the textarea | One panel at a time. Recommended: a pipeline panel replaces the `CoachChip` for the same draft, so the composer never shows two competing messages. Confirm with ui-designer. |
| Submit button | `CommentForm.tsx` (today: `Comment`, and `Posting…` while pending) | The label is `Comment`, not `Post`. These strings use the shipped label. |
| Network and server errors | `CommentForm.tsx` `serverError` slot (today: `Could not post.`) | Replaced by the two error strings below. |

#### 1. Nudge (first flagged submit)

Panel structure: eyebrow, one body string for the flag, then the consequence line. No buttons. The author changes the text in the textarea, which clears the panel and re-checks. There is deliberately no dismiss control, because dismissing would change nothing and would imply an override that does not exist.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.nudge.eyebrow` | Mono kicker above every nudge body | A note before you post | 32 | Same slot and style as `coach.suggest.preface` (`One way to say it:`). No colon, because it introduces a paragraph, not a rewrite. |
| `pipeline.nudge.pii.body` | Flag `pii`: phone, address, email | This may include a phone number, address, or email. Contact details are safer in a direct message. Could you take them out of the comment? | 180 | "May include" because the classifier can be wrong. Points to DMs as the useful alternative, so the author is not just told no. |
| `pipeline.nudge.child_identifying.body` | Flag `child_identifying`: child's name, school, photo, case details, birth-family details | This may include details that could point to a child, like a name, school, photo, case details, or birth-family information. Could you keep it more general? Keeping those details private protects them. | 210 | Lists the concrete things so the author knows what to look for. Ends on the child, not on a rule. |
| `pipeline.nudge.medical_legal_advice.body` | Flag `medical_legal_advice` | This may read as medical or legal advice. Sharing your own experience is welcome. Advice on what someone should do is best left to their doctor, caseworker, or lawyer, who know their situation. | 210 | Opens by saying experience is welcome, so experienced carers do not feel talked down to. |
| `pipeline.nudge.hostile.body` | Flag `hostile` | This could land hard for the person reading it. Could you say it a gentler way? Disagreeing is fine. It's the wording that could hurt. | 160 | Describes the reader's experience, never the author's intent or character. "Disagreeing is fine" keeps this from reading as opinion policing, matching reply-coach rule 2. |
| `pipeline.nudge.consequence` | Line under every nudge body | If you post it as it is, it won't go through. Edit it and we'll take another look. | 110 | Says the quiet part plainly so the later block is never a surprise. Product owner may cut it (see open items); if cut, the block message carries more weight. |
| `pipeline.flag.multiple` | Appended under the body when more than one flag fired | There may be more than one thing to adjust. | 60 | The UI shows one flag body only (precedence below), then this line. Editing re-checks, so remaining flags surface next. |

Recommended precedence when several flags fire: `child_identifying`, `pii`, `medical_legal_advice`, `hostile`. Rationale: the first two are the hardest to undo once read. Engineering owns the final order.

#### 2. Block (second submit with the flagged text unchanged, or direct API rejection)

Panel structure: title, flag body, reason (where one exists), then the shared "how to fix" line. No button and no link: v1 has no override and no appeal, so the copy never offers either.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.block.title` | Heading of every block panel | We can't post this yet | 40 | "Yet" signals it is fixable. Not "blocked", "rejected" or "denied". |
| `pipeline.block.pii.body` | Block, flag `pii` | Your comment seems to include a phone number, address, or email. Please take the contact details out, or share them in a direct message instead. | 180 | Says what to change and where else to put it. |
| `pipeline.block.child_identifying.body` | Block, flag `child_identifying` | Your comment seems to include details that could point to a child, like a name, school, photo, case details, or birth-family information. Please take those out, or keep it more general. | 220 | "Seems to" stays, because a Sonnet second opinion lowers but does not remove false positives. |
| `pipeline.block.medical_legal_advice.body` | Block, flag `medical_legal_advice` | Your comment seems to give advice about what someone should do medically or legally. Please share it as your own experience, or point them to their doctor, caseworker, or lawyer. | 200 | Offers two concrete rewrites of the intent. |
| `pipeline.block.hostile.body` | Block, flag `hostile` | The wording in your comment could hurt the person reading it. Please say it a gentler way. You can still say what you disagree with. | 150 | Ends by protecting the author's right to hold the opinion. |
| `pipeline.block.reason.confidentiality` | Shown under the body for `pii` and `child_identifying` only | Keeping private details out of comments protects the children in our community and their families. | 120 | The "why" the brief asks for. Phrased as protection, not prohibition. |
| `pipeline.block.reason.medical_legal` | Shown under the body for `medical_legal_advice` only | Every child's situation is different, and the people on their team know details we don't. | 110 | Ties the reason back to the child, not to liability. |
| `pipeline.block.how` | Shown under every block panel | Your comment is still here. Change the text and we'll check it again. | 90 | Reassures the draft is safe, which matters most to a tired author, and states the single path forward. |
| `pipeline.block.mistake` | Last line of every block panel (optional) | We don't always get this right. Try rewording it a little. | 80 | Honest about false positives without promising an appeal that does not exist. Product owner may cut it (see open items). |

`hostile` has no reason string on purpose: any "why" would sound like a lecture.

#### 3. Crisis (supportive, never blocking)

A `crisis` classification shows this panel and the comment is not blocked. The copy does not assume who is in crisis (the author, a child, someone else) and does not claim to know how the author feels.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.crisis.title` | Heading of the crisis panel | Support is here if you want it | 50 | Offers; does not diagnose. |
| `pipeline.crisis.body` | Under the title | If things feel heavy right now, you don't have to carry it by yourself. Reaching out to someone can help. | 130 | "If things feel" is conditional, so it still reads as true when the classifier is wrong. Avoids therapy-speak ("valid", "journey", "I hear you"). |
| `pipeline.crisis.not_blocked` | Under the body | Your comment hasn't been blocked. You can post it whenever you're ready. | 100 | The explicit statement the brief requires. |
| `pipeline.crisis.resources.heading` | Above the resource list | Places that can help | 40 | |
| `pipeline.crisis.resources.list` | The resource list itself | `{{CRISIS_RESOURCES}}` | n/a | PLACEHOLDER. Product owner must supply vetted content. See "Product owner must supply" below. |
| `pipeline.crisis.emergency` | Below the resource list | If you or anyone near you is in immediate danger, call your local emergency number. | 120 | Deliberately generic: no number is named, so nothing is invented and it stays correct in every region. |
| `pipeline.crisis.admin_notice` | Optional last line | A member of our team may see this comment. | 70 | INCLUDE ONLY IF the product owner confirms. The data is flagged for an admin, but the admin queue UI is out of scope, so nobody may act on it yet. Never promise a reply or a check-in. |

#### 4. Checking and loading

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.submit.checking` | Submit button label while the pre-publish check runs (replaces `Comment`; `Posting…` still follows) | Checking… | 14 | Button label only. Set `aria-busy` on the button; do not announce it in a live region (see section 6). |
| `pipeline.submit.checking_slow` | Visible line beside the button if the check takes longer than about 3 seconds | Still checking. This is taking a little longer. | 70 | The client must time out and fail open, so this state always resolves. |

Typing-time checks stay silent, exactly as in `coach.state.loading` (nothing rendered). A loading message appears only after the author presses the submit button, because only then are they waiting on us.

#### 5. Fail-open: recommend silent

Recommendation: when the model fails, times out, refuses or returns invalid output, the UI says nothing and the comment publishes. Reasons:

1. It matches reply-coach (`coach.state.error` is silent) and the settled rule that model failure never blocks.
2. "We couldn't check this" after the author already pressed Comment adds worry and offers no action. It can also read as "your comment may be unsafe".
3. The visible `Checking…` state resolves into the comment appearing, so the author is not left waiting on something that never arrives. That keeps the a11y condition recorded in reply-coach `### Accessibility` §7 satisfied.

Failures are logged with `CoachErrorCategory`, not shown.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.check.unavailable` | RESERVED, NOT SHIPPED. Only if the product owner overrules the silent recommendation. | We couldn't check this just now, so we've posted it as written. | 80 | Do not wire this in slice 1. |

#### 6. Screen-reader announcements

Each is one short polite status message, announced once when its panel appears. They do not repeat the panel text and never include any text from the draft. The visible panel is not itself a live region, so nothing is read twice. The a11y-auditor decides `polite` versus `alert` for the block announcement. The `Checking…` state has no announcement; the button's `aria-busy` is enough, and the result is announced when it arrives.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.a11y.nudge` | Live region, nudge panel appears | Your comment hasn't posted yet. We have a note about it, just below. | 90 | States the most important fact first: it has not posted. |
| `pipeline.a11y.block` | Live region, block panel appears | Your comment wasn't posted. Please change the text, then try again. | 90 | |
| `pipeline.a11y.crisis` | Live region, crisis panel appears | Support information is below. Your comment hasn't been blocked. | 90 | |
| `pipeline.a11y.region.nudge` | `aria-label` of the nudge panel | A note about your comment | 40 | Replaces nothing in `coach.*`; the chip keeps `Suggested rewrite`. |
| `pipeline.a11y.region.block` | `aria-label` of the block panel | Comment not posted yet | 40 | |
| `pipeline.a11y.region.crisis` | `aria-label` of the crisis panel | Support information | 40 | |

When an edit clears a block or nudge and the re-check passes, say nothing. The panel simply goes away.

#### 7. Errors that preserve the draft

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.error.network` | Comment POST or check fails because the connection dropped | We couldn't connect. Your comment is still here, so try again in a moment. | 90 | The submit button is the retry, so no extra button label is needed. |
| `pipeline.error.generic` | Any other non-block server failure on the comment POST | We couldn't post your comment. It's still here, so try again in a moment. | 90 | Replaces the terse `Could not post.` in `CommentForm.tsx`. Include only if frontend-dev agrees to widen that one string. |

A block returned by the server (direct POST with flagged text, or a verdict token mismatch) must be mapped by the frontend to the section 2 strings by error code. Never render the server's raw error message in the composer.

#### Voice checklist (microcopy-voice skill and design-system Voice & Tone)

| rule | result |
|---|---|
| Plural "we" as the platform, never "I" | Pass. Strings speak as "we" or address "you / your comment". |
| Active voice, short sentences | Pass. Longest sentence is 23 words (`pipeline.block.child_identifying.body`). |
| Warm, not saccharine, not patronising | Pass. No praise, no reassurance clichés, no pet phrases. |
| No exclamation marks (CTAs excepted) | Pass. None; there are no CTAs in this table. |
| No emoji | Pass. |
| Imperative CTAs | Not applicable. No new buttons. `Checking…` is a state label. |
| Lead with what changed for the user | Pass. Block bodies lead with what the comment contains, then what to change. |
| Does not contradict reply-coach rules | Pass with one distinction, below. |

Distinction from reply-coach rule 3 ("never name the category"): these strings name the content the author can see and change ("a phone number", "a school"), never the classifier's label. No string says PII, hostile, flagged, minimization or any category name.

#### What we never say

- "Violation", "violated", "policy", "prohibited", "not allowed", "inappropriate", "unsafe", "rejected", "denied", "banned".
- The classifier's labels: PII, hostile, toxic, abusive, sensitive, "child-identifying".
- "Flagged", "detected", "our system noticed", "AI", "the model", "automatically". We do not claim a human reviewed anything.
- "Appeal", "contact support", "request a review", "override", "post anyway". None exists in v1, so we never imply one.
- Anything about the author's intent or character: "you meant", "you clearly", "you should know better", "careless".
- Words that shame or warn: "warning", "last chance", "strike", "you failed to", "you must".
- Therapy-speak (carried over from reply-coach rule 7): "I hear you", "valid", "journey", "lived experience".
- "At least", "just", "simply", "obviously": they minimise the effort of editing.
- Any quote, count or paraphrase of the draft's content, including in the live-region strings.
- Exclamation marks and emoji.

#### Rationale for tone choices

- **Tired and protective readers.** Foster parents read these at the end of a long day, often about a child they are fighting for. So the first words say what happened to the comment, the draft is promised safe, and there is one path forward.
- **Fear of being judged.** Strings use "may", "seems to" and "could" because the classifier can be wrong, and confident accusations about a carer's words land badly. They describe the reader's experience ("could land hard for the person reading it") and never the author.
- **Confidentiality as care.** The block explains that privacy protects the children and their families, so the rule reads as shared purpose rather than platform control. That is the same reason a carer would give.
- **Honest about consequences.** The nudge tells the author up front that an unchanged post will not go through. Silent coach-then-block would feel like an ambush. The cost is a heavier nudge, and the string can be cut.
- **Firm without cold.** "We can't post this yet" is a clear no with a clear way forward. Blocks never apologise excessively and never offer something that is not there.
- **Crisis is an offer.** The panel is conditional ("if things feel heavy"), does not diagnose, and says plainly that the comment is not blocked. Support is something to take, not something imposed.
- **Silence where silence is kinder.** Typing-time checks and model failures say nothing, consistent with reply-coach.

#### Product owner must supply (blocking for the crisis panel)

1. `{{CRISIS_RESOURCES}}`: a vetted list of support resources (name, how to reach, hours, region or country coverage, and whether foster-specific or general). Do not ship slice 1 `crisis` handling with the placeholder. No hotline names, numbers or URLs are invented in this spec.
2. Confirmation that the generic line in `pipeline.crisis.emergency` ("your local emergency number") is acceptable, or the approved regional wording.
3. Decision on `pipeline.crisis.admin_notice`: tell the author an admin may see the comment, or say nothing. Recommended: say it, once the admin queue exists.

#### Open items for design-lead and ui-designer

1. **Settings copy now overstates.** `settings.coach.help` in reply-coach says "You can always post your original." That stays true for tone rewrites but not for these flags. The ux-writer cannot change it; propose a reword when settings ships.
2. **One panel at a time.** Confirm that a pipeline panel suppresses `CoachChip` for the same draft. Also confirm the keyboard order and focus target when a panel appears (a11y-auditor).
3. **Crisis flow.** This copy assumes the crisis panel appears on submit and the comment stays postable with the normal `Comment` button. If the design needs a second press, do not label it "Post anyway".
4. **Optional cuts.** `pipeline.nudge.consequence` and `pipeline.block.mistake` are the two most debatable lines. Recommended: ship both for v1 and measure.
5. **Button label.** The composer button reads `Comment`, not `Post`. `Checking…` replaces it in place.

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
