---
kanban-plugin: basic
team: company
---

> Navigation: [[kanban/engineering]] · [[kanban/design]] · [[kanban/marketing]] · [[README]] · [[protocols/dispatch]]
## Backlog
- [ ] [[features/staging-environment]] — dedicated staging Supabase project + separate Vercel deployment, isolated from production
- [ ] [[features/seed-prod-sample-data]] — production-safe sample family/post seeding so prod site doesn't look empty on first visit
- [ ] [[features/reply-coach-live]] — Phase 2 follow-up to [[features/reply-coach]]: live Anthropic SDK + key plumbing + prompt caching + $5/day cost cap + 50/50 holdback experiment + `coach_events` aggregate table
- [ ] [[features/backend-logger-util]] — chore closing MF-1 from reply-coach review: backend logger util + migrate the three known `console.*` sites
- [ ] [[features/brand-contrast-fix]] — system-wide WCAG 1.4.3 fix: white-on-`color.brand.primary` is ~3.4:1; introduce `color.brand.primary.pressed` and migrate every CTA
- [ ] [[features/moderation-report-block]] — community safety
- [ ] [[features/mobile-expo-bootstrap]] — Phase 4 mobile

## In Progress
- [ ] [[features/migrate-render-to-vercel-supabase]] — eng-infra-4 (frontend supabase-js auth swap) + eng-infra-5 (frontend Edge Function wiring for announcements/family/community/search) both closed to Review; frontend 132/132 tests green, tsc/build clean. Same-day correction: an earlier attempt to delete the old Express auth endpoints was a production regression (would have broken messages/playdates/uploads/coach auth entirely), caught before merge — reverted, and auth.middleware.ts now accepts a Supabase session token as a fallback alongside the legacy JWT. Backend 147/147 tests pass, tsc clean. Phase 5 parent (eng-infra-1) remains building — eng-infra-3/6/7/8 still outstanding

## Review
- [ ] [[features/brand-contrast-fix]] — WCAG 1.4.3 fix: `color.brand.primary.pressed` (#3F7E54, 4.86:1 vs white, independently verified by ui-designer + a11y-auditor) introduced; 22 CTA sites (19 files) migrated to accessible pair + hover parity; frontend 119/119, tsc/build clean, 0 must-fix code review, 11/11 pages 0 axe violations; both team kanban cards in Review
- [ ] [[features/reply-coach-live]] — LiveClaudeClient wraps @anthropic-ai/sdk behind existing ClaudeClient seam; prompt caching (cache_control), ANTHROPIC_API_KEY boot-refusal, reply_coach_live_enabled flag, $5/day cost cap, 50/50 holdback by user_id hash, coach_events aggregate table (no draft/rewrite text); backend 141/141 (13/13 coach-live.test.ts), tsc clean; 2 non-blocking code-review must-fix items carried forward (unchecked Zod validation on live response, cache-hit rate not yet logged); design Microcopy 10/10 static voice-rule audit pass (Fixture B/C dogfood tone-fidelity deferred, no real API key this pass); marketing Growth/SEO/Launch-copy specs complete, page build deferred to post-holdback; no real ANTHROPIC_API_KEY used anywhere
- [ ] [[features/backend-logger-util]] — chore closing MF-1 from reply-coach review: backend logger util (LOG_LEVEL filtering, `{msg, ...fields}` shape, no new dependency) + migrated coach.controller.ts/email.service.ts/index.ts off console.*; 134/134 backend tests, tsc clean, 0 must-fix
- [ ] [[features/feed-virtualization]] — perf: `@tanstack/react-virtual`'s `useWindowVirtualizer` applied to pages/Feed.tsx (windowed list, measureElement for variable-height cards); accumulate-vs-replace pagination interpretation endorsed; cache-desync must-fix resolved via useMemo-derived items from cached feedKeys.page queries; vitest 79/79, playwright 14/14, tsc/build clean
- [ ] [[features/playdates]] — availability calendar + playdate request flow; engineering → review (128/128 backend, 109/109 frontend, tsc clean, 3 must-fix resolved); design/marketing sections pending

## Done
- [x] [[features/feed-avatars]] — author avatar (img/initial-circle/neutral-placeholder) next to display name on AnnouncementCard; shared Avatar component; backend 85/85, frontend 72/72, tsc clean; merged to master 2026-06-23
- [x] [[features/ci-pipeline]] — GitHub Actions CI on push/PR; .github/workflows/ci.yml (Node 20, npm ci, typecheck + test --workspaces --if-present); 4/4 ACs; merged to master 2026-06-23
- [x] [[features/reply-coach]] — Phase 2 Claude-API feature: trauma-informed comment coach (mock-first); backend POST /api/comments/coach + MockClaudeClient + flag + 60/hr rate limit + silent fallback; 96/96 backend tests, tsc clean; merged to master 2026-06-11 (PR #2); follow-ups: [[features/reply-coach-live]], [[features/backend-logger-util]], [[features/brand-contrast-fix]]
- [x] [[features/family-recent-posts]] — FamilyView now lists that family's announcements (newest first, Load-more parity with home feed); GET /api/announcements?familyId backend filter; reuses AnnouncementCard (no parallel component tree); warm empty state; backend 82/82, frontend 64/64, tsc clean both workspaces.
- [x] [[features/edit-comment]] — parity with edit-announcement: PATCH /api/comments/:id (author-only) + CommentDTO.updatedAt + inline editor in CommentList + "(edited)" indicator; backend 76/76 (+6 net new), frontend 57/57 (+7 net new).
- [x] [[features/focus-reset-on-route-change]] — a11y follow-up shipped (smoke test of the new 2-level dispatch protocol — passed): `useFocusMainOnRouteChange` hook in `Layout.tsx`; frontend 50/50; axe sweep 11/11 0 violations.
- [x] [[features/dispatch-protocol-update]] — P1: `fofafu_vault/protocols/dispatch.md` + 4 role files + `CLAUDE.md` rewritten for the 2-level harness (Option B: dispatcher fans out specialists, lead aggregates). Smoke-run validated by focus-reset-on-route-change.
- [x] [[features/author-display-names]] — Server-hydrated authorName/partnerName/fromName/toName via LEFT JOIN families; frontend renders linked family names with "A former member" fallback; 70/70 backend, 46/46 frontend.
- [x] [[features/home-dashboard-port]] — 3-column dashboard (family card | composer+feed | community rail) + persistent Navbar (desktop top + mobile bottom tabs) + GET /api/community/recent; 56/56 backend, 38/38 frontend.
- [x] [[features/a11y-audit]] — axe-core sweep across all 11 pages: 0 violations; skip-link + main landmark; manual contrast pass.
- [x] [[features/community-search]] — GET /api/search/families + /search page; matches name/bio/city/state; 53/53 backend, 21/21 frontend.
- [x] [[features/family-avatar]] — families.avatar_url + avatar circle in FamilyHeader + ImagePicker in FamilyEditForm; closes the polish trio.
- [x] [[features/family-owner-link]] — DTO exposes ownerId; FamilyView gets Message-this-family CTA; tests unchanged.
- [x] [[features/polish-edit-delete]] — edit/delete UI on announcements + comments; surfaces existing backend endpoints; 19/19 frontend.
- [x] [[features/uploads-images]] — image uploads (multer + 5MB + mime allowlist) + ImagePicker UI wired into announcement composer; 45/45 backend, 19/19 frontend.
- [x] [[features/messages-pages]] — threads list + thread view + composer + auto mark-read; consumes messaging-dms backend; 17/17 frontend.
- [x] [[features/feed-pages]] — compose + feed list + reactions + comments + detail page; consumes announcements-feed backend; 5 new tests (16/16 frontend).
- [x] [[features/profile-pages]] — FamilyMe edit + FamilyView read-only; consumes family-profiles backend; 5/5 new frontend tests.
- [x] [[features/auth-pages]] — first Phase 3 feature; full Vite+React+Tailwind stack bootstrapped; 6/6 RTL tests, build green.
- [x] [[features/messaging-dms]] — private DMs between families; thread listing with unread counts; 7/7 feature tests, 41/41 full backend.
- [x] [[features/announcements-feed]] — core product loop: posts + comments + 5-type reaction toggle; 11/11 feature tests, 34/34 full backend.
- [x] [[features/family-profiles]] — real version of the Phase 1 worked example; auto-create on register; 23/23 backend tests.
- [x] [[features/auth-password-reset]] — closes out the auth surface; 16/16 backend tests passing.
- [x] [[features/auth-email]] — Phase 2 first feature; backend ported with 9/9 node:test passing.
- [x] [[features/user-profile]] — worked example: dispatched end-to-end through eng → design → marketing in Phase 1.

## Blocked

%% kanban:settings
{"kanban-plugin":"basic"}
%%
