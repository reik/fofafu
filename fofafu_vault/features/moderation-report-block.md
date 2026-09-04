---
slug: moderation-report-block
title: Moderation — report and block
owner: engineering
collaborators: [design, marketing]
status: building
priority: P2
created: 2026-06-12
target: null
links:
  kanban: "[[kanban/company]]"
  designs: null
---

# Moderation — report and block

## Problem

A foster-family community needs lightweight, after-the-fact moderation tools. Even with the reply-coach in place to soften draft comments, some content will still land that another family needs to flag, and some families will reach a point where one family doesn't want to see another's posts or receive their DMs. Without `report` and `block`, the only available escape valves are "leave the platform" or "ask an admin manually" — both too heavy for the kind of low-grade interpersonal friction this community will produce.

Success = a foster family can (a) report a specific post, comment, or DM in two taps, and (b) block another family in one tap from their profile, with both actions producing visible, immediate effects (reporter sees a confirmation; blocker stops seeing the blocked family entirely).

## Acceptance criteria

- [ ] Report flow available on every announcement, comment, and DM (icon in the existing action row, not a new surface).
- [ ] Report categories are short and foster-family-appropriate (not generic "spam / abuse / other" — voice owned by ux-writer).
- [ ] Reports persist with `{reporterId, targetType, targetId, category, note?, createdAt}` and are visible to an admin queue (admin tool is out of scope; the data lands).
- [ ] Block flow available on the family profile page and from any post/comment by that family.
- [ ] A blocked family is invisible to the blocker: their announcements vanish from the feed, their comments vanish from threads, their DMs vanish from the threads list, search excludes them.
- [ ] Block is one-way: the blocker sees nothing; the blocked family is not notified.
- [ ] Reporting and blocking are independent actions — reporting does not auto-block, blocking does not auto-report.

## Out of scope

- Admin moderation queue UI. The report data lands; reading it is a separate feature.
- Auto-moderation / classifier-based hiding. Coaching at write-time (reply-coach) is the prevention surface; this feature is the after-the-fact surface only.
- Block-list management screen. v1 surfaces unblock only on the previously-blocked family's profile (which the blocker can navigate to via the block UI confirmation).
- Reporting a *family* (vs. a post/comment/DM by that family). Channel-specific reports only in v1.

## Open questions

- Should blocks hide *historical* comments by the blocked family in already-read threads, or just future ones? (Hiding historical = more complete escape, but breaks thread readability for the blocker.)
- Where do report categories sit on the spectrum from "vague enough to be safe" to "specific enough to be useful for an admin"? Needs ux-writer.
- Should reports against the same target deduplicate per reporter, or accumulate? (Dedupe = cleaner data; accumulate = more honest engagement signal.)
- ~~DM blocks: when family A blocks family B, does the existing thread stay readable for A in case there's prior context A needs, or vanish entirely?~~ **Resolved (2026-07-08):** conversation history stays readable for the blocker (A). Only new messages from the blocked family (B) are prevented going forward; the thread does not vanish from A's inbox.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### Code review

**Summary.** No backend or frontend implementation code has landed on `feat/moderation-report-block` at the time of this review (2026-09-04, ~09:35, first pass of the parallel wave). `git diff master...HEAD` and `git status` in this worktree show zero changes under `backend/src/` or `frontend/src/` — no `reports`/`blocks` routes, tables, components, or Zod schemas exist yet. The only content in scope is (a) one pre-existing commit, `c98e27a` "chore(process): enforce async-state / cold-start checks," which is already merged on `origin/master` but not yet reflected in this worktree's local `master` ref (see note below — it is unrelated to this feature and predates it), and (b) the dispatcher's own bookkeeping (feature-file `status: drafting → building`, the `company.md` kanban card move, today's log stub). This is not a false negative: I completed the required reads, re-checked `git diff`/`git status` after an interval, checked for uncommitted/untracked files under `backend/src` and `frontend/src` (none, tracked or untracked), and confirmed no `.git/index.lock` (no commit in flight) before finalizing. **Verdict: nothing to review yet.** This subsection should be re-run once backend-dev/frontend-dev actually commit — a zero must-fix count here reflects absence of code, not a clean bill of health.

**Must-fix**
None — not applicable. No code exists yet to check against the standard checklist or the feature-specific risks named for this review (client-derived `reporterId`/`blockerFamilyId`, client-side-only blocked-family filtering, DM thread disappearing instead of staying visible per the resolved Open Question, coupled report/block actions, or category-wording drift between backend and ux-writer's microcopy). Watching for all five once code lands.

**Nice-to-have**
None — not applicable, same reason.

**Acceptance criteria spot-check**
- [ ] Report flow available on every announcement, comment, and DM (icon in the existing action row) — not assessable, no frontend code yet.
- [ ] Report categories short + foster-family-appropriate, ux-writer voice — not assessable; `### Microcopy` is also still a placeholder at review time.
- [ ] Reports persist `{reporterId, targetType, targetId, category, note?, createdAt}`, admin-queue-readable — not assessable, no backend route/schema/migration yet.
- [ ] Block flow available on the family profile page and from any post/comment by that family — not assessable, no frontend code yet.
- [ ] Blocked family invisible to blocker (feed/threads/DM-list/search) — not assessable yet, but flagging in advance: this bullet's literal "DMs vanish from the threads list" wording conflicts with the resolved Open Question (2026-07-08), which requires the thread + history to STAY visible to the blocker with only new inbound messages from the blocked family prevented. Implementation must follow the resolved OQ, not the literal AC text — will be must-fix if the thread is hidden/removed from the list.
- [ ] Block is one-way; blocked family not notified — not assessable, no backend code yet.
- [ ] Reporting and blocking are independent actions — not assessable, no backend code yet.

**Process note (not a code finding).** This worktree's local `refs/heads/master` is stale relative to `origin/master` — it's missing `c98e27a` (already merged via PR #72). Because `feat/moderation-report-block`'s tip *is* `c98e27a`, every `git diff master...HEAD` computed from this worktree will keep including that unrelated commit in scope until local `master` is updated (`git fetch && git branch -f master origin/master` from a checkout that isn't mid-feature, or equivalent). Doesn't block this feature, but worth a fetch before the next diff-based review so an unrelated commit doesn't get mistaken for in-scope changes.

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy

**Framing:** trust & safety, not growth — this copy is written to reassure, not to sell. No new public/marketing page exists or is proposed for report/block: both are in-app, authenticated-only actions a logged-out visitor never encounters.

**Release note** (internal changelog — 78 words)

> Your comfort in this community matters, so we've built two new tools: report and block. Report any post, comment, or DM in two taps — it goes straight to our team, no confrontation required. Block a family in one tap, from their profile or any of their posts: their content stops appearing — feed, threads, new messages — and they're excluded from search. Past conversations stay in your inbox; they're not notified. Reporting and blocking are independent — neither triggers the other.

**Social post** — Not written, by design. A public/social announcement puts a spotlight on moderation tooling for a platform serving foster families; that reads as either alarming ("something happened here") or glib ("now you can block people!") for a feature whose whole point is quiet, low-drama care. Recommend skipping rather than writing a softened version — flagging for marketing-lead to confirm rather than deciding unilaterally.

**Email subject + first line** — Not written. No email touchpoint in the acceptance criteria: report confirmation is in-app only, and blocks are silent by design (the blocked family is not notified). Nothing in this feature should trigger an email send.

**Landing-page block** — Not written. No public page exists or is warranted — report/block are authenticated-only, in-app surfaces; a logged-out visitor never sees them, so there's no landing surface to write for.

**Proposal, not copy** (flagging for ux-writer/design — not requesting, not claiming the section): a short in-app "Community guidelines" line near the report-category picker and the block-confirmation dialog could reinforce that these tools are reviewed by people, not a punishment system. Rough idea only, for whoever picks this up: *"Reports go to our team, not to the other family — we review every one."* This belongs in `### Microcopy` if it goes anywhere.

### SEO

**N/A in v1.** Report and block are in-app, authenticated-only actions — an icon added to the existing action row on announcements/comments/DMs, and buttons on the existing family profile page. No new route, public or authenticated, is introduced; the entire surface lives inside views that already exist (feed, thread, DM list, family profile). Documented explicitly, per role convention, rather than left blank.

**Route audit (why N/A):**
- Report: icon in the *existing* action row on announcements, comments, and DMs — acceptance criteria explicitly says "not a new surface."
- Block: button on the *existing* family profile page, plus from post/comment action rows.
- The visibility effects of a block (feed/thread/DM-list/search filtering) change *data returned to* existing authenticated routes; they don't create new ones.
- Out of scope items (admin moderation queue UI, block-list management screen) would themselves be authenticated-only if/when built — neither introduces a public route either.

**Fields (per role checklist, all N/A):**
- `title`: N/A — no page.
- `meta.description`: N/A — no page.
- `og.{title, description, image, type, url}`: N/A — nothing to share; no OG image needed.
- `twitter.{card, title, description, image}`: N/A.
- `schema`: N/A — no JSON-LD; no page exists to attach Article/Organization/Person schema to.
- `sitemap`: no entry added; `public/sitemap.xml` unchanged.

**Authenticated-views flag:** every surface this feature touches (feed, thread, DM list, family profile) is already `noindex` by standing convention; this feature only adds/removes actions and rows within that surface, it doesn't change indexability posture.

**Fast-follow worth flagging (out of scope for this dispatch):** a public `/help/trust-and-safety` (or `/help/reporting`) explainer — what report/block do, response-time expectations, how to reach an admin for anything they don't cover — would be a reasonable indexable page for prospective foster families vetting the platform, and the kind of page some partner-org/app-store review processes expect. Not specced here (no title/meta/schema drafted); if marketing-lead wants to pursue it, it should get its own feature file rather than ride along on this one.

### Growth
*(filled by growth-analyst)*
