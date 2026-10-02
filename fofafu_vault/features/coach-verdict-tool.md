---
slug: coach-verdict-tool
title: Coach Verdict Tool
owner: engineering
collaborators: []
status: review
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
- [ ] Every coach failure is classified into a `CoachErrorCategory` (`rate_limited`, `overloaded`, `upstream_error`, `timeout`, `network`, `auth`, `bad_request`, `refusal`, `truncated`, `no_tool_call`, `invalid_verdict`, `unknown`) and logged with `retryable` + HTTP `status`. Users still see the silent `verdict=ok` fallback.

## Out of scope

- Model migration off `claude-3-5-haiku-20241022` (forced `tool_choice` is not accepted on Opus 5.5 / Sonnet 5.5 / Fable 5.1, so a future migration must switch to `tool_choice: auto` + `strict: true` or structured outputs).
- Any frontend change: the response shape is unchanged.

## Open questions

- Should the system prompt's "Output contract" paragraph be reworded to reference the tool? It is kept as-is in this feature because the fixtures are graded against the same prompt.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
- `backend/src/services/coach/claudeClient.ts`: new exported `COACH_VERDICT_TOOL` (`submit_coach_verdict`, `input_schema` mirrors `CoachResponse`, `additionalProperties: false`, typed with `satisfies Anthropic.Tool`). `LiveClaudeClient.coach()` sends `tools: [COACH_VERDICT_TOOL]` + `tool_choice: { type: 'tool', name: 'submit_coach_verdict' }`. New `readVerdict()` finds the matching `tool_use` block and validates `input` with the `CoachResponse` Zod schema. Throws on a missing call or a schema mismatch, and the controller's silent fallback catches it.
- `supabase/functions/coach/index.ts`: same tool + `tool_choice`. `isCoachResponse()` is a hand-written type guard, because the edge function has no Zod.
- System-prompt cache_control is unchanged. The prompt's "Output contract" paragraph is left verbatim (see Open questions).
- Error categories: `backend/src/services/coach/coachErrors.ts` defines `CoachErrorCategory`, `CoachClientError`, and `classifyCoachError()`. It maps the SDK's typed errors: 429→`rate_limited`, 529→`overloaded`, other 5xx→`upstream_error`, timeout, connection→`network`, 401/403→`auth`, other 4xx→`bad_request`. `LiveClaudeClient` throws categorized errors for `stop_reason` `refusal`/`max_tokens`, a missing tool call, or a schema failure (only the failing paths are logged, never the values). The controller logs `{category, retryable, status, message}`. The edge function mirrors all of it.
- Known, pre-existing (on master too): `deno check` fails on `cache_control` in `system` because SDK 0.32 types it only under beta. No new Deno errors are introduced.

### Frontend
No frontend change: the `/coach` response shape is unchanged.

### Test plan
`backend/tests/coach-live.test.ts` → new `coach-verdict-tool` describe block (6 tests, written first and confirmed red): tool schema requires all four fields; tool is sent; tool_choice forces it; tool_use input is returned; a text-only response throws; a schema-invalid input throws. The fake Anthropic client now returns a `tool_use` block by default. `backend/tests/coach-errors.test.ts` (16 tests) covers each category's classification and each `LiveClaudeClient` failure path. A `coach.test.ts` case checks that the controller logs `category`. Backend suite: 170/170 pass, `tsc --noEmit` clean.

### E2E coverage
No E2E coverage: backend-only, response contract unchanged.

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
