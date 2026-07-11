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

- Exact route/controller inventory to map 1:1 to Edge Functions (backend-dev to enumerate at speccing time)
- Whether Supabase Auth replaces custom auth entirely or custom auth is reimplemented as an Edge Function

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
