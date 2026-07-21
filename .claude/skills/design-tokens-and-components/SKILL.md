---
name: design-tokens-and-components
description: Checklist for specing a UI component before it's built — anatomy, semantic design-token naming, and the full interaction-state list (default/hover/focus/disabled/loading/empty/error). Use when drafting a wireframe, proposing new design tokens, or reviewing whether a component spec is complete.
---

# Design tokens & component specs

## Component anatomy

Sketch the components needed (ASCII or a markdown-table sketch is fine) before anyone builds them. Name each sub-part explicitly enough that a developer doesn't have to guess (e.g. "Card > Avatar + Name + Timestamp + ReactionBar").

## Token naming

Use semantic names, not literal ones:

- `color.surface.warm` — not `color.beige.300`
- `text.lead` — not `font-size-18`

New tokens require a one-line rationale (why the existing palette/scale doesn't cover this case). Don't introduce a new font — argue for a pairing within the existing type system instead.

## State checklist

Every interactive or data-driven component needs one line per state:

- default
- hover
- focus
- disabled
- loading
- empty
- error

A component spec that's silent on any of these is incomplete — call it out rather than letting the builder guess.

## Scope discipline

Propose tokens and anatomy; don't implement them. If a proposed token conflicts with an existing one, flag the conflict rather than quietly renaming either.
