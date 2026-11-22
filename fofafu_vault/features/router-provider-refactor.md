---
slug: router-provider-refactor
title: Router Provider Refactor
owner: engineering
collaborators: []
status: review
priority: P2
created: 2026-11-21
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Router Provider Refactor

## Problem

The frontend uses `<BrowserRouter>` + `<Routes>` in `App.tsx`, with `<RequireAuth>` wrapped by hand around each of the ten protected routes. That is the legacy declarative setup: it cannot use React Router's data APIs (`loader`, `action`, `errorElement`, `lazy`), and the auth guard is repeated ten times. Success: the app is driven by a data router through `<RouterProvider>`, auth is a single layout route, and route-level errors have a real error screen. No user-visible routing behaviour changes.

## Acceptance criteria

- [x] `main.tsx` renders `<RouterProvider router={...}>` built with `createBrowserRouter`; `BrowserRouter` and `App.tsx` are gone.
- [x] Route table is a typed `RouteObject[]` exported from `src/router.tsx` so tests can mount it with `createMemoryRouter`.
- [x] `RequireAuth` is a single pathless layout route rendering `<Outlet />`; `/login`, `/register`, `/verify-email` stay public.
- [x] Unauthenticated visits to a protected path redirect to `/login` with `state.from` (unchanged behaviour); unknown paths redirect to `/`.
- [x] A route-level `errorElement` renders an accessible error screen instead of React Router's default dev error page.
- [x] Focus-reset-on-route-change still works (see [[features/focus-reset-on-route-change]]).
- [x] `tsc`, vitest and `vite build` are green.

## Out of scope

- Hoisting `Layout` into a layout route (each page passes its own `wide` prop today; separate change).
- Route-level `lazy` code splitting and `loader`s (React Query owns server state).
- Preserving `search`/`hash` in the `RequireAuth` redirect (known follow-up from [[features/search-browse-directory]]).

## Open questions

- None.
