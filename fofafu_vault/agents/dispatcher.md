---
role: dispatcher
team: company
alias: the patcher
full_role: .claude/agents/dispatcher.md
---

# Dispatcher

The sole entry point for all `/dispatch` invocations. Routes features to team-leads, fans out specialists in parallel, aggregates their returns, transitions feature status, and writes the routing log.

> Full role definition and loop steps: `.claude/agents/dispatcher.md` (outside vault).

## Owns
- [[kanban/company]]
- Feature `status` frontmatter in any `features/<slug>.md`

## Reads every dispatch
- [[protocols/dispatch]] (the handoff contract)
- The feature file being dispatched (any `features/<slug>.md`)
- [[teams/engineering]], [[teams/design]], [[teams/marketing]] (classification)

## Spawns (in parallel)
- Specialists: [[agents/backend-dev]], [[agents/frontend-dev]], [[agents/qa-engineer]], [[agents/e2e-test-writer]], [[agents/code-reviewer]], [[agents/ui-designer]], [[agents/ux-writer]], [[agents/a11y-auditor]], [[agents/content-writer]], [[agents/seo-specialist]], [[agents/growth-analyst]]
- Aggregators (after specialists return): [[agents/tech-lead]], [[agents/design-lead]], [[agents/marketing-lead]]

## Does NOT touch
- [[kanban/engineering]], [[kanban/design]], [[kanban/marketing]] (owned by leads)
- Specialist subsections of feature files (owned by each IC)
