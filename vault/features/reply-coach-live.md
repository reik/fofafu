---
slug: reply-coach-live
title: Reply Coach — live Anthropic SDK
owner: engineering
collaborators: [design, marketing]
status: drafting
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
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev — likely N/A; this is a backend swap behind an existing seam)*

### Test plan
*(filled by qa-engineer)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer — likely N/A; no new surface)*

### Microcopy
*(filled by ux-writer — voice rules are inherited verbatim from parent feature's `### Microcopy`; ux-writer audits the live system prompt against them)*

### Accessibility
*(filled by a11y-auditor — likely N/A inherited from parent)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist — `/help/reply-coach` explainer page proposed in parent's `### SEO` is the one public surface here)*

### Growth
*(filled by growth-analyst — re-state parent's canonical metric definitions + cost cap + experiment design)*
