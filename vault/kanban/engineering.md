---
kanban-plugin: basic
team: engineering
---

## Backlog
- [ ] [[features/reply-coach-live]] @engineering — swap MockClaudeClient for live `@anthropic-ai/sdk`; prompt caching; ANTHROPIC_API_KEY boot-refusal; new `reply_coach_live_enabled` flag; $5/day cost cap with silent degradation; 50/50 holdback
- [ ] [[features/backend-logger-util]] @engineering — small logger util at `backend/src/utils/logger.ts` + migrate `backend/src/controllers/coach.controller.ts`, `backend/src/services/email.service.ts`, `backend/src/index.ts`; closes MF-1
- [ ] [[features/moderation-report-block]] @engineering — foster-family safety surface; report + block
- [ ] [[features/playdates]] @engineering — fofa had availability_slots + playdate_requests; deferred per ultraplan, worth revisiting
- [ ] [[features/mobile-expo-bootstrap]] @engineering — Phase 4: mobile workspace + shared API client (deferred)

## In Progress

## Review
- [ ] [[features/feed-avatars]] @engineering — shared Avatar component (img/initial-circle/neutral-placeholder) wired into AnnouncementCard via authorAvatarUrl on AnnouncementDTO; backend 85/85, frontend 72/72, tsc/build clean both, 0 must-fix
- [ ] [[features/ci-pipeline]] @engineering — GitHub Actions CI on push/PR (typecheck + tests); workflow + test plan mapped to all 4 ACs, both open questions resolved

## Done
- [x] [[features/reply-coach]] @engineering — Phase 2 Claude-API feature: trauma-informed comment coach (mock-first; POST /api/comments/coach behind `reply_coach_enabled`; 60/hr rate limit; silent 200 fallback); backend 96/96, tsc clean; merged 2026-06-11 (PR #2)
- [x] [[features/family-recent-posts]] @engineering — GET /api/announcements?familyId filter + FamilyRecentPosts section in FamilyView; reuses AnnouncementCard; Load-more parity with Feed.tsx; backend 82/82, frontend 64/64, tsc clean both
- [x] [[features/edit-comment]] @engineering — PATCH /api/comments/:id + CommentDTO.updatedAt + inline CommentEditForm + "(edited)" indicator; backend 76/76, frontend 57/57
- [x] [[features/focus-reset-on-route-change]] @engineering — a11y follow-up: useFocusMainOnRouteChange hook in Layout.tsx; 4 unit tests covering all 5 ACs; axe sweep clean
- [x] [[features/dispatch-protocol-update]] @engineering — P1: protocol + 4 role files + CLAUDE.md rewritten for the 2-level harness (Option B); smoke-run validated by focus-reset-on-route-change
- [x] [[features/author-display-names]] @engineering — feed/comments/threads show family names via server-hydrated DTOs; "A former member" fallback when family record is missing
- [x] [[features/home-dashboard-port]] @engineering
- [x] [[features/a11y-audit]] @engineering
- [x] [[features/community-search]] @engineering
- [x] [[features/family-avatar]] @engineering
- [x] [[features/family-owner-link]] @engineering
- [x] [[features/polish-edit-delete]] @engineering
- [x] [[features/uploads-images]] @engineering
- [x] [[features/messages-pages]] @engineering
- [x] [[features/feed-pages]] @engineering
- [x] [[features/profile-pages]] @engineering
- [x] [[features/auth-pages]] @engineering
- [x] [[features/messaging-dms]] @engineering
- [x] [[features/announcements-feed]] @engineering
- [x] [[features/family-profiles]] @engineering
- [x] [[features/auth-password-reset]] @engineering
- [x] [[features/auth-email]] @engineering
- [x] [[features/user-profile]] @engineering

## Blocked

%% kanban:settings
{"kanban-plugin":"basic"}
%%
