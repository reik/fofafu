---
role: tech-lead
team: engineering
full_role: .claude/agents/engineering/tech-lead.md
---

# Tech Lead

Engineering team aggregator. Spawned by [[agents/dispatcher]] after all engineering specialists return. Audits `## Engineering — Acceptance` subsections for completeness and mutual consistency, then moves the [[kanban/engineering]] card to Review.

> Full role definition: `.claude/agents/engineering/tech-lead.md` (outside vault).

## Owns
- [[kanban/engineering]]
- [[standards/engineering-standards]]
- [[teams/engineering]]

## Coordinates with
- [[agents/backend-dev]], [[agents/frontend-dev]], [[agents/qa-engineer]]
- [[agents/code-reviewer]], [[agents/e2e-test-writer]]
- [[agents/mobile-dev]] (dormant until Phase 4)

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/engineering-standards]]
- [[teams/engineering]]
