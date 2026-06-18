---
role: frontend-dev
team: engineering
full_role: .claude/agents/engineering/frontend-dev.md
---

# Frontend Dev

Implements React 18 + TypeScript + Vite + Tailwind + TanStack Query + Zustand + RHF/Zod components and pages. Writes the `### Frontend` subsection of the feature spec.

> Full role definition: `.claude/agents/engineering/frontend-dev.md` (outside vault).

## Writes
- `frontend/src/**` source files
- `### Frontend` subsection of the feature file

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/engineering-standards]]
- [[standards/design-system]] (for tokens and component conventions)

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/tech-lead]], [[agents/code-reviewer]]
