---
slug: auth-pages
title: Auth pages — register, verify, login (Phase 3 bootstrap)
owner: engineering
collaborators: [design, marketing]
status: shipped
priority: P0
created: 2026-05-17
target: 2026-05-17
links:
  kanban: "[[kanban/engineering]]"
---

# Auth pages — register, verify, login

First Phase 3 feature. Bootstraps the React frontend and ships the three auth screens that turn the backend into something a human can actually use.

## Acceptance criteria

- [x] `frontend/` workspace scaffolded: Vite + React 18 + TS strict + Tailwind + TanStack Query + Zustand + RHF/Zod + Vitest.
- [x] Routes: `/login`, `/register`, `/verify-email`, `/` (protected placeholder).
- [x] Register form posts to `POST /api/auth/register` with Zod validation; on success shows a "check your email" confirmation.
- [x] Verify-email page reads `?token=…` from the URL, hits `GET /api/auth/verify`, shows success or error.
- [x] Login form posts to `POST /api/auth/login`; on success stores JWT in Zustand (persist to localStorage) and navigates to `/`.
- [x] Protected `/` redirects to `/login` when no JWT.
- [x] Tailwind tokens wired from `vault/standards/design-system.md` (warm surface, brand-primary CTA pill).
- [x] At least one Vitest smoke test per page.

---

## Engineering — Acceptance

### Frontend

**Stack**
- Vite 5 / React 18 / TS strict (extends `../tsconfig.base.json`)
- Tailwind 3 + design tokens from `vault/standards/design-system.md`
- TanStack Query 5 for server state
- Zustand 4 (persist middleware) for JWT + current-user
- React Hook Form 7 + Zod 3
- Vitest + React Testing Library + @testing-library/user-event + happy-dom

**Files (under `frontend/src/`)**

| Path | Purpose |
|---|---|
| `main.tsx` | mounts `<App/>` with `QueryClientProvider` + `BrowserRouter` |
| `App.tsx` | route table + global layout |
| `api/client.ts` | tiny fetch wrapper; reads JWT from auth store |
| `api/auth.ts` | typed register / verifyEmail / login functions |
| `stores/auth.ts` | Zustand store with persist; `{ token, user, setAuth, clear }` |
| `features/auth/components/RegisterForm.tsx` | RHF + Zod; calls register mutation |
| `features/auth/components/LoginForm.tsx` | RHF + Zod; calls login mutation, navigates on success |
| `pages/Register.tsx` | hosts RegisterForm + post-submit confirmation state |
| `pages/Login.tsx` | hosts LoginForm |
| `pages/VerifyEmail.tsx` | reads `?token`, fires query, shows status |
| `pages/Home.tsx` | placeholder, says "you're in"; sign out |
| `components/RequireAuth.tsx` | redirect to `/login` when no token |
| `utils/cn.ts` | clsx + tailwind-merge helper |

### Test plan

Vitest + RTL + msw smoke tests for each page; happy-dom env.

---

## Design — Spec

Visual follows `vault/standards/design-system.md` v0 token system. Single-column, ≤ 480px content, centered. CTAs are pill on brand-primary.

---

## Marketing — Spec

### Launch copy

> The front door is open. Sign up, get a verification email, log in. The shape of fofafu is starting to show.

---

*Shipped 2026-05-17. Frontend only; relies on Phase 2 backend.*
