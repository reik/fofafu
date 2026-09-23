---
kanban-plugin: basic
team: marketing
---

> Navigation: [[kanban/company]] · [[teams/marketing]] · [[standards/marketing-standards]]
## Backlog

## In Progress
- [ ] [[features/playdates]] @marketing — launch copy + growth metric for the new /playdates page and cross-family request flow

## Review
- [ ] [[features/moderation-report-block]] @marketing — launch copy (release note; public/social announcement — content-writer flagged the skip for marketing-lead to confirm, now confirmed: spotlighting moderation tooling reads alarming or glib for a foster-family platform, consistent with the feature's trust-and-safety framing; email N/A, no email touchpoint; landing-page N/A, no new public route) + SEO (N/A in v1 — report/block are icons/buttons on existing authenticated surfaces, no new route; `/help/trust-and-safety` fast-follow flagged, correctly left for its own feature file) + Growth (moderation-flow completion rate primary metric, read weekly, honestly flagged interim-proxy measurement gap for the denominator; existing-platform guardrails only, DM open rate + comment-publish rate; no A/B holdback and no feature flag — both reasoned departures from charter defaults, ratified: randomizing a safety mechanism across a control cohort isn't defensible, and no cost/blast-radius case exists for a flag here; surfaces a real `moderation_reports`-vs-`reports` table-name-and-schema mismatch in [[features/reply-coach-live]]'s own Growth section, correctly left unedited as outside this feature's writer-ownership) — all three subsections present, mutually consistent; `report.sheet.reassurance` (content-writer's cross-team proposal, adopted verbatim by ux-writer into `### Microcopy`) confirmed shipped verbatim in `ReportModal.tsx`; no In Progress card existed for this feature on this board, so added directly to Review (noting the omission, same as [[features/reply-coach-live]]'s precedent)
- [ ] [[features/reply-coach-live]] @marketing — launch copy (internal release note + Slack line + seo handoff note, backend/ops-only, no live-spend claims) + SEO (/help/reply-coach spec finalized: meta/OG/FAQPage schema/sitemap, page build deferred until after 8-week holdback read-out) + Growth (suggestion-acceptance-rate primary metric restated against live mechanics, 8-week treatment-vs-holdback design, 3 guardrail metrics, coach_events mapping, $5/day cap framed as ops guardrail not growth metric, staged rollout plan) — all three subsections present, mutually consistent; no In Progress card existed for this feature on this board, so added directly to Review (noting the omission)

## Done
- [x] [[features/reply-coach]] @marketing — launch copy + SEO (N/A in v1; `/help/reply-coach` proposed for follow-up) + Growth (acceptance-rate primary, reported-comment delta counter); merged 2026-06-11 (PR #2)
- [x] [[features/community-search]] @marketing
- [x] [[features/family-avatar]] @marketing
- [x] [[features/family-owner-link]] @marketing
- [x] [[features/polish-edit-delete]] @marketing
- [x] [[features/uploads-images]] @marketing
- [x] [[features/messages-pages]] @marketing
- [x] [[features/feed-pages]] @marketing
- [x] [[features/profile-pages]] @marketing
- [x] [[features/auth-pages]] @marketing
- [x] [[features/messaging-dms]] @marketing
- [x] [[features/announcements-feed]] @marketing
- [x] [[features/family-profiles]] @marketing
- [x] [[features/auth-password-reset]] @marketing
- [x] [[features/auth-email]] @marketing
- [x] [[features/user-profile]] @marketing

## Blocked

%% kanban:settings
{"kanban-plugin":"basic"}
%%
