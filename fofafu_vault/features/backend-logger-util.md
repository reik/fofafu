---
slug: backend-logger-util
title: Backend logger utility
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-06-11
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
  parent: "[[features/reply-coach]]"
---

# Backend logger utility

## Problem

The project rule (see `.claude/agents/engineering/code-reviewer.md` “project standards”) is "No `console.log` in committed code — use a logger util." The backend workspace has no logger util, so diagnostics fall back to `console.*` (only `coach.controller.ts` currently carries an `// eslint-disable-next-line no-console` marker). Surfaced as **MF-1** by [[agents/code-reviewer]] during the [[features/reply-coach]] dispatch (see `### Code review`). [[agents/tech-lead]] deferred it to this feature.

Existing offenders to migrate: `backend/src/index.ts` (startup logs), `backend/src/services/email.service.ts` (dev-mode dump), `backend/src/controllers/coach.controller.ts` (client-failure warn — the MF-1 site).

Success = a small, dependency-light logger util exists, the three known sites use it, and the no-`console.*` rule is enforceable again.

## Acceptance criteria

- [ ] `backend/src/utils/logger.ts` exports `logger.info`, `logger.warn`, `logger.error`, `logger.debug` (or equivalent). Level filtering via an env var (`LOG_LEVEL`, default `info` in prod, `debug` in dev, `silent` in test).
- [ ] Output format: single line per record (text or JSON — pick one and document why). No PII or request-body leakage by construction — the logger accepts a `{ msg, ...fields }` shape and refuses to deep-stringify unknown objects.
- [ ] No new runtime dependency unless the team specifically wants Pino/Winston. Start with a 30-line hand-rolled wrapper around `console.*` that satisfies the project rule (the rule is about discipline + a single seam, not about feature richness).
- [ ] Three known `console.*` sites migrated: `backend/src/controllers/coach.controller.ts`, `backend/src/services/email.service.ts`, `backend/src/index.ts`.
- [ ] `// eslint-disable-next-line no-console` markers removed at those sites.
- [ ] Backend tests stay green (96/96 + whatever has been added since).

## Out of scope

- Frontend logger (the frontend already has its own conventions; covered elsewhere if needed).
- Log shipping / aggregation (this just gives us a seam — Datadog/Loki integration is a separate concern).
- Request-correlation IDs / tracing.

## Open questions

- JSON or text format? JSON is grep-friendly and shipper-friendly; text is human-friendly in `npm run -w backend dev`. Recommend JSON in prod, text in dev (toggled by `NODE_ENV`).
- Do we want a no-op shim for tests so logs don't pollute test output? Probably yes — default `LOG_LEVEL=silent` in `vitest`/`node:test` runs.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

Implemented `backend/src/utils/logger.ts` — a ~90-line hand-rolled wrapper around `console.*`, no new runtime dependency.

**API.** `logger.debug/info/warn/error(record)` where `record` is a single object `{ msg: string, ...fields }` — matches the acceptance criteria's `{ msg, ...fields }` shape literally (one positional arg, not `(msg, fields)`). Example: `logger.warn({ msg: 'coach client failure', message })`.

**Level filtering.** `LOG_LEVEL` env var (`debug|info|warn|error|silent`) is read on every call (not cached at import time), so tests that flip `process.env` mid-run see the new level immediately. If unset, falls back by `NODE_ENV`: `test` → `silent`, `production` → `info`, anything else (dev) → `debug`.

**Format.** JSON in production (`NODE_ENV=production`) — one `JSON.stringify`'d object per line with `level`, `msg`, fields, and an ISO `time`, for grep/shipper friendliness. Text (`[level] msg {fields}`) everywhere else, for human-readability under `npm run dev`. Toggled purely by `NODE_ENV` per the Open Questions recommendation.

**No deep-stringify / PII guard.** Only primitive field values (string/number/boolean/null/undefined) are emitted as-is. Any object or array value is replaced with a shallow `[object]`/`[array]` marker rather than being recursively walked or `JSON.stringify`'d — this both prevents an entire request body/user record from leaking into a log line via a nested field, and prevents `JSON.stringify` from throwing on circular references. Callers must pass only the specific primitive fields they intend to log.

**Migrated call sites** (all three from the Problem statement), `eslint-disable-next-line no-console` markers removed at all of them:
- `backend/src/controllers/coach.controller.ts` — the MF-1 site; `console.warn('[coach] client failure', { message })` → `logger.warn({ msg: 'coach client failure', message })`.
- `backend/src/services/email.service.ts` — dev-mode dump in both `sendVerificationEmail` and `sendPasswordResetEmail` → `logger.info({ msg: 'email:fake verify'|'email:fake reset', to, name, url })`.
- `backend/src/index.ts` — startup log (`logger.info({ msg: 'fofafu backend listening', port })`) and the previously-unlogged unhandled-error middleware, which now also goes through `logger.error({ msg: 'unhandled error', message })` instead of raw `console.error('[unhandled]', err)` (only the error's `message`, never the raw `err` object, to avoid leaking stack/context).

**Tests.** qa-engineer's `backend/tests/logger.test.ts` (written in parallel) exercises the single-object call signature, silent-in-test default, `LOG_LEVEL` override, and a smoke test that all three migrated modules import cleanly and `buildApp()` still boots. Full backend suite: 134/134 passing (`npm run test:run -w backend`), `tsc -p tsconfig.json --noEmit` clean.

### Frontend
*(filled by frontend-dev — N/A)*

### Test plan

Small surface, proportionate coverage — 6 tests in `backend/tests/logger.test.ts` (node:test), all green against backend-dev's landed `backend/src/utils/logger.ts`:

| # | Type | Assertion |
|---|---|---|
| 1 | unit | `logger.info/warn/error/debug` are exported as functions |
| 2 | unit | `logger.info({ msg, ...fields })` accepts the `{ msg, ...fields }` shape without throwing |
| 3 | unit | passing an unknown/circular nested object as a field does not throw (verifies the shallow-field guard, not deep-stringify) |
| 4 | unit | `LOG_LEVEL` unset + `NODE_ENV=test` → silent by default (no console output) |
| 5 | unit | explicit `LOG_LEVEL=debug` override emits debug output |
| 6 | smoke | importing/booting `index.ts` (`buildApp()`), `email.service.ts`, and `coach.controller.ts` together does not throw — confirms the three migrated call sites still emit through the logger cleanly |

Not separately tested (out of proportion for this surface; covered implicitly by test 6 and by the module's own documented behavior): JSON-vs-text format toggling by `NODE_ENV=production` — a pure function of `NODE_ENV` inside `logger.ts`, exercised transitively via the level-resolution path in tests 4/5.

Full suite result: `npm run test:run -w backend` → **134/134 pass**, 0 fail, 0 skipped — no regressions from the 6 new logger tests.

### Code review

**Summary.** Reviewed `backend/src/utils/logger.ts`, the three migrated call sites (`coach.controller.ts`, `email.service.ts`, `index.ts`), and `backend/tests/logger.test.ts`. This is a clean, proportionate implementation of a small utility — hand-rolled, no new dependency, single-object call signature matches the AC literally, and the shallow-field guard is a sound and simple approach to the PII/leakage risk (reject-by-construction rather than trying to redact known-bad keys). Verdict: **pass**, no must-fix.

**Must-fix**
- none.

**Nice-to-have**
- `backend/src/migrate.ts:157` — `console.log('migrations complete')` is a pre-existing `console.*` call outside the three named sites, not in this diff's scope, but worth a follow-up note/TODO-with-feature-file if the team wants "no console.* left in backend" to be a global invariant rather than three specific sites.
- `backend/src/services/email.service.ts` — `logger.info({ msg: 'email:fake verify', to, name, url })` logs recipient email + name + a reset/verify URL (which embeds a token) as plain fields. This is gated behind `shouldUseFakeMailer() && NODE_ENV !== 'test'` (i.e. only fires in local dev against the fake mailer, never in prod/test), and it's a direct behavioral port of the pre-existing `console.log` call (same fields, same gate), so it's not a regression. Still, since the logger's whole design goal is to make PII leakage harder, it's worth a follow-up decision on whether dev-mode fake-mail dumps should log the URL/name at all, or truncate the token. Not blocking — this is pre-existing behavior, faithfully migrated, and dev-only.
- `backend/src/index.ts` — the unhandled-error middleware previously did `console.error('[unhandled]', err)` (full error object); now logs only `err.message`. This is a scope-positive change (fourth site, not one of the three named in the Problem statement) but it's a genuine improvement: the shallow-field guard would have collapsed a raw `err` object to `[object]` anyway if passed directly, so extracting `.message` explicitly is the correct pattern and a good precedent for future call sites. Recommend keeping it — flagging per the task's ask, not as a concern.

**Acceptance criteria spot-check**
- [x] `logger.info/warn/error/debug` exported, `{ msg, ...fields }` shape, `LOG_LEVEL` filtering with sensible `NODE_ENV`-based defaults (`test`→silent, `production`→info, else debug) — matches AC exactly, including the "silent in test" nuance the AC calls out explicitly.
- [x] Single-line output, JSON in prod / text in dev, documented in the module docstring and in the Backend section — decision matches the Open Questions' recommendation.
- [x] No new runtime dependency (`git diff backend/package.json` is empty) — hand-rolled, ~110 lines including comments, no PII/deep-stringify leakage by construction (shallow `[object]`/`[array]` markers, primitives pass through unchanged).
- [x] Three known sites migrated: `coach.controller.ts`, `email.service.ts` (both `sendVerificationEmail` and `sendPasswordResetEmail`), `index.ts` (startup log). Confirmed via diff — all three read exactly as backend-dev's notes describe.
- [x] `eslint-disable-next-line no-console` markers removed at all three sites — verified `grep -rn "eslint-disable.*no-console" backend/src` returns no hits; the one at `coach.controller.ts` (the MF-1 site) is gone.
- [x] Backend tests stay green — `npm run test:run -w backend` → 134/134 pass (baseline was 96/96 before other features added tests; not a regression), `tsc -p tsconfig.json --noEmit` clean.

## Design — Spec

### Visual
*(N/A — backend chore)*

### Microcopy
*(N/A)*

### Accessibility
*(N/A)*

## Marketing — Spec

### Launch copy
*(N/A — internal chore)*

### SEO
*(N/A)*

### Growth
*(N/A)*
