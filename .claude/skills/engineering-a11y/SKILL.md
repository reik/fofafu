---
name: engineering-a11y
description: WCAG 2.2 AA audit checklist — contrast, keyboard, semantics, screen-reader — plus a blocking/non-blocking severity rule. Use when auditing a spec or built page for accessibility before it ships.
---

# Accessibility audit checklist

Audit across four categories:

- **Contrast** — every color pair used for text/interactive elements, with WCAG ratio and pass/fail verdict at AA (and AAA where relevant).
- **Keyboard** — focus order, escape hatches from any modal/overlay, tab traps to avoid.
- **Semantics** — which elements need ARIA roles or live regions (and which don't — don't over-ARIA elements with sufficient native semantics).
- **Screen-reader** — any accessible name that isn't obvious from visible text (icon-only buttons, decorative-vs-meaningful images).

## Severity rule

"Blocking" = a WCAG AA failure affecting a non-trivial fraction of users. Anything narrower is non-blocking but still worth recording.

## Scope discipline

Flag issues; don't fix visual/design choices yourself if that's a separate role's territory (e.g. a failing color pair is a design-token problem, not something to patch locally).

Note: check against `axe-core` (or equivalent automated tool) once the page is actually built — the manual checklist above covers spec-time review; automated scanning catches what manual review misses at build time.
