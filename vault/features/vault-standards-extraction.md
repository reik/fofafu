---
slug: vault-standards-extraction
title: Vault standards extraction
owner: engineering
collaborators: []
status: shipped
priority: P1
created: 2026-06-12
target: 2026-06-12
links:
  kanban: "[[kanban/company]]"
  designs: null
  pr: https://github.com/reik/fofafu/pull/4
  commit: 9451478
---

# Vault standards extraction

## Problem

`vault/teams/<team>.md` was acting as two artifacts in one file: the team's **charter** (mandate, sanity sweep, escalation — how the team operates) and the team's **standards** (tokens, stack, positioning — the canon every IC consults). The two had different audiences but lived in the same file, so the source of truth was ambiguous.

This worked for a solo collaborator but blocked the obvious "where is the design system?" question for anyone else. The token table was buried inside `vault/teams/design.md`, the stack was buried inside `vault/teams/engineering.md`, and the SEO defaults were buried inside `vault/teams/marketing.md` — all places ICs from other teams wouldn't think to look.

Surfaced during an interview-prep walkthrough of the vault structure; the question "should `vault/kanban/design.md` be in `.claude/`?" exposed the deeper "tool config vs project artifact" boundary, which in turn made the charter/standards conflation visible.

## Acceptance criteria

- [x] New `vault/standards/` directory holds three files: `design-system.md`, `engineering-standards.md`, `marketing-standards.md`.
- [x] `standards/design-system.md` owns tokens (color/type/space/radius/shadow), Voice & Tone, Figma Marketing System reference.
- [x] `standards/engineering-standards.md` owns Stack table + Conventions.
- [x] `standards/marketing-standards.md` owns Positioning, Voice, SEO defaults.
- [x] `vault/teams/<team>.md` files contain ONLY: mandate, sanity sweep, escalation, team-lead playbook. No tokens, no stack, no positioning.
- [x] Each charter has a one-line pointer to its companion standards file at the top.
- [x] Each standards file has an Ownership section naming who can write to it.
- [x] All cross-references in feature files, plans, agents, CLAUDE.md, and vault/README.md repoint at the new paths.
- [x] Dispatch protocol team-lead loop is updated to read both charter and standards file.
- [x] Log entry appended to `vault/log/2026-06-12.md`.
- [x] Wikilink basenames stay distinct across `teams/` and `standards/` so Obsidian resolves cleanly.

## Out of scope

- Unifying design Voice & Tone with marketing Voice (they overlap but have different audiences: in-product microcopy vs. public launch copy). Flagged in `standards/marketing-standards.md` with an explicit cross-reference; full unification is a future feature.
- Migrating any code (e.g. Tailwind config) to read tokens directly from `standards/design-system.md`. Frontend port is Phase 3.
- Renaming `vault/teams/` to `vault/charters/` for clarity. Considered, rejected — too much churn for a naming improvement.

## Open questions

- Should the dispatcher auto-inject the standards file into the team-lead's read list, or rely on the charter's one-line pointer? Current implementation relies on the pointer.
- Should ICs (not just leads) read the charter? Right now only leads do. Tokens-in-standards means frontend-dev no longer has a reason to read `teams/design.md`, which simplifies the IC's first-read list.

## Before / After

### Before — `vault/teams/design.md` (99 lines, one file)

```
# Design — Team Charter
## Mandate
## Fofafu Design System          ← shared spec mixed in
  ### Tokens — Color (10 rows)
  ### Tokens — Type
  ### Tokens — Space
  ### Tokens — Radius
  ### Tokens — Shadow
## Voice & Tone                  ← shared spec mixed in
## Sanity sweep
## Escalation
## Reference: Figma Marketing System  ← shared spec mixed in
```

### After — split into two files

```
vault/teams/design.md (32 lines)        vault/standards/design-system.md (110 lines)
─────────────────────────────────       ──────────────────────────────────────
# Design — Team Charter                  # Fofafu Design System
                                         (pointer at top: "see charter")
## Mandate                               ## Tokens — Color
## Sanity sweep                          ## Tokens — Type
## Escalation                            ## Tokens — Space
                                         ## Tokens — Radius
(pointer at top:                         ## Tokens — Shadow
 "see standards/design-system")          ## Voice & Tone
                                         ## Reference: Figma Marketing System
                                         ## Ownership
```

Same split applied to `engineering.md` (Stack + Conventions extracted) and `marketing.md` (Positioning + Voice + SEO defaults extracted).

### Effect on cross-references

| Before                                    | After                                              |
|---|---|
| `vault/teams/design.md` (token canon)     | `vault/standards/design-system.md`                 |
| `vault/teams/design.md` (Voice & Tone)    | `vault/standards/design-system.md` § Voice & Tone  |
| `vault/teams/design.md` (Figma reference) | `vault/standards/design-system.md` § Reference     |
| `vault/teams/design.md` (charter)         | `vault/teams/design.md` (unchanged path)           |

31 new pointers to `vault/standards/` distributed across:
- 5 feature files
- `vault/plans/PHASE_2.md`
- `vault/protocols/dispatch.md`
- 8 agent definitions in `.claude/agents/`
- `CLAUDE.md`, `vault/README.md`

## Decisions

- **`standards/` not `specs/` or `system/`.** "Standards" reads as "what we agree to follow," which matches how ICs use these files. "Specs" implied feature specs (which already live in `vault/features/`). "System" was ambiguous with the agent system.
- **One file per team, not a tree.** Considered `standards/design-system/tokens.md`, `voice.md`, `principles.md`. Rejected — three sub-files per team is six new files for marginal locality benefit. Section anchors within one file are enough for now.
- **Distinct basenames across `teams/` and `standards/`.** Used `design-system.md` (not `design.md`) in `standards/` so Obsidian wikilink resolution stays unambiguous. Same for `engineering-standards.md` and `marketing-standards.md`.
- **Charter keeps a pointer to the standards file at the top.** Two-way wayfinding — readers landing on either file can find the other.
- **Voice lives in both files.** `design-system.md` voice is for in-product microcopy (ux-writer's job); `marketing-standards.md` voice is for launch copy (content-writer's job). They overlap but the audience differs. Unifying them is a follow-up.

## Shipping notes

- **Branch**: `vault/standards-extraction`
- **Commit**: [`9451478`](https://github.com/reik/fofafu/commit/9451478) — `vault: extract shared standards from team charters` (24 files, +231/−160)
- **PR**: [#4](https://github.com/reik/fofafu/pull/4) — open against `master`
- **Verification**: `grep -rn "§ Fofafu Design System"` returns no orphan refs; `grep -rn "vault/standards/"` returns 31 intentional pointers; all `vault/teams/<team>.md` refs are now annotated `(charter)` or `(charter: mandate, sanity sweep, escalation)`.

## Engineering — Acceptance

### Backend
*N/A — vault-only refactor; no backend code touched.*

### Frontend
*N/A — vault-only refactor; no frontend code touched.*

### Test plan
*N/A — vault-only refactor. Manual verification:*
- [x] `grep -rn "§ Fofafu Design System" vault/features/ vault/plans/ .claude/agents/` returns empty.
- [x] All `vault/teams/<team>.md` cross-references annotated as charter usage.
- [x] Dispatch protocol team-lead loop has correctly renumbered steps after `vault/standards/<team-spec>.md` insertion.
- [x] Wikilinks `[[standards/design-system]]`, `[[standards/engineering-standards]]`, `[[standards/marketing-standards]]` resolve in Obsidian.

### Code review
*N/A — vault-only refactor reviewed inline before commit; no code-reviewer agent dispatched.*
