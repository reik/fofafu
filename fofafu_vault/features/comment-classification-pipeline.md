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
*(filled by frontend-dev)*

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
