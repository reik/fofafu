---
name: design-tokens-and-components
description: Checklist for specing a UI component before it's built — anatomy, semantic design-token naming, and the full interaction-state list (default/hover/focus/disabled/loading/empty/error). Use when drafting a wireframe, proposing new design tokens, or reviewing whether a component spec is complete.
---

# Design tokens & component specs

Three distinct concerns, each in its own reference file — read the one relevant to what you're specing:

- `references/component-anatomy.md` — how to sketch and name a component's sub-parts before it's built.
- `references/token-naming.md` — semantic naming convention for new design tokens.
- `references/component-states.md` — the interaction-state checklist every component spec must cover.

## Scope discipline

Propose tokens and anatomy; don't implement them. If a proposed token conflicts with an existing one, flag the conflict rather than quietly renaming either.
