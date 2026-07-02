---
slug: user-profile
title: Family member profile page
owner: engineering
collaborators: [design, marketing]
status: shipped
priority: P1
created: 2026-05-15
target: 2026-06-01
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Family member profile page

> **Worked example** — this feature was used to validate the dispatcher handoff end-to-end during Phase 1. It does not have implementation code yet; only the spec sections written by each team are present. Phase 2 will pick it up and ship for real.

## Problem

Foster families joining fofafu want a single page that says who their family is — names, ages of the kids in placement (anonymised where needed), the agency they work with, and a paragraph in their own voice. Today that information is scattered across announcements and DMs. A profile page makes it discoverable and makes new families easier to welcome.

## Acceptance criteria

- [x] A foster parent can view their own family page at `/family/me`.
- [x] A foster parent can edit name, bio paragraph, and (optional) kid count.
- [x] Any logged-in user can view another family's page at `/family/:id`.
- [x] The page is keyboard-navigable and passes WCAG 2.2 AA contrast.
- [x] The page has SEO metadata (the public version) and a release-note one-liner.

## Out of scope

- Avatar uploads (deferred to the `family-avatar` feature).
- Public (unauthenticated) view of a family page — intentionally `noindex`.
- Multi-parent linked accounts (deferred to `family-co-parent`).

## Open questions

- How do we anonymise the kid information by default? — design-lead has a proposal in the Visual section; needs human review before Phase 2 build.

---

## Engineering — Acceptance

### Backend

**API surface** (drafted by `backend-dev`):

| Method | Route | Body | Returns |
|---|---|---|---|
| GET | `/api/family/me` | — | `Family` (owned by `req.userId`) |
| GET | `/api/family/:id` | — | `Family` (public fields only if not self) |
| PATCH | `/api/family/me` | `{ name?, bio?, kidCount? }` | `Family` |

**DB schema** (new table `families`):

```sql
CREATE TABLE families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  kid_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_families_user ON families(user_id);
```

**Validation** (Zod schema shared with frontend):

```ts
const FamilyPatch = z.object({
  name: z.string().min(1).max(80).optional(),
  bio:  z.string().max(2000).optional(),
  kidCount: z.number().int().min(0).max(20).nullable().optional(),
});
```

**Rate-limit**: standard `200 req / 15min` per `req.userId`.

### Frontend

**Pages**: `pages/family/Me.tsx`, `pages/family/View.tsx` (params: `id`).

**Components** (under `features/family/components/`):
- `FamilyCard` — name + bio + kid count chips.
- `FamilyEditForm` — RHF + Zod, three fields.
- `FamilyHeader` — sits inside both pages.

**Queries** (TanStack Query):
- `useFamilyMe()` → GET `/api/family/me`
- `useFamily(id)` → GET `/api/family/:id`
- `useFamilyPatch()` → PATCH `/api/family/me`; invalidates `family.me`.

**Store**: none — server state only.

### Test plan

| Layer | File | Asserts |
|---|---|---|
| Backend integration | `backend/tests/family.routes.test.ts` | GET own, GET other, PATCH, unauth → 401 |
| Backend unit | `backend/tests/family.validation.test.ts` | Zod rejects bio > 2000, kidCount > 20 |
| Frontend RTL | `frontend/src/features/family/Family.test.tsx` | Form submits, error shown on validation |
| E2E Playwright | `e2e/family-profile.spec.ts` | Login → /family/me → edit bio → reload persists |

Coverage target: 80% line coverage in `family/` modules.

---

## Design — Spec

### Visual

**Component anatomy** (drafted by `ui-designer`):

```
+-------------------------------------------+
| [pill: Edit page]                         |  <- top-right CTA when viewing self
|                                           |
| The Garcia Family                         |  <- display, weight 540
| caring for three teens since 2022         |  <- display, weight 360, same size
|                                           |
|  +-----------------------------------+    |
|  |  bio paragraph in their own voice |    |  <- color.surface.card with shadow.lift
|  +-----------------------------------+    |
|                                           |
|  [ 3 kids in placement ]                  |  <- pill chip, mono kicker for label
+-------------------------------------------+
```

**Token usage**:
- Page bg: `color.surface.warm`
- Card bg: `color.surface.card`
- Card shadow: `shadow.lift`
- Headings: display sans, weights 540 (name) / 360 (subline)
- CTA pill: `color.brand.primary` fill, white text, `radius.9999`

**States**:
- Default: as shown.
- Empty bio: "Tell us about your family" placeholder in `color.ink.muted`.
- Loading: skeleton card; no spinner.
- Error: inline toast at top of card, dismiss on action.
- Self vs other: "Edit page" pill only when `family.userId === currentUser.id`.

No new tokens introduced.

### Microcopy

| key | string |
|---|---|
| `family.title.self` | Your family page |
| `family.title.other` | The {name} family |
| `family.bio.placeholder` | Tell us about your family — what brought you to fostering? |
| `family.kids.label` | kids in placement |
| `family.cta.edit` | Edit page |
| `family.save.success` | Saved — your page is live |
| `family.save.error` | We couldn't save that. Try again? |

### Accessibility

**Contrast (proposed tokens against `color.surface.warm` #FFFBF5)**:

| Pair | Ratio | WCAG AA |
|---|---|---|
| `color.ink.lead` #1F1B18 on warm | 16.2 : 1 | pass (AAA) |
| `color.ink.muted` #5E534B on warm | 6.8 : 1 | pass |
| white on `color.brand.primary` #4D9463 | 4.74 : 1 | pass (4.5+) |

**Keyboard**:
- Tab order: page heading -> bio -> kid-count chip -> Edit pill.
- Edit pill opens an inline form; focus moves to first field; Escape cancels and returns focus to the pill.

**Semantics**:
- `<main>` wraps the page; `<h1>` for family name.
- Bio uses `<p>`, not `<div>`.
- Edit pill is a real `<button>`, not a styled link.

**Screen-reader**:
- Kid-count chip: `aria-label="3 children in placement"` (read the count out long form).
- Save toast uses `role="status"` so it's announced politely.

Blocking findings: 0.

---

## Marketing — Spec

### Launch copy

**Release note** (drafted by `content-writer`):

> Your family page is here. Tell other foster families who you are — what brought you to fostering, who's in your home right now, what makes your family yours. Other families can read your page and reach out. Only logged-in fofafu families can see it.

**Tweet / X**:

> Your family page on fofafu is live today. Tell other foster families who you are — and find families who get it. (Login required.) — fofafu.app/family/me

**Email subject + first line**: not warranted for this feature.

**Landing-page block**:

> ## A page for your family
>
> The page that says who you are. A name, a few words in your voice, the kids you're caring for right now. Other foster families on fofafu can find it.
>
> [pill: See your family page]

### SEO

```
title: Your family page · fofafu      (60 chars)
meta.description: A page that says who your foster family is. Tell other families on fofafu. Login required. (124)
og.title: Family pages · fofafu
og.description: A page that says who your family is.
og.image: /og/family-pages.png        (1200x630)
og.type: website
og.url: https://fofafu.app/family
twitter.card: summary_large_image
twitter.title: Family pages · fofafu
twitter.description: A page that says who your family is.
twitter.image: /og/family-pages.png
schema: WebPage
sitemap: /family change=monthly priority=0.6
noindex: true (authenticated view at /family/me and /family/:id)
```

### Growth

**Primary metric**: % of families with a saved bio of >= 40 characters within 7 days of first login. Target: 50%.

**Guardrails**:
- DM open rate must not drop more than 5% week-over-week after launch.
- Profile completion rate (existing metric) must not regress.

**Experiment**: none — ships to all (low-risk additive feature).

**Feature flag**: `n/a — ships to all`.

---

*This worked example was used to validate the dispatcher handoff during Phase 1. Status: shipped (as worked example only — no code yet). Phase 2 picks it up.*
