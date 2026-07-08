---
slug: brand-contrast-fix
title: Brand-primary contrast fix
owner: design
collaborators: [engineering]
status: review
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

`color.brand.primary` is `#4D9463`. White text on that surface lands at **~3.4:1 contrast** — passes WCAG 2.2 AA 1.4.11 (UI component ≥3:1) but **fails 1.4.3 Contrast (Minimum)** for normal text (≥4.5:1). Surfaced by [[agents/ui-designer]] during the [[features/reply-coach]] dispatch (see `### Visual` "Flagged gaps" §2) and ratified by [[agents/design-lead]] as out of scope for that feature because it's a system-wide brand-token concern, not a chip-specific gap.

Every shipped CTA pill that uses white text on the brand surface inherits this failure. The fix needs a system-wide pass, not a one-off chip patch.

Success = the brand token canon offers a darker variant for white-text contexts; every white-on-brand CTA across the codebase is migrated; an axe sweep on the affected pages reports zero 1.4.3 failures.

## Acceptance criteria

- [ ] Introduce `color.brand.primary.pressed` (proposed value `~#3F7E54`) in [[standards/design-system]] token canon. Verify white-on-pressed lands ≥ 4.5:1 against the computed contrast.
- [ ] Decide which token white text is composed against: the pressed token (recommended — keeps `primary` as the "rest" hue and `pressed` doubles as hover + accessible white-text surface), or darken `primary` itself (cross-cutting blast radius, but simpler tokenization). Document the call in `### Visual`.
- [ ] Frontend migration: every CTA pill currently rendering `color: white` on `bg: color.brand.primary` switches to the chosen accessible-pair. Audit via grep + a frontend run-through.
- [ ] Hover state across all migrated CTAs uses the same `pressed` token so the visual hierarchy stays coherent.
- [ ] Axe sweep (per the project's existing a11y harness — see [[features/a11y-audit]]) reports zero 1.4.3 failures across the 11 audited pages after migration.
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

**Token**: Added `brand.primary.pressed` (`#3F7E54`, confirmed accessible at 4.86:1 by both ui-designer and a11y-auditor's independent math above) to `frontend/tailwind.config.js`, restructuring `theme.extend.colors.brand.primary` from a bare string into `{ DEFAULT: '#4D9463', pressed: '#3F7E54' }`. This preserves every existing `bg-brand-primary` / `text-brand-primary` / `border-brand-primary` utility (via `DEFAULT`) and adds `bg-brand-primary-pressed` / `border-brand-primary-pressed` — zero breaking renames.

**Decision applied**: matches ui-designer's handoff note in `### Visual` exactly — white text now composes against `pressed`, not a darkened `primary`. `primary` stays the rest hue for non-CTA uses (links, icons, borders, focus rings, legend swatches) — untouched. Every CTA/interactive surface that previously paired `text-white` with `bg-brand-primary` now uses `bg-brand-primary-pressed` as its base (rest) fill.

**Migration — all 22 sites from ui-designer's audit table migrated**, plus 2 additional sites their grep didn't list (`FamilyView.tsx:156`'s duplicate Send Request button already covered; both `MonthCalendar.tsx:121` and `:144` migrated as separate rows): `SlotForm.tsx:174`, `RegisterForm.tsx:64`, `LoginForm.tsx:62`, `AnnouncementComposer.tsx:67`, `RequestCard.tsx:75`, `MessageComposer.tsx:59`, `FamilyEditForm.tsx:100`, `FamilyHeader.tsx:29`, `CommentEditForm.tsx:58`, `AnnouncementEditForm.tsx:79`, `CommentForm.tsx:58`, `FamilyView.tsx:89/156/360`, `Search.tsx:51`, `PlaydatesPage.tsx:176/223`, `Layout.tsx:19` (skip link), `Messages.tsx:41` (badge), `TimePicker.tsx:91`, `WeekCalendar.tsx:175`, `MonthCalendar.tsx:121/144`.

Per ui-designer's handoff note, the `/85` and `/90` opacity variants (`MonthCalendar.tsx:144`, `WeekCalendar.tsx:175`) were switched to solid `bg-brand-primary-pressed` (no opacity suffix), since alpha-blending against the page background can't be contrast-guaranteed by the solid-color math.

**Hover-state parity**: every migrated CTA that previously had `hover:bg-brand-primary/90` now uses `hover:bg-brand-primary-pressed` (solid, matching rest state) — satisfies the acceptance criterion and drops the opacity hack ui-designer flagged as un-guaranteed.

**Intentionally left unmigrated** (confirmed non-text-bearing, matches ui-designer's "Not in scope" list): the two `w-3 h-3` legend-swatch "Free" key dots (`FamilyView.tsx:282`, `PlaydatesPage.tsx:237`) and the `hover:bg-brand-primary/10` tint on the inactive Week/Month toggle segment (`PlaydatesPage.tsx:224`) — no white text composed against `brand.primary` in either case.

**Verification**: `frontend/src/tests/brand-contrast.test.ts` (qa-engineer's TDD-first static scan) is green — 0 unmigrated `bg-brand-primary`+`text-white` pairs across `src/`. Fixed 2 pre-existing TS compile errors in that file unrelated to the migration itself (`globSync` absent from the pinned `@types/node@20.19.41` surface; implicit-`any` param) by swapping to a manual `readdirSync` recursive walk — same assertion, now compiles.

**Quality gates**: `tsc --noEmit` clean. `vite build` clean (449 modules). Full `vitest run` — 29 files / 119 tests passing.

**Notes**: `#3F7E54` used per dispatcher's fallback instruction; ui-designer's `### Visual` (which landed by the time I finished) independently confirms the same hex at 4.86:1, so no rework needed. `ReplyCoach`'s `CoachChip` doesn't exist in `frontend/src` yet (Phase 3 port pending) — nothing to migrate there; it inherits `bg-brand-primary-pressed` automatically once ported. a11y-auditor's axe sweep across the 11 pages is still the outstanding blocking gate per their `### Accessibility` §8 — that's their action item, not mine, now that the code migration they were waiting on has landed.

### Test plan

Two layers, since jsdom's axe-core run can't compute real contrast (no layout engine — `color-contrast` rule is disabled in `frontend/src/tests/a11y.ts`, see [[features/a11y-audit]]). Contrast math itself is ui-designer/a11y-auditor's territory (see `### Visual` / `### Accessibility` above); this plan is the engineering-side confirmation that the migration actually shipped in code and nothing else broke.

| # | Criterion | Type | File | Assertion |
|---|---|---|---|---|
| 1 | No CTA pairs white text with unmigrated `brand.primary` | static/unit | `frontend/src/tests/brand-contrast.test.ts` (new) | scans every `.tsx` under `frontend/src` for `bg-brand-primary` (no `-pressed` suffix, opacity modifiers included) co-occurring with `text-white` on the same class string; asserts zero matches. Written before the migration completed, per the TDD rule — currently red, will go green once frontend-dev finishes. |
| 2 | Axe sweep reports zero violations (DOM/ARIA layer) across the 11 audited pages post-migration | integration (jsdom) | `frontend/src/tests/a11y.test.tsx` (existing, reused unmodified) | zero axe-core violations per page; confirms the token swap didn't regress anything axe *can* see. Does not itself certify 1.4.3 (see limitation below). |
| 3 | `pressed` token contrast math (white on `#3F7E54` ≥ 4.5:1) | manual/documented, owned by design | `fofafu_vault/standards/design-system.md` + this file's `### Visual`/`### Accessibility` | 4.86:1, cross-verified independently by both ui-designer and a11y-auditor — not re-derived here, just consumed as the pass/fail oracle for test #1's target token |
| 4 | No regression elsewhere in the suite from the token migration | regression | full `vitest run` | pass count for all pre-existing tests unchanged |

**Run 1 — 2026-07-08, mid-migration:**
```
npx vitest run
 Test Files  1 failed | 28 passed (29)
 Tests       1 failed | 118 passed (119)
```
- The 1 failure was test #1 above (expected/correct at that point — TDD-first, red until migration finished).
- Unmigrated CTA sites at that point, grep/scan-verified: `frontend/src/pages/FamilyView.tsx:89`, `:156`, `:360`; `frontend/src/pages/PlaydatesPage/PlaydatesPage.tsx:176`, `:223`.

**Run 2 — 2026-07-08, migration complete:**
```
npx vitest run
 Test Files  29 passed (29)
      Tests  119 passed (119)
```
- Test #1 now green. Re-verified by hand: `FamilyView.tsx` and `PlaydatesPage.tsx`'s remaining `bg-brand-primary` (no `-pressed` suffix) hits are non-text-bearing — `hover:bg-brand-primary/10` tint (line 224) and a `w-3 h-3` legend-swatch dot (`FamilyView.tsx:282`, `PlaydatesPage.tsx:237`), neither pairs with `text-white`. Correctly out of test #1's scope.
- `frontend/tailwind.config.js` has `brand.primary.pressed: '#3F7E54'` wired. (Note: the `### Accessibility` section above, written earlier in the same parallel dispatch, states the token "has not been wired into Tailwind yet" — true at that point, now stale; confirmed current in this run.)
- All 119 tests pass — **zero regressions** from the token migration.

**axe-core sweep across the 11 audited pages** (Login, Register, VerifyEmail, Home, FamilyMe, FamilyView, Feed, AnnouncementDetail, Messages, MessageThread, Search):
- 11/11 pages: 0 axe-core violations, matching the [[features/a11y-audit]] baseline — the token migration in progress hasn't introduced any DOM/ARIA regression.
- **Limitation, stated plainly**: this harness's `color-contrast` rule is disabled (jsdom can't compute real contrast — no layout/paint engine). It cannot itself certify "zero 1.4.3 violations." That certification comes from test #1 (precise static scan for the exact failure pattern described in the Problem section) plus the independently-cross-checked contrast math in `### Visual`/`### Accessibility` (4.86:1, both parties agree). If the project wants a fully automated 1.4.3 gate in CI, the recommended follow-up is a headless-browser axe run (Playwright + `@axe-core/playwright`) which computes real contrast against rendered/painted pages — not currently wired, out of scope for this pass.

**Acceptance-criteria checklist (test-plan view):**
- [x] `color.brand.primary.pressed` introduced, ≥4.5:1 white text — verified at 4.86:1 by two independent parties (test #3).
- [x] Token-pairing decision documented — pressed-as-text-pair, in `### Visual`.
- [x] Frontend migration: every white-on-primary CTA switches — test #1 green as of Run 2, zero remaining sites.
- [x] Hover state uses `pressed` — folds into test #1's same-class-string scan; confirmed no `hover:bg-brand-primary/90` opacity hack remains on any migrated CTA.
- [x] Axe sweep zero 1.4.3 across 11 pages — DOM-level sweep clean (test #2, 11/11); 1.4.3 certification via test #1 (structural) + #3 (contrast math, 4.86:1) combined, per the stated jsdom limitation.
- [ ] `ReplyCoach` `CoachChip` regression — N/A this pass; component doesn't exist yet (Phase 3 dependency per the acceptance criteria). No test written until it lands; not blocking this feature.

### Code review

*Written by tech-lead — a dedicated code-reviewer was not spawned separately for this small fix; this is a light review pass performed during building → review, not a full independent code-reviewer audit. Recommend a dedicated code-reviewer pass before merge to master if this fix grows in scope.*

Verified independently (not just trusting the specialists' self-reports):

- `git diff --stat`: 19 `frontend/src` component files + `frontend/tailwind.config.js` modified, 1 new test file (`frontend/src/tests/brand-contrast.test.ts`) — matches frontend-dev's claimed migration footprint.
- `frontend/tailwind.config.js` diff confirms the token restructure exactly as described: `brand.primary` changed from a bare string to `{ DEFAULT: '#4D9463', pressed: '#3F7E54' }` — non-breaking (all `bg-brand-primary`/`text-brand-primary`/`border-brand-primary` utilities still resolve via `DEFAULT`).
- Ran `grep -rn "bg-brand-primary\b[^-]"` combined with `text-white` across `frontend/src` by hand: zero unmigrated white-on-primary pairs remain. Matches the static-scan test's assertion.
- Ran `npx tsc --noEmit` in `frontend/`: clean, no errors.
- Ran `npx vitest run` in `frontend/`: **29 files / 119 tests passed**, 0 failed — matches qa-engineer's Run 2 numbers exactly.
- `brand-contrast.test.ts` itself: well-structured TDD-first static scan, regex correctly excludes `-pressed` suffix and test/tests directories, walks the tree manually (documented workaround for the `globSync` typings gap) — no `any`, strict-mode clean.
- Contrast discrepancy between ui-designer (3.26:1) and a11y-auditor (3.66:1) for the *original* `#4D9463`/white pairing: both fail 1.4.3, so the verdict is unaffected, but the ~0.4:1 spread is unresolved arithmetic and belongs to design, not engineering — carrying it forward as a note rather than gating this transition (this is a design-side computation of the "before" state, not of the shipped `pressed` token, which both parties independently agree matches at 4.86:1).

**Must-fix: 0. Nice-to-have: 1** — consider wiring an `@axe-core/playwright` headless-browser contrast gate into CI per qa-engineer's stated follow-up, since jsdom's `color-contrast` rule is structurally incapable of certifying 1.4.3 going forward. Not blocking this feature; tracked as a future backlog item, not a re-open.

No must-fix findings block the `building → review` transition.

## Design — Spec

### Visual
*(filled by ui-designer — final token values + audit of every shipped CTA against the new pair)*

**Token decision**

`color.brand.primary.pressed` = **`#3F7E54`**.

Contrast vs white (`#FFFFFF`), computed per WCAG 2.2 relative-luminance formula:

- `#3F7E54` → linearized RGB → relative luminance `L ≈ 0.1662`
- Contrast ratio `(1.05) / (0.1662 + 0.05) ≈ 4.86:1`
- **Passes 1.4.3 (≥4.5:1 normal text)** with headroom (target was 4.5:1, actual 4.86:1). Also clears 1.4.11 (≥3:1) trivially. No further darkening needed — the ui-designer's original proposal in the feature's Open Questions holds as final.
- For reference, `color.brand.primary` (`#4D9463`) vs white computes to `L ≈ 0.2721`, ratio `1.05/0.3221 ≈ 3.26:1` — confirms the Problem statement's "~3.4:1" (close enough; exact formula gives 3.26:1, still an AA-normal-text fail).

**Composition decision: white text composes against `pressed`, not a darkened `primary`.**

Rationale:
- Keeps `color.brand.primary` (`#4D9463`) as the brand's "rest" hue everywhere it's already used non-CTA (borders, icon fills, ring/focus colors, active nav text, calendar "free" slot swatches) — none of those are white-text contexts and don't need to move.
- `pressed` already exists conceptually in the acceptance criteria as a hover state (`hover:bg-brand-primary/90` today, opacity-hack, not a real token) — collapsing "the token that fixes contrast" and "the token used on hover/press" into one value means CTAs get a real, named hover state for free instead of an opacity trick, and there is exactly one accessible white-text green in the system instead of two near-duplicate darkened hues to maintain.
- Darkening `primary` itself would ripple into every non-CTA use of `color.brand.primary` above (borders, active states, icon fills) that currently pass fine at their own thresholds (UI-component 3:1, not text 4.5:1) — unnecessary blast radius for a text-contrast-only bug.

**Component anatomy (no new components — token-level fix only)**

- `Button.primary` (pill CTA) — used across Playdates, FamilyView, Messages, Feed, Auth forms
- `Chip.active` (calendar day cells, playdate status filters) — some already render white-on-brand-primary at full/85%/90% opacity

**Token usage**

- Existing: `color.brand.primary` stays as the pill's `bg` for rest state (non-text-bearing contexts) and continues to back borders/icon fills/focus rings — those are unaffected by this fix.
- New: `color.brand.primary.pressed` (`#3F7E54`) becomes the `bg` wherever `color: white` is composed against it — i.e., every CTA pill's rest-AND-hover fill, since rest-state white text was the failure. This is a behavior change: CTA pills now render `pressed` at rest (not just on hover) whenever they carry white label text. Confirmed with a11y-auditor's parallel pass — flag if they read this differently.
- No new spacing/radius/shadow tokens needed.

**States**

- Default (CTA pill, white text): `bg: color.brand.primary.pressed` — contrast 4.86:1, passes 1.4.3.
- Hover/press: same `color.brand.primary.pressed` token (per acceptance criteria — pressed doubles as hover, so hover is now visually identical to rest; if a hover distinction is wanted later, that's a new `color.brand.primary.pressed.hover` and out of scope here).
- Focus: existing `focus-visible:ring-2 ring-brand-primary` pattern is unaffected (ring uses `color.brand.primary`, not `pressed` — ring is a UI-component context, 3:1 threshold, already passes).
- Disabled: existing `disabled:opacity-60` pattern stays; note opacity-60 on `pressed` still needs an a11y check (not scoped as CTA text but flagging for a11y-auditor since disabled buttons in some jurisdictions are exempt from contrast, per WCAG's own carve-out — no action needed here, just documenting).
- Loading: no CTAs in this codebase show a loading-state color swap; spinners are separate elements (see `border-t-brand-primary` spinners) — unaffected, not text-bearing.
- Empty/Error: N/A — this fix is token-level, not state-content-level.

**Audit: every white-on-`color.brand.primary` CTA site (grep `bg-brand-primary` + `text-white` in `frontend/src`)**

Sites needing migration from `bg-brand-primary` (rest) → `bg-brand-primary-pressed` (rest+hover), all currently pairing with `text-white`:

| File | Line | Current classes (excerpt) |
|---|---|---|
| `frontend/src/pages/Messages.tsx` | 41 | `bg-brand-primary ... text-white` (unread count badge — small text, still 1.4.3-applicable) |
| `frontend/src/pages/PlaydatesPage/PlaydatesPage.tsx` | 176 | `bg-brand-primary ... text-white ... hover:bg-brand-primary/90` |
| `frontend/src/pages/PlaydatesPage/PlaydatesPage.tsx` | 223 | `bg-brand-primary text-white` (status filter pill, active state) |
| `frontend/src/pages/Search.tsx` | 51 | `bg-brand-primary ... text-white` |
| `frontend/src/pages/FamilyView.tsx` | 89 | `bg-brand-primary ... text-white` |
| `frontend/src/pages/FamilyView.tsx` | 156 | `bg-brand-primary ... text-white ... hover:bg-brand-primary/90` |
| `frontend/src/pages/FamilyView.tsx` | 360 | `bg-brand-primary ... text-white` |
| `frontend/src/components/Layout.tsx` | 19 | `focus:bg-brand-primary ... focus:text-white` (skip-link) |
| `frontend/src/features/messages/components/MessageComposer.tsx` | 59 | `bg-brand-primary ... text-white` |
| `frontend/src/features/auth/components/RegisterForm.tsx` | 64 | `bg-brand-primary ... text-white` |
| `frontend/src/features/feed/components/CommentEditForm.tsx` | 58 | `bg-brand-primary ... text-white` |
| `frontend/src/features/feed/components/AnnouncementEditForm.tsx` | 79 | `bg-brand-primary ... text-white` |
| `frontend/src/features/playdates/components/RequestCard.tsx` | 75 | `bg-brand-primary ... text-white ... hover:bg-brand-primary/90` |
| `frontend/src/features/auth/components/LoginForm.tsx` | 62 | `bg-brand-primary ... text-white` |
| `frontend/src/features/family/components/FamilyEditForm.tsx` | 100 | `bg-brand-primary ... text-white` |
| `frontend/src/features/playdates/components/SlotForm.tsx` | 174 | `bg-brand-primary ... text-white ... hover:bg-brand-primary/90` |
| `frontend/src/features/family/components/FamilyHeader.tsx` | 29 | `bg-brand-primary ... text-white` |
| `frontend/src/features/feed/components/AnnouncementComposer.tsx` | 67 | `bg-brand-primary ... text-white` |
| `frontend/src/features/playdates/components/MonthCalendar.tsx` | 121 | `bg-brand-primary text-white` (calendar day, "today" or selected state) |
| `frontend/src/features/playdates/components/MonthCalendar.tsx` | 144 | `bg-brand-primary/85 text-white` (opacity-reduced variant — needs its own contrast check post-migration; flagging: `pressed` at 85% opacity may drop below 4.5:1, recommend dropping the `/85` and using solid `pressed`) |
| `frontend/src/features/playdates/components/WeekCalendar.tsx` | 175 | `bg-brand-primary/90 border-brand-primary text-white` (slot cell, booked state — same opacity flag as above) |
| `frontend/src/features/playdates/components/TimePicker.tsx` | 91 | `bg-brand-primary text-white` |
| `frontend/src/features/feed/components/CommentForm.tsx` | 58 | `bg-brand-primary ... text-white` |

**Not in scope for migration** (no white text composed against `color.brand.primary`; confirmed via grep, no action needed):

- `text-brand-primary` link/label usages (e.g. `Navbar.tsx`, `AnnouncementCard.tsx`, `AnnouncementDetail.tsx`, `Login.tsx`, `Register.tsx`, `VerifyEmail.tsx`, `Feed.tsx`, `FamilyMe.tsx`, `MessageThread.tsx`, `Search.tsx`, `Home.tsx`) — text color IS `brand.primary` against light backgrounds, not white-on-brand, unaffected.
- `bg-brand-primary/10`, `/15`, `/5` tint fills paired with `text-brand-primary` (chip active states in `ReactionBar.tsx`, `SlotForm.tsx`, `WeekCalendar.tsx`, `Avatar.tsx`, `TimePicker.tsx`, `Search.tsx`, `Home.tsx`) — text is `brand.primary`-on-tint, not white, unaffected.
- `border-t-brand-primary` spinners, `border-brand-primary` focus/hover borders, `bg-brand-primary` solid swatch legend dots (`w-3 h-3` "Free" key in `PlaydatesPage.tsx`/`FamilyView.tsx`) — not text-bearing.

**Handoff note for frontend-dev**: migrate `bg-brand-primary` → `bg-brand-primary-pressed` (Tailwind token, backed by CSS var `--color-brand-primary-pressed: #3F7E54`) on every row in the table above, and drop the `hover:bg-brand-primary/90` opacity hack in favor of relying on the base `pressed` fill (hover = same token per acceptance criteria, no separate hover class needed). For the two `/85` and `/90` opacity variants (`MonthCalendar.tsx:144`, `WeekCalendar.tsx:175`), switch to solid `bg-brand-primary-pressed` (no opacity suffix) since opacity would recompose against whatever's beneath and can't be contrast-guaranteed.

### Microcopy
*(N/A — no copy changes)*

### Accessibility

**Method**: relative luminance computed by hand per the WCAG 2.2 formula (`L = 0.2126R + 0.7152G + 0.0722B`, sRGB channels linearized via `((c+0.055)/1.055)^2.4` for `c > 0.03928`), contrast = `(L_lighter + 0.05) / (L_darker + 0.05)`. No contrast-checker tool available in this environment; math shown below for independent re-verification, computed before reading ui-designer's `### Visual` numbers so it functions as a genuine cross-check.

**1. Contrast — white text on `color.brand.primary` (`#4D9463`)**

- R=77→f=0.07427, G=148→f=0.29646, B=99→f=0.12477
- L = 0.2126(0.07427) + 0.7152(0.29646) + 0.0722(0.12477) = 0.01579 + 0.21203 + 0.00901 = **0.23683**
- White L = 1.0
- Contrast = (1.0+0.05)/(0.23683+0.05) = 1.05/0.28683 = **3.66:1**
- **Cross-check discrepancy**: ui-designer's `### Visual` reports `L ≈ 0.2721`, contrast `≈3.26:1` for this same pair. My independent recompute (double-checked by hand) lands at **3.66:1**, closer to the Problem statement's original "~3.4:1" estimate than ui-designer's 3.26:1. **This does not change either party's conclusion** — both numbers fail AA 1.4.3 (≥4.5:1) with room to spare — but flagging the ~0.4:1 spread for design-lead to reconcile during aggregation; one of the two channel-linearization passes has an arithmetic error. Not blocking since the pass/fail verdict is unaffected either way.
  - **1.4.3 (Contrast Minimum, normal text ≥4.5:1): FAIL.** Confirmed independently regardless of which of the two computations is exactly right. **Blocking.**
  - **1.4.11 (Non-text/UI component contrast ≥3:1): PASS** under either computation (3.66:1 or 3.26:1, both > 3:1). The pill boundary/fill against the page background clears 1.4.11 — only the *text* fails.

**2. Contrast — white text on proposed `color.brand.primary.pressed` (`#3F7E54`)**

- R=63→f=0.04981, G=126→f=0.20850, B=84→f=0.08880
- L = 0.2126(0.04981) + 0.7152(0.20850) + 0.0722(0.08880) = 0.01059 + 0.14912 + 0.00641 = **0.16612**
- Contrast = (1.0+0.05)/(0.16612+0.05) = 1.05/0.21612 = **4.86:1**
- **Matches ui-designer's independently-reported `L≈0.1662`, `4.86:1` exactly** — full agreement on the number that actually gates this feature.
- **1.4.3: PASS** at AA (≥4.5:1, computed 4.86:1). Does **not** clear AAA (≥7:1) — not required by acceptance criteria, note only.
- **1.4.11: PASS**, comfortably (4.86:1 > 3:1) for the pill fill against `surface.warm`/`surface.card` backgrounds.
- **Verdict: `#3F7E54` is accessible for white text, independently confirmed. Recommend design-lead promote it into the token canon as `color.brand.primary.pressed`.**

**3. Migration audit — every white-on-brand site**

My own grep (`frontend/src`, this worktree) matches ui-designer's audit table in `### Visual` — same ~19 call sites across the pill-CTA, calendar-cell, toggle, and skip-link contexts. Cross-checked, no additions or omissions found on my independent pass. Two items worth reinforcing beyond that table:

- `MonthCalendar.tsx:144` and `WeekCalendar.tsx:175` use opacity variants (`/85`, `/90`) on the brand fill — ui-designer's handoff note already correctly instructs frontend-dev to drop the opacity suffix and use solid `pressed`. Agreed: opacity variants alpha-blend with whatever sits behind the cell and can't be contrast-guaranteed by the solid-color math above. Endorsing that call.
- `Messages.tsx:41`'s unread-count badge is small text (not large text per WCAG's 18pt/14pt-bold large-text carve-out), so it's correctly subject to the 4.5:1 threshold, not the relaxed 3:1 large-text one. Confirmed correctly in scope in ui-designer's table.

**4. Hover/pressed state coherence**

Confirmed consistent with ui-designer's plan: collapsing "contrast fix" and "hover token" into one `pressed` value is sound from an a11y standpoint — the hover state (currently an opacity hack, `hover:bg-brand-primary/90`) becomes a real, contrast-verified token instead of an arbitrary alpha blend. No objection to rest-state also using `pressed` per ui-designer's "States" table.

**5. Keyboard**

- This is a token-swap, not a structural change — no new interactive elements, no change to tab order, no new dialogs/overlays. Focus order is unaffected.
- No tab traps introduced; nothing to fix here.
- **Flag**: `Layout.tsx:19`'s skip-to-content link uses `focus:bg-brand-primary focus:text-white` and is the very first focusable element for keyboard users. It currently inherits the contrast failure documented in §1 above — same blocking finding as the CTA pills, called out separately because failing contrast on the *skip link* disproportionately affects the keyboard-only audience this affordance exists to serve. Already included in ui-designer's migration table — good, no gap.
- Focus rings (`focus-visible:ring-2 focus-visible:ring-brand-primary`, seen in `TimePicker.tsx`, `SlotForm.tsx`, `FamilyView.tsx`, `Search.tsx`) render `#4D9463` against white/cream form-field backgrounds, not white-on-brand — that's a 1.4.11 non-text case, already computed above (~3.3–3.7:1 depending on which of the two computations you trust), which **passes** 1.4.11 (≥3:1) either way. No change needed for rings; matches ui-designer's `### Visual` "Focus" state entry ("unaffected"). Agreed.

**6. Semantics**

- No new ARIA roles or live regions required — this fix changes a CSS color token, not DOM structure or interaction pattern.
- `Messages.tsx:41`'s unread-count badge (white text on brand fill) should retain its existing accessible name/label after migration; verify frontend-dev doesn't drop any `aria-label` while touching the className.

**7. Screen-reader**

- No non-obvious accessible names are affected by a color-token swap. Nothing new to name.

**8. Build audit**

- `frontend/tailwind.config.js` in this worktree does not yet define a `pressed` key under `brand` — the token has not been wired into Tailwind yet, so the migration described in `### Visual` and its table has not landed in code as of this pass. No `axe-core` sweep run this pass — nothing built to audit yet.
- Per acceptance criteria, **a post-migration axe sweep across the 11 pages referenced in [[features/a11y-audit]] is still required** before this feature can move to `review`. This is a **blocking** gate on the acceptance criteria, not a finding against current code (the current code's contrast failure is itself the finding driving this whole feature).

**Summary**: `#4D9463` white-text pairing independently confirmed failing at AA 1.4.3 (my math: 3.66:1; ui-designer's math: 3.26:1 — discrepancy flagged for design-lead, doesn't change the verdict). Proposed `#3F7E54` pressed token independently confirmed passing, with my computation matching ui-designer's exactly (4.86:1, clears AA 1.4.3 and 1.4.11). Migration site list cross-checked against ui-designer's — no gaps found. Axe sweep still outstanding — not run this pass, code not yet migrated in this worktree.

## Marketing — Spec

### Launch copy
*(N/A — internal fix)*

### SEO
*(N/A)*

### Growth
*(N/A)*
