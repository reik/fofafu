---
spec: design-system
owner: design-lead
read_by: [ui-designer, ux-writer, a11y-auditor, frontend-dev, content-writer]
---

# Fofafu Design System

The shared design spec. Tokens, voice, and the north-star principles every team references when they touch UI, microcopy, or launch copy. Owned by the design-lead; read by anyone who renders or writes for the product surface.

*(This file is the team's source of truth for tokens. Update it when tokens change. The Figma reference below is canon for principles only.)*

## Tokens — Color

| Semantic name | Value (proposed) | Use |
|---|---|---|
| `color.surface.warm` | `#FFFBF5` | page background |
| `color.surface.card` | `#FFFFFF` | card background |
| `color.surface.subtle` | `#F4ECDF` | low-contrast hover/active fill for text-on-surface pills (e.g. `Edit` / `Keep mine` in chip action rows). A muted derivative of `color.surface.warm`. Introduced 2026-06-10 by design-lead for the reply-coach `CoachChip`; reusable wherever a chip needs a soft pill. |
| `color.ink.lead` | `#1F1B18` | primary text |
| `color.ink.muted` | `#5E534B` | secondary text (use sparingly — weight, not gray) |
| `color.brand.primary` | `#4D9463` | primary CTA pill |
| `color.brand.warm` | `#F0B24F` | accent (used in blocks, not text) |
| `color.feedback.success` | `#3F8A52` | toasts |
| `color.feedback.warning` | `#D27A2A` | toasts |
| `color.feedback.error` | `#B83B3B` | toasts |

*(These are starting values inherited from the old fofa palette. Adjust as the system stabilizes.)*

### Playdates additions (promoted 2026-07-02, design-lead)

Proposed by ui-designer in `[[features/playdates]]` ### Visual, adjusted per a11y-auditor's blocking contrast findings before promotion. All are derivations of existing hues — no new hue families.

| Semantic name | Value | Use | Notes |
|---|---|---|---|
| `color.slot.free` | = `color.brand.primary` (`#4D9463`) | free-slot fill (`SlotCell`/`SlotChip`) | Fg/glyph must be `color.ink.lead`, **not white** — white text fails AA (3.66:1); `ink.lead` passes at 4.67:1. |
| `color.slot.busy` | bg `#E4D9C8` / fg `color.ink.muted` | busy-slot fill, own-calendar only | Passes AA (5.35:1). |
| `color.slot.match` | bg `#F0B24F` (= `color.brand.warm`) / fg `color.ink.lead`, `2px` ring @60% | matching-availability slot + `MatchBanner` | Passes AA/AAA (9.10:1). |
| `color.request.pending` | bg `#FBF1DC` / fg `#8A5D1F` | pending `RequestStatusBadge` | Darkened from ui-designer's original `#A8732A` (3.63:1, failed AA at badge's 0.72rem size) per a11y-auditor's recommended target — clears 4.5:1. |
| `color.request.accepted` | bg `#E3EFE7` / fg `#2F6B41` | accepted `RequestStatusBadge` | Passes AA (5.38:1). |
| `color.request.declined` | bg `#F6E2E2` / fg `#8C2E2E` | declined `RequestStatusBadge` | Passes AA (6.63:1). |
| `color.neutral.100` | `#EDE3D4` | cosmetic-only hairlines/dividers (card outlines, non-structural) | Warm-neutral family, resolves the "Open item for design-lead" flagged in `[[features/playdates]]` — formalized as `neutral.*` rather than a one-off `border.subtle` name. |
| `color.neutral.200` | `#C9B896` | structural borders needing ≥3:1 against white/card (calendar grid lines, day-column dividers) | Darkened from ui-designer's original `color.border.subtle` (`#EDE3D4`, 1.27:1, failed WCAG 1.4.11) per a11y-auditor's recommended target. Required wherever the border itself carries structural meaning (e.g. the playdates calendar grid). |

## Tokens — Type

- **Body**: Nunito 400 / 500 / 700 (carried from fofa).
- **Display / headings**: Inter or system-ui at 320–540 weight increments (Figma-style weight-not-size hierarchy). Pick one and commit.
- **Eyebrow / mono**: JetBrains Mono 400 for kicker labels only.

## Tokens — Space

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96` px. No half-units. No magic numbers.

## Tokens — Radius

`4 / 8 / 16 / 9999` (pill).

## Tokens — Shadow

- `shadow.lift`: `0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)` (light, never heavy).
- No `shadow.heavy` — we use color blocks for depth, not drop shadows.

## Voice & Tone

- Plural "we" as platform; never "I".
- Active voice, short sentences.
- Warm not saccharine; never patronising.
- No exclamation marks except in CTAs.
- No emoji unless the feature file requests them.

## Reference: Figma Marketing System

*(North-star reference; not a copy source. Treat the principles, not the palette, as canon.)*

**Visual principles**

1. **Weight, not size, carries hierarchy.** Display text is variable-weight 320–540 at similar sizes — emphasis is the weight axis, not the type-scale axis.
2. **Color is depth.** Oversized pastel blocks define sections; chrome stays monochrome. The eye reads sections by color, not by rule lines.
3. **Pill-only CTAs.** Every actionable surface is a pill. No outline buttons that look like inputs.
4. **Mono = taxonomy.** Mono type appears only on small eyebrow labels and category chips — never on body or display.
5. **Generous whitespace.** Sections breathe. The ratio of text-block to padding is roughly 1:1 vertically.
6. **Shadow-light.** Depth is delivered by color blocks, not heavy drop shadows.

**Adoption notes for fofafu**

- Palette: replace Figma's editorial cool palette with foster-family warm (cream, sage, gold).
- Type: keep weight-not-size principle; pair Nunito (existing fofa brand) with a single display sans at variable weights.
- Mono: JetBrains Mono only for kickers — never body.
- CTAs: pill, brand-primary fill, white text. No outline variant.
- Cards: subtle radius, single shadow.lift token, no inner borders.

The reference is the *bar*, not the spec. Diverge with intent, document the divergence in `## Tokens` above.

## Ownership

- Token additions, value changes, and new sections go through the design-lead.
- ui-designer proposes new tokens in their `### Visual` subsection of a feature file; design-lead promotes them into this file on dispatch close.
- ux-writer references the Voice & Tone section but does not edit it.
- frontend-dev consumes tokens; never picks palette.
- a11y-auditor flags contrast failures against this canon; fixes land here, not in component code.
