---
spec: design-system
owner: design-lead
read_by: [ui-designer, ux-writer, a11y-auditor, frontend-dev, content-writer]
---

# Fofafu Design System

The shared design spec. Tokens, voice, and the north-star principles every team references when they touch UI, microcopy, or launch copy. Owned by the [[agents/design-lead]]; read by [[agents/ui-designer]], [[agents/ux-writer]], [[agents/a11y-auditor]], [[agents/frontend-dev]], and [[agents/content-writer]].

*(This file is the team's source of truth for tokens. Update it when tokens change. The Figma reference below is canon for principles only.)*

## Tokens — Color

| Semantic name | Value (proposed) | Use |
|---|---|---|
| `color.surface.warm` | `#FFFBF5` | page background |
| `color.surface.card` | `#FFFFFF` | card background |
| `color.surface.subtle` | `#F4ECDF` | low-contrast hover/active fill for text-on-surface pills (e.g. `Edit` / `Keep mine` in chip action rows). A muted derivative of `color.surface.warm`. Introduced 2026-06-10 by [[agents/design-lead]] for the [[features/reply-coach]] `CoachChip`; reusable wherever a chip needs a soft pill. |
| `color.ink.lead` | `#1F1B18` | primary text |
| `color.ink.muted` | `#5E534B` | secondary text (use sparingly — weight, not gray) |
| `color.brand.primary` | `#4D9463` | primary CTA pill fill for non-text-bearing contexts (borders, icon fills, focus rings, active nav text, calendar-free swatches). White text against this fails 1.4.3 (~3.26:1) — do not compose white text on this token. |
| `color.brand.primary.pressed` | `#3F7E54` | Accessible white-text pair for CTA pills, and doubles as the hover/press fill (rest + hover use the same value — see acceptance criteria). Contrast vs white `#FFFFFF` = **4.86:1** (WCAG relative-luminance formula), passes 1.4.3 (≥4.5:1 normal text) and 1.4.11 (≥3:1). Introduced 2026-07-08 by [[agents/ui-designer]] for [[features/brand-contrast-fix]] — see that feature's `### Visual` for full audit + rationale (pressed-as-text-pair chosen over darkening `primary` itself, to avoid rippling into non-CTA `primary` usages that already pass their own thresholds). |
| `color.brand.warm` | `#F0B24F` | accent (used in blocks, not text) |
| `color.feedback.success` | `#3F8A52` | toasts |
| `color.feedback.warning` | `#D27A2A` | toasts |
| `color.feedback.error` | `#B83B3B` | toasts |

*(These are starting values inherited from the old fofa palette. Adjust as the system stabilizes.)*

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

## Tokens — Size

| Semantic name | Value | Use |
|---|---|---|
| `size.hitTarget.min` | `44px` | Minimum interactive hit-target for icon-only controls, independent of the visible glyph size (e.g. a 20px icon inside a 44px circular button). A different axis from the `space` scale above, which governs gaps/padding between elements, not a control's own dimensions. Introduced 2026-08-21 by [[agents/design-lead]] for [[features/header-nav-redesign]]'s `NavTrackItem` / Pill Track pattern; reusable wherever an icon-only actionable control needs a documented floor. Verified against the shipped `Navbar.tsx` (`h-11 w-11` = 44×44). |

*(WCAG 2.2 SC 2.5.8 Target Size Minimum only requires 24×24 CSS px at AA — this codebase already clears that regardless. `44px` is this system's own best-practice floor, matching common platform guidance (Apple HIG / Material), not a legal minimum.)*

## Patterns

Reusable compositions of the tokens above, ratified once a real (or clearly anticipated repeat) use case exists. Each entry: name, definition, first-use link.

### Pill Track

Extends principle #3 ("Pill-only CTAs," see Reference below) from single standalone buttons to a cluster of related chrome-level actions sharing one pill.

> **Pill Track.** When 2+ mutually-exclusive icon-only actions live together in persistent chrome, group them in one pill container (`radius.9999`, `color.surface.warm` fill, tight internal padding) instead of giving each its own floating pill. Each item is its own circular pill sized to the accessibility hit-target minimum (`size.hitTarget.min`, 44px), and exactly one may carry the "puck" treatment — solid `color.brand.primary` fill, white icon — for whichever item is current/selected. No new color tokens required.

**Implementation note** (design-lead, verified against shipped code): if the puck's white icon is composed via a shared `text-*` color utility rather than an icon-specific color prop — as this repo's Tailwind setup does, since icons inherit `currentColor` — the repo-wide `brand-contrast.test.ts` same-line regex guard will flag `bg-brand-primary` + `text-white` on sight, regardless of icon-vs-text distinction. Use `color.brand.primary.pressed` for the puck fill in that case. Compliant either way: plain `brand.primary` already clears 1.4.11's 3:1 floor for icon-only (non-text) fills, and `.pressed` clears the stricter 1.4.3 4.5:1 floor too, so it's a safe superset, not a new color decision. [[features/header-nav-redesign]]'s `Navbar` ships with `.pressed` for exactly this reason.

**Exception, scoped to this pattern only:** the internal gap between items may be `2px`, below the space scale's smallest value (`4`). Deliberate — the fused-cluster read is the point of the pattern, and even `4px` starts to look like separate buttons. Do not lift `gap-[2px]` into other contexts without the same rationale; the global space scale is otherwise unchanged.

First used: [[features/header-nav-redesign]] (Navbar `NavTrack`). Candidate future uses: view-mode switchers, filter-scope toggles, thread-status tabs — anywhere a small cluster of icon-only, mutually-exclusive chrome actions would otherwise each get its own floating pill.

## Brand mark

Ratified compositions of the tokens above into standalone brand assets — distinct from `## Patterns` above, which are reusable *UI* compositions (buttons, chrome), not standalone artifacts. Each entry: name, definition, scope, first-use link.

### Favicon / small icon

> **Brand mark — Favicon / small icon.** `frontend/public/favicon.svg`, `viewBox 0 0 100 100`. Anatomy: `SurfaceBadge` (`color.surface.subtle` circle, full-bleed, r=46) + `OuterArc` (`color.brand.primary`, stroke 7/100, round cap) + `InnerArc` (`color.brand.warm`, stroke 7/100, round cap, nested) + `BaseDot` (`color.brand.primary` circle, r=5.5). Reads as a protective arch cradling a small held shape.

Originated as a deliberate abstraction of fofa's legacy `Logo.tsx` mark (two adult figures + a child figure + a concave heart, under a protective arch — 9 discrete shapes in a 60-unit viewBox) — extracting only the arch/shelter element, the one piece `Logo.tsx`'s own source comment names as doing the conceptual work, and dropping the figures/heart because they do not survive rasterization below ~32px. Verified directly, not taken on faith: design-lead read `Logo.tsx` itself (confirms the 9-shape count and the heart's compound concave path) and viewed the shipped `favicon-16x16.png` / `favicon-32x32.png` / `apple-touch-icon.png` as rendered images (16px genuinely degrades to a soft brand-colored blob with the arc-nesting no longer distinguishable; 32px and up reads as a clear nested double-arch). Same two brand hex values carried over exactly (`#4D9463` / `#F0B24F`, byte-matched against this file's own token table); no new tokens introduced.

**Scope: icon / favicon / app-icon contexts only.** This is not a ratification of fofafu's primary header logo, wordmark, or marketing lockup — that decision remains fully open and gets its own future dispatch, not a default silently inherited from this entry.

**Known limit:** loses arc-nesting detail at 16×16 (reads as a brand-colored blob, not a distinct nested shape, on direct visual inspection). Acceptable at that size today; candidate refinement, not a blocker.

First used: [[features/site-icon]] (favicon.svg + 5 sized PNGs, wired via 6 `<link>` tags in `frontend/index.html`). Proposed by [[agents/ui-designer]] 2026-09-02, promoted into this canon 2026-09-03 by [[agents/design-lead]] after independently re-verifying token conformance and 16/32/180px legibility against the shipped assets (see [[features/site-icon]] `### Visual` for the full reasoning trail).

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
