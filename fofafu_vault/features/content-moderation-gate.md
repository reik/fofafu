---
slug: content-moderation-gate
title: Content Moderation Gate
owner: engineering
collaborators: []
status: drafting
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
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

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
