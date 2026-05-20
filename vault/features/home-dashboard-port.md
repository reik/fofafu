---
slug: home-dashboard-port
title: Port fofa's 3-column home dashboard (and the missing top nav)
owner: engineering
collaborators: [design]
status: review
priority: P0
created: 2026-05-19
target: 2026-05-19
links:
  kanban: "[[kanban/engineering]]"
---

# home-dashboard-port

User feedback: the auth-protected Home page is a placeholder with nav cards; fofa's actual product surface is a 3-column dashboard (left rail = user card + family, middle = composer + feed, right rail = community members). Port that structure faithfully, and add the persistent navigation chrome that's been missing this whole time.

## Acceptance criteria

- [x] `/` shows fofa's 3-column dashboard layout (collapses to single column on mobile).
- [x] Left rail: family card (avatar/initial, name, city/state, "Edit page" link).
- [x] Middle: composer + paginated/feed-style announcement list (reuses existing AnnouncementComposer + AnnouncementCard).
- [x] Right rail: list of recent community families with "View all →" → `/search`.
- [x] Persistent top nav with logo + 4 links (Home / Family / Messages / Community) + unread-message badge + Sign out.
- [x] Mobile: navbar collapses; bottom tab bar mirrors top links.
- [x] New backend endpoint `GET /api/community/recent?limit=N` returning the most recently-updated families (excluding the caller's own).

## Mismatches with fofa (called out)

- fofa's `users.thumbnail` is unbuilt here; we render the family's avatar (or initial badge) in its place.
- fofa's `family_members` mini-grid depends on a table we never built (we use a single `families` row per user); deferred — left rail just shows the family card, no member tiles.
- fofa has Playdates; we don't, and removed that nav link.
- Theme toggle (light/dark) skipped — out of scope.

---

## Engineering — Acceptance

### Backend
- `schemas/community.schemas.ts`: `RecentCommunityQuery { limit }`.
- `controllers/community.controller.ts`: `getRecent(req,res)` → `SELECT families.* ... WHERE user_id != viewer ORDER BY updated_at DESC LIMIT ?`. Returns `FamilyDTO[]`.
- `routes/community.routes.ts`: behind `authenticate`; mounted at `/api/community`.

### Frontend
- `api/community.ts`: typed `getRecentCommunity(limit?)`.
- `components/Navbar.tsx`: sticky desktop top bar + mobile bottom tab bar. Reads auth store; queries unread count (`refetchInterval: 30s`). Active link via `aria-current="page"`. Sign-out action.
- `components/Layout.tsx`: renders `<Navbar/>` when authenticated; mobile bottom-tab spacer.
- `pages/Home.tsx`: rewritten as the dashboard. 3 columns on `md+`, single column on mobile.
- App routes unchanged; `/` continues to render Home behind RequireAuth; `/feed` kept as the legacy feed-only view (no sidebars).

### Test plan
- Backend: `tests/community.test.ts` — recent excludes own, ordered by updated_at desc, limit clamp, auth required.
- Frontend: `Home.test.tsx` — dashboard renders user card + composer + community rail with stub data; navbar smoke (renders 4 nav links + Sign out).

---

## Design — Spec

Reuses existing tokens (surface-card, surface-warm, brand-primary, shadow-lift). Adds:
- `<nav>` chrome with brand-primary 3px bottom border to match fofa's accent.
- Active link state: brand-primary text on `surface-card` pill background.
- Mobile bottom tab: identical to top nav links, icon-emoji + label.

### Microcopy

| key | string |
|---|---|
| `nav.home` | Home |
| `nav.family` | Family |
| `nav.messages` | Messages |
| `nav.community` | Community |
| `nav.signout` | Sign out |
| `dashboard.community.title` | Community |
| `dashboard.community.cta` | View all → |

