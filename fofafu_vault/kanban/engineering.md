---
kanban-plugin: basic
team: engineering
---

> Navigation: [[kanban/company]] · [[teams/engineering]] · [[standards/engineering-standards]]
## Backlog
- [ ] eng-backend-17 [[features/backend-logger-util]] @engineering — small logger util at `backend/src/utils/logger.ts` + migrate `backend/src/controllers/coach.controller.ts`, `backend/src/services/email.service.ts`, `backend/src/index.ts`; closes MF-1
- [ ] eng-frontend-13 [[features/moderation-report-block]] @engineering — foster-family safety surface; report + block
- [ ] eng-mobile-1 [[features/mobile-expo-bootstrap]] @engineering — Phase 4: mobile workspace + shared API client (deferred)

## In Progress

## Review
- [ ] eng-backend-16 [[features/reply-coach-live]] @engineering — LiveClaudeClient wraps @anthropic-ai/sdk behind existing ClaudeClient seam (MockClaudeClient kept as production fallback for flag-off/cap-exceeded/holdback-control, per allowed AC reading); prompt caching configured on system block; ANTHROPIC_API_KEY boot-refusal; reply_coach_live_enabled flag; $5/day cost cap; 50/50 holdback (FNV-1a); coach_events aggregate-only table; backend 141/141 (13/13 coach-live.test.ts, 0 skips), tsc clean; verified no real ANTHROPIC_API_KEY used anywhere; 2 must-fix from code review (unchecked JSON.parse of live SDK response bypassing Zod, cache-hit rate not logged despite cache_control being sent) — non-blocking, tech-lead judgment: flag-gated off by default, no live traffic yet, tracked as fast-follow
- [ ] eng-frontend-12 [[features/feed-virtualization]] @engineering — `@tanstack/react-virtual`'s `useWindowVirtualizer` applied to pages/Feed.tsx (windowed list, measureElement for variable-height cards); accumulate-vs-replace pagination interpretation endorsed; code review's must-fix #1 (accumulated items desync after composer invalidateQueries) fixed by tech-lead via useMemo-derived items from all cached feedKeys.page queries; must-fix #2 (test docstring) also addressed; vitest 79/79, playwright 14/14, tsc/build clean
- [ ] eng-backend-15 [[features/playdates]] @engineering — availability_slots + playdate_requests tables; /playdates page (week/month calendar); request flow on /family/:id

## Done
- [x] eng-backend-14 [[features/feed-avatars]] @engineering — shared Avatar component (img/initial-circle/neutral-placeholder) wired into AnnouncementCard via authorAvatarUrl on AnnouncementDTO; backend 85/85, frontend 72/72, tsc/build clean both, 0 must-fix; merged to master
- [x] eng-backend-13 [[features/ci-pipeline]] @engineering — GitHub Actions CI on push/PR (typecheck + tests); workflow + test plan mapped to all 4 ACs, both open questions resolved; merged to master
- [x] eng-backend-12 [[features/reply-coach]] @engineering — Phase 2 Claude-API feature: trauma-informed comment coach (mock-first; POST /api/comments/coach behind `reply_coach_enabled`; 60/hr rate limit; silent 200 fallback); backend 96/96, tsc clean; merged 2026-06-11 (PR #2)
- [x] eng-frontend-11 [[features/family-recent-posts]] @engineering — GET /api/announcements?familyId filter + FamilyRecentPosts section in FamilyView; reuses AnnouncementCard; Load-more parity with Feed.tsx; backend 82/82, frontend 64/64, tsc clean both
- [x] eng-backend-11 [[features/edit-comment]] @engineering — PATCH /api/comments/:id + CommentDTO.updatedAt + inline CommentEditForm + "(edited)" indicator; backend 76/76, frontend 57/57
- [x] eng-frontend-10 [[features/focus-reset-on-route-change]] @engineering — a11y follow-up: useFocusMainOnRouteChange hook in Layout.tsx; 4 unit tests covering all 5 ACs; axe sweep clean
- [x] eng-backend-10 [[features/dispatch-protocol-update]] @engineering — P1: protocol + 4 role files + CLAUDE.md rewritten for the 2-level harness (Option B); smoke-run validated by focus-reset-on-route-change
- [x] eng-frontend-9 [[features/author-display-names]] @engineering — feed/comments/threads show family names via server-hydrated DTOs; "A former member" fallback when family record is missing
- [x] eng-frontend-8 [[features/home-dashboard-port]] @engineering
- [x] eng-frontend-7 [[features/a11y-audit]] @engineering
- [x] eng-backend-9 [[features/community-search]] @engineering
- [x] eng-backend-8 [[features/family-avatar]] @engineering
- [x] eng-frontend-6 [[features/family-owner-link]] @engineering
- [x] eng-frontend-5 [[features/polish-edit-delete]] @engineering
- [x] eng-backend-7 [[features/uploads-images]] @engineering
- [x] eng-frontend-4 [[features/messages-pages]] @engineering
- [x] eng-frontend-3 [[features/feed-pages]] @engineering
- [x] eng-frontend-2 [[features/profile-pages]] @engineering
- [x] eng-frontend-1 [[features/auth-pages]] @engineering
- [x] eng-backend-6 [[features/messaging-dms]] @engineering
- [x] eng-backend-5 [[features/announcements-feed]] @engineering
- [x] eng-backend-4 [[features/family-profiles]] @engineering
- [x] eng-backend-3 [[features/auth-password-reset]] @engineering
- [x] eng-backend-2 [[features/auth-email]] @engineering
- [x] eng-backend-1 [[features/user-profile]] @engineering

## Blocked

%% kanban:settings
{"kanban-plugin":"basic"}
%%
