---
slug: seed-prod-sample-data
title: Seed Prod Sample Data
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-07-10
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Seed Prod Sample Data

## Problem

New visitors landing on prod today see an empty feed and no family profiles — the site looks dead rather than in-progress, which hurts first impressions during demos and early signups. We need a small set of realistic, clearly-labeled sample families and posts seeded into production so the community feed and search feel populated before real foster families sign up.

Note: `backend/scripts/seed-dummy.ts` already exists but is scoped to local/e2e testing (`@dummy.test` emails, shared plaintext password `password123`, wired into `e2e:setup`). It is not safe to run as-is against prod — this feature is about producing a production-safe variant (or safe execution path), not reusing the test script directly.

## Acceptance criteria

- [ ] Sample families/posts appear in prod feed, profiles, and search so the site doesn't look empty on first visit
- [ ] Sample accounts are clearly distinguishable from real users (e.g. a `is_sample` flag or naming/badge convention) and cannot be logged into by the public (no shared/guessable password reused from the test script)
- [ ] Seeding is idempotent — safe to re-run without duplicating data
- [ ] Clear path to remove/replace sample data once real families onboard

## Out of scope

- Reusing `seed-dummy.ts`'s test credentials or `@dummy.test` emails as-is
- Seeding realistic user-generated images/media beyond placeholder assets

## Open questions

- Who owns pruning sample data once real signups pick up — manual or automated?
- Should sample posts be excluded from analytics/growth metrics?

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
