---
kanban-plugin: basic
team: company
---

## Backlog

## In Progress

## Review

## Done
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
