---
slug: ci-pipeline
title: CI Pipeline
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: review                 # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2
created: 2026-06-13
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# CI Pipeline

## Problem

There is currently no automated check on push or pull request: `npm test`, `npm run typecheck`, and lint only run when an agent (qa-engineer, `/sanity-check`) explicitly invokes them locally. A regression can land on `master` if no one remembers to run the suite. We want a GitHub Actions workflow that runs the existing test/typecheck commands on every push and PR, so failures are visible on the PR before merge regardless of what a contributor (human or agent) ran locally.

## Acceptance criteria

- [ ] `.github/workflows/ci.yml` runs on `push` and `pull_request` against any branch
- [ ] Workflow installs dependencies (`npm ci` at the repo root, workspaces-aware) and runs `npm run typecheck` and `npm test` (backend + frontend)
- [ ] CI fails (non-zero exit / red check) if typecheck, backend tests, or frontend tests fail
- [ ] Workflow run shows up as a status check on PRs against `master`

## Out of scope

- Branch protection rules requiring the check to pass before merge (follow-up, needs repo admin action)
- Deploy/release pipelines
- E2E (Playwright) in CI — separate follow-up once E2E suite is established
- Pre-commit/pre-push git hooks (separate, optional follow-up)

## Open questions

- Node version to pin in CI — match local dev version (check `.nvmrc` / `engines` field, or default to current LTS)
- Should ESLint be part of this workflow's required checks, or a separate non-blocking job?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan

Verification is via static review of `.github/workflows/ci.yml` (no `act` runner available locally; GitHub will execute the workflow itself on first push/PR). Mapping to acceptance criteria:

| # | Acceptance criterion | How the workflow satisfies it |
|---|---|---|
| 1 | `.github/workflows/ci.yml` runs on `push` and `pull_request` against any branch | `on:` block declares both `push` and `pull_request` triggers, each with `branches: ['**']` — matches any branch for both events. |
| 2 | Workflow installs dependencies (`npm ci` at the repo root, workspaces-aware) and runs `npm run typecheck` and `npm test` (backend + frontend) | Single job `test` on `ubuntu-latest`: checkout (`actions/checkout@v4`) → `actions/setup-node@v4` (Node 20, `cache: npm`) → `npm ci` at repo root (root `package.json` declares `workspaces: [backend, frontend]`, so `npm ci` installs and links both workspaces) → `npm run typecheck --workspaces --if-present` (runs `tsc --noEmit` in both `backend` and `frontend`, each of which defines a `typecheck` script) → `npm test --workspaces --if-present` (runs `node --test` in backend, `vitest run` in frontend). |
| 3 | CI fails (non-zero exit / red check) if typecheck, backend tests, or frontend tests fail | GitHub Actions marks a job failed if any `run:` step exits non-zero, and steps run sequentially with default `continue-on-error: false` — a failing `tsc --noEmit`, backend `node --test`, or frontend `vitest run` will fail the step and the job, turning the check red. No step suppresses exit codes. |
| 4 | Workflow run shows up as a status check on PRs against `master` | Because `pull_request.branches` includes `**` (matches `master`), every PR targeting `master` triggers this workflow, and GitHub surfaces the job (`Typecheck & Test (backend + frontend)`) as a status check on that PR automatically — no extra `branch protection` config is required for the check to *appear* (only for it to be *required*, which is explicitly out of scope). |

**Open question 1 — Node version**: No `.nvmrc` or `engines` field exists anywhere in the repo (root, `backend/package.json`, `frontend/package.json`). Pinned `node-version: '20'` (current LTS) in `actions/setup-node@v4`, with an inline comment in the workflow noting the absence of an explicit project-level pin and that this should be revisited if one is added later. This resolves the open question — no app code changes needed.

**Open question 2 — ESLint scope**: Recommend leaving ESLint **out** of this workflow, consistent with the feature's "Out of scope" framing (this PR ports only the existing `typecheck`/`test` commands). ESLint sweeps are already part of the qa-engineer's `/sanity-check` loop locally; wiring `eslint .` into CI as a separate, explicitly-named job (non-blocking initially, or blocking once the team is comfortable with the current lint baseline) is a good P2/P3 follow-up but should get its own feature file per the "No TODOs without a feature file" rule rather than being folded into this scaffold.

**Root `package.json` script gap (noted, not fixed here)**: The root `package.json`'s `test` script is currently a Phase-1 placeholder (`echo 'Phase 2+: no test runners wired yet.'`) and there is no root `typecheck` script at all — both predate the backend/frontend workspace scaffolding. Rather than edit root scripts (outside this feature's writer-ownership / "do not modify root package.json scripts unless absolutely required"), the workflow calls `npm run typecheck --workspaces --if-present` and `npm test --workspaces --if-present` directly, which is npm's built-in workspace fan-out and requires zero application-code changes — both `backend/package.json` and `frontend/package.json` already define working `typecheck` and `test` scripts. A follow-up could replace the root placeholder scripts with real fan-out wrappers so a contributor running `npm test` locally at the root gets the same behavior as CI, but that is a separate, small chore (suggest a `chore/root-package-scripts` feature) and is **not required** for this CI workflow to function correctly.

**Backend test env vars**: `backend/package.json` defines two test scripts — `test` (no env vars; falls back to `DB_PATH=./fofafu.db`, a real on-disk sqlite file) and `test:run` (sets `DB_PATH=:memory:`, `NODE_ENV=test`, `JWT_SECRET=test-secret-please-rotate` — the isolated/CI-appropriate variant). To satisfy "`npm test`... at the root" literally while still getting isolated, repeatable runs, the workflow sets these three env vars at the **job level** (`env:` block), so the plain `npm test --workspaces --if-present` fan-out picks them up for the backend workspace without needing `test:run` or any package.json edits. Frontend's `test` script (`vitest run`) is unaffected by these vars.

No `*.test.ts`/`*.spec.ts` files were added or modified — this feature is CI-config-only (per "Out of scope": no application code changes). Existing backend (`node:test`) and frontend (Vitest) suites are exercised as-is by the new workflow on the next push/PR.

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
