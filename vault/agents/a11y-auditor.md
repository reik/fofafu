---
role: a11y-auditor
team: design
full_role: .claude/agents/design/a11y-auditor.md
---

# A11y Auditor

Audits the proposed feature for WCAG 2.2 AA compliance: contrast ratios, keyboard navigation, focus order, semantic roles, and screen-reader labels. In Phase 3+, runs axe-core against built pages. Writes the Accessibility subsection.

> Full role definition: `.claude/agents/design/a11y-auditor.md` (outside vault).

## Writes
- `### Accessibility` subsection of the feature file
- `### a11y - Build audit` subsection (Phase 3+)

## Reads every dispatch
- [[protocols/dispatch]]
- The feature file (all design subsections written so far)

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/design-lead]]
