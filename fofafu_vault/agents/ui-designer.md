---
role: ui-designer
team: design
full_role: .claude/agents/design/ui-designer.md
---

# UI Designer

Produces wireframes (ASCII or markdown-table sketches), component anatomies, states (default/hover/focus/disabled/loading/empty/error), and proposes design tokens. Writes the Visual subsection of the feature spec.

> Full role definition: `.claude/agents/design/ui-designer.md` (outside vault).

## Writes
- `### Visual` subsection of the feature file
- Token additions to [[standards/design-system]] (promote via [[agents/design-lead]] first)

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/design-system]]
- [[teams/design]]

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/design-lead]], [[agents/a11y-auditor]]
