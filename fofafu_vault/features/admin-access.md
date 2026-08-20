---
slug: admin-access
title: Admin Access
owner: engineering
collaborators: []
status: drafting
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

- [ ] A Postgres `is_admin()` SQL function (`SECURITY DEFINER`, matches the caller's `auth.uid()` against one hardcoded admin email) is the single source of truth for admin identity. No `role` column, no multi-admin support in v1 — this was an explicit product decision.
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

- User deletion: hard delete (cascades via FK to a user's families/announcements/comments/messages/etc.) or soft delete/ban (`auth.admin.updateUserById(id, { ban_duration })`, or a `deleted_at` marker that keeps the data)? This changes the migration shape — needs a decision before backend-dev builds the DELETE routes.
- Should an admin-edited email address re-trigger Supabase's email verification flow, or is admin trusted to set a pre-verified address directly?
- Does `coach_events` need full admin edit access, or should it stay read-only in the admin UI (it's aggregate-only metrics, no draft/rewrite text, per [[features/reply-coach-live]])? Proposing read-only unless there's a concrete reason to edit it.

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
