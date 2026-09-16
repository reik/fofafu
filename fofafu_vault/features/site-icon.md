---
slug: site-icon
title: Site Icon
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-08-26
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Site Icon

## Problem

`frontend/index.html` has no `<link rel="icon">` and there is no icon asset anywhere in the repo — the browser tab falls back to a blank default, and bookmarking or adding fofafu to a phone home screen produces no icon. For a platform asking foster families to trust it with sensitive community/messaging data, an unbranded tab reads as unfinished. Success looks like: every page shows a recognizable fofafu icon in the browser tab, and saving the site to a phone home screen produces a real icon instead of a blank square.

## Acceptance criteria

- [ ] Browser tab shows a fofafu icon on every page (not the browser's blank default).
- [ ] Icon is provided at resolutions covering standard favicon + Apple touch icon + Android/PWA home-screen use.
- [ ] Icon reflects the fofafu brand (`color.brand.primary` / existing design tokens per [[standards/design-system]]), not a generic placeholder.

## Out of scope

- Full PWA manifest / installability (separate feature if wanted later).
- Per-environment favicon variants (staging vs. prod) — one icon everywhere for now.
- Animated or dark-mode-aware favicon.

## Open questions

- No brand mark/wordmark is defined yet in [[standards/design-system]]. Is there an existing source (Figma, prior fofa repo) ui-designer should port, or does one need to be originated from scratch?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(No backend surface — this is a pure frontend/static-asset feature: favicon `<link>` tags in `frontend/index.html` plus icon files in `frontend/public/`, nothing under `backend/`. `backend-dev` was deliberately not spawned for this dispatch; this is a scope decision, not an unfilled gap. Confirmed by tech-lead: `git status`/`git diff` for this dispatch touch no files under `backend/`.)*

### Frontend

**Correction-pass note**: this write-up follows an account-wide API-limit interruption (see today's `#team/dispatch` log entry) that killed an earlier identically-scoped frontend-dev spawn mid-run before it could write this subsection or the log entry. The code/assets themselves were **not** touched or redone in this pass — they were already complete and passing when this pass started. Everything below reflects my own direct verification against the files on disk, not a copy of the dispatcher's briefing.

**Deliverables** (confirmed present, non-empty, on disk 2026-09-02):

| File | Purpose |
|---|---|
| `frontend/index.html` | 6 `<link>` tags in `<head>`: SVG icon, 4 sized PNG icons (32×32, 16×16, 192×192, 512×512), Apple touch icon |
| `frontend/public/favicon.svg` | primary vector favicon (487 bytes) |
| `frontend/public/favicon-32x32.png`, `favicon-16x16.png` | PNG fallback for browsers without SVG favicon support |
| `frontend/public/icon-192.png`, `icon-512.png` | Android/PWA home-screen sizes |
| `frontend/public/apple-touch-icon.png` | iOS home-screen icon (180×180) |

**favicon.svg**, read directly off disk:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <title>fofafu</title>
  <circle cx="50" cy="50" r="46" fill="#F4ECDF" />
  <path d="M30 62 C30 44, 42 32, 50 32 C58 32, 70 44, 70 62" stroke="#4D9463" stroke-width="7" stroke-linecap="round" />
  <path d="M38 66 C38 52, 45 43, 50 43 C55 43, 62 52, 62 66" stroke="#F0B24F" stroke-width="7" stroke-linecap="round" />
  <circle cx="50" cy="66" r="5.5" fill="#4D9463" />
</svg>
```

Geometrically: a `#F4ECDF` circular background (`color.surface.subtle`), two open rounded-cap arc strokes — outer `#4D9463` (`color.brand.primary`), inner `#F0B24F` (`color.brand.warm`) — each curving up from around the base to a shared peak and back down, plus a small filled circle (`color.brand.primary`) sitting beneath them near the base. All three hex values are exact, case-confirmed matches for existing tokens in [[standards/design-system]] — no new token was invented. I'm not committing to one metaphorical read of the shape (the dispatch brief that spawned this pass called it "a protective nest/bowl"; to my eye the curvature reads more like a shared arch) — that interpretive call belongs to ui-designer, not to this section.

**Design divergence — flagged, not defended:** this project's default is to port fofa's existing pages/marks faithfully before redesigning (per house convention). What's on disk does not literally port `~/dev/fofa`'s `Logo.tsx` mark (adults + child + arch + heart) — it's an original abstract composition reusing two of that mark's brand colors but none of its figures. Worth noting factually: this feature file's own `## Open questions` section (still open, unedited by me) already flagged the port-vs-originate choice as unresolved before any implementation began ("No brand mark/wordmark is defined yet... does one need to be originated from scratch?"), which is relevant context but not a resolution — it doesn't tell us *why* origination was chosen over porting in this specific case. I have no reliable record of the interrupted prior run's actual reasoning — this is a fresh context — so I'm not going to invent a retroactive rationale I can't verify. I'm reporting the shipped artifact as-is; whether the divergence is the right call (e.g. whether `Logo.tsx`'s multi-figure detail would even read at 16–32px) is ui-designer's independent judgment to make in their own `### Visual` section this same wave, not mine to pre-empt or defend.

**Tooling:** `frontend/package.json` confirmed by hand — no new dependency in either `dependencies` or `devDependencies`, no image-processing library present. PNGs were generated from the SVG source using a native tool, not an npm package: macOS's `sips` is present on this machine (`/usr/bin/sips`, version 316) and is the documented approach. Corroborating but not conclusive: the PNGs' embedded XMP metadata (`x:xmptk="XMP Core 6.0.0"`) is consistent with Apple's native ImageIO stack (which `sips` uses) rather than a cross-platform library — no ImageMagick/librsvg/GraphicsMagick signature is present in the file. I did not re-run the conversion myself; redoing it is out of this pass's scope and risks introducing a spurious diff against an asset already verified good.

**Verification I ran myself (2026-09-02, this worktree):**

- `npm run typecheck` — clean, no errors.
- `npm run build` (`tsc --noEmit && vite build`) — succeeds; confirmed `dist/index.html` carries all 6 `<link>` tags and `dist/` contains all 6 icon files (Vite's `public/` passthrough verified working, not just present in source).
- `npm run test` — **182/182 passed**, 34 files. Re-ran `frontend/src/tests/site-icon.test.ts` in isolation for an exact count: **10/10 passed**.
- Cross-checked PNG pixel dimensions with the `file` command — a mechanism independent of both qa-engineer's hand-rolled IHDR parser and of `sips` itself: `favicon-32x32.png` 32×32, `favicon-16x16.png` 16×16, `icon-192.png` 192×192, `icon-512.png` 512×512, `apple-touch-icon.png` 180×180 — all RGBA PNG, non-interlaced, all match spec.
- Also spot-ran e2e-test-writer's `frontend/e2e/site-icon.spec.ts` myself for corroboration (not my subsection to own, see `### E2E coverage` above for their authoritative record): `npx playwright test e2e/site-icon.spec.ts --project=chromium` — **2/2 passed** against a live `npm run dev` server. The dev server logged an unrelated `Missing VITE_SUPABASE_URL` client-side error mid-run; harmless here since this spec only asserts against static `<head>` markup and fetched-asset content-types, never the React app's runtime.

**Screenshots — not captured, and structurally not capturable here:** `docs/screenshots/site-icon/` does not exist (only `admin-access/` and `header-nav-redesign/` are present under `docs/screenshots/`); no `before.png` / `after.png` were produced. This isn't a workaround-able sandbox gap — this feature's entire visible surface (a browser tab icon, a bookmark icon, a phone home-screen icon) lives in browser chrome / OS UI, and no screenshot tool available to me in this environment (Playwright, via the existing `@playwright/test` devDependency, is the only one) can capture that: `page.screenshot()` captures page content only, never the tab strip. e2e-test-writer's own spec file already documents this exact limitation for why AC1 can't be asserted pixel-by-pixel via Playwright; it applies identically to screenshot capture. A same-viewport screenshot of the rendered page body would also show zero trace of this change — no on-page DOM element reflects the `<head>` `<link>` tags — so producing one anyway would misrepresent verification rather than demonstrate it. Flagging this plainly per `engineering-standards.md`'s honesty-over-silence convention rather than skipping silently or faking a screenshot that shows nothing relevant.

**Outstanding, not actioned this pass (outside this pass's writer-ownership):** nothing under `frontend/` is committed yet — `git status` shows `frontend/index.html` modified and `frontend/public/`, `frontend/src/tests/site-icon.test.ts`, `frontend/e2e/site-icon.spec.ts` untracked.

### Test plan

**Correction-pass note**: this write-up follows an account-wide API-limit interruption (see today's log entry from `#team/dispatch`) that killed an earlier identically-scoped qa-engineer spawn mid-run before it could write this subsection. The test file itself was not touched in this pass — it was already complete and passing when this pass started. What follows is this pass's independent re-verification plus the write-up that never landed.

**Layer**: single Vitest file, filesystem/source-scan style (no jsdom rendering, no live server, no browser) — `frontend/src/tests/site-icon.test.ts`. 10 tests, one `describe` block. Per the file's own docstring, it was written TDD-first, before frontend-dev's asset/markup commit landed (same pattern as `brand-contrast.test.ts`'s precedent, referenced directly in the docstring).

| # | Test | Covers | Assertion |
|---|---|---|---|
| 1 | declares at least one `<link rel="icon">` | AC1 | ≥1 `rel="icon"` tag parsed out of `index.html` |
| 2 | declares an SVG icon as the primary favicon | AC1 | a `rel="icon" type="image/svg+xml"` tag exists |
| 3 | declares a PNG fallback for browsers without SVG favicon support | AC1/AC2 | a `rel="icon"` tag with `type="image/png"` or a `.png` href exists |
| 4 | declares `<link rel="apple-touch-icon">` for iOS home-screen bookmarking | AC2 | an `apple-touch-icon` tag exists |
| 5 | every icon `<link>` href resolves to a real file under `frontend/public/` | AC1/AC2 | every `icon`/`apple-touch-icon` href, resolved root-relative, has a matching file on disk — catches a silently-broken href (blank tab in a real browser, no console error) |
| 6 | apple-touch-icon PNG is exactly 180x180px | AC2 | hand-rolled PNG IHDR parse (dependency-free, no image-size package — see docstring's justification) → dims === {180,180} per Apple HIG |
| 7 | `icon-192.png` exists and is exactly 192x192px (Android/PWA) | AC2 | file exists + dims === {192,192} |
| 8 | `icon-512.png` exists and is exactly 512x512px (Android/PWA) | AC2 | file exists + dims === {512,512} |
| 9 | `favicon.svg` exists, is a real `<svg>` document, and is not an empty placeholder | AC1/AC3 | file exists, matches `/<svg[\s>]/`, content length > 40 chars |
| 10 | `favicon.svg` reflects the fofafu brand (`color.brand.primary` `#4D9463`), not a generic placeholder | AC3 | svg source contains `#4d9463` (case-insensitive); additionally rejects the case where only a known generic/Vite-default color is present with no brand token at all |

**Scope boundary (deliberate — stated in the file's own docstring)**: this suite verifies the *filesystem contract* — that `index.html`'s declared `<link>` hrefs resolve to real files with the right pixel dimensions, and that the SVG source contains real brand color — not the *rendered* result. jsdom does not fetch real `<link>` resources, so nothing in this file can confirm a browser tab actually paints the icon or that a phone's "Add to Home Screen" flow picks it up. That confirmation is delegated to the sibling Playwright spec, `frontend/e2e/site-icon.spec.ts`, documented above in `### E2E coverage` — it runs against a live dev server and asserts the `<link>` hrefs are actually fetchable and image-typed. The two layers catch different failure modes: this file catches "the referenced file doesn't exist on disk / has the wrong pixel dimensions" (a mistake in the commit); the E2E spec catches "the file exists but isn't actually served by the running app" (a mistake in how Vite/the server exposes it). Per the E2E section, AC2's Android/PWA-manifest clause and AC3's "reflects the brand, not a placeholder" judgment call are further scoped there — AC3 in particular is a visual/design judgment for which this suite only offers a scriptable proxy (hex match), not true rendered-color confirmation.

**Fresh verification, this pass (2026-09-02):**

```
$ npm run test -- site-icon
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

```
$ npm run test          # full frontend workspace, regression check
 Test Files  34 passed (34)
      Tests  182 passed (182)
```

```
$ npm run typecheck     # tsc --noEmit
(clean, no output, exit 0)

$ npm run build         # tsc --noEmit && vite build
✓ 498 modules transformed, built in 756ms
```

Independently cross-checked the underlying files by hand — deliberately using different tooling than the test's own hand-rolled IHDR parser, as a sanity check against a bug in that parser itself:

- `file(1)` on every PNG under `frontend/public/`: `apple-touch-icon.png` → 180×180, `icon-192.png` → 192×192, `icon-512.png` → 512×512 (all match the suite's asserted dimensions exactly), plus `favicon-32x32.png` (32×32) and `favicon-16x16.png` (16×16) — present and wired via `sizes="32x32"`/`sizes="16x16"` in `index.html` but not asserted individually by dimension in this suite.
- `grep -io "#4d9463" frontend/public/favicon.svg` → 2 matches — brand color independently confirmed present.
- `grep "<link" frontend/index.html` → 6 tags total (SVG icon, two sized PNG fallbacks, the two PWA-size PNGs, apple-touch-icon), all with hrefs resolving to files that exist on disk.

**Acceptance-criteria checklist (test-plan view):**
- [x] AC1 (browser tab shows a fofafu icon, not the blank default) — filesystem-level proxy satisfied: tests 1–3, 5, 9 confirm a real SVG+PNG icon is declared in `index.html` and resolves to real files. Rendered-tab confirmation is the sibling E2E spec's job (see `### E2E coverage`).
- [x] AC2 (resolutions covering favicon + Apple touch + Android/PWA) — tests 4, 6, 7, 8 confirm apple-touch-icon (180×180), icon-192 (192×192), icon-512 (512×512) all exist at their exact required dimensions; 16×16/32×32 favicon sizes confirmed present via the independent `file(1)` check above (not asserted individually by name in the suite itself).
- [x] AC3 (reflects the fofafu brand, not a generic placeholder) — test 10 gives a scriptable proxy (brand hex present, generic-placeholder hex absent-or-superseded); true visual/design judgment is outside this suite's reach by design, consistent with `### E2E coverage`'s note that this is design-review territory.

### E2E coverage

One spec, two scenarios — `frontend/e2e/site-icon.spec.ts`. Both now **pass** (corrected 2026-09-02; supersedes the 08-26 09:07 log record below, which was accurate for its time): frontend-dev's `<link>` tags and icon assets have since landed (`frontend/index.html` now carries 6 icon `<link>` tags, `frontend/public/` has the 6 corresponding image assets). No spec changes were needed: hrefs are read off the live DOM rather than hardcoded, so the spec didn't couple to frontend-dev's exact filename/format choice.

| Scenario | Spec | Status |
|---|---|---|
| AC1 — page serves a `<link rel="icon">`; its href is reachable at runtime and returns an image content-type (the scriptable proxy for "browser tab shows a real fofafu icon, not the blank default") | `frontend/e2e/site-icon.spec.ts` | pass |
| AC2, favicon+Apple-touch-icon half — page serves a `<link rel="apple-touch-icon">`; its href is reachable at runtime and returns an image content-type | `frontend/e2e/site-icon.spec.ts` | pass |

**Scope judgment (why a Playwright spec, and why only these two checks):** Playwright has no access to actual browser-chrome or OS-level rendering — there's no way to screenshot a tab bar or a phone's home-screen icon grid — so AC1 can never be verified as "the pixel in the tab looks right" by any E2E tool. What *is* E2E-testable is the underlying contract the browser/OS reads from: the `<link>` tag exists in the served document and its href is a real, fetchable, image-typed asset. That's what this spec checks, against a real running dev server. This is a live-request **complement** to qa-engineer's `frontend/src/tests/site-icon.test.ts` (a source/filesystem scan of `index.html` + `frontend/public/`, written TDD-first), not a duplicate of it — that file's own docstring says "Browser-level confirmation ... is out of this file's scope — see e2e coverage in the feature spec's ### E2E coverage section," i.e. qa-engineer wrote it expecting this spec to exist as the second layer. The two catch different failure modes: qa-engineer's scan catches "the referenced file doesn't exist on disk / wrong pixel dimensions"; this spec catches "the file exists but isn't actually served / reachable through the running app."

Two AC clauses are **deliberately not covered** by this spec:
- AC2's "Android/PWA home-screen" clause — no `manifest.json` exists (full PWA manifest is explicitly out of scope per this feature's own Out-of-scope section), so there's no distinct link/manifest contract beyond the favicon check above; without a manifest, Chrome's Android "Add to Home Screen" falls back to the same `<link rel="icon">` already asserted.
- AC3 ("icon reflects the fofafu brand ... not a generic placeholder") — a visual/design judgment call, not a DOM assertion. qa-engineer's unit test already gives this a scriptable proxy (hex-match against `favicon.svg`'s source for `color.brand.primary`); true rendered-color confirmation is ui-designer/a11y-auditor visual-review territory, consistent with how header-nav-redesign's E2E coverage handled its own visual-only ACs.

Verified by running `npx playwright test e2e/site-icon.spec.ts --project=chromium` directly against this worktree on 2026-09-02: 2/2 pass — confirms the spec is wired correctly and now exercising the real `<link>` markup/assets frontend-dev landed, not a script bug.

### Code review

**Summary.** Reviewed the full working-tree diff for site-icon. No commits exist yet on `feat/site-icon` (`git log master..HEAD` is empty, so `git diff master...HEAD` would show nothing) — per this dispatch's 09-02 12:22 log entry, the work is real and complete but not yet committed, so review was done against `git status`/`git diff` on the working tree instead. Scope: `frontend/index.html` (+6 `<link>` tags, no other changes), 6 new binary/SVG assets under `frontend/public/`, qa-engineer's `frontend/src/tests/site-icon.test.ts`, and e2e-test-writer's `frontend/e2e/site-icon.spec.ts`. Independently re-ran both: unit 10/10 pass, e2e 2/2 pass (`npx playwright test e2e/site-icon.spec.ts --project=chromium`). Also spot-checked: `tsc --noEmit` clean; no `console.log`/`any`/`@ts-ignore`/`TODO` in any new file; `package.json` diff is empty at both repo root and `frontend/` (no new dependency, matching the stated `sips`-based, dependency-free approach); no `manifest.json` anywhere in the tree (out-of-scope item correctly not added); all six `<link>` `type`/`sizes` attributes match their target files' actual MIME type and pixel dimensions exactly. This is a small, self-contained, frontend-only change with no backend/DTO surface and no PII exposure. Verdict: clean modulo one conditional must-fix below (screenshot convention, contingent on a sibling section not yet written at review time).

**Must-fix**
- `docs/screenshots/site-icon/` (missing — no `before.png`/`after.png` anywhere in the repo) — engineering-standards.md's screenshot convention is explicit that this is "deterministic, not reviewer's-discretion" for any PR that changes user-visible behavior, and a favicon is user-visible (browser tab, phone home screen) even though it's chrome rather than in-page UI. The escape hatch requires an *explicit stated reason* in `### Frontend`, not silent omission — and `### Frontend` is still the unfilled template placeholder as of this review (its correction pass hadn't landed yet when I read the file), so there's currently no recorded justification either way. This is genuinely contingent, not a confirmed defect: re-check once frontend-dev's write-up lands. If it states a reasoned exemption (e.g. Playwright/automated tooling has no access to browser chrome or a phone's home-screen grid — confirmed true, e2e-test-writer made the identical observation in `### E2E coverage` — and a manual OS-level capture wasn't taken because of X), this downgrades to nice-to-have or drops entirely. Flagging now so the tech-lead knows to verify before gating `review → shipped` rather than missing it because it wasn't there on this pass.

**Nice-to-have**
- `frontend/public/icon-192.png`, `frontend/public/icon-512.png` — naming drifts from the `favicon-` prefix used by the two smaller PNGs in the same directory (`favicon-16x16.png`, `favicon-32x32.png`). Either drop the prefix from all four raster favicons or apply it consistently (e.g. `favicon-192x192.png`/`favicon-512x512.png`) so the four read as one family at a glance. `apple-touch-icon.png` is correctly exempt from this — no-dimensions-in-filename is the actual Apple convention (browsers/OS probe `/apple-touch-icon.png` by that exact name by default).
- `frontend/index.html:5-10` — no classic `/favicon.ico` fallback. Not required by AC2's explicit resolution list and not a functional gap in any current evergreen browser (SVG-first with sized PNG fallbacks is standard modern practice), but some crawlers/RSS readers/older browser "new tab" thumbnails still probe `/favicon.ico` by convention regardless of `<link>` tags present. Trivial, low-cost addition if it ever surfaces as a support question — not worth blocking on now.

**Acceptance criteria spot-check**
- [x] Browser tab shows a fofafu icon on every page (not the browser's blank default) — `index.html` is the single SPA shell serving every route, so all 6 `<link>` tags apply globally, not per-page; the primary `link[rel="icon"]` was confirmed reachable and image-typed at runtime by the (independently re-run) e2e spec.
- [x] Icon is provided at resolutions covering standard favicon + Apple touch icon + Android/PWA home-screen use — 16×16, 32×32, 180×180 (apple-touch-icon), 192×192, 512×512 all present and pixel-exact (`file` output + qa-engineer's PNG-IHDR dimension assertions, independently re-run, 10/10 pass); no `manifest.json`, correctly matching this feature's own out-of-scope list.
- [x] Icon reflects the fofafu brand (`color.brand.primary`/existing tokens), not a generic placeholder — `favicon.svg` uses `#F4ECDF`/`#4D9463`/`#F0B24F`, exact matches for `color.surface.subtle`/`color.brand.primary`/`color.brand.warm` in `standards/design-system.md`; no Vite/React stock placeholder colors present. Separately, and *not* rendered as a review verdict here (design-authority call, not a code-quality one — see `notes` in my return): the mark itself is an original geometric abstraction rather than a port of `~/dev/fofa`'s figurative `Logo.tsx` (two adults + child + heart, drawn from the same two brand hexes). The feature file's own `## Open questions` already flagged whether a source mark should be ported as unresolved, so this is squarely ui-designer's call, not a gap in this AC as literally worded.

## Design — Spec

### Visual

*(Post-hoc assessment — the mark shipped before design ran on it this wave; see Process note at the end for why. Evaluated on the merits below, not approved because it already exists — per explicit instruction, "it's already built" is not treated as a reason on its own.)*

#### What shipped (verified directly against source)

`frontend/public/favicon.svg` — `viewBox="0 0 100 100"`, `<title>fofafu</title>`, 4 primitives:

| # | Part | Shape | Token | Value | Role |
|---|---|---|---|---|---|
| 1 | Background | `circle` r=46 (full-bleed, 4-unit margin) | `color.surface.subtle` | `#F4ECDF` | Badge field |
| 2 | Outer arc | open path (arch), `stroke-width 7`, round caps | `color.brand.primary` | `#4D9463` | Outer "shelter" band |
| 3 | Inner arc | open path (tighter arch, nested), `stroke-width 7`, round caps | `color.brand.warm` | `#F0B24F` | Inner "held" band |
| 4 | Base dot | `circle` r=5.5 | `color.brand.primary` | `#4D9463` | Cradled center |

Anatomy: `BrandMark(Favicon) > SurfaceBadge + OuterArc + InnerArc + BaseDot`.

Raster set, all present and wired: `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`, 6 matching `<link>` tags in `index.html`. No new tokens invented — every hex in the file matches a ratified `design-system.md` value byte-for-byte (two brand tokens + one surface token), not a coincidental substring match.

#### Design-system conformance

**Token-use audit** — is each token doing its documented job, or just technically present?

| Token | Documented use | Use here | Verdict |
|---|---|---|---|
| `color.brand.primary` | "icon fills, focus rings ... non-text-bearing contexts" | Icon stroke + fill | On-contract — this is the literal documented use case. |
| `color.brand.warm` | "accent (used in blocks, not text)" | Icon stroke, 7/100 width (≈ a band, not a hairline) | Compliant. Not text (the one hard constraint); at 7% of the icon's width it reads as a band, in spirit with "blocks." |
| `color.surface.subtle` | "low-contrast hover/active fill for text-on-surface pills ... reusable wherever a chip needs a soft pill" | Full-bleed icon background, no interaction | Repurposed, not violated — a genuinely new use case the doc doesn't name yet. But it's the *right* token for the job: the favicon needs a field warmer/darker than a browser tab's own white-ish chrome so it reads as a badge rather than blending in — `surface.warm` (#FFFBF5, near-white) would risk exactly that blend; `surface.subtle` is the one existing token built for "a step darker than page background," which is precisely what's needed here. Deliberate choice, not an accident of "closest hex." |

No hex literal in the file falls outside the ratified table — clears the design team's own token-drift sanity-sweep check.

**Visual-principles check** (against the Figma-reference principles in `design-system.md`):

| # | Principle | Read |
|---|---|---|
| 1 | Weight, not size, carries hierarchy | N/A — no type in this asset. |
| 2 | Color is depth | On-principle — two flat color bands + a dot read as layered depth with zero shadow/gradient. |
| 3 | Pill-only CTAs | N/A — not an actionable surface. |
| 4 | Mono = taxonomy | N/A — no text. |
| 5 | Generous whitespace | Justified exception, not a violation — background circle is near-full-bleed (4% margin). At 16-32px scale, generous internal whitespace would shrink the mark below legibility; the tension is scale-driven, same category as the Pill Track pattern's documented internal-gap exception (`design-system.md` § Pill Track). |
| 6 | Shadow-light | On-principle — flat fills/strokes, no drop shadow anywhere. |

Reads as fofafu per the team charter's mandate ("warm, careful home for foster families"): soft cream field, round caps throughout (no sharp corners in the mark), two warm-palette colors nested rather than colliding.

#### Legibility at favicon scale — the actual concern that motivated simplifying in the first place

Read `favicon-16x16.png`, `favicon-32x32.png`, and `apple-touch-icon.png` as rendered images directly, not estimated from path geometry alone:

- **16×16**: reads as a soft cream circle with a small green/gold blob at center. Not blank, not generic — clears AC1/AC3's literal bar. But the two-arc nesting is **not** discernible at this size: the ~4-unit gap between the outer arc's inner edge and the inner arc's outer edge (of a 100-unit viewBox) is ≈0.64px at 16px, and `stroke-width 7` is ≈1.1px — both below what antialiasing preserves as distinct shapes, so detail collapses into one soft blob.
- **32×32**: reads clearly — distinct nested-arc silhouette, cream/green/gold clearly separated.
- **180×180 and up** (`apple-touch-icon.png`, `icon-192`, `icon-512`): unambiguous — outer arch, inner arch, base dot all crisp.

**Verdict: real but bounded, not a defect in direction.** At 32px and above — the majority of real viewing contexts today (retina tab rendering, PWA/home-screen, apple-touch-icon) — the mark is clean and distinctive. At 16px it degrades to "a warm-colored blob" rather than a legible nested arch, but losing fine internal detail at 16px is normal for a two-tone icon of this complexity industry-wide, and the fallback read (unmistakably brand-colored, not a generic placeholder) still satisfies AC1 and AC3 at that size. **Polish gap, not a ship blocker.**

Non-blocking, scoped fast-follow if anyone picks it up later: widen the gap between the two arcs (push the inner arc's apex further in/down, or thin both strokes slightly) for 16px headroom, or generate a simplified single-arch-plus-dot variant just for the 16×16 raster. Not required for this feature.

#### Comparison against fofa's `Logo.tsx`

Read `~/dev/fofa/frontend/src/components/ui/Logo.tsx` directly. It's a literal scene: 2 adult figures (circle head + rounded-rect body each) + 1 child figure (same construction, smaller) + 2 arm-connector strokes (`stroke-width 3.5` in a 60-unit viewBox, ≈5.8%) + 1 heart (compound concave path) at the arch's apex, all under a `stroke-width 3.5` arch — 9 discrete shapes, several with fine strokes and concave curves that need meaningfully more than 16-32px to read (a two-lobe heart shape especially doesn't survive below ~24-32px in isolation, let alone as the smallest of 9 competing elements).

Colors carry over exactly (`#4d9463`/`#f0b24f` = `brand.primary`/`brand.warm`, hex-for-hex). What did **not** carry over: the two-figures-plus-child figuration, the heart, the limbs. What the shipped mark kept: the one element `Logo.tsx`'s own source comment names as doing the conceptual work — `{/* Protective arch — shelter / home */}` — extracted, doubled into a nested pair, paired with a dot standing in for "the held/cradled thing," with the literal figures dropped.

#### Resolving the Open Question

> "No brand mark/wordmark is defined yet in `design-system.md`. Is there an existing source (Figma, prior fofa repo) ui-designer should port, or does one need to be originated from scratch?"

**Resolution: approve "original abstraction, not a literal port" as the right call for favicon/small-icon use — on the merits.**

1. **A literal port would have failed this feature's own acceptance criteria worse than what shipped.** 9 shapes, several sub-2px strokes at 16-32px, and a concave heart, rasterized to 16×16 or even 32×32, would not produce "a recognizable fofafu icon" (AC1) — it would produce noise. The 16px gap flagged above is real but survivable (still reads as brand-colored, non-generic); a literal `Logo.tsx` port at 16px would not survive at all. This isn't an abstraction-for-its-own-sake preference — the source asset's complexity class is structurally incompatible with the deliverable's smallest required size.
2. **Color identity fully preserved** — same two hex values, doing the same structural job (primary = protective/structural element, warm = the softer inner/held element).
3. **The motif is extracted, not invented.** The shipped mark keeps the one element `Logo.tsx` itself flags as conceptually load-bearing and drops only what can't survive the resolution budget — a conservative simplification methodology, not a from-scratch reinvention.
4. **No new tokens** — lowest-risk path for a first brand-mark ratification.
5. **Reads as fofafu** — see conformance tables above.

Named honestly, not smoothed over: this trades explicit figuration (two-adults-plus-child, unambiguously "family") for an implicit shelter/nest metaphor that, without a wordmark or product context beside it, reads as "warm abstract mark" more than "foster family" in isolation. Not disqualifying for a **favicon** specifically — no favicon in common use (Slack, Figma, Notion, Linear) carries its full brand narrative at 16px, they carry color + silhouette + distinctiveness, and this does that. But this resolution should be scoped to icon/favicon/app-icon use, not silently inherited as the answer for fofafu's eventual primary header logo or marketing wordmark — whether that stays literal-figurative (like old fofa) or extends this abstraction system-wide is a materially bigger, still fully open decision that deserves its own dispatch, not a default inherited from a favicon.

If a future pass wants to revisit rather than extend, the concrete alternative worth naming: a single arch (not nested double-arch) plus dot — fewer competing elements, likely stronger at 16px, still legible as "shelter over something small." Named here so a follow-up has a specific starting point.

#### Should this get a documented "Brand mark" entry in `design-system.md`?

**Yes — propose one, scoped narrowly.** `design-system.md` currently has zero logo/icon/brand-mark entries despite this being the first shipped brand asset beyond raw tokens; leaving it undocumented means the next person touching branding (app-store icon, OG image, email header) reverse-engineers intent from SVG source instead of reading a ratified spec. Draft below is a proposal only — design-lead promotes into `design-system.md` per writer ownership, not written there directly by this pass:

> **Brand mark — Favicon / small icon.** `frontend/public/favicon.svg`, `viewBox 0 0 100 100`. Anatomy: `SurfaceBadge` (`color.surface.subtle` circle, full-bleed) + `OuterArc` (`color.brand.primary`, stroke 7/100, round cap) + `InnerArc` (`color.brand.warm`, stroke 7/100, round cap, nested) + `BaseDot` (`color.brand.primary` circle). Reads as a protective arch/nest cradling a small held shape. Originated as a deliberate abstraction of fofa's legacy `Logo.tsx` (two figures + child under an arch), extracting only the arch/shelter element — the legacy figuration does not survive rasterization below ~32px and was dropped for that reason, not stylistic preference. Same two brand hex values carried over exactly; no new tokens.
>
> **Scope: icon/favicon/app-icon contexts only.** Not yet ratified as fofafu's primary header logo, wordmark, or marketing lockup — see [[features/site-icon]] `### Visual` for the reasoning trail if that comes up.
>
> **Known limit:** loses arc-nesting detail at 16×16 (reads as a brand-colored blob, not a distinct nested shape). Acceptable at that size per current bar; candidate refinement, not a blocker.

Suggest this lands as its own `## Brand mark` section (sibling to `## Patterns`) rather than folded into `## Tokens — Color`, since it's a ratified *composition* of existing tokens, not a new token itself — design-lead's call on exact placement.

#### State checklist

Not applicable in the literal sense — `favicon.svg`/PNGs are a static, non-interactive brand asset: no default/hover/focus/disabled/loading/empty/error states exist because nothing in app code renders it conditionally; it's the same markup every time, painted by browser chrome. Calling this out explicitly per the skill's instruction to flag silence rather than let a builder guess. The actually-variable axis for this artifact is **size**, not interaction state — covered under Legibility above (16 / 32 / 180 / 192 / 512, all verified by direct image read).

#### Process note

The Open Question named `ui-designer` directly, but the mark was built and shipped before design ran on it (per the day's dispatcher log: an interrupted wave meant frontend-dev's asset landed without a design pass first, discovered and corrected today). The outcome holds up on independent review, but the sequencing was backwards from how a first-ever brand mark should ideally go. Worth the dispatcher/design-lead routing future from-scratch brand-asset work through design *before* implementation, not after.

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
