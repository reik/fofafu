---
slug: dispatch-protocol-update
title: Dispatch Protocol Update
owner: engineering
collaborators: []
status: shipped
priority: P1
created: 2026-05-20
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Dispatch Protocol Update

## Problem

The current `vault/protocols/dispatch.md` assumes a 3-level agent hierarchy (dispatcher → team-lead → specialists). The Claude Code harness only supports 2 levels: a top-level session can spawn subagents, but those subagents cannot themselves spawn further subagents — the `Agent` tool is not propagated even when the role file declares it. The first dispatch under the current protocol always fails with `status: failed` from the team-lead (see `[[features/author-display-names]]` log entry at 11:02 and the #escalation at 11:05). The recovery path required explicit human approval and a documented bypass of protocol §11. Every future `/dispatch` will hit the same wall unless the protocol is rewritten to match harness reality.

## Acceptance criteria

- [x] `vault/protocols/dispatch.md` is updated so a clean `/dispatch <slug>` flow on a fresh feature succeeds end-to-end without human intervention (no `#escalation`, no protocol bypass approval needed).
- [x] The protocol explicitly documents who spawns whom in the 2-level model — chosen shape: **Option B** (dispatcher spawns specialists in parallel; team-lead spawned afterwards as aggregator-only).
- [x] `.claude/agents/dispatcher.md`, `.claude/agents/engineering/tech-lead.md`, `.claude/agents/design/design-lead.md`, `.claude/agents/marketing/marketing-lead.md` are updated to match the new protocol so an agent that re-reads its role file behaves correctly.
- [x] The writer-ownership table in `CLAUDE.md` is updated: kanban writers unchanged (leads still own team boards), but body-section ownership clarified to point at specialists per subsection rather than the lead as a whole. ICs-and-kanban paragraph rewritten to match the 2-level return path.
- [x] An end-to-end smoke run of `/dispatch` against a small throwaway feature (or a real low-risk one from the backlog) completes Backlog → In Progress → Review → Done without any tooling escalation. *(Validated 2026-05-21 by `[[features/focus-reset-on-route-change]]` — clean end-to-end run with zero `#escalation`. One `#manual-aggregation` footnote where a lead's aggregator spawn hit a session quota mid-call AFTER moving the kanban card; dispatcher wrote the missing log entry per the new failure-mode rule. Confirms the new protocol works as designed.)*

## Out of scope

- Changing the kanban-lifecycle rule (Backlog → In Progress → Review → Done remains).
- Changing writer-ownership semantics (a lead still owns its team board; specialists never touch kanban).
- Multi-level orchestration tricks (e.g. dispatcher running a lead-as-planner first, then a separate spawn round for ICs). Keep the protocol simple.

## Open questions

- Should the lead spawn happen at all? Two viable shapes:
  - **A**: dispatcher → lead (lead returns a *plan* only) → dispatcher spawns ICs from the plan → lead aggregates (second spawn). Two lead spawns; closer to the spirit of the original protocol.
  - **B**: dispatcher → ICs directly in parallel (no lead spawn at all); lead is only spawned at the end to aggregate. One lead spawn; simpler, what we did manually for `author-display-names`.
- Where does the lead's decomposition live if option B is chosen — embedded in the IC prompts the dispatcher writes itself, or in a "Decomposition" section the lead pre-fills before any IC spawns?
- Does this change require a corresponding update to the `/dispatch` skill body (the slash-command Markdown), or only the agent role files?

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
