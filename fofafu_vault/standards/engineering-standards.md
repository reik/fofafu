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
- **Screenshots on every PR for major/user-facing functionality.** Deterministic, not reviewer's-discretion: if the PR adds or changes a page, UI flow, or other user-visible behavior, the PR description includes screenshots of it working. Backend-only / no-UI-change PRs are exempt.
  - Capture `docs/screenshots/<slug>/before.png` as the FIRST step, against the still-unmodified component, before writing any code — do not reconstruct the old version from git history afterward, that's needless extra work. Capture `after.png` (or feature-specific screenshots for a new page/flow) once the change is finished, same viewport and same demo state as `before.png`.
  - Save under `docs/screenshots/<feature-slug>/`, committed on the feature branch.
  - Link with `github.com/<owner>/<repo>/blob/<branch>/<path>?raw=true` — **never** `raw.githubusercontent.com`: it works for `gh`/`curl` with a token but silently 404s for a plain browser viewer if the repo is ever private (no session auth on that host), which looks fine when the agent tests it and only fails for the human reading the PR.
  - Captured by whoever lands the visual change (usually [[agents/frontend-dev]]). If live capture genuinely isn't possible (e.g. no real auth/backend in the sandbox), say so explicitly in the `### Frontend` subsection rather than skipping it silently — same honesty bar as any other unexecuted test. [[agents/tech-lead]] checks for their presence when auditing a visually-affecting feature at aggregation time.
  - Right after merge, *before* deleting the source branch, swap `<branch>` for `master` in the image URL (`gh pr edit`) — the squash-merge commit places the same file at the same path on `master`, so the link survives the branch's post-merge deletion. Skipping this silently 404s the screenshot once the branch is gone.

## Async-restored state

Any component that gates behavior (redirects, guards, conditional rendering) on state that is restored asynchronously on load — auth/session hydration, feature flags fetched at boot, etc. — must treat "not yet resolved" as a distinct third state, not collapse it into `false`/logged-out. Reading the raw resolved value before hydration completes is a race, not a bug you'll see on every load — it reproduces specifically on a cold start (hard refresh / first paint), which is why it survives a warm-app manual test and a test suite that mocks the store as already-hydrated.

- **Gate on the loading flag, not just the value.** `{ isAuthenticated, isLoading }` (or equivalent) — never branch on `isAuthenticated` alone when it can start `false` and flip true after hydration.
- **Test the loading state, not just the two resolved states.** A test suite for such a component is incomplete with only "authenticated" and "unauthenticated" cases — it must also assert behavior while the flag is still resolving.
- **Verify the cold-start path by hand before claiming the fix works.** Hard-refresh the affected route, don't just navigate to it within an already-warm app — that's a different code path and won't exercise the race.
- **E2E coverage**: for a route/guard change of this kind, [[agents/e2e-test-writer]] adds (or the qa-engineer notes as a gap) a full-page-reload scenario in Playwright — this is the only automated check that reliably catches the race, since unit tests typically hydrate the store synchronously in setup.
- **PR checklist**: see `.github/pull_request_template.md` — any PR touching an auth-/session-/flag-gated component must check the cold-start box before merge.

## Ownership

- Stack additions or replacements go through the [[agents/tech-lead]].
- Convention changes go through the [[agents/tech-lead]] and are reflected in this file before any IC adopts them.
- ICs reference this file; they do not edit it.
