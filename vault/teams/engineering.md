---
team: engineering
lead: tech-lead
members: [tech-lead, backend-dev, frontend-dev, mobile-dev, qa-engineer]
charter_owner: tech-lead
---

# Engineering — Team Charter

## Mandate

Ship the foster-family product with calm, well-tested code that a one-person team can keep in their head. No surprise abstractions. No clever metaprogramming. Strict TypeScript, clear boundaries, fast tests.

## Stack

| Layer | Stack | Notes |
|---|---|---|
| Backend | Express 4 + TS strict + better-sqlite3 + JWT + Multer | sync DB, no async wrappers |
| Frontend | React 18 + TS strict + Vite + Tailwind + TanStack Query + Zustand + RHF + Zod | per `~/.claude/rules.md` |
| Mobile | Expo + RN (Phase 4) | dormant until Phase 4 |
| Testing | Vitest + RTL + node:test + Playwright | replaces Cypress |
| Tooling | ESLint + Prettier + tsc; npm workspaces | monorepo |

## Conventions

- **TDD by default.** Tests written before implementation. Tests live next to the code.
- **Database is synchronous.** `better-sqlite3` returns rows directly; do not wrap in Promises.
- **One concern per PR.** Squash-merge to `master`.
- **No new dependency without justification.** Justification = one line in the feature file.
- **Branch naming**: `feat/<slug>`, `fix/<slug>`, `chore/<topic>`.
- **Commit format**: Conventional Commits (`feat(area): …`, `fix:`, `chore:`).

## Decomposition heuristics (tech-lead's playbook)

For a typical CRUD feature:
- backend-dev: routes, controller, DB schema/migration, validation.
- frontend-dev: page, components, query hooks, form with Zod.
- qa-engineer: 1 integration test per endpoint + 1 RTL smoke test per page.

For an auth-touching feature, add:
- backend-dev: middleware updates, token handling.
- qa-engineer: explicit "unauthenticated → 401" tests.

For a data-shape change, add:
- backend-dev: migration with rollback note.
- qa-engineer: migration smoke test on a fresh DB.

## Sanity sweep

Triggered by `/sanity-check engineering` (and nightly once scheduled):

1. `npx tsc --noEmit` in each workspace.
2. `npx eslint .` in each workspace.
3. `npx vitest run --coverage` if test runner is wired.
4. `npm audit --omit=dev` for high/critical advisories.

For each failure: scaffold a feature file with `priority: P1`, tag `#bug`, add a Backlog card on `engineering.md`.

## Escalation

- backend↔frontend disagreement on API shape → tech-lead arbitrates; if unresolved, returns `status: partial` to dispatcher with both proposals in notes.
- QA flags a P0 regression → tech-lead immediately re-opens the shipped feature with `status: blocked` and a new Backlog card.
