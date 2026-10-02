---
slug: coach-verdict-tool
title: Coach Verdict Tool
owner: engineering
collaborators: []
status: drafting
priority: P2
created: 2026-10-02
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
  parent: "[[features/reply-coach-live]]"
---

# Coach Verdict Tool

## Problem

[[features/reply-coach-live]] asks Claude to "respond with a single JSON object … and nothing else", then runs `JSON.parse` over the first text block. Any preamble, markdown fence, or shape drift throws and silently degrades to `verdict=ok`, which shows up as missed nudges rather than as errors. Moving to Claude API tool use (a `submit_coach_verdict` tool whose `input_schema` mirrors `CoachResponse`, forced via `tool_choice`) gives the API a schema to fill in and removes the text-parsing step. Success means the live coach returns schema-shaped verdicts without a JSON-parse failure path.

## Acceptance criteria

- [ ] A `submit_coach_verdict` tool definition (name, description, `input_schema` matching `CoachResponse`) is exported from the coach service and sent on every live call.
- [ ] Live calls force the tool via `tool_choice: { type: "tool", name: "submit_coach_verdict" }`.
- [ ] `LiveClaudeClient` reads the `tool_use` block's `input` and validates it with the `CoachResponse` Zod schema. Text output is no longer parsed.
- [ ] A missing `tool_use` block or a schema-invalid input throws, so the controller's existing silent fallback (`verdict=ok`) still applies.
- [ ] The Supabase edge function (`supabase/functions/coach/index.ts`) is ported to the same tool contract.
- [ ] Prompt caching on the system block is unchanged.

## Out of scope

- Model migration off `claude-3-5-haiku-20241022` (forced `tool_choice` is not accepted on Opus 5.5 / Sonnet 5.5 / Fable 5.1, so a future migration must switch to `tool_choice: auto` + `strict: true` or structured outputs).
- Any frontend change: the response shape is unchanged.

## Open questions

- Should the system prompt's "Output contract" paragraph be reworded to reference the tool? It is kept as-is in this feature because the fixtures are graded against the same prompt.

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
