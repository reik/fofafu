---
slug: auth-user-name-semantics
title: Auth User Name Semantics
owner: engineering
collaborators: []
status: drafting
priority: P2
created: 2026-08-22
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Auth User Name Semantics

## Problem

[[features/header-nav-redesign]] made a pre-existing ambiguity newly visible: `AuthUser.name` (and by extension `user.name` everywhere in the frontend) is populated with household/family-style display names ("The Anderson Family", "The Brooks Family", ...) rather than a person's given name. This was silently fine while `user.name` was always rendered in full; the redesign's new avatar+name chip was speced assuming a personal first name existed (`firstName(user.name)`), which broke visibly (the chip read "The" for every account) until reverted to show the full name instead. Three specialists (frontend-dev, qa-engineer, e2e-test-writer) independently flagged this as a real product/data-model question during that feature's build, not just a one-off bug.

## Acceptance criteria

- [ ] A product decision is made and documented: is `AuthUser.name` meant to be a household name, a person's name, or does the schema need a separate field for each?
- [ ] If a schema/data change is warranted, a migration + DTO update ships
- [ ] Every frontend surface that currently assumes `user.name` is a person's first name (search for `firstName(` / similar first-token-extraction helpers) is audited against the decision

## Out of scope

- Re-touching `frontend/src/components/Navbar.tsx`'s current behavior (already fixed to show the full name) unless the product decision above requires a further change there too

## Open questions

- Is this actually worth a schema change, or should the product simply commit to "household name, always shown in full" as the intended behavior, and this ticket just documents that decision? (product/dispatcher call)

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
