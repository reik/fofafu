---
team: engineering
lead: tech-lead
members: [tech-lead, backend-dev, frontend-dev, mobile-dev, qa-engineer, e2e-test-writer]
charter_owner: tech-lead
---

# Engineering — Team Charter

How the engineering team operates. This file is the tech-lead's playbook: mandate, decomposition heuristics, sanity sweep, escalation. The shared engineering spec (stack, coding conventions) lives in `[[standards/engineering-standards]]` and is the canon every IC consults — keep it in lockstep with this charter. This team operates under [[protocols/dispatch]].

## Mandate

Ship the foster-family product with calm, well-tested code that a one-person team can keep in their head. No surprise abstractions. No clever metaprogramming. Strict TypeScript, clear boundaries, fast tests.

Kanban board: [[kanban/engineering]].

## Decomposition heuristics (tech-lead's playbook)

For a typical CRUD feature:
- [[agents/backend-dev]]: routes, controller, DB schema/migration, validation.
- [[agents/frontend-dev]]: page, components, query hooks, form with Zod.
- [[agents/qa-engineer]]: 1 integration test per endpoint + 1 RTL smoke test per page.

For any feature that adds or changes a route, page, or user-facing component (i.e. frontend-dev's section is non-empty), also spawn:
- [[agents/e2e-test-writer]]: one Playwright spec per new/changed flow at `frontend/e2e/<slug>.spec.ts`, covering the acceptance criteria qa-engineer lists as E2E in `### Test plan`. Backend-only features skip this (writes "No E2E coverage" instead).

For an auth-touching feature, add:
- [[agents/backend-dev]]: middleware updates, token handling.
- [[agents/qa-engineer]]: explicit "unauthenticated → 401" tests.

For a data-shape change, add:
- [[agents/backend-dev]]: migration with rollback note.
- [[agents/qa-engineer]]: migration smoke test on a fresh DB.

## Sanity sweep

Triggered by `/sanity-check engineering` (and nightly once scheduled):

1. `npx tsc --noEmit` in each workspace.
2. `npx eslint .` in each workspace.
3. `npx vitest run --coverage` if test runner is wired.
4. `npm audit --omit=dev` for high/critical advisories.

For each failure: scaffold a feature file with `priority: P1`, tag `#bug`, add a Backlog card on `kanban/engineering.md`.

## Escalation

- backend↔frontend disagreement on API shape → [[agents/tech-lead]] arbitrates; if unresolved, returns `status: partial` to dispatcher with both proposals in notes.
- QA flags a P0 regression → [[agents/tech-lead]] immediately re-opens the shipped feature with `status: blocked` and a new Backlog card.
- A convention proposal from an IC (e.g. a new lint rule, a new test pattern) → [[agents/tech-lead]] lands it in `[[standards/engineering-standards]]` first, then the IC adopts it; no convention lives only in a feature file.
