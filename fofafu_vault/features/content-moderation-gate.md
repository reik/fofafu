---
slug: content-moderation-gate
title: Content Moderation Gate
owner: engineering
collaborators: []
status: building
priority: P2
created: 2026-09-10
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Content Moderation Gate

## Problem

[[features/moderation-report-block]] gives the community an after-the-fact escape valve (report, block), and [[features/reply-coach]] gently nudges authors away from phrasing that reads as harsh but is usually well-meaning — both are deliberately soft, dismissible tools. Neither one stops genuinely guideline-violating content (harassment, hate speech, threats, spam, doxxing) from ever reaching the feed in the first place: today it publishes immediately, and the only recourse is someone reading it and reporting it afterward.

Using the Claude API as a content classifier (per Anthropic's [content moderation guide](https://platform.claude.com/docs/en/about-claude/use-case-guides/content-moderation)), the platform should catch clearly-inappropriate content at write time — before it's ever published — and require the author to revise it. This is a firm gate, not a suggestion: unlike reply-coach's dismissible "want a softer version?" nudge, there is no "post anyway." The two systems are deliberately kept separate (confirmed with the user 2026-09-10) — reply-coach keeps softening well-meaning-but-harsh tone; this catches the narrower, more severe band of actual violations.

Success = harmful content never reaches the feed/thread in the first place, false positives on ordinary foster-family conversation are rare enough that the gate doesn't feel like an obstacle, and the two systems (this + reply-coach) never contradict or duplicate a prompt on the same piece of content.

## Acceptance criteria

- [ ] Applies to both feed/announcement posts and comments on submit, before the content is persisted or visible to anyone else.
- [ ] Content is classified against a defined set of community-guideline violation categories (harassment, hate speech, threats/violence, spam, doxxing/PII exposure, illegal content — final taxonomy is foster-family-appropriate and owned by ux-writer, mirroring how [[features/moderation-report-block]]'s report categories were defined).
- [ ] If flagged, the author sees a clear, non-punitive message explaining the content may not be appropriate for the community and must revise it before they can submit — no override/"post anyway" path.
- [ ] If not flagged, publish proceeds with no visible interruption — silent on clean content, matching reply-coach's proven "silent unless needed" pattern.
- [ ] Flagged content is never persisted or visible to any other user, even transiently (gate happens before the write, not a publish-then-takedown).
- [ ] Classifier inputs/outputs are not retained beyond what's operationally necessary — same privacy bar as reply-coach ("coach inputs are NOT persisted").
- [ ] Gated behind a feature flag, defaulting off, following the `reply_coach_enabled`/`reply_coach_live_enabled` precedent.

## Out of scope

- Any change to [[features/reply-coach]] or [[features/reply-coach-live]] — both stay exactly as they are (advisory, dismissible, tone-only). Confirmed explicitly with the user rather than assumed.
- Admin review queue for flagged/blocked content — this is a pure prevention gate, not a queue-based moderation system (mirrors [[features/moderation-report-block]]'s "admin tool is out of scope" precedent).
- Editing or moderating already-published content — this only runs at write time, before publish. After-the-fact handling is [[features/moderation-report-block]]'s job.
- DM message content — tentatively out of scope pending the open question below; do not build DM coverage without resolving it first.

## Open questions

- Does this cover DM messages too, or only the public feed/comments surface named above? The user's own phrasing ("feed/comment etc") didn't clearly settle this, and DMs are a different privacy context than public content — needs a product call, not an engineering default.
- Fallback behavior if the classification call fails or times out: fail-open (let the post through, matching reply-coach's silent-200 precedent — favors availability) or fail-closed (block until classification succeeds — favors safety, but a Claude API outage would stop everyone from posting)? This is a real tradeoff, not a default to pick silently.
- Exact violation-category taxonomy and the user-facing rewrite-prompt copy — ux-writer's call, likely informed by Anthropic's content-moderation guide's suggested category structure.
- Should any aggregate, non-content signal (e.g. "how often does this fire") be tracked for tuning/abuse-pattern purposes, given there's no admin queue to surface individual flags to? If so, same aggregate-only shape as `coach_events`, per growth-analyst.
- Where does this live technically — its own Edge Function, or a shared classification seam alongside `reply-coach-live`'s `ClaudeClient`/`LiveClaudeClient`? An implementation-strategy question for backend-dev/tech-lead, not a product one.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage

**Blocked on `### Backend` / `### Frontend` — not yet landed.** Checked twice in this session (08:3x and again ~08:5x, with a fresh re-read of this file immediately before each check and productive prep work in between) via `git diff master...HEAD --stat` and a repo-wide grep for `moderation-gate|classify|classification`: zero backend or frontend files for this feature exist yet, and both subsections above are still their unfilled placeholder text. This is not a failure — it's the expected outcome when e2e-test-writer is fanned out in parallel with backend-dev/frontend-dev rather than strictly after them (2-level dispatch, all specialists spawned in one block per `protocols/dispatch.md` §2).

No spec was written against guessed selectors/copy/flag names — that would produce a spec that either can't run or gives false confidence. Prep done so the spec can land immediately once code is available:

| Scenario (from Acceptance criteria) | Planned spec | Status |
|---|---|---|
| Flagged post on `/feed` composer blocks publish, shows the required non-punitive message, no override path | `frontend/e2e/content-moderation-gate.spec.ts` | pending (backend classifier + frontend blocking UI not landed) |
| Flagged comment on `/post/:id` composer blocks publish, same message contract, no override path | `frontend/e2e/content-moderation-gate.spec.ts` | pending (same) |
| Clean post on `/feed` composer publishes with no visible interruption | `frontend/e2e/content-moderation-gate.spec.ts` | pending (same) |
| Clean comment on `/post/:id` composer publishes with no visible interruption | `frontend/e2e/content-moderation-gate.spec.ts` | pending (same) |

**Target surfaces confirmed by reading source (no route change, per `### SEO`'s finding too):**
- Feed composer: `frontend/src/features/feed/components/AnnouncementComposer.tsx`, mounted on `/feed`. Current selectors: `getByLabel("What's going on?")` (textarea), `getByRole('button', { name: 'Post', exact: true })` (submit). Errors currently surface via `serverError` → `<p role="alert">`.
- Comment composer: `frontend/src/features/feed/components/CommentForm.tsx`, mounted on `/post/:id` (`AnnouncementDetailPage`). Current selectors: `getByLabel('Add a comment')` (textarea), `getByRole('button', { name: 'Comment', exact: true })` (submit). Same `role="alert"` error-surfacing pattern.
- Auth/seed pattern already in `frontend/e2e/utils/login.ts` (`loginAs(page, email)` against dummy families from `backend/scripts/seed-dummy.ts`) — reusable as-is, no new fixture needed for login.

**Two dependencies to flag for backend-dev/frontend-dev before I can write real assertions (not inventable by e2e-test-writer):**
1. **Deterministic flagged/clean fixtures.** Live Claude classification is non-deterministic input→output for E2E purposes. `reply-coach`'s precedent (`backend/src/services/coach/claudeClient.ts`'s `MockClaudeClient`) solved this with exact-match canonical strings (e.g. `"At least you got to keep her for a while."` → fixture B). This feature needs the equivalent: at least one canonical string that reliably classifies as flagged and one that classifies as clean, stable across runs, so the Playwright specs aren't asserting against live-model variance.
2. **Flag visibility to the e2e environment.** Per AC, the gate is "gated behind a feature flag, defaulting off" (`reply_coach_enabled` precedent). The Playwright `webServer` in `frontend/playwright.config.ts` points at a real target Supabase project (no local backend to toggle env vars against per-test) — the flag needs to default **on** in whatever environment `npm run test:e2e` targets, or the flagged/clean specs can't exercise the gate at all. Same shape of dependency reply-coach's live SDK follow-up will eventually hit.

Will re-check and write real specs the moment `### Backend`/`### Frontend` land (still within this feature's building phase — tech-lead should re-spawn e2e-test-writer once those subsections are filled, rather than treating this `skipped` as terminal).

### Code review

**Summary.** No backend or frontend code exists on `feat/content-moderation-gate` at review time — the branch (and `origin/feat/content-moderation-gate`, confirmed via `git fetch` + `git rev-parse FETCH_HEAD`) contains only the `313cac1` vault-scaffold commit. Re-checked 4 times across this session (~08:3x–08:47) via `git log master..HEAD --oneline`, `git diff master...HEAD --stat`, and a fetch-vs-local comparison, with a fresh re-read of this file before each check; `### Backend` and `### Frontend` are still unfilled placeholders. e2e-test-writer independently hit and logged the same gap (two checks ~20min apart, per the log). This is the expected shape of the 2-level parallel-spawn model (`protocols/dispatch.md` §2 — code-reviewer is fanned out alongside backend-dev/frontend-dev, not strictly after them), not a failure by anyone. There is no diff to line-review. Rather than finalize a review against nothing, the rest of this entry pre-loads the risk areas this dispatch's review scope specifically named, so a fast, targeted re-review can happen the moment code lands.

**Must-fix**
None — no diff exists to contain one. (Not a claim that the feature is fine; see watch-list below for what still needs confirming against real code.)

**Nice-to-have**
None — same reason.

**Review-readiness watch-list (for the re-review once `### Backend`/`### Frontend` land)**

1. **Transient-persistence ordering — the sharpest risk in this feature.** Current pre-gate `backend/src/controllers/announcement.controller.ts` inserts synchronously with no gate at all (`createAnnouncement` L97–107, `createComment` L191–204: `db().prepare('INSERT ...').run(...)` runs immediately). A Claude classification call is `await`-based, and Node's single-threaded event loop interleaves *other* requests during an `await`. If the implementation inserts the row before awaiting the classifier and deletes it afterward on a flagged verdict, that's a real transient-visibility window (another request could read it mid-await) — not a style nit, a direct violation of this feature's own AC ("gate happens before the write, not a publish-then-takedown"). Note that `db().transaction()` (used in `auth.controller.ts`) would *not* protect against this either, since better-sqlite3 transactions are synchronous and can't span an `await`. **Check for:** the classifier call resolves to a non-flagged verdict strictly *before* the `INSERT` executes; no insert-then-conditionally-delete pattern anywhere on this path.
2. **Fail-open vs. fail-closed is an open question, not a locked decision.** The spec's `## Open questions` explicitly calls this "a real tradeoff, not a default to pick silently." If backend code lands having picked one (most likely fail-open, mirroring `coach.controller.ts`'s `SILENT_FALLBACK` shape), confirm the spec was updated (open question resolved / a decision recorded) to say which one and why. A silent pick with no spec update is a process gap for the tech-lead, not something to wave through as "matches reply-coach precedent" — the spec itself says not to default silently here.
3. **No-override guarantee.** Unlike `coach.controller.ts`'s advisory silent-fallback (200 + `verdict: 'ok'`, correct for reply-coach's dismissible nudge), a flagged verdict here must hard-block the write server-side with no bypass — no `?force=`-style param, no second-submit, no client-only check that a modified client could skip. Needs both a backend enforcement check and a frontend UX check once code exists.
4. **Ephemeral-input bar.** `coach.controller.ts`'s no-persistence argument is structural: the failure-path logger writes only `{ message }`, never `req.body`; `coach_events` has no free-text column at all. This feature should match that bar exactly — no log call on this path should touch post/comment content. `### Growth` (landed after this watch-list was drafted) specs a `moderation_gate_events` table for exactly this purpose, column-for-column no-content-ever by design — confirm the shipped migration matches that shape (no draft/reasoning/rewrite column snuck in) rather than a looser table.
5. **Feature-flag naming.** `### Growth` names the flag concretely: `content_moderation_gate_enabled` / env var `CONTENT_MODERATION_GATE_ENABLED` / `isContentModerationGateEnabled()` alongside `featureFlags.ts`'s existing `isReplyCoachEnabled()`/`isReplyCoachLiveEnabled()` (uncached `process.env.X === 'true'`, default-off-if-unset). Check the shipped flag matches this exact name — a drift here (e.g. a differently-cased or differently-worded flag) wouldn't break anything functionally but would break `grep`-ability across the three sibling gates, which `### Growth` explicitly calls out as the reason to hold the line on naming.
6. **Contract surface.** Once `### Backend` lands, cross-check any new endpoint's response shape against whatever Zod schema `### Frontend` consumes — standard contract-drift check, not yet possible with nothing committed.

**Acceptance criteria spot-check**
- [ ] Applies to both feed/announcement posts and comments on submit, before persisted/visible — no code to check.
- [ ] Classified against a defined violation-category taxonomy — no code to check; taxonomy is ux-writer's open call per spec.
- [ ] Flagged → clear non-punitive message, no override path — no code to check; see watch-list #3.
- [ ] Not flagged → silent, no visible interruption — no code to check.
- [ ] Flagged content never persisted/visible even transiently — no code to check; see watch-list #1 (highest-risk AC here).
- [ ] Classifier inputs/outputs not retained beyond operational necessity — no code to check; see watch-list #4.
- [ ] Gated behind a feature flag, default off — no code to check; see watch-list #5.

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy

**Scope note.** This is a pre-ship draft, matching [[features/reply-coach-live]]'s precedent: launch copy is written now, during `building`, so voice work isn't a bottleneck once the feature is ready — but nothing below is published anywhere yet. The feature is default-off behind its own flag (per `## Acceptance criteria`), and several open questions in the feature file are still unresolved — DM coverage, fail-open vs. fail-closed on classifier timeout, and, most relevant here, the exact violation-category taxonomy and in-app rewrite-prompt copy, which is ux-writer's call in `### Microcopy`, not mine. The "what a flagged author sees" line below is a release-note-level gloss on the *experience* (a firm, non-punitive ask to revise, no override) for internal/changelog use — it is not the in-app string itself, and should not be quoted as such. Re-check this draft against ux-writer's actual taxonomy and against `### SEO`'s finding (no public page proposed this pass) before any of it is used publicly.

**Internal release note** (≤ 80 words)

We've added a quiet check that runs before a post or comment publishes, catching the narrow band of real violations — harassment, threats, doxxing, spam — before anyone ever sees them, instead of relying on someone reporting it afterward. If something's flagged, the author gets a plain, non-punitive note asking them to revise before it can go out; there's no "post anyway." Everything else publishes exactly as it does today. Flagged drafts are never stored or shown to anyone else.

**Internal Slack/standup line** (short-form, not public)

Content Moderation Gate: write-time Claude-classifier check on feed posts + comments, catching harassment/threats/doxxing/spam before publish — no override if flagged, silent if clean. Feature-flagged off by default. Deliberately separate from [[features/reply-coach]] (which stays a soft, dismissible tone nudge) — this is a firm gate for the narrower, more severe band. DM coverage, fail-open/closed behavior, and final taxonomy still open.

**Not done in this pass**

- No social post, email subject/line, or landing-page block — no email touchpoint exists for this feature, and per `### SEO`'s finding there's no public page or public rollout to announce yet. The microcopy-voice skill's landing-block guidance ("only for features significant enough to warrant a landing update") doesn't apply until the flag is live and the open questions above resolve.
- No public help-center or community-guidelines copy drafted, for the same reason `### SEO` gave for not minting a page this pass: writing around a taxonomy that's still ux-writer's open call risks drifting from what actually ships.
- No exact in-app "please revise" string is asserted anywhere above — that string belongs to ux-writer's `### Microcopy`, written independently of this subsection.

### SEO

**Applicability finding: N/A — no new public page/route.** This subsection documents the reasoning rather than forcing meta/OG/schema/sitemap artifacts that don't apply, per role convention ("Public pages only").

#### 1. Surface audit

Per `## Acceptance criteria`, this feature "applies to both feed/announcement posts and comments on submit" — i.e. it inserts a classification gate into the existing composer submit paths on:

- `/feed` (`frontend/src/pages/Feed.tsx`) — announcement composer
- `/post/:id` (`frontend/src/pages/AnnouncementDetail.tsx`) — comment composer

Both routes are confirmed in `frontend/src/App.tsx` to already be wrapped in `<RequireAuth>`:

```
<Route path="/feed" element={<RequireAuth><FeedPage /></RequireAuth>} />
<Route path="/post/:id" element={<RequireAuth><AnnouncementDetailPage /></RequireAuth>} />
```

No new route, page component, or URL is added. The feature adds a write-time check (classify → block-with-revise or silently proceed) inside forms that already exist on already-authenticated pages. There is no new content, template, or component surfaced to unauthenticated visitors or search crawlers.

Cross-checked against `## Out of scope`: no admin review queue (which would at least be an authenticated internal page, but explicitly excluded), no DM coverage (tentative, and DMs are `/messages/*`, also `RequireAuth`-gated in the current router even if this were in scope), and no change to already-published-content pages. Nothing in scope or in the open questions implies a new indexable surface.

#### 2. Meta / OG / Twitter / schema.org / sitemap

Not produced — none apply. `title`, `meta.description`, `og.*`, `twitter.*`, `schema`, and `sitemap` are all N/A for this feature. There is no canonical URL to mint because there is no page.

#### 3. Authenticated-views flag (role convention: "Authenticated views are noindex by default")

`/feed` and `/post/:id` were already authenticated, pre-existing routes before this feature and remain so. This feature does not change their auth posture, indexability, or robots directives — whatever `noindex`/robots convention the frontend already applies to `RequireAuth`-wrapped pages (per `[[standards/marketing-standards]]` "Authenticated views are noindex unless flagged otherwise") continues unmodified. If the backend classification call lives behind a dedicated endpoint (e.g. `POST /api/posts/:id/moderate` or similar, per the open technical-seam question in the feature body), that endpoint is API-only (JSON, session-gated) and should inherit the same `noindex`/`X-Robots-Tag` posture as other authenticated `/api/**` routes — flagging this for `backend-dev`/`code-reviewer` to confirm at implementation time, consistent with the precedent set in [[features/reply-coach]]'s SEO subsection for its sibling endpoint `POST /api/comments/coach`.

#### 4. Considered and rejected: a public trust/transparency page

[[features/reply-coach]]'s SEO subsection proposed a future `/help/reply-coach` explainer page because that feature is a positive, publicizable trust signal. This feature is a moderation/safety gate, which is arguably also publicizable ("we proactively screen for harassment and hate speech before it's ever posted"). I considered proposing an analogous `/help/community-guidelines` or `/help/content-moderation` page here.

**Rejected for this dispatch** — not because the idea has no merit, but because:
- It is not named anywhere in this feature's `## Problem`, `## Acceptance criteria`, or `## Out of scope` — proposing it here would be forcing an artifact onto a spec that doesn't ask for one, which the role brief explicitly warns against.
- The final violation-category taxonomy is an **open question** owned by `ux-writer`, not yet resolved. Any public-facing copy describing "what gets flagged" would need to wait on that taxonomy anyway, so drafting page metadata now would be premature and likely to drift.
- No existing route or page (`/help/*`, `/about/*`, or otherwise) currently exists in `frontend/src/pages/` for community guidelines — confirmed via repo search — so this would be new scope, not a refinement of something already planned.

If a public trust page is wanted later, it belongs in its own feature file (per `CLAUDE.md`: "No TODOs without a feature file"), not bootstrapped inside this one's SEO subsection.

#### 5. Frontend SEO wiring (Phase 3+)

None required for this feature. No `react-helmet-async` block to add — the composer components this gate touches are sub-components of already-`noindex` authenticated pages.

### Growth

**Naming note (surfaced, not silently resolved).** `.claude/agents/marketing/growth-analyst.md`'s general convention is kebab-case flags (`ff-user-profile-v2`). This feature's own Acceptance criteria names a different, already-doubly-precedented pattern instead: `reply_coach_enabled` / `reply_coach_live_enabled` — snake_case, `<name>_enabled`, backend env-var-backed. Following the feature spec's explicit instruction over the generic role convention here: the codebase precedent wins, because it's the pattern the two shipped/building features closest to this one (`reply-coach`, `reply-coach-live`) already use for this exact kind of backend gate, and introducing a third naming scheme would make flag-checks harder to `grep` for, not easier.

**For backend-dev — read this first, even if you finish before this subsection exists:**
- **Flag:** `content_moderation_gate_enabled` (env var `CONTENT_MODERATION_GATE_ENABLED`, boolean string — same read pattern as `featureFlags.ts`'s `isReplyCoachEnabled()` / `isReplyCoachLiveEnabled()`; add `isContentModerationGateEnabled()` alongside them). Defaults off, per Acceptance criteria.
- **Aggregate table:** `moderation_gate_events` — full schema in §5 below. No raw content, no classifier reasoning text, ever, matching the "classifier inputs/outputs are not retained" acceptance criterion.

#### 1. Primary metric — gate republish rate

```
gate_republish_rate = republished / (republished + abandoned)
```

Computed over `moderation_gate_events` rows where `verdict = 'blocked'`, restricted to rows older than the session-timeout window (§5) — a just-created blocked row hasn't had a chance to resolve yet and would wrongly count toward "abandoned" if included too early.

**Plain English:** *when someone's post or comment gets stopped by the gate, how often do they revise it and get it published anyway — versus just giving up?*

This is the one number that defines "this worked" because, unlike reply-coach's dismissible nudge, there is no "post anyway" path (per Acceptance criteria) — the only two outcomes for a blocked author are "successfully revise" or "abandon." A gate tuned correctly for a narrow, severe-violation band (harassment, hate speech, threats/violence, spam, doxxing/PII exposure, illegal content — not the broad "harsh but well-meaning" band reply-coach handles) should see **most** gated authors revise and get through, because the Problem statement's own success bar is "false positives... rare enough that the gate doesn't feel like an obstacle." A low republish rate is the earliest, cheapest-to-observe signal that the classifier is over-flagging ordinary foster-family conversation, or that the rewrite-prompt copy (ux-writer's territory, open question #3) isn't giving people a workable path to fix their post.

**Target band:** ≥ 70% at every rollout stage before advancing (§4) — an initial hypothesis, not a derived number (this is a first-of-its-kind gate with no prior baseline to carry forward the way reply-coach-live carried reply-coach's 35–60% band). Revisit once the first ≥400-event sample lands at the 10% stage (§3). Below 50% halts the rollout at its current stage regardless of guardrail health — a hard stop, not a "watch and see."

**Known blind spot, stated up front** (mirrors reply-coach-live's own acceptance-rate caveat): this metric cannot distinguish "false positive who gave up in frustration" from "genuine bad actor who correctly got stopped and left" — both show up as `abandoned`. There is no admin queue (per Out of scope) to disambiguate with ground truth. That's an accepted limitation of the no-queue design, not a metric flaw to fix later — it's exactly why the guardrails below exist as a second, independent check.

#### 2. Guardrail metrics (existing platform metrics, not invented here)

| Metric | Direction | Source |
|---|---|---|
| **Post/comment publish rate** (platform-wide, all submissions, not just gated ones) | must NOT drop >5pp vs. the 4-week pre-flag baseline | existing announcement-feed engagement metric (same one reply-coach-live guardrails against) |
| **Reported-comment rate** (on published content, once [[features/moderation-report-block]] ships) | must NOT increase | existing `moderation_reports` table |

Rationale for the second guardrail: if this gate is working, content that would have drawn a report should increasingly get caught before publish instead — so the report rate on what *does* get published should hold flat or fall, never climb. A climbing report rate alongside a healthy republish rate would suggest the classifier's taxonomy (open question #3) is missing a violation category entirely, rather than being too strict.

#### 3. Experiment

**Not a randomized A/B holdback** — a deliberate departure from reply-coach-live's 50/50 holdback design, worth stating explicitly rather than defaulting to the precedent: withholding this gate from a control group means intentionally leaving flagged harassment, threats, hate speech, or doxxing live in that group's feed for the life of the experiment. Reply-coach's downside-of-being-wrong is a missed *tone* suggestion; this feature's downside-of-being-off is *exposure to the exact harm the feature exists to prevent*. A safety gate is not an A/B-testable growth lever in the same sense a nudge is. (The role template asks for A/B "if applicable" — here it isn't, and the reason is load-bearing enough to state rather than silently omit.)

**Instead: a staged percentage rollout with a sample-size gate at each stage**, not a permanent control group — see §4.

- **Sample size per stage:** ≥ 400 `moderation_gate_events` rows with `verdict = 'blocked'` observed at a stage before evaluating whether to advance. (≈400 gives a ±5pp margin of error at 95% CI on the republish-rate proportion estimate, conservatively assuming p≈0.5; fewer than that and a stage's republish-rate read is too noisy to act on.)
- **Success threshold to advance a stage:** republish rate ≥ 70% **AND** both §2 guardrails hold, simultaneously — same "all must hold" framing as reply-coach-live §2, for the same reason: a healthy republish rate alone doesn't rule out a classifier that's silently suppressing overall participation, or missing a violation category the guardrails would catch.

#### 4. Feature flag — `content_moderation_gate_enabled`

| Stage | % of users | Gate to advance |
|---|---|---|
| Off (default) | 0% | ships behind flag per Acceptance criteria; classifier taxonomy (open question #3) finalized and reviewed by ux-writer |
| Internal / dogfood | dev + team accounts | fail-open/fail-closed behavior (open question #2, once resolved) verified end-to-end; spot-check confirms no raw content or classifier reasoning lands in `moderation_gate_events` or application logs |
| 10% | 10% of users | ≥400 blocked-event sample reached; republish rate ≥70%; both guardrails hold |
| 50% | 50% of users | held **minimum 2 weeks** (longer than reply-coach-live's 1-week hold — a miscalibrated gate here fully blocks a legitimate post outright, a more severe failure mode than a missed advisory nudge); republish rate and guardrails re-verified at the larger sample; category breakdown (§5) reviewed for any single category dominating flags disproportionately, a sign that one category's threshold is miscalibrated rather than the gate overall |
| 100% | 100% | full rollout; `moderation_gate_events` becomes a permanent ops/tuning dashboard from here, not a time-boxed read-out — there's no holdback arm to eventually "graduate," per §3 |

If republish rate drops below 50% at any stage, or either guardrail breaks, roll the flag back one stage (or to off) rather than pausing in place — matches the hard-stop framing in §1.

#### 5. Aggregate tracking — `moderation_gate_events` (resolves Open Question #4)

**Answering Open Question #4 directly: yes** — aggregate, non-content signal should be tracked, for exactly the reason the question names: no admin queue exists to surface individual flags to, so this table is the *only* tuning/abuse-pattern visibility this feature will ever have. Shape mirrors `coach_events` deliberately, column for column where the concepts line up:

```sql
CREATE TABLE moderation_gate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  surface TEXT NOT NULL CHECK (surface IN ('post', 'comment')),
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'blocked')),
  category TEXT,
  outcome TEXT CHECK (outcome IN ('republished', 'abandoned')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- **One row per gate check, both verdicts** — including `verdict = 'ok'` (clean, silent-publish) checks, not just blocked ones. Deliberate, mirroring `coach_events` (which also records every `verdict='ok'` call, not only `'suggest'`): without the clean-verdict rows there's no denominator for a flag rate, and no way to see total submission volume trending over time.
- **`surface`**: `'post' | 'comment'` only, matching this feature's actual scope (Acceptance criterion #1). Does **not** include `'dm'` — DM coverage is still open (open question #1); if that resolves to "yes," add `'dm'` to the `CHECK` constraint in a follow-up migration rather than guessing now.
- **`verdict`**: reuses `coach_events`'s exact `'ok'` term for the pass state — a literal terminology mirror, not just a shape mirror. Uses `'blocked'` rather than `coach_events`'s `'suggest'` for the fail state, deliberately different, because this gate has no dismissible-suggestion state to name — `'blocked'` says what actually happens (no "post anyway" path, per Acceptance criteria).
- **`category`**: nullable, populated only when `verdict = 'blocked'`, from whatever taxonomy ux-writer lands (open question #3 — harassment, hate speech, threats/violence, spam, doxxing/PII exposure, illegal content is the Acceptance criteria's working list, not yet final). **No `CHECK` constraint on the values** — same choice `coach_events.category` made — so the taxonomy can land or change without a migration.
- **`outcome`**: nullable; `NULL` for `verdict='ok'` rows (nothing to resolve). For `verdict='blocked'` rows: starts `NULL` at insert, `UPDATE`d to `'republished'` if the same author's revised content on the same draft clears the gate and publishes within the session-timeout window. Rows still `NULL` past that window are treated as `'abandoned'` **at query time** (`outcome IS NULL AND created_at < now() - session_timeout`), not written as `'abandoned'` by a cron job — the same lazy-rollover simplification `costCap.ts` used for the day-boundary counter in reply-coach-live, accepted there as fine for v1. Session-timeout window: suggest **30 minutes**. (Backend-dev's call on exact mechanism — client-side draft-session token vs. same-user-same-surface-within-window heuristic; this subsection owns the *semantics* of `outcome`, not the plumbing that resolves it.)
- **No content, ever.** No draft text, no classifier reasoning, no rewrite-suggestion column exists on this row shape — there is no code path that could persist it, matching the acceptance criterion ("classifier inputs/outputs are not retained beyond what's operationally necessary") and `coach_events`'s "no draft, rewrite, or reasoning text persisted" bar exactly.
- **Write timing:** after the classification decision is made, using only structural metadata — never blocks or delays the actual publish/gate response. If the event write fails, the gate decision still stands and the metric silently under-counts rather than erroring — same accepted tradeoff reply-coach-live's Growth §4 already made for `coach_events`.
- **Dependency flag (not mine to resolve, noted for whoever picks up open question #2):** this schema assumes the fail-open/fail-closed decision doesn't introduce a third classification outcome. If classification errors or times out and the answer is fail-open (matching reply-coach's precedent, which this feature's own open question already leans toward), that failure path is just another `verdict='ok'` row, same as `coach_events` treats a silent-fallback `verdict=ok`. If fail-closed is chosen instead, this table's `verdict` `CHECK` may need a third value for "classification never resolved" — flagging the interaction, not resolving it.
