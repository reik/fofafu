---
slug: comment-classification-pipeline
title: Comment Classification Pipeline
owner: engineering
collaborators: []
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
- **`question` means anything a user wants to ask the community.** No topic restriction. A question gets source references where a curated source applies, and is never refused for being off-topic.
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
- [ ] `update` drafts are checked for child-identifying information and case details; `support` drafts reuse the existing coach tone check.
- [ ] `question` drafts get source references only from a curated allowlist; the model returns source ids and the code renders the links. Model-generated URLs are never shown.
- [ ] A `crisis` classification shows support resources and flags the comment for an admin; it is not silently blocked.
- [ ] Moderation filter runs on every category.
- [ ] Any model failure falls back to publishing, logs a categorized error (reuse `CoachErrorCategory`), and is covered by tests.
- [ ] Per-stage feature flag and cost cap, reusing the coach's flag/cap mechanics.
- [ ] Fixture-based test suite for classification and for each handler, written before implementation.

## Out of scope

- After-publish auto-hiding (stays out of scope in [[features/moderation-report-block]]).
- An MCP server or an agent loop for the `question` handler.
- Admin queue UI for flagged `crisis` comments (the data lands; the UI is separate).
- Direct messages. Comments only in v1.

## Open questions

- What is the curated source set for `question` references: seeded from `fofafu_vault` / `docs/user-guide.md`, or from an external list the user supplies?
- What is the block UX: hard block with edit-only, or block with an "appeal" that sends the draft to an admin?
- Which model per stage? The coach still pins `claude-3-5-haiku-20241022`; the classifier should start on a current small model.
- Does the Supabase edge function (`supabase/functions/coach/`) host the pipeline, or does a new function do?
- Slicing: stage 0 + stage 1 + block-on-repeat first; the per-category handlers as follow-up features.

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
