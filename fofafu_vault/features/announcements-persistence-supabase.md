---
slug: announcements-persistence-supabase
title: Announcements Persistence (Supabase)
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: abandoned              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P1                  # P0 | P1 | P2
created: 2026-07-11
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Announcements Persistence (Supabase)

## Abandoned — superseded by [[features/migrate-render-to-vercel-supabase]]

This feature reached `status: review` (PR #45) with a working `better-sqlite3` → `pg.Pool` (direct Postgres) migration that kept the existing Express + JWT + `users`-table architecture, just repointed at Supabase's Postgres.

While that PR was in flight, [[features/migrate-render-to-vercel-supabase]] (Phase 5) landed on `master` with a larger, incompatible architecture already partially applied to the **same live Supabase project** (`rlizubjugevyxsfzmpny`): Supabase Edge Functions, Supabase Auth (`auth.users`), and RLS policies — with `users`/`email_tokens`/`password_reset_tokens` dropped entirely in favor of `auth.users`. PR #45's schema (still expecting a `users` table) is incompatible with that.

Decision (2026-07-11, confirmed with the project owner): Phase 5 is the intended direction. PR #45 was closed unmerged; this feature is abandoned rather than reconciled, since Phase 5 already supersedes its acceptance criteria (Postgres-backed persistence) via a different mechanism.

**Residual risk to check:** the user ran `npm run migrate` from this feature's `backend/src/migrate.ts` (the `better-sqlite3`-shaped `CREATE TABLE IF NOT EXISTS users ...` script) against the real Supabase project before this was caught. Worth confirming Phase 5's schema/RLS migrations weren't clobbered or left in a mixed state — see `supabase migration list` against `rlizubjugevyxsfzmpny`.

## Problem

`POST /api/announcements` on the deployed backend (https://fofafu.onrender.com) returns a 500 ("Something went wrong on our end.") when called from the deployed frontend (https://fofafu-frontend.vercel.app/). The backend currently persists data via `better-sqlite3` to a local file (`DB_PATH`, default `./fofafu.db`). Render's filesystem is ephemeral/non-persistent across deploys and restarts, which is the leading suspect: the sqlite file may not exist, may not have run migrations, or may not be writable on the running instance. We have a Supabase project (`https://rlizubjugevyxsfzmpny.supabase.co`) provisioned as the replacement persistence layer.

Success: announcement creation (and all other DB-backed endpoints) works reliably on the deployed backend, backed by Supabase Postgres instead of a local sqlite file.

## Acceptance criteria

- [ ] Root cause of the current production 500 on `POST /api/announcements` is confirmed (e.g. via Render logs) before migration work is considered "done"
- [ ] Backend data access is migrated from `better-sqlite3` to Supabase (Postgres), preserving existing schema/behavior for announcements, comments, reactions, families, and any other current tables
- [ ] Existing migration script (`backend/src/migrate.ts`) equivalent exists for Supabase/Postgres
- [ ] Local dev and test workflows (`npm run dev`, `npm run test:run`) continue to work against Supabase (or a documented local Postgres substitute)
- [ ] Secrets (`SUPABASE_URL`, service key) are only ever read from environment variables, never committed
- [ ] Deployed backend on Render successfully creates/reads/updates/deletes announcements end-to-end

## Out of scope

- Any frontend UI changes (this is a backend persistence swap only)
- Adding Supabase Auth/RLS-based auth — existing JWT-based auth middleware stays as-is unless it breaks
- Migrating uploads/media storage off local disk (separate concern)

## Open questions

- Do we want Supabase Auth/RLS eventually, or keep app-level JWT auth and just use Supabase as a Postgres host? **Answered by supersession: Phase 5 adopts Supabase Auth/RLS.**
- Should local dev use a real Supabase project or a local Postgres/dockerized instance for tests?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Note on provenance:** backend-dev's spawn was interrupted twice by harness connection/stall errors (bounded per protocol §8 — one retry max), but a complete, working implementation was already produced across the two attempts on a sibling worktree (`worktree-feat+backend-supabase-postgres`). The dispatcher ported that diff into this feature branch verbatim (byte-identical `backend/src`, `backend/tests`, `backend/package.json`, `backend/.env.example` — confirmed via `diff -rq`), installed `pg`, and independently re-ran the full quality gate below rather than trusting the interrupted agent's self-report.

**Root cause (confirmed):** Render's filesystem is ephemeral across deploys/restarts. `backend/src/db.ts` previously opened a `better-sqlite3` file at `DB_PATH` (default `./fofafu.db`); on Render this file (and any migrations run against it) does not survive a restart/redeploy, so `POST /api/announcements` (and any other write path) intermittently hit a missing table/file and surfaced as an opaque 500.

**What changed (on the now-closed PR #45; not merged):**
- `backend/src/db.ts` — replaced `better-sqlite3` with `pg.Pool`. Kept the existing `db().prepare(sql).get/all/run(...)` call shape so every controller only needed `await` added at call sites, not a query rewrite. `?`/named placeholders are compiled to Postgres `$1..$n` positional params internally.
- `backend/src/migrate.ts` — Postgres-flavored equivalent of the old sqlite migration script: `CREATE TABLE IF NOT EXISTS` per table plus defensive `ensureColumn`/`ensureForeignKeyTarget` backfills, run idempotently as a `before()`/`beforeEach()` fixture in every integration test and on server boot.
- All controllers/routes touching persistence (`announcement`, `auth`, `community`, `family`, `message`, `playdates`, `search`) updated to `await` the now-async `db()` calls; `backend/src/utils/asyncHandler.ts` added so Express routes correctly forward rejected promises to the error middleware instead of crashing unhandled (this closes the "opaque 500" failure mode, not just the persistence swap).
- `resolveConnectionString()` in `db.ts` reads `DATABASE_URL` (prod/dev) or `TEST_DATABASE_URL` (`NODE_ENV=test`) exclusively from `process.env` — no secrets in code, no in-memory/mock fallback.
- No `@supabase/ssr` and no `@supabase/supabase-js` REST client were introduced — talked to Postgres directly via `pg.Pool`.

**Quality gate (before abandonment, on PR #45):**
- `npx tsc --noEmit` in `backend/`: clean, 0 errors.
- `npm run test:run` against a disposable `postgres:16-alpine` container: **147/147 pass, 30 suites, 0 fail/cancelled/skipped/todo**, ~103s.

**Why this was abandoned rather than merged:** its `users`/`email_tokens`/`password_reset_tokens` schema is incompatible with Phase 5's already-applied schema on the same live Supabase project, which folds users into `auth.users`. See the Abandoned note at the top of this file.

### Frontend
N/A — backend-only persistence swap. No route, page, or component changes.

### Test plan

147/147 backend tests passed against a disposable Postgres container prior to abandonment. Full history preserved in git on the closed `fix/announcements-persistence` branch / closed PR #45 for reference, in case any of this work (schema parity notes, asyncHandler fix, `resolveConnectionString` boot-refusal pattern) is useful to Phase 5.

### E2E coverage
No E2E coverage — backend-only persistence swap, no frontend diff.

### Code review
0 must-fix found in the PR #45 diff prior to abandonment (1 non-blocking process gap: CI had no Postgres service container). Full review preserved on the closed PR for reference.

## Design — Spec

### Visual
N/A — feature abandoned before design work was needed.

### Microcopy
N/A — feature abandoned before design work was needed.

### Accessibility
N/A — feature abandoned before design work was needed.

## Marketing — Spec

### Launch copy
N/A — feature abandoned before design work was needed.

### SEO
N/A — feature abandoned before design work was needed.

### Growth
N/A — feature abandoned before design work was needed.
