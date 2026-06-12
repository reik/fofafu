---
slug: backend-logger-util
title: Backend logger utility
owner: engineering
collaborators: []
status: drafting
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

The project rule (see `.claude/agents/engineering/code-reviewer.md` “project standards”) is "No `console.log` in committed code — use a logger util." The backend workspace has no logger util, so diagnostics fall back to `console.*` (only `coach.controller.ts` currently carries an `// eslint-disable-next-line no-console` marker). Surfaced as **MF-1** by code-reviewer during the `reply-coach` dispatch (see `vault/features/reply-coach.md` `### Code review`). Tech-lead deferred it to this feature.

Existing offenders to migrate: `backend/src/index.ts` (startup logs), `backend/src/services/email.service.ts` (dev-mode dump), `backend/src/controllers/coach.controller.ts:52` (client-failure warn — the MF-1 site).

Success = a small, dependency-light logger util exists, the three known sites use it, and the no-`console.*` rule is enforceable again.

## Acceptance criteria

- [ ] `backend/src/utils/logger.ts` exports `logger.info`, `logger.warn`, `logger.error`, `logger.debug` (or equivalent). Level filtering via an env var (`LOG_LEVEL`, default `info` in prod, `debug` in test).
- [ ] Output format: single line per record (text or JSON — pick one and document why). No PII or request-body leakage by construction — the logger accepts a `{ msg, ...fields }` shape and refuses to deep-stringify unknown objects.
- [ ] No new runtime dependency unless the team specifically wants Pino/Winston. Start with a 30-line hand-rolled wrapper around `console.*` that satisfies the project rule (the rule is about discipline + a single seam, not about feature richness).
- [ ] Three known `console.*` sites migrated: `coach.controller.ts:52`, `email.service.ts`, `index.ts`.
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
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev — N/A)*

### Test plan
*(filled by qa-engineer — small surface; one unit test on the logger + a smoke test that the three migrated sites still emit something)*

### Code review
*(filled by code-reviewer; populated during building → review)*

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
