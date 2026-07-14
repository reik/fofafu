---
kanban-plugin: basic
team: engineering
---

> Navigation: [[kanban/company]] · [[teams/engineering]] · [[standards/engineering-standards]]
## Backlog
- [ ] eng-infra-1 [[features/migrate-render-to-vercel-supabase]] @engineering — Phase 5 parent ticket: migrate off Render entirely. Sub-tickets eng-infra-2..8 below track each workstream; this closes when all sub-tickets are Done and Render is decommissioned.
- [ ] eng-infra-3 [[features/migrate-render-to-vercel-supabase]] @engineering — data migration script: dump sqlite rows, bulk-insert into Supabase Postgres, verify row counts + FK integrity — prod has no real user data yet (seed-prod-sample-data still open), so this is low-priority/may collapse to a re-seed once eng-backend-18 lands
- [ ] eng-infra-8 [[features/migrate-render-to-vercel-supabase]] @engineering — further along: `e2e/playdates.spec.ts`'s Express-based data seeding migrated to Supabase (Auth REST + `playdates` Edge Function), `backend/scripts/seed-dummy.ts` repointed off the dead sqlite file, dead pre-migration plumbing removed (playwright's Express webServer, vite's `/api`/`/uploads` proxy). Full test suite green (backend 147/147, frontend 132/132). PR #54 (draft). Remaining: staging cutover confirmation, Express auth/route cleanup, decommission Render (kept alive as rollback fallback for now, per explicit instruction not to delete yet). Also found (not fixed — credentials): `backend/.env`'s `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` appear swapped/misnamed, blocking a live run of the seed script until the user corrects it locally.
- [ ] eng-backend-18 [[features/seed-prod-sample-data]] @engineering — production-safe sample family/post seeding so prod site doesn't look empty on first visit
- [ ] eng-backend-16 [[features/reply-coach-live]] @engineering — swap MockClaudeClient for live `@anthropic-ai/sdk`; prompt caching; ANTHROPIC_API_KEY boot-refusal; new `reply_coach_live_enabled` flag; $5/day cost cap with silent degradation; 50/50 holdback
- [ ] eng-backend-17 [[features/backend-logger-util]] @engineering — small logger util at `backend/src/utils/logger.ts` + migrate `backend/src/controllers/coach.controller.ts`, `backend/src/services/email.service.ts`, `backend/src/index.ts`; closes MF-1
- [ ] eng-frontend-13 [[features/moderation-report-block]] @engineering — foster-family safety surface; report + block
- [ ] eng-mobile-1 [[features/mobile-expo-bootstrap]] @engineering — Phase 4: mobile workspace + shared API client (deferred)

## In Progress

## Review
- [ ] eng-infra-6 [[features/migrate-render-to-vercel-supabase]] @engineering — Edge Functions port, batch 2 done: `supabase/functions/{message,playdates,coach}/index.ts` mirror the batch-1 pattern (RLS-scoped client via `_shared/client.ts`); app-level rules RLS can't express (busy-slot hiding, no self-requests, no duplicate pending requests, coach rate-limit/cost-cap/holdback) replicated in the functions. `frontend/src/api/messages.ts`/`playdates.ts` repointed at `edgeRequest`; `coach` has no frontend consumer yet so only the function was ported. Deployed + live-verified against `rlizubjugevyxsfzmpny`. A PostgREST filter-injection bug in `message/index.ts`'s `GET /threads/:userId` (caught by automated commit review — unvalidated `partnerId` interpolated into `.or()`) was found and fixed same-day, redeployed. Backend 147/147 (unmodified), frontend 132/132, tsc/build clean. PR #50.
- [ ] eng-infra-7 [[features/migrate-render-to-vercel-supabase]] @engineering — uploads moved from local-disk (Express + multer) to a public Supabase Storage bucket (`20260713000000_uploads_storage_bucket.sql`); RLS restricts writes to the caller's own `<uid>/` prefix. Public (not signed) URLs — the old endpoint already served files with no ACL, and `mediaUrl`/`avatarUrl` columns store permanent URL strings that signed/expiring URLs would eventually break. `frontend/src/api/uploads.ts` now uploads directly via `supabase-js` instead of proxying through Express. Migration applied to `rlizubjugevyxsfzmpny`. Same PR #50.
- [ ] eng-infra-4 [[features/migrate-render-to-vercel-supabase]] @engineering — auth migration complete: DB side (on_auth_user_created trigger + RLS policies, 20260711010000_auth_trigger_and_rls.sql, 2 security findings fixed via WITH CHECK + column-level GRANTs) + frontend side (supabase-js signUp/signInWithPassword/resetPasswordForEmail/updateUser/signOut wired into api/auth.ts + stores/auth.ts) done. Forced-password-reset AC satisfied pragmatically: wrong-password and no-Supabase-account both surface the same invalid-credentials message pointing at "Forgot password" (client can't distinguish the two post-migration). Corrected same-day: the earlier auth.controller.ts/auth.routes.ts deletion was a production regression (broke messages/playdates/uploads/coach auth entirely, not just tests) — restored those files and made auth.middleware.ts accept a Supabase session token as a fallback after the legacy JWT check (backend/src/lib/supabaseAdmin.ts, new). 147/147 backend tests pass unmodified; eng-backend-19 abandoned.
- [ ] eng-infra-5 [[features/migrate-render-to-vercel-supabase]] @engineering — Edge Functions batch 1 deployed, live-verified, AND now wired to the frontend: family, community, search, announcement (`supabase/functions/{family,community,search,announcement}/index.ts` + shared `_shared/client.ts`); frontend's announcements.ts/family.ts/community.ts/search.ts repointed at live functions via new edgeClient.ts (Authorization: Bearer <session.access_token>), one path drift adapted (announcement singular route, /react not /reactions). messages.ts/playdates.ts/uploads.ts intentionally untouched (still Express, per eng-infra-6/7 not yet live). Frontend 132/132 tests green, tsc/build clean.
- [ ] eng-frontend-18 [[features/brand-contrast-fix]] @engineering — migrated 22 white-on-brand-primary CTA/interactive sites (19 files) to `bg-brand-primary-pressed`; added `brand.primary.pressed` (#3F7E54, 4.86:1) to tailwind.config.js; new static-scan test (brand-contrast.test.ts) + full vitest 119/119, tsc/build clean, 0 must-fix in code review
- [ ] eng-backend-16 [[features/reply-coach-live]] @engineering — LiveClaudeClient wraps @anthropic-ai/sdk behind existing ClaudeClient seam (MockClaudeClient kept as production fallback for flag-off/cap-exceeded/holdback-control, per allowed AC reading); prompt caching configured on system block; ANTHROPIC_API_KEY boot-refusal; reply_coach_live_enabled flag; $5/day cost cap; 50/50 holdback (FNV-1a); coach_events aggregate-only table; backend 141/141 (13/13 coach-live.test.ts, 0 skips), tsc clean; verified no real ANTHROPIC_API_KEY used anywhere; 2 must-fix from code review (unchecked JSON.parse of live SDK response bypassing Zod, cache-hit rate not logged despite cache_control being sent) — non-blocking, tech-lead judgment: flag-gated off by default, no live traffic yet, tracked as fast-follow
- [ ] eng-backend-17 [[features/backend-logger-util]] @engineering — hand-rolled logger util at `backend/src/utils/logger.ts` (no new dependency, LOG_LEVEL filtering, JSON prod/text dev, shallow-stringify guard against circular refs/PII); migrated coach.controller.ts, email.service.ts, index.ts (plus bonus 4th unhandled-error site); closes MF-1; backend 134/134, tsc clean, code review 0 must-fix (3 non-blocking nice-to-haves)
- [ ] eng-frontend-12 [[features/feed-virtualization]] @engineering — `@tanstack/react-virtual`'s `useWindowVirtualizer` applied to pages/Feed.tsx (windowed list, measureElement for variable-height cards); accumulate-vs-replace pagination interpretation endorsed; code review's must-fix #1 (accumulated items desync after composer invalidateQueries) fixed by tech-lead via useMemo-derived items from all cached feedKeys.page queries; must-fix #2 (test docstring) also addressed; vitest 79/79, playwright 14/14, tsc/build clean
- [ ] eng-backend-15 [[features/playdates]] @engineering — availability_slots + playdate_requests tables; /playdates page (week/month calendar); request flow on /family/:id

## Done
- [x] eng-backend-19 [[features/backend-tests-broken-by-auth-removal]] @engineering — ABANDONED: earlier "Express cleanup" (deleting auth.controller.ts/auth.routes.ts) turned out to be a production regression, not just a broken test fixture — messages/playdates/uploads/coach (still Express) had no way to authenticate at all once /api/auth/* was removed. Resolved directly on eng-infra-4 instead: restored the Express auth endpoints and made auth.middleware.ts accept a Supabase session token as a fallback after the legacy JWT check. 147/147 backend tests pass unmodified.
- [x] eng-infra-2 [[features/migrate-render-to-vercel-supabase]] @engineering — schema translation: `supabase/migrations/20260711000000_initial_schema.sql`, all 8 sqlite tables ported (families/announcements/comments/reactions/messages/availability_slots/playdate_requests/coach_events); `users`/`email_tokens`/`password_reset_tokens` dropped (fold into Supabase `auth.users`); TEXT ids→uuid, INTEGER bools→boolean, TEXT timestamps→timestamptz; RLS enabled on all tables, policies deferred to eng-infra-4/5/6; applied and verified against live project rlizubjugevyxsfzmpny via `supabase db push` + `migration list` (remote matches local)
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
