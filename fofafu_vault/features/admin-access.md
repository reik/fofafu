---
slug: admin-access
title: Admin Access
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-08-20
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Admin Access

## Problem

There is no admin capability in fofafu today. Every table (`families`, `announcements`, `comments`, `reactions`, `messages`, `availability_slots`, `playdate_requests`, `coach_events`) now lives in Supabase Postgres with RLS scoping every read/write to `auth.uid()` (see [[features/migrate-render-to-vercel-supabase]], [[features/supabase-rls-sensitive-columns]]), and there is no identity in the system that can see or fix another family's data. [[features/moderation-report-block]]'s own Problem statement names the gap directly — "the only available escape valves are leave the platform or ask an admin manually — both too heavy" — and its Out of scope explicitly defers "Admin moderation queue UI" because there's no admin to view it yet.

This feature is that admin: one trusted account (Rei) that can view and correct any user's data — profile, posts, comments, reactions, DMs, playdate data — for support and moderation purposes, without needing raw database access for every fix.

Scope decision from product: full edit access, including reading/editing private messages between other users. That is a real privacy line for a platform whose core data is about foster families and children, so this spec leans hard on RLS-level enforcement (not just application-code checks) and an append-only audit log of every admin action — see Acceptance criteria.

## Acceptance criteria

- [ ] A Postgres `is_admin()` SQL function (`SECURITY DEFINER`, matches the caller's `auth.uid()` against the hardcoded admin email `kurarei+5@gmail.com`) is the single source of truth for admin identity. No `role` column, no multi-admin support in v1 — this was an explicit product decision.
- [ ] Every RLS-enabled table (`families`, `announcements`, `comments`, `reactions`, `messages`, `availability_slots`, `playdate_requests`, `coach_events`) gets an additional `FOR ALL USING (is_admin()) WITH CHECK (is_admin())` policy, so the admin's own session token — not a service-role key — can read and write any row, including DMs in `messages` between two other users.
- [ ] A new `supabase/functions/admin/index.ts` Edge Function (same shape as the existing `message`/`family`/`playdates` functions: `supabaseForRequest`, `requireUserId`, segment-based routing per `supabase/functions/_shared/client.ts`) exposes admin CRUD across the tables above. Every route calls `rpc('is_admin')` and 403s before touching any data.
- [ ] Editing the identity-level fields Supabase itself owns (an arbitrary user's email, forcing a password reset, banning/deleting the account) goes through the Supabase Admin API (`supabase.auth.admin.*`), using a service-role client constructed only inside this function, only after the `is_admin()` check passes. The service-role key never reaches the frontend.
- [ ] Every admin mutation — table edits and `auth.admin.*` calls alike — writes one row to a new `admin_audit_log` table (`admin_user_id, action, target_type, target_id, before, after, created_at`) in the same request. No admin write path skips the audit log.
- [ ] `admin_audit_log` is itself RLS-protected: readable only via `is_admin()`, and no UPDATE/DELETE policy exists on it at all (append-only, matches this vault's own log convention).
- [ ] Frontend `/admin` route (React Query + `edgeRequest` against the new function — same convention as `messages.ts`/`playdates.ts`) with views for **Users** (families data + auth identity), **Content** (announcements/comments/reactions — edit/delete), and **Messages** (look up a conversation between two users, edit/delete individual messages, with an explicit "you are viewing a private conversation" banner given what this view grants).
- [ ] Non-admin sessions get a 403 from every `/admin/*` function route and cannot perform any admin action even if they reach the page directly by URL. The server-side `is_admin()` check is the actual security boundary; anything the frontend does to hide the nav link for non-admins is UX polish, not the gate.

## Out of scope

- Role column / multiple admins — single hardcoded admin only this pass (explicit product decision). If a second admin is ever needed, revisit `is_admin()` as a table-backed allowlist instead of an email literal.
- Admin "log in as" / impersonation of another user.
- A parallel Express `admin.controller.ts`. Express/Render is being decommissioned ([[features/migrate-render-to-vercel-supabase]]); this feature targets Supabase Edge Functions only, consistent with where every other live route has already moved.
- The moderation `reports` queue view — depends on [[features/moderation-report-block]]'s `reports` table, which doesn't exist yet (that feature is still `drafting`). Admin ships without a Reports tab; add one once that table lands.
- Rate limiting or anomaly alerting on admin actions (e.g. "admin touched 500 rows in a minute").

## Open questions

- ~~Which email should `is_admin()` match against?~~ **Resolved (2026-08-22), corrected (2026-08-23):** `kurarei+5@gmail.com` (user had mixed up which test account was which — previously recorded as `kurarei+8@gmail.com`). Not yet verified to exist as a registered Supabase Auth user in the live project — confirm (or sign it up) before the migration is written against a real user id, otherwise `is_admin()` matches zero rows and silently grants nobody access.
- ~~User deletion: hard delete (cascades via FK to a user's families/announcements/comments/messages/etc.) or soft delete/ban (`auth.admin.updateUserById(id, { ban_duration })`, or a `deleted_at` marker that keeps the data)? This changes the migration shape — needs a decision before backend-dev builds the DELETE routes.~~ **Resolved (2026-08-23):** Soft delete/ban via `auth.admin.updateUserById(id, { ban_duration })`. No hard DELETE route on `/admin/users/:id` in v1 — safer default for a platform with a legal/compliance surface (foster families, minors); reversible if an admin bans the wrong account.
- Should an admin-edited email address re-trigger Supabase's email verification flow, or is admin trusted to set a pre-verified address directly? **Assumption (undecided by product, not blocking):** admin is trusted; edits go through `auth.admin.updateUserById` with `email_confirm: true`, no re-verification email sent. Flagging as an assumption rather than a silent default — revisit if that's wrong.
- Does `coach_events` need full admin edit access, or should it stay read-only in the admin UI (it's aggregate-only metrics, no draft/rewrite text, per [[features/reply-coach-live]])? Proposing read-only unless there's a concrete reason to edit it.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
`supabase/migrations/20260823000000_admin_access.sql`: `is_admin()` SECURITY DEFINER function (auth.users email lookup, not the JWT claim — avoids a stale-claim gap); `FOR ALL USING(is_admin()) WITH CHECK(is_admin())` on families/announcements/comments/reactions/availability_slots/messages/playdate_requests; `coach_events` gets admin SELECT-only per this doc's own Open Questions default. `messages`/`playdate_requests` needed an extra fix beyond the literal ACs: both already had a column-level `REVOKE UPDATE ... GRANT UPDATE(<one column>)` from `20260711010000_auth_trigger_and_rls.sql`, which is role-wide and would have silently blocked the admin's own-session-token writes to any other column even with the new RLS policy in place. Fixed with a `BEFORE UPDATE` trigger per table that enforces the original non-admin column restriction for everyone except `is_admin()`. While auditing `playdate_requests`, found the existing non-admin `respondToRequest` path already writes `updated_at` alongside `status` — one column beyond what was ever granted, a latent pre-existing bug unrelated to this feature; not fixed as its own change, but incidentally resolved by the column grant this feature already needed to widen. `admin_audit_log` table: RLS readable only via `is_admin()`, no UPDATE/DELETE policy at all (append-only).

`supabase/functions/admin/index.ts`: same shape as message/family/playdates (`supabaseForRequest`, segment routing). Single `is_admin()` RPC gate before any routing — 401 unauthenticated, 403 non-admin/RPC-error. Routes: `users` (list/get/patch incl. optional email via Admin API/ban-unban/force-password-reset), `content/:table` (announcements/comments/reactions — list/edit(not reactions)/delete), `messages/:userA/:userB` (conversation)+`messages/:id` (edit/delete). Service-role client constructed only inside handlers that need Supabase's Admin API (email/ban/reset-password), only after the gate passes, via an injectable factory (`getServiceRoleClient`) defaulting to the real one — added purely so the highest-risk paths could be unit tested at all. Every mutation writes one `admin_audit_log` row in the same request; documented in code why this isn't a single DB transaction (two separate PostgREST calls) and why an audit-log failure surfaces as a loud 500 rather than a silent success.

Testing: no pgTAP/local-Postgres harness exists in this repo yet (no `supabase/tests/`, no committed `config.toml`) — attempted to stand one up for this feature (local stack on remapped ports, `supabase start`), but a fresh-database migration replay fails deterministically on `20260711010000_auth_trigger_and_rls.sql` (duplicate-policy error) regardless of pgdelta/volume state — a pre-existing gap unrelated to this feature (fails before reaching this migration at all). Flagging for a future infra ticket rather than fixing here. In its place: added `supabase/functions/deno.json` (scoped `nodeModulesDir`, doesn't touch the npm workspace) and `supabase/functions/admin/index.test.ts` — 12 Deno unit tests against a fake Supabase client + injectable fake service-role client, covering the auth/admin gate, every route's happy path, 400/404s, and the audit-log-failure-surfaces-500 behavior. `deno check` clean. The RLS policies and column-grant triggers themselves are reviewed manually only (see migration comments) — verify against a real/staging Supabase project before this ships.

### Frontend
`frontend/src/api/admin.ts` (Zod-validated wrappers for all 11 admin routes, mirrors `messages.ts`) + `hooks/useIsAdmin.ts` (`supabase.rpc('is_admin')` via React Query, UX-only — fails closed to `false` on any RPC error) + `pages/AdminPage/{AdminPage,UsersView,ContentView,MessagesView}.tsx` (tabbed: Users — list/ban/unban/force-password-reset; Content — announcements/comments editable, reactions delete-only; Messages — user-id-pair lookup with an explicit `role="alert"` "You are viewing a private conversation" banner, edit/delete per message). `/admin` wired into `App.tsx` inside `RequireAuth`; nav link in `Navbar.tsx` shown only when `useIsAdmin()` is true, and the page itself `<Navigate>`s a non-admin away — both UX polish, not the gate (that's server-side `is_admin()` on every route + RLS). Non-admin/unauthenticated behavior is covered by the Edge Function's own 401/403 gate tests, not re-derived client-side.

### Test plan
Backend: 147/147 (`npm run test:backend`, full suite incl. pre-existing features — unaffected). New: 12 Deno unit tests (`supabase/functions/admin/index.test.ts`) against a fake Supabase client + injectable fake service-role client — auth/admin gate (401/403, including an RPC-error case), every route's happy path, a 404-row-missing case, and the audit-log-insert-failure-surfaces-500 case (a mutation must never silently succeed with no trail). `deno check` clean.
Frontend: 139/139 (`npm run test:frontend`, 32/32 files, full suite incl. pre-existing pages — unaffected), `AdminPage.test.tsx` covering non-admin sees no admin content, the Users ban flow, Content edit+delete, and the Messages banner+edit+delete flow. `tsc --noEmit` clean both workspaces.
Note: while running the full suite, found backend was 100% failing on `better-sqlite3`'s native binding — caused by an earlier unscoped `deno check --node-modules-dir=auto` (run once, before `supabase/functions/deno.json` existed to scope it) restructuring the *root* `node_modules` into Deno's own npm-compat layout, which never runs npm's install/build scripts. Fixed with `rm -rf node_modules && npm ci` at the repo root; confirmed clean before reporting complete. Flagging in case any other worktree/session hit the same thing from a stray unscoped `deno check`/`deno test` at the repo root.
RLS policies and the column-grant triggers in the migration are **not** exercised by any of the above (no pgTAP/local-Postgres harness exists in this repo — see Backend section) — manual-review-only; verify against a real/staging Supabase project before this ships.

### E2E coverage
None added this pass. This feature is not backend-only, so per this file's own template a Playwright E2E would normally be expected — deferred rather than skipped silently: a real E2E needs either a seeded admin test account against a real/staging Supabase project or a fully-mocked Playwright run, and this pass already ran long. RTL+MSW page-level tests (see Test plan) cover the UI flows short of a real browser hitting a real backend.

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
