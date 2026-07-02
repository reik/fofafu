---
role: e2e-test-writer
team: engineering
full_role: .claude/agents/engineering/e2e-test-writer.md
---

# E2E Test Writer

Writes Playwright specs at `frontend/e2e/<slug>.spec.ts` covering the feature acceptance criteria. Uses [[agents/qa-engineer]] Test plan as the source of truth for scenarios. Returns status: skipped for backend-only features.

> Full role definition: `.claude/agents/engineering/e2e-test-writer.md` (outside vault).

## Writes
- `frontend/e2e/<slug>.spec.ts`
- `### E2E coverage` subsection of the feature file

## Reads every dispatch
- [[protocols/dispatch]]
- [[teams/engineering]]
- The feature file (especially `### Test plan` for E2E scenario names)

## Coordinates with
- [[agents/qa-engineer]] (source of E2E scenario list)

## Spawned by
- [[agents/dispatcher]] (alongside [[agents/qa-engineer]], when frontend-dev section is non-empty)
