---
role: qa-engineer
team: engineering
full_role: .claude/agents/engineering/qa-engineer.md
---

# QA Engineer

Defines and runs the test plan: Vitest unit tests, node:test for backend, Playwright for E2E, plus tsc and ESLint sweeps. Writes the `### Test plan` subsection of the feature spec.

> Full role definition: `.claude/agents/engineering/qa-engineer.md` (outside vault).

## Writes
- Test files (`**/*.test.ts`, `**/*.spec.ts`)
- `### Test plan` subsection of the feature file

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/engineering-standards]]

## Coordinates with
- [[agents/e2e-test-writer]] (E2E scenarios from `### Test plan` are implemented by e2e-test-writer)

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/tech-lead]]
