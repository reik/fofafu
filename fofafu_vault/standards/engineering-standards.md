---
spec: engineering-standards
owner: tech-lead
read_by: [tech-lead, backend-dev, frontend-dev, mobile-dev, qa-engineer, code-reviewer]
---

# Engineering Standards

The shared engineering spec. Stack, coding conventions, and the project-wide rules every IC follows when they write code. Owned by the tech-lead; read by every engineering IC at the start of every dispatch.

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

## Ownership

- Stack additions or replacements go through the tech-lead.
- Convention changes go through the tech-lead and are reflected in this file before any IC adopts them.
- ICs reference this file; they do not edit it.
