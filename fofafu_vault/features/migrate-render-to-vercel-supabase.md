---
slug: migrate-render-to-vercel-supabase
title: Migrate Render To Vercel Supabase
owner: engineering
collaborators: []
status: drafting
priority: P1
created: 2026-07-11
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Migrate Render To Vercel Supabase

## Problem

Production currently runs on Render: Express + better-sqlite3 backend, static frontend, local-disk file uploads. This is a single-vendor lock-in with no managed Postgres, no object storage, and sqlite doesn't scale past one instance. We're moving to Vercel (frontend hosting) + Supabase (Postgres, Storage, Auth, Edge Functions for backend compute), eliminating Render entirely.

## Acceptance criteria

- [ ] Postgres schema on Supabase mirrors current sqlite schema (translated, not copied verbatim)
- [ ] All current Express routes ported to Supabase Edge Functions with equivalent behavior
- [ ] File uploads (`backend/uploads`) migrated to Supabase Storage with signed URLs
- [ ] Auth flow migrated to Supabase Auth (or equivalent Edge Function auth); existing users forced through password reset (no hash migration)
- [ ] Frontend deployed on Vercel, pointed at Supabase Edge Functions / client SDK
- [ ] Existing production data migrated from sqlite to Supabase Postgres
- [ ] Full test suite (unit + E2E) passes against the new stack
- [ ] Render service decommissioned after cutover

## Out of scope

- Mobile (Phase 4, still dormant)
- Any new product features — this is a pure infra migration, behavior must stay equivalent

## Open questions

- RLS policies for the tables in `supabase/migrations/20260711000000_initial_schema.sql` are deferred to eng-infra-4/5/6 (auth pattern must be settled first); tables are RLS-enabled with zero policies in the meantime, so no anon/authenticated access until then

## Sub-tickets (kanban/engineering.md)

- eng-infra-1 — parent ticket, closes when all below are Done and Render is decommissioned
- eng-infra-2 — schema translation (sqlite → Postgres DDL): families, users, announcements, comments, reactions, messages, playdates, coach_events
- eng-infra-3 — data migration script (sqlite → Supabase Postgres, row-count + FK verification)
- eng-infra-4 — auth: auth.controller.ts/auth.routes.ts → Supabase Auth, forced password reset for existing users
- eng-infra-5 — Edge Functions batch 1: announcement, community, family, search
- eng-infra-6 — Edge Functions batch 2: message, playdates, coach (keep MockClaudeClient/LiveClaudeClient seam)
- eng-infra-7 — uploads: local disk → Supabase Storage + signed URLs; update ImagePicker/Avatar consumers
- eng-infra-8 — Vercel deploy + staging cutover + full test suite green + Render decommission

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
eng-infra-2 done: `supabase/migrations/20260711000000_initial_schema.sql` translates all 8 sqlite tables from `backend/src/migrate.ts` to Postgres. Deltas: `users` table dropped (folds into `auth.users` — Supabase Auth owns credentials/verification, closes eng-infra-4's open question); `email_tokens`/`password_reset_tokens` dropped (Supabase Auth owns these flows); TEXT ids → uuid; INTEGER booleans → boolean; TEXT timestamps → timestamptz; RLS enabled on all 8 tables with no policies yet (locked down pending eng-infra-4/5/6). Remaining eng-infra-2 work: none — ticket ready to move to Review once a live Supabase project exists to apply the migration against.

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
