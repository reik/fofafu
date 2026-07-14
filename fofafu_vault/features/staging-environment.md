---
slug: staging-environment
title: Staging Environment
owner: engineering
collaborators: []
status: drafting
priority: P2
created: 2026-07-14
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Staging Environment

## Problem

Seeded/test data currently has no safe place to live — the frontend at fofafu-frontend.vercel.app talks to the production Supabase project, so any seeding or data-layer testing (see [[features/supabase-postgres-migration]] and the in-flight [[features/migrate-render-to-vercel-supabase]]) risks touching real user data. We need a fully isolated staging environment — separate Supabase project and separate Vercel deployment — so engineering can seed, migrate, and test the Postgres data layer without any path to production data or production traffic.

## Acceptance criteria

- [ ] A dedicated Supabase project exists for staging, provisioned independently of the production project (own URL, own service/anon keys, own secrets).
- [ ] A dedicated Vercel deployment/project exists for staging (e.g. `fofafu-frontend-staging.vercel.app`), configured with env vars pointing only at the staging Supabase project.
- [ ] Seeding scripts can be run against staging without any credential or config path that could reach production.
- [ ] Documented in engineering standards how to point local dev / CI at staging vs. production.

## Out of scope

- Automatic data sync or anonymized-prod-snapshot refresh into staging (future feature if needed).
- Staging environments for design/marketing previews (this is a data-layer/engineering need only).

## Open questions

- Who owns the Supabase billing/org for the new staging project?
- Should staging auto-deploy on every push to a `staging` branch, or be manually promoted?
- How does this relate to the "staging cutover" step already tracked under eng-infra-8 in [[features/migrate-render-to-vercel-supabase]]? May be the same piece of work — confirm at /dispatch time to avoid duplicate effort.

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
