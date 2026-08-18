---
slug: backend-cors-origin-fix
title: Backend Cors Origin Fix
owner: engineering
collaborators: []
status: abandoned
priority: P2
created: 2026-08-18
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
  parent: "[[features/playdates]]"
---

# Backend Cors Origin Fix

**Abandoned 2026-08-18, same day, before dispatch.** Scaffolded this off a
first-pass read of the Express `cors()` config in `backend/src/index.ts`
against *local* `master`, which turned out to be ~15 commits behind
`origin/master`. On the real (origin) `master`, `playdates` — and
`announcement`, `family`, `community`, `search` — are already served by
Supabase Edge Functions, not Express. The actual, already-diagnosed root
cause: `frontend/src/api/edgeClient.ts`'s `edgeRequest()` never sends the
Supabase `apikey` header, so the gateway rejects with `401
UNAUTHORIZED_NO_AUTH_HEADER` before reaching function code, which the
browser surfaces as a CORS-shaped failure. This was already found, tested,
and fixed on 2026-08-17 (see `fofafu_vault/log/2026-08-17.md` on branch
`fix/edge-function-apikey-header`, PR #59, still draft/unmerged) against
`[[features/migrate-render-to-vercel-supabase]]` — at the time `playdates`
was still Express-backed so it wasn't in that fix's blast radius; it joined
the same broken code path once a later commit (`55b950f`) repointed
`playdates`/`messages`/`coach` onto `edgeRequest`. No new fix needed here —
see today's log entry for the recommendation to merge PR #59.

## Problem

Reported: `POST https://fofafu-frontend.vercel.app/playdates` fails in the
browser with a CORS error. The playdates page is just where it was noticed —
the underlying bug is backend-wide, not playdates-specific.

`backend/src/index.ts` configures CORS with a single hardcoded origin:

```ts
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
```

If `FRONTEND_URL` is unset, stale, or points at the wrong URL in the deployed
backend's environment, this silently falls back to `http://localhost:5173`,
which never matches the production frontend origin
(`https://fofafu-frontend.vercel.app`). Every cross-origin request from the
deployed frontend — the preflight `OPTIONS` for any `POST`/`PUT`/`DELETE`
included — then fails CORS, since the `cors` middleware won't emit a
matching `Access-Control-Allow-Origin` header. There's no boot-time check or
log line that would surface a misconfigured/missing `FRONTEND_URL`, so this
fails silently until a user hits it in the browser.

Success = requests from the deployed frontend to the deployed backend work
without CORS errors, and a future misconfiguration of `FRONTEND_URL` is loud
(fails at boot or logs clearly) instead of showing up as an opaque
browser-side CORS error.

## Acceptance criteria

- [ ] Confirm what `FRONTEND_URL` is actually set to on the deployed backend
      (hosting provider's env config — not discoverable from the repo alone)
      and correct it to match the live frontend origin
      (`https://fofafu-frontend.vercel.app`)
- [ ] CORS config no longer silently no-ops into an unreachable default when
      `FRONTEND_URL` is missing in a production-like environment — e.g. warn
      loudly (log) or fail fast at boot, so this class of bug is caught
      before a user hits it
- [ ] If Vercel preview-deployment URLs are expected to call this backend,
      the CORS origin check supports more than one fixed string (confirm
      with deploy setup whether that's actually required — otherwise leave
      single-origin and note it as intentional)
- [ ] Manual verification: a `POST` from the deployed frontend to a playdates
      endpoint (e.g. add an availability slot) succeeds with no CORS error
      in the browser console/network tab

## Out of scope

- The in-progress Render→Vercel/Supabase migration (tracked separately —
  see the untracked `supabase/` work and prior
  `migrate-render-to-vercel-supabase` effort). This fix targets CORS on the
  backend as currently deployed, not a hosting rearchitecture. backend-dev
  should note in `### Backend` if that migration changes which env var /
  host actually needs the fix.
- Any non-CORS playdates functionality — [[features/playdates]] is already
  `status: review` and unrelated to this bug.

## Open questions

- What is `FRONTEND_URL` set to right now on whatever currently hosts the
  backend? backend-dev needs to identify the deploy target and confirm the
  actual misconfiguration before proposing the code-level fix.
- Do Vercel preview deployments need API access, or is single-origin
  production-only CORS sufficient? Affects whether the fix is a one-line env
  correction or needs an origin-list/allowlist change in `index.ts`.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

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
