---
slug: header-nav-redesign
title: Header Nav Redesign
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-08-20
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Header Nav Redesign

## Problem

Today's desktop `Navbar` (`frontend/src/components/Navbar.tsx`) renders icon **and** text for all 5 links (Home, Family, Messages, Community, Playdates), plus a busy right-hand cluster (full name, city/state, an outlined "Sign out" button). The user asked for a more sophisticated header and to drop redundant text like "Home"/"Messages" — the icon already says it.

Three directions were mocked as a Claude Design canvas (https://claude.ai/code/artifact/d6c2f65b-7e62-4f20-8c5d-dc611745b6a1) and presented to the user: a quiet icon-only rail, a grouped pill track, and a centered masthead. **The user picked the grouped pill track ("Option B").**

### Reference spec (Option B, from the approved mock)

- Nav icons (Home, Family, Messages, Community, Playdates) move from individual `icon + label` pills into one **track container**: `bg-surface-warm`, `border-radius: 9999px` (pill), `padding: 4px`, `gap: 2px`, flex row.
- Each icon becomes a `44×44` circular button (`border-radius: 9999px`) inside the track — hit target stays ≥44px even though the visible icon is ~20px.
- Active page = the icon's own button filled solid `brand-primary` with a white icon ("puck"), replacing today's `bg-surface-warm text-brand-primary` treatment.
- Every icon-only link keeps its current `aria-label` text (unchanged wording) plus a small hover/focus tooltip (mock uses `JetBrains Mono`, 11px, `ink-lead` bg / white text) so sighted mouse users aren't left guessing.
- Unread badge on Messages is unchanged in behavior/copy (`"{label}, {n} unread"`), just repositioned to sit on the smaller circular button.
- Header bottom border goes from today's `3px solid brand-primary` to `2px solid brand-primary` — quieter, still branded.
- Right-hand cluster (name + city/state text + outlined Sign out button) collapses into **one** avatar-and-first-name chip (avatar: 36px circle, `brand-primary` bg, white initial; name: 14px/600/`ink-lead`); the chip is one pill button (`border-radius: 9999px`, hover `bg-surface-warm`).
- No new color tokens — reuses `surface.warm`, `surface.card`, `brand.primary`, `ink.lead`, `ink.muted`, `feedback.error` exactly as already defined in `fofafu_vault/standards/design-system.md` / `tailwind.config.js`.

## Acceptance criteria

- [ ] Desktop nav renders Home/Family/Messages/Community/Playdates as icon-only links inside one pill-shaped track (replaces the current row of individual icon+label pills).
- [ ] The active page's icon sits on a filled `brand-primary` circular "puck" (white icon), not today's `surface-warm` background treatment.
- [ ] Every icon-only nav link keeps an accessible name via `aria-label` (same wording as today's visible label) and gets a visible hover/focus tooltip — removing the text must not remove the information.
- [ ] Unread-messages badge still renders on the Messages icon with the same `aria-label` pattern as today ("Messages, N unread").
- [ ] Right-hand cluster (name + city/state + outlined "Sign out" button) collapses into a single avatar + first-name chip; sign-out remains reachable from whatever the chip opens.
- [ ] Header's bottom border changes from `3px solid brand-primary` to `2px solid brand-primary`.
- [ ] All interactive controls have visible `:focus-visible` states and correct roles/`aria-current` (keyboard and screen-reader parity with today, not a regression).
- [ ] `Navbar.test.tsx` updated to match the new structure; full frontend suite and `tsc` stay green.

## Out of scope

- The mobile bottom tab bar (`aria-label="Mobile navigation"`) — bottom tab bars conventionally keep labels; this redesign is desktop-header-only.
- Designing a full account menu — implement the minimum needed to relocate "Sign out" behind the new avatar chip (frontend-dev's call whether that's a real dropdown or a simpler reveal; note the choice in the Frontend subsection).
- No backend/API changes — this is purely a frontend component restyle.
- Changing which 5 destinations are in the nav, their order, or routes.
- New design tokens — reuse the existing palette; if something genuinely new is needed, ui-designer proposes it here for design-lead to promote into `design-system.md`, not invented silently in code.

## Open questions

- Is a real dropdown menu for the avatar chip in scope for v1, or is relocating the existing "Sign out" control under/behind the chip enough? (frontend-dev, note your call)
- The mock's hover tooltip uses `JetBrains Mono` per the design system's "mono = taxonomy" principle — confirm as the tooltip convention, or prefer body font? (ui-designer)

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend

Implemented in place in `frontend/src/components/Navbar.tsx` (evolved, not rewritten — same file, same `NAV_LINKS` order/routes, mobile `<nav aria-label="Mobile navigation">` block untouched byte-for-byte). Supporting change: `frontend/tailwind.config.js` (see "Token wiring fix" below). Tests: `frontend/src/components/Navbar.test.tsx` (mine) rewritten to match; `frontend/src/components/Navbar.a11y-behavior.test.tsx` (qa-engineer's, not mine to edit) is green against the final markup. `tsc --noEmit` and `vitest run` both clean: **166/166 tests, 32/32 files.**

**Open question #1 resolved — lightweight disclosure, not a full ARIA menu.** The avatar chip is a plain `<button aria-expanded aria-controls="account-menu">` toggling a sibling `<div id="account-menu" hidden={!open}>` containing a single `<button>Sign out</button>`. No `role="menu"`/`role="menuitem"`, no roving tabindex, no `aria-haspopup` — `aria-expanded` alone already tells AT users it toggles something, and a real APG menu pattern's required-children/arrow-key semantics would be unjustified complexity for one static action. Closes on: click-outside (document `mousedown` listener scoped to a wrapping ref), `Escape`, and route change. **Escape also returns focus to the trigger** (`accountTriggerRef.current?.focus()`) — a11y-auditor's Blocking #3 in `### Accessibility` required this explicitly; it's the one piece of keyboard-focus-management code in the component.

**Cross-specialist convergence on the tooltip mechanism (worth recording — this thrashed twice).** My first pass nested the tooltip `<span>` inside the `<Link>`, aria-hidden, revealed via `group-hover`/`group-focus-visible`. qa-engineer's TDD file (`Navbar.a11y-behavior.test.tsx`) initially asserted the opposite shape — empty `link.textContent` plus an `aria-describedby`-referenced sibling element — so I rebuilt around that (React-state-driven hover tracking + hardcoded-literal `left-[Npx]` position classes per link, since Tailwind's JIT can't see dynamically-interpolated class names and a sibling can't inherit the link's own `position:relative` for centering). Before I could finish verifying that version, the test file was revised again — its own docblock now says it "reconciled against frontend-dev's actual implementation" and explicitly calls the original nested/`aria-hidden`/`group-hover` shape "a legitimate alternative," adding a `accessibleTextContent()` helper (strips `aria-hidden` branches, then checks `textContent`) instead of requiring literal emptiness. I reverted to that original, simpler shape rather than push a third variant — it's what's now in both `Navbar.a11y-behavior.test.tsx` and `e2e/header-nav-redesign.spec.ts` (e2e-test-writer's IMPLEMENTATION NOTES section independently describes the identical opacity/`group-hover`/`group-focus-visible`/always-mounted contract). All three files agree on this shape as of this revision.

**Applied ui-designer's `### Visual` + a11y-auditor's `### Accessibility` corrections** (both landed after my first pass; reconciled against the Reference Spec where they refine it):
- Tooltip font: `font-sans font-semibold` (Nunito 600), not `font-mono` — mono is reserved for taxonomy per design-system.md principle #4, and this tooltip repeats a status string (`aria-label`), not a category label.
- Tooltip radius: `rounded-sm` (this project's 4px token), not `rounded-md` (an un-themed Tailwind stock 6px value I'd used by mistake — not one of this project's `4/8/16/9999` tokens at all).
- Inactive `NavTrackItem` hover fill: `hover:bg-surface-subtle`, not `hover:bg-surface-warm`/`hover:bg-surface-card` — the track itself is already `surface-warm`, so a same-color hover is invisible; `surface-subtle` is the token ui-designer named for exactly this case.
- Avatar initial: `bg-brand-primary-pressed` (not plain `brand-primary`) — a11y-auditor's Blocking #1, contrast fails 1.4.3 at 3.66:1 with plain `brand-primary`. I'd already independently reached this from design-system.md's own token note before the audit landed; the audit confirms it.
- Every desktop link already carries an explicit `aria-label` (same wording as the old visible `<span>`) — a11y-auditor's Screen-reader finding says today's desktop links have *no* `aria-label` at all pre-redesign (only mobile does), so this isn't optional; confirmed already correct in my first pass.
- Unread badge: switched to the mobile tab's exact classes (`-right-2 -top-1 h-4 min-w-[16px] text-[0.6rem]`), 1:1 as ui-designer's anatomy section specifies, replacing a custom size I'd invented (`-right-1 -top-1 h-[18px] text-[0.68rem]`).
- No `role="toolbar"`/roving `tabindex` — a11y-auditor explicitly warned against a half-implemented toolbar pattern; kept 5 independent `<Link>` Tab stops as recommended.

**Deviation: puck uses `bg-brand-primary-pressed`, not plain `bg-brand-primary`.** The Reference Spec and ui-designer's Visual spec both say plain `brand-primary` is fine for the puck (white *icon*, not text — passes 1.4.11's 3:1 floor at 3.66:1, per a11y-auditor's own contrast table). The reason I still use `-pressed`: `frontend/src/tests/brand-contrast.test.ts` (from the earlier `brand-contrast-fix` feature) is a source-level regex sweep that fails the suite on *any* `bg-brand-primary` (unmigrated) co-occurring with `text-white` on the same line, with no icon/text distinction — and my puck sets `text-white` on the same element for the icon's `currentColor`. Using `-pressed` keeps that pre-existing repo-wide gate green and matches the codebase's only real precedent (every other white-on-brand instance already uses `-pressed`); ui-designer's Visual spec itself names `brand.primary.pressed` as the "zero-new-token fallback if a wider margin is wanted," so this isn't off-menu, just forced rather than optional. Flagging explicitly per this feature's drift-disclosure convention.

**Token wiring fix: `surface.subtle` added to `tailwind.config.js`.** `design-system.md` has documented `color.surface.subtle` (`#F4ECDF`) since the `reply-coach` feature (design-lead-ratified), but it was never added to `theme.extend.colors` — `CoachChip`, the component that motivated it, hasn't been ported to `frontend/src` yet, so nothing had needed it until ui-designer's spec here called for `hover:bg-surface-subtle`. I added the exact already-approved hex value; this is wiring an existing decision into the shared token module (my job per role boundaries), not picking a new color.

**AccountChip padding.** Read ui-designer's anatomy line "`44px tall, px-8 gap-8`" as the design-system's own space-scale notation (literal 8px), not Tailwind's class-suffix numbering (which would mean 32px) — consistent with how the rest of that section writes "space scale `4`" to mean 4px elsewhere. Implemented as `px-2 py-1 gap-2` (8px/4px/8px). Height isn't set explicitly; it falls out to exactly 44px from the 36px avatar plus 4px top/bottom padding. Flagging the notation ambiguity in case ui-designer meant literal Tailwind `px-8`/`gap-8` (32px) instead.

**Known limitation, not fixed here — `firstName()` on family-style display names.** `firstName()` is `name.trim().split(/\s+/)[0]`, matching ui-designer's anatomy spec verbatim ("first token of `user.name`"). e2e-test-writer's spec notes the seed data's `user.name` is a *family* display name ("The Anderson Family"), so this resolves to "The account menu," not anything identifying — they routed around it (matching on the "account menu" suffix) and flagged it back to me rather than fix it in their file. I'm not guessing at a fix here (stripping a leading "The," or preferring a surname token, is a product/copy decision, not a frontend one, and I don't know whether every account follows this "The X Family" convention or if personal names also occur) — surfacing it for ux-writer/ui-designer/product rather than silently patching with a heuristic.

**Tooltip 1.4.13 overlap risk (a11y-auditor flagged non-blocking, revisit-if-real-dimensions-overlap):** at 11px Nunito semibold, "Community"/"Playdates" tooltips are plausibly wider than the 46px slot spacing and could visually bleed into a neighboring button. Left as-is per the audit's own "non-blocking now" framing — the tooltip is `pointer-events-none`, so even visual bleed doesn't block the neighboring button's actual hit area/functionality. Worth a real-browser look in visual QA once this ships.

**Correction (post-review) — chip shows the full `user.name`, not a first-name extraction.** The "first token of `user.name`" heuristic (mine and ui-designer's `### Visual` anatomy spec both assumed it) was wrong: this app's `user.name` is a household display name ("The Anderson Family"), not a person's name, and there's no separate first-name field — e2e-test-writer, qa-engineer, and code-reviewer each independently caught this (chip read "The" for every real account). Fixed: `firstName()` removed entirely; the visible name span and the trigger's `aria-label` now use `user.name` directly (reverting to what the pre-redesign Navbar already did for the text — `{user.name}` — just relocated inside the new chip), with `max-w-[24ch] truncate` on the visible span only (not the `aria-label`, which stays untruncated so screen-reader users get the full name) — matching the precedent in [[features/community-playdate-badge]] (`max-w-[24ch] truncate`, ellipsis only past 24 characters). `initialOf(user.name)` is unchanged — "T" for "The Anderson Family" is still a fine, unambiguous avatar glyph; the bug was specifically in treating the first *token* as a person's first name for announced/visible text, not in using the first *character* for the avatar.

**Consequence, not silently absorbed: this breaks one existing assertion in `Navbar.a11y-behavior.test.tsx` (qa-engineer's file, not mine to edit).** "`renders exactly one chip with the first name only — no city/state text, no full name text`" asserts `queryByText(/Jane Ramirez/)).not.toBeInTheDocument()` — that's now definitionally false once the chip correctly shows the full name. This isn't a bug in the fix; it's a test that encoded the pre-fix (wrong) assumption and needs its "no full name text" line updated or removed to match the corrected acceptance behavior. Full run after this fix: **166/167** (`tsc` clean); the 1 failure is exactly this one assertion, nothing else regressed. Flagging for qa-engineer/tech-lead rather than editing their file myself.

**Reconciling against `### Test plan` below (qa-engineer's section, not mine to edit):** its "Known-gap failure" — Escape not returning focus to the chip trigger — was accurate against the snapshot qa-engineer read, but predates the `accountTriggerRef` fix landing in this file (see "Open question #1 resolved" above). Re-ran the full suite after that fix: **166/166 passing**, including `returns focus to the chip trigger after closing on Escape`. Not editing their section per writer-ownership — flagging here, and in my returned `notes`, so this doesn't read as an unresolved contradiction sitting in the same file. Same applies to their "stale comment" note about `TOOLTIP_LEFT_CLASS` describing tooltip bubbles as link siblings — that whole approach (and the constant) was removed in the revert described above; current code has no such comment or constant.

### Test plan

**Scope:** component-level coverage (Vitest + RTL) for the Acceptance criteria — icon-only rendering, per-link `aria-label` wording, active-page puck + `aria-current`, unread-badge `aria-label` pattern, the avatar+name chip, and keyboard/focus-visible reachability. Playwright/E2E is e2e-test-writer's `### E2E coverage` section, not duplicated here. Files:

- `frontend/src/components/Navbar.test.tsx` — frontend-dev's own structural suite (4 tests: icon-only links + puck, unread badge, chip reveal/sign-out, full-name chip per commit 1bd5833). Not edited by qa-engineer (writer-ownership).
- `frontend/src/components/Navbar.a11y-behavior.test.tsx` — **new, added by qa-engineer** (31 tests). Additive, not a duplicate: targets the criteria frontend-dev's own file doesn't cover per-link, plus the a11y-auditor's blocking findings.

**Coverage table**

| Acceptance criterion | Type | File | Assertion |
|---|---|---|---|
| Icon-only track, one shared container | unit | `Navbar.a11y-behavior.test.tsx` | each of the 5 links has zero accessible-tree text content (icon + tooltip + badge all `aria-hidden`); all 5 share one `parentElement` |
| Per-link `aria-label` wording | unit | `Navbar.a11y-behavior.test.tsx` (`it.each`) | `link` has `aria-label` **exactly** equal to today's visible label ("Home"/"Family"/"Messages"/"Community"/"Playdates") at 0-unread baseline |
| Hover/focus tooltip preserves the removed text | unit | `Navbar.a11y-behavior.test.tsx` (`it.each`) | no native `title` attr; an `aria-hidden="true"` node with matching text exists and its class carries both `group-hover:` and `group-focus-visible:` |
| Active puck (filled `brand-primary`, not `surface-warm`) | unit | `Navbar.a11y-behavior.test.tsx` | active link's className matches `brand-primary` fill family, not `bg-surface-warm`, and differs from an inactive sibling's className |
| `aria-current="page"` exclusivity | unit | `Navbar.a11y-behavior.test.tsx` (`it.each`, 5 routes) + `Navbar.test.tsx` | on each of the 5 routes, only that route's link carries `aria-current="page"` |
| Unread badge `"{label}, {n} unread"` unchanged | unit | `Navbar.a11y-behavior.test.tsx` + `Navbar.test.tsx` | at count=3, an element with accessible name `/messages, 3 unread/i` exists inside `nav[aria-label="Main navigation"]`; at count=0, no "unread" text anywhere in that nav |
| Right-hand cluster → one avatar+name chip | unit | `Navbar.a11y-behavior.test.tsx` + `Navbar.test.tsx` | no separate city/state text; the full `user.name` renders once, on a `max-w-[24ch] truncate` span; exactly one `button` whose accessible name includes it |
| Sign-out reachable from the chip | unit | `Navbar.a11y-behavior.test.tsx` + `Navbar.test.tsx` | keyboard: Tab to chip → Enter reveals a "Sign out" button; clicking it clears the auth token and redirects to `/login` (same assertions as the pre-redesign baseline, routed through the chip) |
| Avatar-chip keyboard model (a11y-auditor Blocking #3) | unit | `Navbar.a11y-behavior.test.tsx` | `aria-expanded` toggles false→true on open; Escape closes the reveal (`aria-expanded` back to false, Sign out unreachable); Escape **returns focus to the chip trigger** |
| Avatar-initial contrast (a11y-auditor Blocking #1) | unit | `Navbar.a11y-behavior.test.tsx` | avatar-initial element's className carries `bg-brand-primary-pressed` + `text-white`, not plain `bg-brand-primary` |
| Header border 3px → 2px, still `brand-primary` | unit | `Navbar.a11y-behavior.test.tsx` | main nav className matches a 2px border-bottom utility, not `border-b-[3px]`, and still references `brand-primary` |
| Focus-visible + keyboard reachability | unit | `Navbar.a11y-behavior.test.tsx` | `Tab` visits brand mark → 5 track links → avatar chip in DOM order; no `tabindex="-1"` traps; every control's className carries a `focus-visible:` hook; axe-core (color-contrast rule disabled, same as `src/tests/a11y.ts`) reports no violations on the authed+badge render |
| Mobile nav out of scope, unaffected | unit | `Navbar.a11y-behavior.test.tsx` | mobile tab bar still renders a visible text `<span>` per link (regression guard against the icon-only treatment leaking into the bottom bar) |
| `Navbar.test.tsx` updated + suite/tsc green | quality gate | n/a | see Results below |

**Results (2026-08-21, re-verified against commit 1bd5833, the final landed state)**

- `npx vitest run` (full frontend workspace) → **167/167 passing, 32/32 files green.**
- `npx tsc --noEmit` (frontend workspace) → **clean, 0 errors.**
- ESLint: no `lint` script and no ESLint config/devDependency present in this workspace (`frontend/package.json` scripts are `dev/build/preview/test/test:watch/test:e2e/test:e2e:ui/typecheck` only) — not a gate that exists to run, not skipped by choice.

**Second reconciliation — the "first name" fix (commit 1bd5833) made one of my own assertions stale, now corrected.** frontend-dev's `### Frontend` notes above (and independently, e2e-test-writer's and code-reviewer's sections) confirm the same finding this section already flagged below: `firstName()` produced "The" for every real household-name account. The fix removes `firstName()` and shows the full `user.name` (truncated past 24 chars, matching [[features/community-playdate-badge]]'s precedent), reverting to what the pre-redesign header already displayed. That correctly broke `renders exactly one chip with the first name only — no city/state text, no full name text`, which had asserted `queryByText(/Jane Ramirez/)).not.toBeInTheDocument()` — the literal opposite of the corrected behavior. Updated in place (not deleted — the test still guards real regressions): renamed to `renders exactly one chip with the full household name, truncated — no separate city/state text`; now asserts the full name **is** present, on an element carrying both `max-w-[24ch]` and `truncate`, and that the chip's accessible name still resolves to exactly one button. Also fixed a self-inflicted regex bug surfaced while rewriting this assertion — `/\bmax-w-\[24ch\]\b/` can never match, since both `]` and the space after it are non-word characters, so a trailing `\b` has no valid word/non-word transition to land on; replaced with a plain `toContain('max-w-[24ch]')` substring check. Full suite re-run twice after this fix, stable at 167/167 both times.

**TDD loop worked as intended — a real gap was caught red, then fixed, then re-verified green.** First pass against frontend-dev's implementation was 30/31 (`Navbar.a11y-behavior.test.tsx` alone) / 165/166 (full suite): `returns focus to the chip trigger after closing on Escape` failed — `handleKeyDown`'s Escape branch closed the account menu (`setAccountMenuOpen(false)`) but never called `.focus()` back on the trigger, leaving focus stranded on the now-hidden Sign-out button (in a real browser this drops focus to `document.body` — a keyboard user's position lost on every Escape-dismiss). This is a11y-auditor's Blocking #3, reproduced concretely. Left the test red rather than softening it, per frontend-dev's own `### Frontend` notes they then added `accountTriggerRef` and `accountTriggerRef.current?.focus()` inside the Escape branch. Re-run above confirms **all 166/166 pass** with that fix in place — no further action needed on this item.

**Reconciliation note — tooltip mechanism differs from this file's first draft, both are valid:** this test file originally assumed the hover/focus tooltip would use `aria-describedby` pointing at a separate node. frontend-dev's landed implementation instead renders the tooltip text as an `aria-hidden="true"` `<span>` inside the `<Link>`, shown via `group-hover:opacity-100 group-focus-visible:opacity-100`, with the link's own `aria-label` (not the tooltip) supplying the accessible name. Both satisfy "hover/focus tooltip, information not lost" — the shipped approach additionally avoids double-announcing the same string to screen readers via a redundant description. Test file was updated to assert the shipped pattern instead of insisting on the originally-assumed one.

**Flagged for product/design, not a test failure — "first name" may not mean anything for this app's real accounts.** `firstName()` in `Navbar.tsx` takes `user.name.split(/\s+/)[0]`. That's correct *if* `user.name` holds a person's given name ("Jane Ramirez" → "Jane"), which is what this test file's fixture uses and what the Reference spec / ui-designer's `### Visual` both assumed. But `backend/scripts/seed-dummy.ts` and every existing E2E fixture (`anderson@dummy.test` → `"The Anderson Family"`, similarly Brooks/Chen/Davis) populate `user.name` with a **family display name**, not a person's name — confirmed by e2e-test-writer's own comment in `header-nav-redesign.spec.ts` ("there's no separate first-name field in the data model"). `RegisterForm.tsx`'s "Your name" field is generic enough that either was always a valid answer, but the app's actual data consistently goes family-style. Run `firstName()` against that real shape and the chip reads **"The"** for every seeded account — worse than the pre-redesign header, which at least showed the full family name. This isn't a regression against the acceptance criteria as literally written (the code does extract "first token of `user.name`"), and no test in this file encodes "The" as expected-correct — that would bake in a bug. It's a product question one level up: does `user.name` mean "person" or "family" in this app, and should the chip's fallback (see ui-designer's `AccountChip` "empty" state note) also cover "first token is a stopword like 'The'"? Recommend the dispatcher/tech-lead route this to a follow-up rather than block this feature on it, since it predates this redesign (the ambiguity was already in `AuthUser.name`) and this feature only made it visible in a new place. **Independently corroborated twice since first flagged here:** frontend-dev's own `### Frontend` notes ("Known limitation, not fixed here") and e2e-test-writer's `### E2E coverage` notes both hit the same "The account menu" behavior and reached the same conclusion — three specialists converging on it independently is a stronger signal than any one of us alone; worth an actual follow-up rather than letting it sit as a footnote in three sections.

**Resolved in commit 1bd5833, after this was flagged.** frontend-dev dropped `firstName()` and reverted the chip to the full `user.name` (truncated past 24 chars) — see "Second reconciliation" above. Leaving this paragraph in place rather than deleting it: it's the record of how the bug was originally found and why, and the fix landed in the direction this section already recommended (show the real name, don't guess at a stopword-stripping heuristic).

**Superseded, kept for the record rather than silently deleted:** an earlier revision of this note flagged a stale code comment above a `TOOLTIP_LEFT_CLASS` constant claiming tooltip bubbles were positioned as `<Link>` siblings. Per frontend-dev's `### Frontend` notes, that whole approach (and the constant) was removed in a later revert to the simpler nested/`aria-hidden`/`group-hover` tooltip shape — current `Navbar.tsx` has no such comment or constant, so there's nothing left to fix. Confirmed by re-reading the file before finalizing this section.

### E2E coverage

Spec: `frontend/e2e/header-nav-redesign.spec.ts` (7 tests, 4 `test.describe` blocks, all against `anderson@dummy.test` / `davis@dummy.test` seed families).

| Scenario | Spec | Status |
|---|---|---|
| AC1+AC2 — each of the 5 icon-only links is reachable, clicking navigates to its route, and the active page's link is the *only* one carrying `aria-current="page"` | `header-nav-redesign.spec.ts:164` | pending (env — see below) |
| AC3 — every icon keeps its `aria-label`; its (always-mounted, `aria-hidden`) tooltip sits at `opacity:0` by default and flips to `opacity:1` on hover | `header-nav-redesign.spec.ts:206` | pending (env) |
| AC3 — same tooltip flips to `opacity:1` on keyboard focus (`.focus()` → `:focus-visible`) | `header-nav-redesign.spec.ts:216` | pending (env) |
| AC4 — Messages icon's `aria-label` reads "Messages, N unread" after actually receiving a new message (seeded via the `message` Edge Function + a before/after count delta, not an assumed absolute number) | `header-nav-redesign.spec.ts:230` | pending (env) |
| AC5 — Sign out is hidden (`hidden` attr) until the avatar chip is opened by **mouse**, then visible and functional through to `/login` | `header-nav-redesign.spec.ts:250` | pending (env) |
| AC5 — a11y-auditor's blocking Keyboard finding: Sign out is reachable and activatable via **keyboard alone** (Tab to chip → Enter opens, `aria-expanded` flips → Tab lands on Sign out → Enter signs out) | `header-nav-redesign.spec.ts:280` | pending (env) |
| AC6 (border 3px→2px), AC7 (`:focus-visible` ring *styling*) | — | not E2E's job — pure visual/style, no DOM-observable behavior change; a11y-auditor/ui-designer's terrain (see their subsections above) |
| AC7 (Escape closes the chip reveal + returns focus to the trigger) | — | intentionally not duplicated — covered by `Navbar.a11y-behavior.test.tsx` ("closes the reveal on Escape", "returns focus to the chip trigger after closing on Escape"), both passing as of this write; pure keyboard/focus state with no real-browser-only dependency, so RTL is sufficient and E2E would be redundant |
| AC8 (`Navbar.test.tsx` / `tsc`) | — | frontend-dev's / qa-engineer's own gates, not E2E |

**Honest execution status: written and reconciled against the real landed `Navbar.tsx`, but not executed live end-to-end.**

- **Blocker (environment, not code):** `frontend/.env` doesn't exist in this sandbox, so `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are unset. `frontend/src/lib/supabaseClient.ts` throws at module-load, and this spec (mirroring `playdates.spec.ts`'s own top-of-file guard) throws the same way before any test can run — confirmed this is an environment-wide precondition, not specific to this file: `npx playwright test playdates --list` fails identically. Whoever runs this next needs a real `frontend/.env` (copy `.env.example`, fill in a real anon key) against a Supabase project seeded via `backend/scripts/seed-dummy.ts`.
- **What was actually verified in this environment:**
  1. `npx playwright test header-nav-redesign --list` (with throwaway env vars, list-only — no network calls) registers all 7 tests cleanly against the real `Navbar.tsx`, confirming no syntax/import errors.
  2. Selectors were written against `Navbar.tsx` as landed (not the pre-redesign version this file was drafted against initially), and two real issues were caught and fixed by doing so before this was returned:
     - `toBeVisible()`/`not.toBeVisible()` does **not** detect the tooltip's `opacity:0`→`opacity:1` reveal (Playwright's visibility check ignores computed `opacity`, only `display`/`visibility`/zero-size — confirmed empirically with a throwaway fixture, then deleted). Switched those assertions to `toHaveCSS('opacity', ...)`.
     - The avatar chip's accessible name is `` `${firstName(user.name)} account menu` ``, and `firstName()` is a naive first-whitespace-token split. Every seeded dummy family's `user.name` is a *family* display name ("The Anderson Family", "The Brooks Family", …), so `firstName()` resolves to **"The"** for all of them — the chip's aria-label is "The account menu", not "Anderson account menu" as originally assumed. Selectors now match the stable "account menu" suffix instead. **Flagging this one up, not just working around it** — see notes to tech-lead/frontend-dev.
  3. Cross-checked against `frontend/src/components/Navbar.a11y-behavior.test.tsx` + `Navbar.test.tsx`: `npx vitest run` on both → **34/34 passing** against the real component (jsdom/msw, no live Supabase needed). Strong corroborating signal that the DOM contract this spec depends on (aria-label wording, aria-current exclusivity, aria-expanded toggling, tooltip markup/classes, Tab order) is real and correct — RTL just can't verify the *computed-CSS* half (opacity reveal, focus-visible ring) that this Playwright spec is the only layer actually exercising.

**Reconciliation note for tech-lead — qa-engineer's `### Test plan` "Results" above is timing-stale on one point, not wrong at the time it was written.** It reports `Navbar.a11y-behavior.test.tsx` at 30/31 with `returns focus to the chip trigger after closing on Escape` as a known-gap failure. Re-running that exact file fresh (twice, moments apart, immediately before writing this subsection) shows **34/34 passing**, that test included — and `### Frontend` above independently confirms frontend-dev added `accountTriggerRef.current?.focus()` to the Escape handler specifically to close this gap, which `### Code review` also independently corroborates (34/34, names the same fix). All three subsections now agree the gap is closed; only qa-engineer's "Results" snapshot predates the fix. Not mine to edit (outside this section's writer-ownership) — flagging so it doesn't get read as a live regression.

### Code review

**Summary.** This review spanned a real session-limit interruption/resume — confirmed via file mtimes and a ~6-hour wall-clock jump between my own `vitest` invocations, not just a narrative claim — and the file changed shape several times while I was mid-review (most notably a tooltip-implementation thrash between a nested-`aria-hidden`/`group-hover` shape and a sibling/`aria-describedby` shape, later reconciled back to the former). Final state reviewed: two commits on this branch, `c9dfe2d feat(frontend): redesign header nav to grouped pill track (Option B)` and a follow-up `1bd5833 fix(frontend): show full household name on nav chip, not first-name split`, with a clean working tree on top of them. I ran the full frontend suite directly rather than transcribing the results already written into `### Frontend` / `### Test plan` / `### E2E coverage`: **166 passed, 1 failed, 167 total** (reproduced twice, stable) — this contradicts the "166/166... clean" figure asserted in those three subsections and two `#team/eng` log entries, all written before `1bd5833` landed. Root cause: `1bd5833` switches the AccountChip to render `user.name` in full instead of `firstName(user.name)` — a reasonable response to a real, independently-flagged problem (this app's `user.name` is a household display name, e.g. "The Anderson Family," so first-token extraction produced "The" for every real account) — but it contradicts the Acceptance Criteria's "first-name chip" wording and ui-designer's `FirstName` anatomy, and it breaks `Navbar.a11y-behavior.test.tsx` (qa-engineer's file), which frontend-dev correctly left unedited per this feature's writer-ownership discipline but which nobody has reconciled since. Apart from that one unresolved cross-specialist conflict, the rest holds up well: all three of a11y-auditor's blocking items are correctly resolved and covered by passing tests, `tsc --noEmit` is clean, and the `brand-primary-pressed` fill on the puck/avatar (a literal deviation from the Reference Spec's plain `brand-primary`) is a verified non-issue — `frontend/src/tests/brand-contrast.test.ts` is a same-line regex guard that fails on any `bg-brand-primary`+`text-white` co-occurrence, which the puck's `text-white` icon needs, and ui-designer's own `### Visual` names `.pressed` as the explicit "zero-new-token fallback" for exactly this case. (Could not spot-check ESLint: no `eslint.config.*`/lint script exists anywhere in this workspace — confirmed via `package.json`'s scripts list — pre-existing gap, unrelated to this feature.)

**Must-fix**
- `frontend/src/components/Navbar.tsx:162,177-182` (commit `1bd5833`) vs. `frontend/src/components/Navbar.a11y-behavior.test.tsx:199-209` (qa-engineer's file) — the AccountChip renders the full `user.name` (`"Jane Ramirez"`) instead of `firstName(user.name)`; `Navbar.test.tsx:44-63` was updated in the same commit to expect this, but the sibling `Navbar.a11y-behavior.test.tsx` was not, and its existing "no full name text" regression guard now fails on `npx vitest run` (reproduced twice). This also contradicts the Acceptance Criteria ("collapses into a single avatar + **first-name** chip") and ui-designer's `### Visual` anatomy ("**FirstName** ... first token of `user.name`"). The underlying motivation is legitimate — already flagged three separate times in this same feature (by qa-engineer, e2e-test-writer, and frontend-dev's own prior commit's notes) as a real data-shape mismatch — but resolving it by silently changing what the chip renders, without updating the AC/Visual spec or reconciling the sibling test file, is the exact "silently patching a product decision in code" that frontend-dev's own earlier notes said explicitly not to do. Needs one of: (a) revert to `firstName(user.name)` and track the household-name problem as its own follow-up (matches the AC as currently written), or (b) get tech-lead/ui-designer sign-off to change the AC + Visual spec to "full name, truncated," then update `Navbar.a11y-behavior.test.tsx` to match — this feature file already has a working template for that exact reconciliation a few paragraphs up in `### Frontend` (the tooltip-mechanism thrash). Either is fine; shipping with the two test files actively disagreeing is not.
- `frontend/src/components/Navbar.tsx:42-234` — `Navbar()` is one ~193-line function (rules.md: "Functions ≤ 40 lines. Prefer early returns"). The shipped `### Visual` spec explicitly names `NavTrackItem` and `AccountChip` as their own components; neither was extracted — both `useEffect`s, the disclosure's `useState`/`useRef`s, and both link trees (desktop + mobile) live inline in one function. Straightforward to split along the boundaries the design spec already drew (`NavTrackItem.tsx`, `AccountChip.tsx` + a co-located `useAccountMenu.ts`).

**Nice-to-have**
- `frontend/src/components/Navbar.tsx:~127,163` — No `ring-offset-*` on the `:focus-visible` rings. The Visual spec asked for the ring to be "offset so it isn't clipped by the track's own rounded edge"; with only a 2px gap between 44px buttons, an un-offset 2px ring risks visually crowding its neighbor. Cosmetic — the AC only requires "visible," which this already meets.
- `frontend/src/components/Navbar.tsx:38-39` (`initialOf`) — falls back to `'?'` for an empty name; the Visual spec's hedged suggestion was a generic person glyph instead. Low priority — spec itself says this "shouldn't happen post-signup."
- Vault hygiene: `### Frontend`, `### Test plan`, and `### E2E coverage` (plus the 12:07 and 18:08 `#team/eng/qa` and 18:08 `#team/eng/frontend` log entries) all assert a clean "166/166" that stopped being accurate once `1bd5833` landed. Not mine to edit (writer-ownership), but worth a tech-lead pass to reconcile once the Must-fix above is resolved, so the vault doesn't keep asserting green against a red suite.

**Acceptance criteria spot-check**
- [x] Desktop nav renders the 5 links as icon-only inside one pill-shaped track — confirmed: single `rounded-full bg-surface-warm p-1` container wraps all 5 `<Link>`s, no visible label text nodes remain.
- [x] Active page's icon sits on a filled circular puck, white icon, distinct from `surface-warm` — confirmed; fill is `brand-primary-pressed` not literal `brand-primary`, verified as a forced/pre-approved substitution (see Summary), not a defect.
- [x] Icon-only links keep an accessible name via `aria-label` + get a visible hover/focus tooltip — `aria-label` supplies the accessible name; tooltip is an `aria-hidden="true"` `<span>` nested in the `<Link>`, revealed via `group-hover`/`group-focus-visible`. Verified via a direct full-suite run.
- [x] Unread badge still renders on Messages with the same `aria-label` pattern — badge count composed into the link's own `aria-label` exactly as before; passing.
- [ ] Right-hand cluster collapses into one **avatar + first-name** chip; sign-out reachable from whatever it opens — sign-out mechanism (lightweight disclosure, keyboard-operable, Escape closes + returns focus to the trigger) is correct and passing, but the chip now shows the *full* name as of `1bd5833` — see Must-fix #1. Currently failing its own dedicated test.
- [x] Header bottom border 3px → 2px `brand-primary` — `border-b-[3px]` → `border-b-2`, `border-brand-primary` retained; passing.
- [x] All interactive controls have visible `:focus-visible` + correct roles/`aria-current` — ring classes present on all 5 track links and the chip trigger; `aria-current="page"` preserved; Escape-returns-focus-to-trigger is explicitly tested and passing.
- [ ] `Navbar.test.tsx` updated + full suite/tsc stay green — `tsc --noEmit` is clean workspace-wide; the full suite is **not** green (166 passed / 1 failed / 167 total, verified directly via `npx vitest run`, reproduced twice) — contradicts "166/166" claimed elsewhere in this file.

### Tech-lead reconciliation (engineering aggregation pass)

Independently re-ran the suite against final `HEAD` (commit `1bd5833`) rather than take any of the counts above on trust: `npx vitest run` → **167/167 passing, 32/32 files**; `npx tsc --noEmit` → **clean, 0 errors**. This confirms qa-engineer's final reconciliation (`### Test plan`, "Second reconciliation") and supersedes two figures elsewhere in this section that were accurate when written and superseded by qa-engineer's same-day fix to `Navbar.a11y-behavior.test.tsx`: the "166/166" opening claim in `### Frontend`, and the "166 passed / 1 failed / 167 total" figure in `### Code review`'s Summary and its final acceptance-criteria row directly above. Also ran `Navbar.test.tsx` + `Navbar.a11y-behavior.test.tsx` in isolation: **35/35** (4 + 31, matching `### Test plan`'s own file-by-file count) — one higher than the "34/34" cross-check cited in `### E2E coverage`, which ran before qa-engineer's final reconciliation pass landed. Not a pass/fail contradiction, just a one-test drift from timing; noted for the record, not worth another round-trip to fix.

**Must-fix #1 (firstName/full-name test contradiction between `Navbar.a11y-behavior.test.tsx` and the landed chip): resolved**, confirmed by the run above.

**Must-fix #2 (`Navbar()` not split into `NavTrackItem`/`AccountChip` per ui-designer's `### Visual` anatomy): confirmed still open.** Verified directly: no `NavTrackItem.tsx` or `AccountChip.tsx` exists in `frontend/src/components/`; `Navbar.tsx` is 238 lines, one function well over this project's 40-line cap (`~/.claude/rules.md`: "Keep functions under 40 lines; extract if longer"). No `any` usage and no stray `console.log`/unlinked `TODO` found in `Navbar.tsx` or its two test files — those parts of the standards checklist are clean.

**Tech-lead call: non-blocking, tracked as a fast-follow — not gating `building → review`.** Same treatment as this board's `reply-coach-live` must-fixes (kanban: "non-blocking, tech-lead judgment... tracked as fast-follow"). Reasoning:
- The violation is organizational/maintainability, not correctness, security, or user-facing behavior. Every acceptance criterion the code touches is met, the full suite is green, `tsc` is clean, and all three of a11y-auditor's blocking findings are resolved and covered by passing tests.
- This branch already thrashed twice on pure-implementation questions (the tooltip mechanism, then the firstName/full-name chip content) across two session-limit resumes. Re-opening `building` for a pure-refactor pass with zero intended behavior change, on top of that history, carries real regression risk for no user-facing benefit.
- ui-designer's `### Visual` anatomy already names the target component boundaries (`NavTrackItem`, `AccountChip`, plus a co-located `useAccountMenu` hook per code-reviewer's suggestion), so the extraction is well-scoped, mechanical, and cheap whenever picked up — a good fast-follow candidate, not a deferred-indefinitely risk.
- Unlike `reply-coach-live`'s must-fixes (an unvalidated JSON.parse on a live SDK response, missing cache-hit logging), which were behavior-adjacent risks temporarily inert behind a flag, this finding carries zero runtime behavior difference between the monolithic and extracted forms — the "flag-gated, no live traffic yet" framing doesn't even need to apply here for the non-blocking call to hold, since there's no behavior gap to begin with, only a structure one.

Flagging to the dispatcher for a Backlog follow-up entry (see `notes` in my returned block) rather than letting this sit only as a footnote in a must-fix list.

## Design — Spec

### Visual

Formalizing the approved Option B ("Grouped Track") mock into buildable spec + design-system additions. Not re-litigating the direction — only filling in the pixel/token/state detail the mock didn't pin down, and flagging two places where the literal mock number doesn't cleanly fit the existing token canon.

**Component anatomy**

New components in **bold**, unchanged/reused in *italics*:

- `Navbar` (desktop) → *BrandMark + wordmark* (unchanged) + **NavTrack** + **AccountChip**
- **NavTrack** → **NavTrackItem** × 5 (Home, Family, Messages, Community, Playdates — existing `NAV_LINKS` order, unchanged)
- **NavTrackItem** → *IconGlyph* (existing `HomeIcon`/`FamilyIcon`/`MessageIcon`/`CommunityIcon`/`CalendarIcon`, unchanged) + *UnreadBadge* (existing, Messages only, repositioned) + **Tooltip** + visually-hidden accessible name (`aria-label`, unchanged copy)
- **AccountChip** → **Avatar** (initial) + *FirstName* text + disclosure target (dropdown vs. reveal — frontend-dev's call, open question #1; this spec only fixes the trigger's own visual states)

Header row:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [BrandMark] fofafu     ┌─ NavTrack ──────────────────┐    ┌─ AccountChip ─┐│
│                        │ (H)(Fam)(Msg●)(Com)(Play)     │    │ (A) FirstName │
│                        └────────────────────────────────┘    └───────────────┘
└───────────────────────────────────────────────────────────────────────────┘
                                2px solid brand-primary bottom border (was 3px)
```

NavTrack, zoomed (each `(...)` = one 44×44 circular button, `◉` = active "puck"):

```
┌── surface-warm fill, radius-9999, padding 4px, gap 2px ──────────────┐
│   ○        ○        ◉         ○         ○                            │
│  Home    Family   Messages  Community  Playdates                     │
└────────────────────────────────────────────────────────────────────────┘
```
Computed track height = 44 (item) + 2×4 (padding) = 52px; fully pill-rounded at `radius-9999`.

NavTrackItem (single item, layered):
```
NavTrackItem — button, 44×44, radius-9999
 ├─ IconGlyph        20×20 centered, aria-hidden
 ├─ UnreadBadge       Messages only — reuse the existing mobile-tab absolute-corner
 │                     treatment 1:1 (Navbar.tsx's mobile <nav> already solves
 │                     "icon-only + badge" this way: absolute -right-2 -top-1,
 │                     h-4 min-w-[16px], feedback-error fill) rather than a new impl
 ├─ a11y name          aria-label, same wording as today's visible label
 └─ Tooltip            mounts on :hover and :focus-visible only
```

AccountChip:
```
AccountChip — button/trigger, pill, 44px tall, px-8 gap-8
 ├─ Avatar            36×36 circle, brand-primary fill, white initial (first
 │                     letter of user.name), aria-hidden
 ├─ FirstName          14px/600/ink-lead, first token of user.name, truncate
 └─ disclosure target  opens Sign-out surface; content/mechanism is frontend-dev's
                        call (open question #1) — only trigger states specced here
```

**Token usage**

| Token | Applies to | Note |
|---|---|---|
| `color.surface.warm` | `NavTrack` container fill | same value, new application (was per-link, now the shared track) |
| `color.surface.card` | Header bar background (unchanged) | |
| `color.surface.subtle` | `NavTrackItem` **hover** fill | **not** `surface.warm` — the track itself is already `surface.warm`, so a same-color hover would be invisible against its own container. `surface.subtle` was introduced for exactly this "soft pill hover fill" case (see its design-system.md entry) — reusing it here, zero new tokens. |
| `color.brand.primary` | active "puck" fill; `AccountChip` `Avatar` fill; header bottom border (2px, was 3px); `:focus-visible` ring on all header interactive controls | matches the token's own documented use-cases ("icon fills… focus rings, active nav text") |
| `color.ink.lead` | default `NavTrackItem` icon color; `AccountChip` `FirstName`; `Tooltip` background | |
| `color.ink.muted` | not used — the city/state text it served is being removed | |
| `color.feedback.error` | `UnreadBadge` fill (unchanged component, repositioned only) | |
| `radius.9999` (pill) | `NavTrack`, each `NavTrackItem` (44px square → visual circle), `AccountChip` | |
| `radius.sm` (4px) | `Tooltip` bubble — **deliberately not** pill radius. Pills mean "clickable" under principle #3; a tooltip is informational, not actionable, so a small rect avoids implying it's a button. | |
| space scale `4` | `NavTrack` internal padding | matches scale, no issue |

*Contrast flag on the "puck":* `color.brand.primary`'s own table entry warns "white text against this fails 1.4.3 (~3.26:1) — do not compose white text on this token." The approved mock puts a **white icon** (not text) on this fill for the active puck. Icons fall under **1.4.11 Non-text Contrast** (≥3:1 for meaningful graphical objects), not 1.4.3's 4.5:1 text threshold — 3.26:1 clears 1.4.11. Since these icons become the *only* remaining signifier of the current page once labels are removed, they do count as "meaningful" graphics, so this isn't just a technicality. Recommend a11y-auditor re-verify this specific pairing explicitly (icon-on-fill, not the text-on-fill case the note was written for). Zero-new-token fallback if a wider margin is wanted: `color.brand.primary.pressed` (4.86:1 vs. white, already accessibility-proven).

*Scale conflict, flagged not silently resolved:* the mock's track `gap: 2px` is below the smallest existing space value (`4`) — see "Flagged token gaps" below.

**States**

*NavTrackItem*
- default — 44×44 circle, transparent fill, `ink-lead` icon at 20×20, sits inside the `surface-warm` track.
- hover — fill steps to `surface.subtle` (see Token usage); icon stays `ink-lead`.
- focus — `:focus-visible` 2px `brand-primary` ring, offset so it isn't clipped by the track's own rounded edge; tooltip becomes visible too (keyboard parity, required by acceptance criteria).
- current page ("puck," beyond the standard checklist but central to this component) — solid `brand-primary` fill, white icon, `aria-current="page"`; persists independent of hover/focus.
- disabled — n/a; all 5 destinations are always enabled. An unavailable destination should be omitted from the list, not shown disabled — flag to frontend-dev if that assumption is wrong.
- loading — the button itself renders synchronously; only its badge has an async dependency (see UnreadBadge).
- empty — n/a to the button itself; see UnreadBadge for "0 unread."
- error — unchanged from today: unread-count query failure silently falls back to 0/no badge (out of scope for this restyle, not a new regression).

*UnreadBadge (existing, repositioned only)*
- default/empty — `n = 0` → doesn't render (unchanged).
- populated — same `feedback.error` fill, same `"{label}, {n} unread"` aria-label, same 99+ cap; repositioned to the 44px circle's corner using the existing mobile-tab treatment (see anatomy above).
- loading/error — unchanged (falls back to 0, see NavTrackItem's error line).

*Tooltip (new)*
- default — unmounted / not in the DOM, no layout reservation.
- hover — mounts: `ink-lead` bg, white text, `radius.sm`, centered below the button (top-nav convention — above would clip against the viewport/browser chrome).
- focus — identical visual, triggered by `:focus-visible` on the parent `NavTrackItem`.
- disabled/loading/empty — n/a, content is always the static `aria-label` string.
- error — n/a.

*AccountChip*
- default — pill, no fill (header's own `surface-card` shows through), `Avatar` + `FirstName`.
- hover — `bg-surface-warm` (valid here — unlike `NavTrackItem`, the chip's resting background is `surface-card`, not `surface-warm`, so there's no invisible-hover problem; this also reuses the exact hover token today's Sign-out button already ships with).
- focus — `:focus-visible` 2px `brand-primary` ring around the whole pill.
- expanded (beyond the standard checklist — this is a disclosure trigger) — needs `aria-expanded`/`aria-haspopup` wired to whatever frontend-dev builds behind it; this spec fixes only the trigger's own visual states.
- disabled — n/a while authenticated.
- loading — chip doesn't render until `user` resolves from the auth store (matches today's conditional render — no skeleton proposed; pre-existing gap, not a new regression).
- empty — if `user.name` is ever empty (shouldn't happen post-signup, name is required), fall back to a generic person glyph in the `Avatar` circle rather than an empty circle — named so the implementer doesn't have to guess.
- error — n/a, no async fetch scoped to the chip beyond the already-resolved store.

**Open question (mine) — tooltip typeface: recommend Nunito, not JetBrains Mono**

Not carrying the mock's mono tooltip into the formalized spec. Principle #4 in `design-system.md` is explicit: mono is for "small eyebrow labels and category chips… never on body." A hover tooltip on a nav icon repeats the plain-English `aria-label` verbatim, including the unread-count variant ("Messages, 3 unread") — that reads as a functional status clause, not a taxonomy/category label, so it's body register, not an eyebrow. Two supporting reasons beyond the principle citation: (1) legibility — monospace runs wider per character than Nunito at the same size, and the longest realistic string ("Messages, 99+ unread") has to fit without wrapping awkwardly; (2) precedent — no other tooltip or transient UI-feedback surface in this app uses mono today, so this would be the first non-taxonomy use of it, exactly the drift principle #4 exists to prevent. Recommendation: Nunito 600, ~11–12px (a bespoke small size, same as the existing unread-badge numerals already do at `0.68rem`/`0.6rem` with no formal type-scale token — consistent precedent, not a new one), keeping everything else from the mock (`ink-lead` bg, white text, hover + `:focus-visible` trigger).

**Proposed design-system addition — name the "Pill Track" pattern**

`NavTrack` is the first time this codebase groups several mutually-exclusive icon toggles inside one pill-shaped container with a solid-fill "puck" for the active member, instead of separately-pilled buttons. That's a new *application* of principle #3 ("Pill-only CTAs") — extending "every actionable surface is a pill" from single standalone buttons to a cluster of related chrome-level actions sharing one pill. Recommend design-lead promote this as a named, reusable pattern — not a one-off tied to this Navbar — e.g. under a new `## Patterns` section, or as a sub-bullet under principle #3's adoption notes:

> **Pill Track.** When 2+ mutually-exclusive icon-only actions live together in persistent chrome, group them in one pill container (`radius.9999`, `color.surface.warm` fill, tight internal padding) instead of giving each its own floating pill. Each item is its own circular pill sized to the accessibility hit-target minimum (see proposed `size.hitTarget.min` below), and exactly one may carry the "puck" treatment — solid `color.brand.primary` fill, white icon — for whichever item is current/selected. No new color tokens required. First used: [[features/header-nav-redesign]] (Navbar). Candidate future uses: view-mode switchers, filter-scope toggles, thread-status tabs — anywhere a small cluster of icon-only, mutually-exclusive chrome actions would otherwise each get its own floating pill.

**Flagged token gaps** (per scope note: proposing here, not inventing silently in code)

1. **New token: `size.hitTarget.min` = 44px.** Rationale: icon-only controls (this `NavTrackItem`, and any future Pill Track item) need a documented minimum tappable area independent of the visual glyph size (glyph 20px, hit area 44px) — an accessibility floor, a different axis from the `space` scale (which governs gaps/padding between elements, not a control's own dimensions), so nothing on today's `4/8/12/16/24/32/48/64/96` scale legitimately covers it. Zero-new-token alternative: round up to the existing `48` space value instead — still clears the floor, but diverges from the already-approved mock's literal 44px, so I'm flagging rather than silently picking one. My recommendation: adopt the new token at 44, don't round to 48 — 44 is a deliberate accessibility number, not a layout choice, and tying it to the general `space` scale would make it drift if that scale is retuned later for unrelated reasons.
2. **Not a token — a documented exception:** the mock's track `gap: 2px` is below the smallest existing space value (`4`), which is a literal miss against "no half-units, no magic numbers" if read as a global rule. Recommend scoping it to the Pill Track pattern specifically (a tightly-fused-cluster gap is the point — even `4px` would read as five separate buttons instead of one track) rather than adding a global `2` to the space scale, which would invite magic-number creep elsewhere. Call this out explicitly in the pattern write-up so `gap-[2px]` isn't copy-pasted outside this pattern without asking.
3. **Considered, not flagging:** `Avatar` at 36px and `Tooltip` at `radius.sm` are reasoned choices within the existing scale/tokens (see Token usage above), not new asks.

### Microcopy
*(No ux-writer pass on this feature — by design, not omission. Nav labels are unchanged wording, only relocated from a visible `<span>` to `aria-label` (the hover/focus tooltip repeats the same string verbatim); the dispatcher judged this too small a copy surface to warrant a dedicated pass. Confirmed by design-lead against the shipped `Navbar.tsx`: every string that would otherwise need review — "Home"/"Family"/"Messages"/"Community"/"Playdates", the `"{label}, {n} unread"` badge pattern, "Sign out" — is copied unchanged from the pre-redesign component. ui-designer's `### Visual` and a11y-auditor's `### Accessibility` both state this explicitly ("same wording as today's visible label"). Nothing here is missing pending a specialist; none was scoped to this feature.)*

### Accessibility

**Audited against:** the Reference Spec + Acceptance Criteria in this feature file, plus `fofafu_vault/standards/design-system.md` tokens. `frontend/src/components/Navbar.tsx` on disk is still the **pre-redesign** version at audit time (confirmed via `git status` — zero local diff), and the `### Visual` subsection above was still unfilled by ui-designer when this was written. This is a **spec-level audit, not a build audit** — nothing new is built yet to run `axe-core` against (it's already a devDependency, `^4.11.4`, alongside `@playwright/test`), so `### a11y — Build audit` is deliberately omitted this pass. Re-run once frontend-dev's diff lands.

**Summary: 18 items reviewed, 3 blocking** — (1) avatar-chip initial fails text contrast, (2) desktop nav links lose their only accessible-name source, (3) avatar-chip reveal ("Sign out") has no confirmed keyboard model yet. (A 4th — no focus-visible ring token — downgraded to non-blocking below: ui-designer's `### Visual` landed concurrently with a concrete proposal that passes.) Details below by category.

#### Contrast

Computed with the WCAG relative-luminance formula (not eyeballed), against tokens in `design-system.md`.

| Pair | Ratio | Context | Verdict |
|---|---|---|---|
| white on `brand.primary` #4D9463 | 3.66:1 | Avatar-chip **initial** (text) | **FAIL AA** (1.4.3 needs 4.5:1 for normal text) — see Blocking #1 below |
| white on `brand.primary` #4D9463 | 3.66:1 | Active-nav "puck" icon fill (non-text graphic) | PASS (1.4.11 non-text needs 3:1) |
| `brand.primary` #4D9463 on `surface.warm` #FFFBF5 | 3.55:1 | Active puck vs. track background (component boundary) | PASS, thin margin (~18% headroom over the 3:1 floor) — worth a note to ui-designer if either token shifts later |
| `ink.lead` #1F1B18 on `surface.warm` #FFFBF5 | 16.58:1 | Inactive icon fill on track bg | PASS AA + AAA |
| `ink.lead` #1F1B18 on `surface.card` #FFFFFF | 17.10:1 | Inactive icon / avatar-chip name text on header bg | PASS AA + AAA |
| white on `ink.lead` #1F1B18 | 17.10:1 | Tooltip text on tooltip bg | PASS AA + AAA (contrast is not the risk here — see the 11px-size note under Keyboard) |
| white on `feedback.error` #B83B3B | 5.63:1 | Unread badge digit (token/copy unchanged) | PASS AA, fail AAA (not required) |
| `feedback.error` #B83B3B on `brand.primary` #4D9463 | 1.54:1 | Badge visually adjacent to puck fill when Messages is both active *and* unread | Not itself a WCAG SC (the badge's own text/bg pair is what's regulated, and that passes) — flagged as a **non-blocking** red/green legibility risk, forwarded to ui-designer |

**Blocking #1 — avatar-chip initial fails 1.4.3.** The Reference Spec says, verbatim: "avatar: 36px circle, `brand-primary` bg, white initial." `design-system.md` already documents this exact prohibition for this token: *"White text against this fails 1.4.3 (~3.26:1) — do not compose white text on this token."* My independently computed ratio is 3.66:1 (different rounding, identical verdict) — fails the 4.5:1 normal-text floor, and a single-letter initial in a 36px circle can't be relied on to consistently render ≥14pt/18.66px **bold** (the "large text" 3:1 exemption) across browsers/zoom. No new token needed: `color.brand.primary.pressed` (#3F7E54) is already the documented accessible pairing for white text (4.86:1, PASS AA) and is already in use elsewhere for CTA pills. Recommend the avatar-initial fill use `brand.primary.pressed`; leave plain `brand.primary` for the non-text puck icon fill, which is compliant as specified. This is a token swap within the existing palette, not a new palette decision — routed to ui-designer/frontend-dev, not requesting a design-lead retry loop.

#### Keyboard

- **Tab order** is unaffected by the restyle if DOM order is preserved: brand mark → 5 nav links (Home, Family, Messages, Community, Playdates, visual order) → avatar chip. No `tabindex` overrides needed or wanted.
- **Avoid a half-implemented toolbar pattern.** The "one track container" framing (single pill wrapping all 5 icons) may tempt `role="toolbar"` + roving `tabindex` (arrow-key nav, single Tab stop). Nothing in the Reference Spec asks for this. Recommend keeping 5 independent `<Link>`s, each its own Tab stop, unless frontend-dev deliberately implements the full roving-tabindex APG pattern end to end. A `role="toolbar"` applied only for visual grouping, without the matching arrow-key model, breaks Tab expectations. Non-blocking — preventive, nothing's built yet to fail this.
- **Tooltip hover/focus behavior (1.4.13 Content on Hover or Focus)** — a mechanism this feature newly introduces. Needs: persistent (stays until hover/focus/dismiss — a plain CSS `:hover`/`:focus-visible` reveal satisfies this for free) and, if the tooltip ends up obscuring a neighboring control, dismissible via Escape. The track's `gap: 2px` between 44px buttons is tight; if a tooltip's rendered width overlaps the adjacent icon's hit area, this SC is triggered. **Non-blocking now; becomes blocking if final tooltip sizing overlaps a neighboring 44px target** — flagging so it's checked once real dimensions exist.
- **Avatar-chip reveal ("Sign out") must be keyboard-operable — this is the item called out explicitly in my task scope.** This feature's own "Open questions" leaves the mechanism (real dropdown vs. simpler reveal) to frontend-dev's judgment, so I can't verify a concrete implementation yet. Whichever is chosen, it must clear all of: opens via Enter/Space on the chip (not click-only or hover-only), closes via Escape and returns focus to the chip trigger, and Sign out is reachable and activatable via keyboard alone. A hover-only or click-outside-only reveal with no keyboard open path would make Sign out **unreachable** for keyboard users — a 2.1.1 Keyboard failure, and a hard regression from today's always-visible, always-Tab-reachable "Sign out" button. **Blocking (spec gap)** — must be resolved and re-verified once frontend-dev's implementation lands. Recommend qa-engineer/e2e-test-writer add an explicit keyboard-only test case ("Tab to chip → Enter → Tab to Sign out → Enter") regardless of which mechanism is chosen.
- **Focus-visible ring — update, downgraded to non-blocking.** Drafted this as a blocking spec gap before re-reading the file; ui-designer's `### Visual` subsection (written concurrently, see its "States" tables) has since specified a 2px `brand-primary` ring for both `NavTrackItem` and `AccountChip`. Checked it against the Contrast table above: `brand.primary` vs. `surface.warm` = 3.55:1 and vs. `surface.card` (#FFFFFF, same value as the "white on brand.primary" row) = 3.66:1 — both clear the 1.4.11 non-text 3:1 floor, so it's compliant as specified. **Non-blocking**, but flagging two thin-margin considerations for ui-designer, not a re-open: (a) ~18–22% headroom only, worth re-checking if either token value ever shifts; (b) using the *same hue* for "focused" (thin ring) and "current page" (solid puck fill) is technically fine under 1.4.1 — shape/weight differs, not just color — but is a legibility nuance worth a look when Tab focus lands on the active item itself (ring-on-top-of-puck, both green). If a wider margin or clearer differentiation is wanted later, `ink.lead` (#1F1B18) rings at 16.6–17.1:1 against the same two backgrounds.

#### Semantics

- **`aria-current="page"`** already exists in today's code (`Navbar.tsx:90`) and must be preserved on the link element itself. It now carries more weight than before: with the puck being the only sighted-user cue for "current page" (previously a differently-colored *and* differently-labeled pill — shape/fill difference, not color alone, so 1.4.1 Use of Color still passes), `aria-current` is the only equivalent signal for screen-reader users. Not a regression risk by default — noting why it's non-negotiable here.
- **Avatar-chip trigger needs `aria-haspopup="menu"` (if a real dropdown) or `aria-expanded="true|false"` (either pattern) reflecting open/closed state.** Same root cause as the avatar-chip Keyboard finding above — not a separate blocking count, just the semantics half of the same gap. Screen-reader users need to know the chip toggles something before they try to interact with it.
- **Icons are already `aria-hidden="true"`** — confirmed in `frontend/src/components/icons.tsx:6` (`baseProps` sets it on every icon, including all 5 nav icons and `BrandMark`). No action needed; noting it so frontend-dev doesn't spend time re-adding it, and so nobody assumes a double-announcement risk that isn't there.

#### Screen-reader

- **Highest-risk item in the whole feature.** Today's **desktop** nav links (`Navbar.tsx:87-100`) have **no `aria-label`** — their accessible name comes entirely from the visible `<span>{link.label}</span>` text node. Only the **mobile** tab bar (lines 123-154) already has an explicit `aria-label` + `aria-hidden`-wrapped icon (lines 136, 142). The acceptance criteria's phrasing — "keeps its current `aria-label`" — is misleading for desktop: there isn't one to "keep" yet. If the visible label is deleted without adding `aria-label={link.label}` (or the badge-aware variant) in its place, all 5 primary nav links go from "Home" / "Family" / etc. to **completely unlabeled** for screen-reader and voice-control users — a 4.1.2 Name, Role, Value failure on the primary nav. **Blocking.** Fix is mechanical, and there's already a correct in-repo reference to copy: mirror the mobile `<Link>`'s `aria-label` + `aria-hidden` pattern (lines 136, 142) onto the desktop links.
- **Unread badge label** — keep composing it dynamically (`"{label}, {n} unread"`, exactly as `renderBadge` does today) into the link's `aria-label`, not as a separately announced node, so it isn't lost when the visible text label is removed.
- **Avatar-chip accessible name** should expose both identity and behavior, e.g. `aria-label="Account menu, {first name}"` (or equivalent), once `aria-haspopup`/`aria-expanded` are added — otherwise a screen-reader user hears a name with no indication it's an interactive toggle. Same root issue as the Keyboard/Semantics avatar-chip findings above, not a separate count.

#### WCAG 2.2-specific check

- **Target size (2.5.8, AA, min 24×24 CSS px):** every icon button is spec'd at 44×44 with the visible icon only ~20px — comfortably clears the minimum (also clears the stricter 44×44 AAA guidance, though that's not required). **PASS**, explicitly verified since 2.2 is new enough to be worth calling out. The `gap: 2px` between adjacent 44px targets doesn't trigger 2.5.8's spacing exception since each target already individually meets the 24px floor.

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
