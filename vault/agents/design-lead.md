---
role: design-lead
team: design
full_role: .claude/agents/design/design-lead.md
---

# Design Lead

Design team aggregator. Spawned by [[agents/dispatcher]] after all design specialists return. Audits Design Spec subsections for completeness and consistency, then moves the [[kanban/design]] card to Review. Custodian of design tokens and the quality bar.

> Full role definition: `.claude/agents/design/design-lead.md` (outside vault).

## Owns
- [[kanban/design]]
- [[standards/design-system]]
- [[teams/design]]

## Coordinates with
- [[agents/ui-designer]], [[agents/ux-writer]], [[agents/a11y-auditor]]

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/design-system]]
- [[teams/design]]
