---
slug: reply-coach
title: Reply Coach
owner: engineering
collaborators: []
status: drafting
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

- [ ] `POST /api/comments/coach` accepts a draft comment (+ optional thread context) and returns `{ verdict, categories, reasoning, rewrite }` per the contract in `vault/plans/PHASE_2.md`.
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

- Final list of categories (initial six are in `vault/plans/PHASE_2.md` — confirm during spec).
- Reasoning string returned to the client: included in v1 response or held back until UI design lands?
- Default rate limit (60/hour proposed) — tune after dogfood pass.
- Cache-hit metadata in the response body vs. server logs only? *(deferred to the live-SDK follow-up)*

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

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

**Styling.** Tailwind utilities only, `cn()` for the chip's conditional states (visible / dismissed / accept-pending). No inline styles, no CSS modules. Visual tokens (color, radius, spacing) come from `vault/teams/design.md` via the existing tokens module — frontend-dev does not pick palette here.

**Testing (Phase 3).** Co-located `CoachChip.test.tsx` + `useCoach.test.ts`. Mock at the network boundary with MSW:
- Renders nothing when API returns `verdict: 'ok'`.
- Renders chip with `rewrite` string when `verdict: 'suggest'`.
- `Accept` replaces the textarea value and hides the chip.
- `Dismiss` hides the chip without mutating the draft.
- `404` from the API renders nothing and does not block the submit button.
- Submit button remains clickable during an in-flight coach request.

**Out of this dispatch.** No `frontend/` files are written, edited, or scaffolded as part of `reply-coach`. The Phase 3 frontend port will own all code, tests, and final UX micro-decisions against the design-lead's tokens and microcopy that land in the sections below.

### Test plan
*(filled by qa-engineer)*

## Design — Spec

### Visual
*(filled by ui-designer)*

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
*(filled by a11y-auditor)*

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
*(filled by growth-analyst)*
