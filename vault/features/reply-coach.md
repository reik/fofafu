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
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

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
