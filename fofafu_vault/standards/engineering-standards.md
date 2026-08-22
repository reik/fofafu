---
spec: engineering-standards
owner: tech-lead
read_by: [tech-lead, backend-dev, frontend-dev, mobile-dev, qa-engineer, code-reviewer]
---

# Engineering Standards

The shared engineering spec. Stack, coding conventions, and the project-wide rules every IC follows when they write code. Owned by the [[agents/tech-lead]]; read by every engineering IC ([[agents/backend-dev]], [[agents/frontend-dev]], [[agents/qa-engineer]], [[agents/code-reviewer]], [[agents/e2e-test-writer]]) at the start of every dispatch — see [[protocols/dispatch]] §4.

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
- **Visual changes need before/after screenshots.** Capture `docs/screenshots/<slug>/before.png` as the FIRST step, against the still-unmodified component, before writing any code — do not reconstruct the old version from git history afterward, that's needless extra work. Capture `after.png` once the change is finished, same viewport and same demo state as `before.png`. Both committed to the feature branch and embedded in the PR body via raw GitHub URLs (`https://raw.githubusercontent.com/<org>/<repo>/<branch>/docs/screenshots/<slug>/{before,after}.png`). Captured by whoever lands the visual change (usually [[agents/frontend-dev]]). If live capture genuinely isn't possible (e.g. no real auth/backend in the sandbox), say so explicitly in the `### Frontend` subsection rather than skipping it silently — same honesty bar as any other unexecuted test. [[agents/tech-lead]] checks for their presence when auditing a visually-affecting feature at aggregation time.

## Ownership

- Stack additions or replacements go through the [[agents/tech-lead]].
- Convention changes go through the [[agents/tech-lead]] and are reflected in this file before any IC adopts them.
- ICs reference this file; they do not edit it.
