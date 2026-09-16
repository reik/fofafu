---
kanban-plugin: basic
team: design
---

> Navigation: [[kanban/company]] · [[teams/design]] · [[standards/design-system]]
## Backlog

## In Progress
- [ ] [[features/playdates]] @design — new /playdates page (calendar week/month views, requests sidebar) + availability/request surface on /family/:id; visual, microcopy, a11y

## Review
- [ ] [[features/brand-contrast-fix]] @design — ui-designer + a11y-auditor returned; token `color.brand.primary.pressed` (#3F7E54, 4.86:1) ratified; migration + axe sweep landed per engineering
- [ ] [[features/reply-coach-live]] @design — no In Progress card existed for this collaborator-scope feature (never created during the interrupted 07-08 session); added directly to Review. ui-designer + ux-writer (re-audit) + a11y-auditor all returned; Visual N/A (no new surface), Microcopy 10/10 PASS on static voice-rule audit with Part 2 fixture tone-fidelity honestly deferred (no live API key), Accessibility 0 findings/0 blocking. Design-lead audit: consistent across subsections, no gaps.
- [ ] [[features/moderation-report-block]] @design — no In Progress card existed for this feature (never created during the long, rate-limit-interrupted 06-12→09-04 dispatch); added directly to Review per the header-nav-redesign/reply-coach-live precedent. ui-designer (ModerationMenu/ReportModal/BlockAction anatomy, zero new color tokens) + ux-writer (4-category taxonomy + full report/block/unblock/DM-banner string table) + a11y-auditor (21 items reviewed, 3 blocking) all returned. Design-lead audit: all 3 a11y blocking findings — `brand.primary` misused as text in 3 spots (1.4.3 fail), row-level block dropping keyboard focus to `document.body`, `ReportModal` confirmation missing `role="status"` — independently reverified fixed by reading the shipped `ReportModal.tsx`/`BlockUndoStrip.tsx`/`BlockedContentPlaceholder.tsx` directly, not just trusting frontend-dev's self-report. Ratified ui-designer's one-tap-block+inline-undo call (no confirm dialog) and backend-dev's DM-composer Variant-B override — both sound, cross-checked against code-reviewer's independent trace. ux-writer's Block copy predates ui-designer's anatomy (out-of-order dispatch) and left 2 reserved slots (`block.undo.strip`, `block.placeholder.body`) unfilled; frontend-dev's reconciliation reuses ux-writer's exact strings almost everywhere (verified string-by-string), with one short invented sentence in `BlockedContentPlaceholder` — good enough to ship, flagged as a ux-writer fast-follow, not a blocker. Token discipline confirmed clean (`ink.lead` reused, no new token) — but a repo-wide grep found the same `brand.primary`-as-text pattern still live in several unrelated files (`ReactionBar`, `Navbar`, `Avatar`, `Home`, others); recurrence documented in [[standards/design-system]], recommending a `/sanity-check design` pass.

- [ ] [[features/site-icon]] @design — same gap as the reply-coach-live precedent above: no In Progress card ever existed on this board, despite ui-designer's 12:45 log entry claiming "added a design kanban card directly to In Progress (none existed pre-dispatch)" — verified directly (`grep -n "site-icon"` returned nothing before this edit); that write failed silently or never happened. Added straight to Review per the reply-coach-live precedent (line above) rather than silently correcting the log record. Only ui-designer was spawned this wave (correctly — no copy surface and no in-page a11y surface on a static favicon; see notes below); returned a thorough `### Visual`: favicon.svg anatomy/token audit, resolution of this feature's Open Question (original nested-arc abstraction approved for favicon/icon/app-icon use specifically), and a proposed `## Brand mark` entry. Design-lead audit: mark shipped before design ran on it this wave (interrupted-dispatch side effect, self-flagged in ui-designer's own `#### Process note`) — independently re-verified the post-hoc review rather than rubber-stamping it: token hexes byte-matched on disk against `design-system.md`, 16/32/180px legibility confirmed by viewing the rendered PNGs directly (16px genuinely degrades to a blob, 32px+ reads clearly), and the comparison against fofa's figurative `Logo.tsx` (9 shapes incl. a concave heart) confirmed accurate by reading that file directly — the review holds up on the merits, not rationalization. Open-Question resolution scoping confirmed preserved: favicon/icon/app-icon only, explicitly not extended to fofafu's future primary header logo/wordmark. Microcopy + Accessibility correctly left N/A — concurred independently: no labels/placeholders/errors exist on a static image asset, and it never enters the page DOM/accessibility tree (referenced only via `<head><link>`), so there's no ARIA/keyboard/focus/contrast surface to audit. Promoted 1 design-system addition: `## Brand mark` → `### Favicon / small icon` (ratifies the shipped composition, no new tokens). Process note concurred with: future from-scratch brand-asset work should route through design before implementation, not after.

## Done
- [x] [[features/header-nav-redesign]] @design — Visual complete (NavTrack/NavTrackItem/AccountChip anatomy, tokens, states, open question resolved); Microcopy correctly empty, no ux-writer spawned — nav labels are unchanged wording; Accessibility 3 blocking findings, all independently verified fixed by design-lead reading the shipped `Navbar.tsx` directly (avatar-initial contrast → `brand-primary-pressed`, desktop `aria-label`s present, keyboard-operable disclosure with Escape-returns-focus). Promoted 2 design-system additions: `size.hitTarget.min` (44px) token + "Pill Track" pattern (extends principle #3). Merged to master 2026-08-22 (PR #64).
- [x] [[features/reply-coach]] @design — ui-designer + ux-writer + a11y-auditor; design-lead ratified 4 flagged gaps (added `color.surface.subtle` token; deferred system-wide brand-contrast fix to [[features/brand-contrast-fix]]); merged 2026-06-11 (PR #2)
- [x] [[features/focus-reset-on-route-change]] @design — a11y-auditor: 7 findings / 0 blocking; axe sweep 11/11 0 violations; Visual + Microcopy marked N/A (no surface)
- [x] [[features/a11y-audit]] @design
- [x] [[features/community-search]] @design
- [x] [[features/family-avatar]] @design
- [x] [[features/family-owner-link]] @design
- [x] [[features/polish-edit-delete]] @design
- [x] [[features/uploads-images]] @design
- [x] [[features/messages-pages]] @design
- [x] [[features/feed-pages]] @design
- [x] [[features/profile-pages]] @design
- [x] [[features/auth-pages]] @design
- [x] [[features/messaging-dms]] @design
- [x] [[features/announcements-feed]] @design
- [x] [[features/family-profiles]] @design
- [x] [[features/auth-password-reset]] @design
- [x] [[features/auth-email]] @design
- [x] [[features/user-profile]] @design

## Blocked

%% kanban:settings
{"kanban-plugin":"basic"}
%%
