---
slug: community-search
title: Community search — find other foster families
owner: engineering
collaborators: [design, marketing]
status: shipped
priority: P1
created: 2026-05-18
target: 2026-05-18
links:
  kanban: "[[kanban/engineering]]"
---

# community-search

Last surface-level product feature from the original fofa spec. A simple search box that finds other families by name, bio text, city, or state. JWT-protected (community-only, never public).

## Acceptance criteria

- [x] `GET /api/search/families?q=...&limit=...` returns matches across family `name`, `bio`, and the owning user's `city`/`state`.
- [x] Query is case-insensitive; trims whitespace; minimum 2 chars.
- [x] Limit clamped 1..50, default 20.
- [x] Result item shape = `FamilyDTO` (so the frontend reuses the existing FamilyHeader / FamilyView page).
- [x] Auth required (401 without JWT).
- [x] `/search` route in the frontend with a search input + result cards linking to `/family/:id`.
- [x] Backend tests: matches by name + bio + city + state; case-insensitive; empty query rejected; auth required.
- [x] Frontend test: input + submit fires the API call and renders results.

---

## Engineering — Acceptance

### Backend

| Method | Route | Query | Returns |
|---|---|---|---|
| GET | `/api/search/families` | `q` (>=2 chars), `limit` (1..50, default 20) | 200 `FamilyDTO[]` |

- Implementation: `SELECT families.* FROM families JOIN users ON users.id = families.user_id WHERE LOWER(name) LIKE ? OR LOWER(bio) LIKE ? OR LOWER(users.city) LIKE ? OR LOWER(users.state) LIKE ? LIMIT ?`. Term wrapped in `%...%`.
- Future: swap to FTS5 once the corpus is large enough that LIKE becomes the bottleneck. Out of scope here.

### Frontend

- `api/search.ts`: typed `searchFamilies(q, limit?)`.
- `pages/Search.tsx`: input + RHF (single field) + result list using `FamilyHeader` in compact mode (or a slim card linking to `/family/:id`).
- `App.tsx`: mount `/search` behind `RequireAuth`.
- `Home.tsx`: add a "Find a family" nav card.

### Test plan

Backend (`tests/search.test.ts`):
- Match by name (case-insensitive).
- Match by bio fragment.
- Match by city.
- Match by state.
- q too short (1 char) → 400.
- Empty / missing q → 400.
- No JWT → 401.
- Returns no more than `limit` rows.

Frontend (`pages/Search.test.tsx`):
- Typing a query and submitting fires the API and renders the result cards.

---

## Design — Spec

Centered search input (pill-shaped) on `surface-warm`. Results render as the same family-card styling. Mono kicker label "results" above the list.

### Microcopy

| key | string |
|---|---|
| `search.title` | Find a family |
| `search.subtitle` | Search by name, what they wrote about their family, or where they are. |
| `search.input.placeholder` | Name, city, anything… |
| `search.cta` | Search |
| `search.empty.first` | Try a name, a city, or a few words from their bio. |
| `search.empty.none` | No families matched "{q}". |

---

## Marketing — Spec

### Launch copy

**Release note**

> Find another foster family. fofafu now has a search box — by name, by what they wrote, by where they are. (Login required.)

### Growth

**Primary metric**: % of monthly active users who run at least one search in a week. Target: 30% within 30 days.

---

*Shipped 2026-05-18.*
