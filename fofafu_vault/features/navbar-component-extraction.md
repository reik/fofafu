---
slug: navbar-component-extraction
title: Navbar Component Extraction
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

# Navbar Component Extraction

## Problem

[[features/header-nav-redesign]]'s code review (must-fix #2) found `Navbar()` in `frontend/src/components/Navbar.tsx` is one ~238-line function — well over the 40-line function-length standard. ui-designer's `### Visual` subsection on that feature already named the intended component boundaries (`NavTrack`, `NavTrackItem`, `AccountChip`, `Avatar`) that were never actually extracted into real components; the redesign shipped as-is because re-opening `building` for a pure refactor on a branch that had already thrashed twice (tooltip mechanism, then firstName/full-name) carried real regression risk for zero user-facing benefit — tech-lead judged it a non-blocking fast-follow rather than a blocker. This ticket is that fast-follow.

## Acceptance criteria

- [ ] `NavTrackItem` extracted as its own component (icon, tooltip, active-puck state, badge)
- [ ] `AccountChip` extracted as its own component (avatar, name, disclosure trigger + panel)
- [ ] `Navbar()` itself drops under 40 lines
- [ ] No behavior change — existing frontend test suite passes unmodified, or tests are only moved/adjusted for the new file boundaries, not rewritten for new behavior
- [ ] `tsc` and the full frontend suite stay green

## Out of scope

- Any visual or behavioral change — this is a pure refactor
- The mobile `<nav aria-label="Mobile navigation">` block — untouched by header-nav-redesign, not in scope here either

## Open questions

- None currently.

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
