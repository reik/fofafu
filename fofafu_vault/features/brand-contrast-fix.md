---
slug: brand-contrast-fix
title: Brand-primary contrast fix
owner: design
collaborators: [engineering]
status: drafting
priority: P2
created: 2026-06-11
target: null
links:
  kanban: "[[kanban/design]]"
  designs: null
  parent: "[[features/reply-coach]]"
---

# Brand-primary contrast fix

## Problem

`color.brand.primary` is `#4D9463`. White text on that surface lands at **~3.4:1 contrast** — passes WCAG 2.2 AA 1.4.11 (UI component ≥3:1) but **fails 1.4.3 Contrast (Minimum)** for normal text (≥4.5:1). Surfaced by `ui-designer` during the `reply-coach` dispatch (see `fofafu_vault/features/reply-coach.md` `### Visual` "Flagged gaps" §2) and ratified by design-lead as out of scope for that feature because it's a system-wide brand-token concern, not a chip-specific gap.

Every shipped CTA pill that uses white text on the brand surface inherits this failure. The fix needs a system-wide pass, not a one-off chip patch.

Success = the brand token canon offers a darker variant for white-text contexts; every white-on-brand CTA across the codebase is migrated; an axe sweep on the affected pages reports zero 1.4.3 failures.

## Acceptance criteria

- [ ] Introduce `color.brand.primary.pressed` (proposed value `~#3F7E54`) in `fofafu_vault/standards/design-system.md` token canon. Verify white-on-pressed lands ≥ 4.5:1 against the computed contrast.
- [ ] Decide which token white text is composed against: the pressed token (recommended — keeps `primary` as the "rest" hue and `pressed` doubles as hover + accessible white-text surface), or darken `primary` itself (cross-cutting blast radius, but simpler tokenization). Document the call in `### Visual`.
- [ ] Frontend migration: every CTA pill currently rendering `color: white` on `bg: color.brand.primary` switches to the chosen accessible-pair. Audit via grep + a frontend run-through.
- [ ] Hover state across all migrated CTAs uses the same `pressed` token so the visual hierarchy stays coherent.
- [ ] Axe sweep (per the project's existing a11y harness — see `fofafu_vault/features/a11y-audit.md`) reports zero 1.4.3 failures across the 11 audited pages after migration.
- [ ] No regression in `ReplyCoach` chip's `CoachChip.Use this` pill once Phase 3 frontend port lands — it inherits the new token.

## Out of scope

- Other brand tokens (`color.brand.secondary`, etc.) — flagged for a follow-up audit if any present similar gaps.
- Dark-mode tokens — out of scope until the design system grows a dark mode.
- Logo / icon contrast outside of CTA pills.

## Open questions

- Pick the exact pressed hue. `#3F7E54` is the ui-designer's proposal — needs a contrast-checker pass (e.g. `npx @adobe/leonardo-contrast-colors` or manual against the WCAG formula).
- Should the rest state also shift slightly (`#479058`?) to preserve the visual jump from rest → pressed? Or is pressed-as-hover sufficient?
- Do we need a `color.brand.primary.surface` (lighter) for tinted backgrounds, or is that a separate concern?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(N/A — frontend/design only)*

### Frontend
*(filled by frontend-dev — the migration sweep across every `bg-brand-primary text-white` site)*

### Test plan
*(filled by qa-engineer — axe sweep + manual screenshot diff of every migrated CTA)*

### Code review
*(filled by code-reviewer; populated during building → review)*

## Design — Spec

### Visual
*(filled by ui-designer — final token values + audit of every shipped CTA against the new pair)*

### Microcopy
*(N/A — no copy changes)*

### Accessibility
*(filled by a11y-auditor — verifies 1.4.3 + 1.4.11 against every migrated pair)*

## Marketing — Spec

### Launch copy
*(N/A — internal fix)*

### SEO
*(N/A)*

### Growth
*(N/A)*
