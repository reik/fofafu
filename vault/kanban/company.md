---
kanban-plugin: basic
team: company
---

## Backlog
- [ ] [[features/focus-reset-on-route-change]] — a11y follow-up
- [ ] [[features/edit-comment]] — parity with edit-announcement
- [ ] [[features/family-recent-posts]] — surface a family's posts on their page
- [ ] [[features/moderation-report-block]] — community safety
- [ ] [[features/playdates]] — fofa feature deferred at ultraplan time
- [ ] [[features/mobile-expo-bootstrap]] — Phase 4 mobile

## In Progress

## Review

## Done
- [x] [[features/dispatch-protocol-update]] — P1: `vault/protocols/dispatch.md` + 4 role files + `CLAUDE.md` rewritten for the 2-level harness (Option B: dispatcher fans out specialists, lead aggregates). Final acceptance box pends next /dispatch smoke run.
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
