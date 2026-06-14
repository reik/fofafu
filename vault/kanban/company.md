---
kanban-plugin: basic
team: company
---

## Backlog
- [ ] [[features/moderation-report-block]] — community safety
- [ ] [[features/playdates]] — fofa feature deferred at ultraplan time
- [ ] [[features/mobile-expo-bootstrap]] — Phase 4 mobile

## In Progress

## Review
- [ ] [[features/ci-pipeline]] — GitHub Actions CI on push/PR; .github/workflows/ci.yml (Node 20, npm ci, typecheck + test --workspaces --if-present); engineering aggregated to Review, 4/4 ACs verified
- [ ] [[features/reply-coach]] — Phase 2 Claude-API feature: trauma-informed comment coach (mock-first); backend POST /api/comments/coach + MockClaudeClient + flag + 60/hr rate limit + silent fallback; 96/96 backend tests, tsc clean; engineering/design/marketing all aggregated to Review; MF-1 (logger util) carried as known deviation pending [[features/backend-logger-util]] (to scaffold); follow-ups noted: [[features/reply-coach-live]] (live SDK + key + prompt caching), [[features/brand-contrast-fix]] (system-wide WCAG 1.4.3)

## Done
- [x] [[features/family-recent-posts]] — FamilyView now lists that family's announcements (newest first, Load-more parity with home feed); GET /api/announcements?familyId backend filter; reuses AnnouncementCard (no parallel component tree); warm empty state; backend 82/82, frontend 64/64, tsc clean both workspaces.
- [x] [[features/edit-comment]] — parity with edit-announcement: PATCH /api/comments/:id (author-only) + CommentDTO.updatedAt + inline editor in CommentList + "(edited)" indicator; backend 76/76 (+6 net new), frontend 57/57 (+7 net new).
- [x] [[features/focus-reset-on-route-change]] — a11y follow-up shipped (smoke test of the new 2-level dispatch protocol — passed): `useFocusMainOnRouteChange` hook in `Layout.tsx`; frontend 50/50; axe sweep 11/11 0 violations.
- [x] [[features/dispatch-protocol-update]] — P1: `vault/protocols/dispatch.md` + 4 role files + `CLAUDE.md` rewritten for the 2-level harness (Option B: dispatcher fans out specialists, lead aggregates). Smoke-run validated by focus-reset-on-route-change.
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
