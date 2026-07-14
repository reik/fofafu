---
slug: supabase-rls-sensitive-columns
title: Supabase RLS Sensitive Columns
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P0                  # P0 | P1 | P2
created: 2026-07-14
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Supabase RLS Sensitive Columns

## Problem

Supabase Security Advisor flagged `sensitive_columns_exposed`: a table with columns that likely contain sensitive data (e.g. passwords, personal identifiers) is reachable through the PostgREST API with no access restrictions. Any anon/API caller can currently read this data. Foster families' PII must not be publicly queryable — this is a P0 data-exposure risk, not a feature request.

## Acceptance criteria

- [ ] Identify the specific table(s)/column(s) the Supabase Security Advisor flagged (run the advisor/linter against the linked project `rlizubjugevyxsfzmpny`, or query `pg_tables` for tables with RLS disabled).
- [ ] Row Level Security (RLS) is enabled on the flagged table(s).
- [ ] Explicit RLS policies restrict SELECT (and other verbs as needed) to the intended audience — never a blanket `USING (true)` for sensitive columns.
- [ ] Any password/secret columns are excluded from the anon/authenticated API surface entirely (not just RLS-gated) — e.g. via a view that omits them, or column-level privileges.
- [ ] Migration is captured in `supabase/migrations/` so it's reproducible, not just applied ad hoc in the dashboard.
- [ ] Re-run Supabase Security Advisor and confirm `sensitive_columns_exposed` no longer fires.

## Out of scope

- Broader RLS policy design for tables unrelated to this advisory.
- Rotating any credentials that may have already been exposed (separate incident-response decision — flag to the user, don't do unilaterally).

## Open questions

- Which table did the advisor actually flag? (Not stated in the raw finding — needs to be looked up in the Supabase dashboard/advisor output before backend-dev can write the migration.)
- Was this table's data actually accessed by an unauthorized party while exposed, or is this a preventive fix? Determines whether this also needs an incident write-up.

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
