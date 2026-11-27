---
slug: messages-two-pane
title: Messages Two Pane
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: building              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-11-27
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: "docs/screenshots/messages-two-pane/mock.png"
---

# Messages Two Pane

## Problem

`/messages` is a single narrow column (the thread list) with large empty space on both sides at desktop widths, and reading or replying to a thread means navigating away to `/messages/:userId`. Families should be able to read and reply without leaving the list, see who they are talking to (bio, open playdates), and be nudged toward new connections. Success: a desktop user can switch between conversations, reply, and request a playdate from one page. Approved layout mock: `docs/screenshots/messages-two-pane/mock.png`.

## Acceptance criteria

- [ ] At `md` and wider, `/messages` uses the same three-column grid as Home and Search (`240px | main | 240px`).
- [ ] Left column: conversation list (avatar, family name, last message preview, timestamp, unread count), a "Search conversations" filter, and "+ New message".
- [ ] Center column: the selected conversation renders in place (header, message bubbles, composer). Selecting a thread updates the URL to `/messages/:userId` so links and back/forward keep working; with no thread selected the center shows an empty state.
- [ ] Right column, "About this family": the selected family's avatar, name, location, bio, upcoming open playdate slots each with a Request action, and a "View family page" link.
- [ ] Right column, "Families to say hi to", selection rules (approved by the user 2026-11-27):
  - [ ] Exclude: the viewer's own family; blocked families in either direction; families the viewer already has a thread with (match family `ownerId` against thread `partnerId`).
  - [ ] Rank: same city first, then same state; then families with an upcoming open playdate slot; then most recently active.
  - [ ] Show at most 3, each with a one-line reason (e.g. "Also in Oakland", "Open Sat 10am") and a Message action.
  - [ ] **If no family qualifies, the "Families to say hi to" section is not rendered at all**: no heading, no empty-state card, no placeholder.
- [ ] Below `md`: today's behavior is unchanged (list page, then a separate thread page); the side rails are hidden.

## Out of scope

- Matching or ranking on household makeup (e.g. number of kids). Excluded deliberately as sensitive in a foster-family context.
- Real-time typing indicators and read receipts.
- The `/family/me` side rails (separate feature).

## Open questions

- Location ranking needs the viewer's city/state, which the frontend `FamilyDTO` does not expose today. Either extend `family/me` to return `city`/`state`, or have the server rank suggestions (e.g. a `community/suggested` endpoint). This is a backend change, so it ships as its own PR before the frontend one.
- "Most recently active" currently means `families.updated_at` (last profile edit). Is that good enough, or should it be last post or message?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

Targets the Supabase Edge Functions stack (`supabase/functions/`), not legacy `backend/`. No migration, no new dependency. Ships as its own PR before the frontend one.

**`GET /community/suggested?limit=N&now=YYYY-MM-DDTHH:MM:SS`**: `supabase/functions/community/suggested.ts`, routed from `community/index.ts` (`handleRequest`; any other path still answers as `/recent`).
- Auth required: 401 `{ error: "Not authenticated" }` otherwise. Non-GET: 404.
- `limit`: default 3, clamped to 1..3. Anything that isn't a whole number ≥ 1 falls back to 3 (same as `parseLimit`). `now`: same floating-local semantics as `/community/recent` (`_shared/familyListing.ts`).
- Response: JSON array with the `/community/recent` row shape (`id, ownerId, name, bio, kidCount, avatarUrl, isOwner, updatedAt, city, state, nextFreeSlotId, nextFreeSlotStart`) plus `reason: "same_city" | "same_state" | "open_slot" | "recent"`. `kidCount` is always null and `isOwner` always false. `city`/`state` here pass through as stored (`""` when blank), the same as `/recent`. Only `/family/:id` turns blank into null.
- Excludes: the caller's own family (`neq user_id`); families the caller blocked (caller's own client, as `/recent` does); **families that blocked the caller**; families whose owner has any message with the caller, sent or received.
- Ranking compares these in order: same city AND same state as the caller's family → same state → has a `nextFreeSlotStart` → `families.updated_at` desc. Comparison trims and ignores case, and a blank value on either side never matches. A city match needs the state to match too ("Portland, OR" ≠ "Portland, ME"). No family row, or no city/state, means the location rules never fire. Because the rules compare in order, a same-city family with an open slot ranks above a same-city family without one. `reason` = the first rule the row meets. Every remaining row meets `recent`, so `[]` only when nothing is left after the exclusions.
- Bounded: the candidate pool is the 50 most recently updated non-excluded families (`SUGGESTION_POOL_SIZE = 50`, ordered `updated_at desc`), ranked in memory. Each request makes 5 fixed queries (own blocks, own family row, blocked-by, pool, messages) plus one slot query per surviving candidate, so at most 55 however many families exist. Trade-off: a same-city family outside the 50 most recently updated is never suggested.
- The messages query is a single `.or(...)` asking only about the caller and the pool's ≤50 owner ids (both directions). Query count is fixed, but the rows it returns grow with how many messages the caller has with those owners. PostgREST has no DISTINCT and aggregates are off, so a capped version would risk false negatives. Revisit with an RPC if inboxes get large.
- Fails closed: if the pool, messages or blocked-by lookup fails, the response is a 500, never a list that might include a blocker or an existing thread. A failed slot lookup still degrades quietly (no slot → that row may rank as `recent`), as on `/recent`.

**Block direction (finding).** `blockedFamilyIds` only covers *caller → blocked*: `blocks` RLS lets a family read only the rows where it is the blocker, by design, so a blocked family cannot see who blocked them. To satisfy "blocked families in either direction", `community/blocks.ts#blockingFamilyIds` reads `blocks.blocker_family_id WHERE blocked_family_id = <caller's family id>` through a **service-role client**. The caller's family id is read with the caller's own client, and the filter is a parameterized `eq`. Those ids only remove rows from the response and are never returned, logged or counted back. The service client is created only on `/suggested`, and only when the caller has a family row. This follows `admin/index.ts`'s narrow service-role precedent. `/community/recent` and `/search` still exclude one direction only (unchanged, out of scope here).

**`GET /family/:id` and `/family/me`** (and the PATCH response, which shares `toDTO`): add `city: string | null` and `state: string | null`. Values are trimmed, and a blank stored value (`''`, the column default) becomes null. Additive only. `family/index.ts` now exports `handleRequest(req, supabase)` behind an `import.meta.main` guard, like `community`/`search`. Frontend `FamilyDTO` should add `city`/`state` as `.nullish()`.

**Tests**: `community/suggested.test.ts` (36): 401/404, each exclusion and the exact filters sent, each ranking tier and `reason`, case/whitespace matching, the city-needs-state rule, no-family and blank-location callers, slot-within-tier, the updated_at tiebreak, `now`, limit default/clamp/fallback, pool size/order, slot lookups only for survivors, `[]`, row keys, and the fail-closed 500s. `family/index.test.ts` (10): city/state present/blank/missing/trimmed, owner-id lookup, key set, kidCount still owner-only, 404, `/me`, 401. Full suite: `deno test --allow-env` in `supabase/functions` → 205 passed, 0 failed. `deno check` is clean on the changed files.

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual

*ui-designer, 2026-11-27. Source of truth: the user-approved mock `docs/screenshots/messages-two-pane/mock.png`. The dashed gold outlines, the "NEW · CONVERSATION STAYS ON THIS PAGE" / "NEW" tabs, and the black "MOCK · NOT LIVE" pill are mock annotations. Do not build them. **No new tokens.** Everything below uses existing tokens and Tailwind classes already in the codebase. One existing token gets a new usage (V-1), which needs design-lead sign-off. Copy is referenced by the string keys in `### Microcopy` (reconciled against ux-writer's table after it landed); final wording belongs to ux-writer.*

#### 1. Layout and grid (md and wider)

```
<Layout wide>  max-w-[1100px] px-6 py-6
┌──────────── 240 ────────────┬──────────── minmax(0,1fr) ────────────┬──────────── 240 ────────────┐
│ <aside> ConversationList    │ <section> ConversationPane             │ <aside> right rail          │
│ ┌─────────────────────────┐ │ ┌────────────────────────────────────┐ │ ┌─────────────────────────┐ │
│ │ CONVERSATIONS           │ │ │ (K) Kuratars                       │ │ │ ABOUT THIS FAMILY       │ │
│ │ ( Search conversations )│ │ │     Oakland, CA                    │ │ │ (K) Kuratars            │ │
│ │ ┌─────────────────────┐ │ │ ├────────────────────────────────────┤ │ │     Oakland, CA         │ │
│ │ │(K) Kuratars      (3)│ │ │ │          Aug 18 · 11:02am          │ │ │ bio, max 4 lines …      │ │
│ │ │    let me know if … │ │ │ │ ┌──────────────┐                   │ │ │ OPEN PLAYDATES          │ │
│ │ └─────────────────────┘ │ │ │ │ incoming     │                   │ │ │ ─────────────────────── │ │
│ │ (A) Anderson Family  Mon│ │ │ └──────────────┘ ┌──────────────┐  │ │ │ Sat, Aug 22 · 10am [Req]│ │
│ │     Pizza night was …   │ │ │                  │ outgoing ███ │  │ │ │ ─────────────────────── │ │
│ │ (R) Rivera Family  Oct 2│ │ │                  └──────────────┘  │ │ │ Sun, Aug 23 · 2pm  [Req]│ │
│ │ …  (scrolls)            │ │ │ …  (scrolls, pinned to bottom)     │ │ │ View family page →      │ │
│ │ ─────────────────────── │ │ ├────────────────────────────────────┤ │ └─────────────────────────┘ │
│ │ + New message           │ │ │ ( Write a message…         ) (Send)│ │ ┌─────────────────────────┐ │
│ └─────────────────────────┘ │ └────────────────────────────────────┘ │ │ FAMILIES TO SAY HI TO   │ │
│  height = pane height       │  height = calc(100dvh - 8rem)          │ │ (N) Nguyen Fam.  Message│ │
│                             │                                        │ │     <reason line>       │ │
│                             │                                        │ │ (O) Okafor Fam.  Message│ │
│                             │                                        │ └─────────────────────────┘ │
└─────────────────────────────┴────────────────────────────────────────┴─────────────────────────────┘
```

- **Grid:** reuse Search's `GRID` constant exactly (`grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)_240px] [&_:is(a,button,input)]:scroll-my-20`). Recommendation for frontend-dev: move it into one shared export rather than copying it a third time. Home has its own copy, which is missing the `scroll-my` part. Inside `<Layout wide>`, as on Search and Home.
- **Column heights:** the left card and center pane both use `md:h-[calc(100dvh-8rem)] md:min-h-[32rem]`. The 8rem is the navbar (`h-16` + `border-b-2` = 66px), plus main's `py-6` (48px), plus 14px of slack at the bottom. Both columns are the same height, as in the mock. Each scrolls internally: the list's rows and the pane's message area. The page itself doesn't scroll at typical desktop heights. The `min-h` stops short viewports from crushing the pane; below it the page scrolls normally.
- **Right rail:** natural height, `space-y-4` between cards (16px, the mock's gap). It doesn't scroll internally.
- **Empty right rail:** if neither card renders (no conversation selected and no suggestions), don't render the `<aside>` element at all, so there's no empty landmark. The grid template keeps the 240px track, so the center width never jumps.
- **Cards** follow the existing rail-card recipe: `rounded-lg bg-surface-card shadow-lift`. That's `radius.16`, `color.surface.card`, `shadow.lift`.
- **Eyebrow headings** (CONVERSATIONS, ABOUT THIS FAMILY, OPEN PLAYDATES, FAMILIES TO SAY HI TO) reuse the existing rail heading classes: `text-xs font-bold uppercase tracking-wide text-ink-muted`. They're sans, not mono, matching Home/Search rails and the mock.
- **Hairline rules:** the mock has inner dividers (pane header/body/composer, list footer, slot rows), so this departs from the "no inner borders" card note on purpose. Use `border-ink-muted/20`, which is the opacity `MessageComposer` already uses. Don't introduce a new border color.

#### 2. ConversationList (left column)

**Anatomy**

```
ConversationList  <section> card: flex h-full flex-col p-4
├── ListHeading           h2 eyebrow  [messages.list.heading]
├── ConversationFilter    label(sr-only) [messages.list.search.label] + input [messages.list.search.placeholder]
├── ConversationRows      <ul role="list"> flex-1 overflow-y-auto, mt-3 space-y-1
│   └── ConversationRow   <li><Link to=/messages/:partnerId>
│       ├── Avatar        Avatar size="sm" (40px), name = partnerName
│       └── RowText       min-w-0 flex-1
│           ├── NameLine      flex justify-between gap-2
│           │   ├── PartnerName   truncate text-base font-semibold   (formatAuthor; italic text-ink-muted when null, as today)
│           │   └── RightSlot     UnreadBadge if unreadCount > 0, else Timestamp
│           └── PreviewLine   truncate text-sm   (text-ink-lead if unread, text-ink-muted if read)
└── ListFooter            mt-3 border-t border-ink-muted/20 pt-3
    └── NewMessageLink    [messages.list.new] → /search ("+" glyph aria-hidden)
```

- **Filter input:** a pill, `type="search"`. No custom × clear button, so `messages.list.search.clear` is unused. `w-full rounded-full border border-ink-muted/30 bg-surface-card px-4 py-2 text-sm placeholder:text-ink-muted outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary`. It filters client-side and case-insensitively on partner name. No submit button.
- **Row:** `flex items-center gap-3 rounded px-3 py-2` (`radius.8`, `space.12`/`space.8`).
- **UnreadBadge:** reuse today's badge unchanged: `rounded-full bg-brand-primary-pressed px-2 py-0.5 text-xs font-semibold text-white`. The brand-contrast guard passes because of the `-pressed` suffix. The digit is `aria-hidden`, and an sr-only [messages.list.row.unread] goes inside the row link.
- **Timestamp:** `text-xs text-ink-muted`, using `formatTimestamp`. It's sans, as in the mock. Today's row uses `font-mono text-[10px]`, which goes away here.
- **RightSlot follows the mock:** the badge takes the timestamp's place while a thread has unread messages. Today's code puts the badge on the preview line. This change is deliberate, to match the mock.
- **NewMessageLink:** `text-sm font-semibold text-brand-primary-pressed underline-offset-4 hover:underline rounded-sm focus-visible:ring-2 focus-visible:ring-brand-primary` (see V-1). It targets `/search`, as ux-writer confirmed.

**States**

| State | Treatment |
|---|---|
| default | As anatomy. A read row has no fill. |
| hover | Row: `hover:bg-surface-warm`, the same as Home's Community rail rows. Link: underline. |
| focus | Row link: `focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary`. It's inset because the scroll container clips an outer ring. Input: border + ring as above. |
| selected | The row whose `partnerId` equals `:userId` gets `bg-surface-subtle` and `aria-current="page"`. It stays filled on hover. Text on this fill: `ink.lead` and `ink.muted` both pass (ink.muted on surface.subtle is about 6.4:1). |
| disabled | None. Rows are links and the filter input is never disabled. |
| loading | Heading and filter input render. The rows area shows **5** skeleton rows using the `CommunityRowSkeleton` bone recipe (`bg-surface-subtle`, `animate-pulse`, `motion-reduce:animate-none`, plus the `usePrefersReducedMotion` hook). Each has a **40px** circle (`h-10 w-10`), matching the real Avatar so nothing jumps when rows load, plus 2 lines. Recommend adding an `avatarSizeClass` prop to `CommunityRowSkeleton` rather than forking it. The bones are `aria-hidden`, with an sr-only [messages.list.loading] and `aria-busy` on the rows container. |
| empty, no threads | One line, `text-sm italic text-ink-muted` [messages.list.empty]. The footer's NewMessageLink still shows. |
| empty, filter has no match | One line, `text-sm italic text-ink-muted` [messages.list.search.noMatch]. The footer still shows. Plus an sr-only `aria-live="polite"` [messages.list.search.resultsCount]. |
| error | One line, `text-sm text-feedback-error` [messages.list.error] in the rows area. The heading, input, and footer still render. Optional: an inline [messages.list.retry] text button after it, styled like NewMessageLink, if frontend-dev wires `refetch`. |

#### 3. ConversationPane (center column)

**Anatomy**

```
ConversationPane  <section> card: flex h-full flex-col overflow-hidden
├── PaneHeader        flex items-center gap-3 border-b border-ink-muted/20 px-4 py-3
│   ├── Avatar            Avatar size="sm" (40px)
│   └── HeaderText        min-w-0 flex-1
│       ├── PartnerName       h2, truncate text-lg font-semibold, Link to /family/:userId (as today)
│       │   └── ThreadHeaderBlockedTag   (existing, unchanged)
│       └── LocationLine      text-sm text-ink-muted [messages.thread.header.location] (omitted when both city and state are missing)
├── MessageScroll     flex-1 overflow-y-auto bg-surface-warm px-4 py-4, flex-col gap-3; opens scrolled to the newest message
│   ├── TimeDivider       text-center text-xs font-mono text-ink-muted   (e.g. "Aug 18 · 11:02am")
│   └── MessageBubble     (restyled, see below)
├── BlockedThreadBanner   (existing, unchanged, between scroll and composer as today) px-4
└── ComposerBar       border-t border-ink-muted/20 bg-surface-card px-4 py-3
    └── MessageComposer   (restyled to one row, see below)
```

- **Header kebab:** per the dispatcher's decision (10:48), the mock's "⋯" at the header's right is the **existing `ModerationMenu`** component, unchanged. Its own trigger and menu styling are reused, positioned `ml-auto shrink-0`, with a trigger hit area of at least `size.hitTarget.min` (44px). See N-4 for what it targets.
- **MessageBubble** (the shared component, so this restyle applies to every breakpoint):
  - Incoming: unchanged (`bg-surface-card shadow-lift`, `ink.lead`). Its ModerationMenu kebab keeps the hover/focus reveal.
  - Outgoing: becomes `bg-brand-primary-pressed text-white`, the mock's solid green with white text. Contrast is 4.86:1 (passes 1.4.3), and the brand-contrast guard passes. This replaces `bg-brand-primary/10`.
  - Both: `max-w-[80%] rounded-lg px-4 py-3 text-sm`.
- **TimeDivider:** render one before the first message, and before any message that's on a different calendar day or 60+ minutes after the previous one. Its text is `formatTimestamp(createdAt)` of the first message in the group, so no new copy key and no new date format. This replaces the visible per-bubble timestamp, as in the mock. Keep each bubble's `<time>` in the DOM as `sr-only` so screen-reader users still get per-message times. The a11y-auditor needs to confirm this (N-5). Mono here matches the existing bubble timestamp style.
- **MessageComposer** (shared): `flex items-end gap-2`.
  - Textarea: `rows={1}`, `min-h-11 max-h-40 flex-1 resize-none rounded-lg border border-ink-muted/30 bg-surface-card px-4 py-2.5 text-sm`. It auto-grows up to `max-h-40`, then scrolls. Focus: `focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary`.
  - Send pill: unchanged classes, plus `min-h-11` for `size.hitTarget.min`.
  - Field and server error lines stay below the row, as today.
  - The mock shows a full pill input. `rounded-lg` (16px) on a 44px field reads nearly the same and stays sane once the field grows past one line. `radius.9999` on a growing textarea looks broken.

**States**

| State | Treatment |
|---|---|
| default | As anatomy. |
| hover | PartnerName link: underline. Bubbles: the existing kebab reveal. Send: unchanged. |
| focus | Every link, button, and textarea uses `focus-visible:ring-2 focus-visible:ring-brand-primary`. Inside the `overflow-hidden` card, use `ring-inset` on elements that sit flush with the card edge. |
| disabled | Send: `disabled:opacity-60` while the message is sending (existing), with its existing "Sending…" label (`messages.composer.*`). The textarea stays editable. |
| loading, thread | The real PaneHeader renders once partner data arrives. Until then, show header bones: a 40px circle and 2 lines. MessageScroll shows 4 bubble bones that alternate left and right (`h-10 rounded-lg`, widths `w-2/3`, `w-1/2`, `w-3/5`, `w-2/5`), using the same bone recipe. The bones are `aria-hidden`, with an sr-only [messages.thread.loading] and `aria-busy` on MessageScroll. The composer renders and is usable. |
| empty, no selection (`/messages` at md+), viewer has threads | The same card frame and height, with no header and no composer. Content is centered vertically and horizontally: `MessageIcon` `h-8 w-8 text-ink-muted`, then a heading `mt-3 text-base font-semibold` [messages.center.none.heading], then a body `mt-1 max-w-[32ch] text-center text-sm text-ink-muted` [messages.center.none.body]. No CTA, because the list is right there. |
| empty, no selection, viewer has **no** threads | Same layout with [messages.center.noThreads.heading] / [messages.center.noThreads.body]. Add a pill CTA below, `mt-4`: [messages.center.noThreads.cta] → `/search`, using the Send pill's classes (`rounded-full bg-brand-primary-pressed px-4 py-2 min-h-11 text-sm font-semibold text-white shadow-lift`). |
| empty, selected but no messages (for example, arriving from a "Message" action) | Header and composer render. MessageScroll shows one centered line, `text-sm italic text-ink-muted` [messages.thread.empty]. No row is highlighted in the list until the first send creates the thread. |
| error | MessageScroll shows `text-sm text-feedback-error` [messages.thread.error]. The header falls back to `formatAuthor(null)`. The composer stays rendered, so the user can still send. |
| blocked partner | Existing `ThreadHeaderBlockedTag` and `BlockedThreadBanner`, unchanged. |

#### 4. AboutFamilyCard (right rail, top)

**Anatomy**

```
AboutFamilyCard  <section> card: p-4   (rendered ONLY when :userId is set)
├── CardHeading       h2 eyebrow [messages.about.heading]
├── Identity          mt-3 flex items-center gap-3
│   ├── Avatar            Avatar size="sm" className="h-12 w-12 text-xl" (48px, on the space scale)
│   └── IdentityText      min-w-0
│       ├── FamilyName        truncate text-base font-semibold
│       └── MetaLine          text-xs text-ink-muted, [messages.about.location], plus " · " [messages.about.joined] only if backend ever exposes a created date (ux-writer: omit for now). The line is omitted when there's no location.
├── Bio               mt-3 text-sm text-ink-lead line-clamp-4 whitespace-pre-line; empty bio → text-sm italic text-ink-muted [messages.about.bio.empty]
├── OpenSlots         mt-4
│   ├── SubHeading        h3 eyebrow [messages.about.slots.heading]
│   └── <ul role="list"> mt-2 divide-y divide-ink-muted/20 border-t border-ink-muted/20
│       └── SlotRow           flex items-center justify-between gap-2 py-2
│           ├── <time>            text-sm text-ink-lead [messages.about.slots.row] (formatShortDate + formatTime; "Sat, Aug 22 · 10am")
│           └── RequestChip       PlaydateBadge, to=/family/:familyId?requestSlot=<slotId>, label [messages.about.slots.request], accessibleLabel [messages.about.slots.request.a11y]
└── ViewFamilyLink    mt-4 block text-sm font-semibold text-brand-primary-pressed underline-offset-4 hover:underline rounded-sm focus-visible:ring-2 focus-visible:ring-brand-primary, visible [messages.about.viewFamily], aria-label [messages.about.viewFamily.a11y], to /family/:familyId
```

- **Slots:** show the partner's `status: 'free'` slots dated today or later, sorted ascending. **Max 3** (N = 3). Anything beyond that is reachable through ViewFamilyLink.
- **RequestChip:** reuse `PlaydateBadge` unchanged, so it's identical to the Search rail's Request chip, including its 45px `after:` hit area. The mock's chip has no 🗓 glyph. Keeping the glyph means no component change and consistency with Search. If design-lead wants it gone, it's a one-prop variant (`showGlyph={false}`). Flagged as N-6.

**States**

| State | Treatment |
|---|---|
| default | As anatomy. |
| hover | RequestChip: existing `hover:bg-brand-warm/30`. ViewFamilyLink: underline. |
| focus | RequestChip: existing ring with `ring-offset-2`. ViewFamilyLink: ring as above. |
| disabled | None. All actions are links. |
| loading | The real CardHeading renders, and the bones get an sr-only [messages.about.loading] (slots: [messages.about.slots.loading]). Below the heading, bones: a 48px circle and 2 lines (`h-3 w-3/4`, `h-2.5 w-1/2`), 3 bio lines (`w-full`, `w-[92%]`, `w-[64%]`), then 2 slot rows (line `h-3 w-1/2` + pill `h-5 w-16 rounded-full`). Same bone recipe; `aria-busy` on the card body. If the family data arrives before the slots, the slot rows stay as bones until the slots load. |
| empty | **No selection:** the card isn't rendered. **No bio:** the muted italic [messages.about.bio.empty]. **No city/state:** the MetaLine is omitted. **0 upcoming free slots:** the sub-heading stays, and in place of the rows goes one line, `mt-2 text-sm italic text-ink-muted` [messages.about.slots.none]. ViewFamilyLink still leads to their full calendar. |
| partner has no family row | Identity shows the fallback Avatar and name. Below it, `text-sm italic text-ink-muted` [messages.about.noFamily]. No Bio, OpenSlots, or ViewFamilyLink. |
| partner is a former member (null name) | Same treatment with [messages.about.formerMember]. |
| error, family | Below the heading: `text-sm text-feedback-error` [messages.about.error]. Nothing else renders. |
| error, slots only | Identity, Bio, and ViewFamilyLink render. In place of the rows: `text-sm text-ink-muted` [messages.about.slots.error]. Muted rather than red, because it's secondary. |
| blocked partner | Omit OpenSlots, because Request actions shouldn't be offered to a blocked family. Identity, Bio, and ViewFamilyLink still render. Flagged as N-7. |

#### 5. SuggestedFamiliesCard (right rail, below About)

**Anatomy**

```
SuggestedFamiliesCard  <section> card: p-4   (rendered ONLY when the query succeeded with ≥1 row)
├── CardHeading       h2 eyebrow [messages.suggest.heading]
└── <ul role="list"> mt-3 space-y-2   (max 3 <li>, sliced defensively on the client)
    └── SuggestionRow     flex items-center gap-3
        ├── Avatar            Avatar size="sm" className="h-8 w-8 text-sm" (32px, as in the Community/OpenPlaydates rail rows)
        ├── RowText           min-w-0 flex-1
        │   ├── FamilyName        Link to /family/:id [messages.suggest.row.name], block truncate text-sm font-semibold text-ink-lead
        │   │                     underline-offset-4 hover:underline rounded-sm focus-visible:ring-2 focus-visible:ring-brand-primary
        │   └── ReasonLine        block truncate text-xs text-ink-muted; reason-line table in ### Microcopy (omitted when no string applies)
        └── MessageAction     Link to /messages/:ownerId
                              inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-brand-primary-pressed
                              underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand-primary
                              visible [messages.suggest.message], aria-label [messages.suggest.message.a11y]
```

- **Two links per row,** per ux-writer: the name goes to the family page and Message goes to the thread. The name stays `ink.lead`, as in the mock; only the action is green. If the reason line is omitted, the row is just the name, vertically centered against the avatar.
- **ReasonLine:** the mock's "Alameda" / "Berkeley" lines are placeholder text. The line is driven by `reason` and interpolated, for example "Also in Oakland" or "Open Sat 10am". For `open_slot`, the short line is `aria-hidden`, with an sr-only spoken twin.
- **After a Message click:** you land on `/messages/:ownerId`, and the pane shows its "selected but no messages" state. Once the first message sends, invalidate the suggestions query. The server excludes existing thread partners, so the family drops off the card.

**States**

| State | Treatment |
|---|---|
| default | As anatomy. |
| hover | FamilyName and MessageAction: underline only. **Not** a `surface.subtle` fill: `brand.primary.pressed` text on `surface.subtle` is about 4.15:1, which fails 1.4.3. |
| focus | FamilyName and MessageAction rings, as above. |
| disabled | None. |
| loading | **Not rendered. No skeleton.** This deliberately departs from "skeleton for every block". The user-approved rule says that with no qualifying family there's no heading, card, or placeholder. A heading and skeleton that then vanish on an empty result would briefly show exactly that placeholder. This is the last element in the rail, so the card appearing late shifts nothing below it. |
| empty (0 rows) | **Not rendered at all.** No heading, no empty-state copy, no placeholder. This is the approved acceptance criterion. |
| error | **Not rendered.** It's a nudge, not core content. The error isn't surfaced in the UI. Frontend-dev logs it via the logger util. |

#### 6. Responsive rule

- **md (768px) and wider:** the three-column layout above. `/messages` shows the list, the no-selection pane state, and the right rail with only the suggestions card (when non-empty). `/messages/:userId` shows the list with that row selected, the conversation, and both cards. Selecting a row changes the URL to `/messages/:userId`, so back and forward work, and the grid never remounts.
- **Below md:** the navigation model is unchanged. Both right-rail cards stay out of the DOM below md (`hidden md:block` on the `<aside>`, as on Search and Home).
  - `/messages` shows ConversationList alone, full width, with natural height. No `calc` height and no internal scroll.
  - `/messages/:userId` shows ConversationPane alone, full width, with natural height.
  - Page-level strings stay as today, per ux-writer. The list page keeps its visible `h1` [messages.page.title] and [messages.page.subtitle] above the list card. The thread page keeps today's "← All messages" back link, `md:hidden`, above the PaneHeader, with today's classes except that `text-brand-primary` becomes `text-brand-primary-pressed` (V-1).
  - The PaneHeader replaces today's "Conversation / With {name}" header block on the mobile thread page. That's a visible copy change below md (N-2).
  - The visual restyle (rows, bubbles, composer) therefore also shows on mobile. Before/after screenshots must cover both mobile pages as well as desktop (see N-2).
- **Risk at exactly md:** at 768px, the content box is 720px. 240 + 240 + 2×24 leaves the center at **192px**, which is cramped for a chat pane. Search and Home have the same squeeze today, and the dispatcher fixed md as the breakpoint, so I've specced md as instructed. Recommendation N-1 below.

#### 7. Token usage summary (no new tokens)

| Token | Where |
|---|---|
| `color.surface.warm` | page bg, MessageScroll bg, row hover |
| `color.surface.card` | all three cards, incoming bubble, composer bar, input fills |
| `color.surface.subtle` | selected ConversationRow, all skeleton bones |
| `color.ink.lead` | names, bio, slot times, unread preview |
| `color.ink.muted` | eyebrows, read preview, timestamps, meta lines, reasons, empty/italic lines, hairlines at /20–/30 |
| `color.brand.primary` | focus rings and focused input borders only (non-text) |
| `color.brand.primary.pressed` | outgoing bubble fill, unread badge fill, Send pill, **green text links** (V-1) |
| `color.brand.warm` (+ existing `#8a5a12` in PlaydateBadge) | RequestChip, reused unchanged |
| `color.feedback.error` | list, pane, and About error lines |
| `radius.8` / `radius.16` / `radius.9999` | rows / cards, bubbles, textarea / pills, badge, search input |
| `shadow.lift` | cards, incoming bubbles (existing) |
| `size.hitTarget.min` (44px) | Send, MessageAction, textarea min height |
| space `4/8/12/16/24` | as specified per component |

**V-1: new usage of an existing token, needs design-lead sign-off.** The mock's green text ("+ New message", "View family page →", "Message", and the mobile back link) uses `brand.primary.pressed` as a **text** color. Per the 2026-09-07 recurrence note, `text-brand-primary` fails as text (about 3.1–3.6:1). `pressed` as text is the same pair as white-on-pressed, which works because contrast is symmetric:

| Background | Contrast | Result |
|---|---|---|
| white | 4.86:1 | passes |
| `surface.warm` | about 4.57:1 | passes, narrowly |
| `surface.subtle` | about 4.15:1 | **fails** |

Green text must therefore never sit on `surface.subtle`. That's why MessageAction's hover is an underline, not a fill. Suggest design-lead adds this as an allowed usage on the `color.brand.primary.pressed` row in `standards/design-system.md`.

#### 8. Data the visuals assume (for backend-dev / frontend-dev)

- **`GET /community/suggested` row:** verified against backend-dev's `supabase/functions/community/suggested.ts`. Each row is `ListedFamily & { reason }`, so it carries everything the visuals need:
  - `id`, **`ownerId`** (the Message link targets `/messages/:ownerId`), `name`, and `avatarUrl`.
  - The reason-line interpolation data: `city`, `state`, and the floating `nextFreeSlotStart`.
  - `MAX_SUGGESTIONS = 3`.
- **`family/:id`:**
  - Optional `city`/`state` (already in the contract).
  - "joined YYYY" from the mock is **omitted** (dispatcher decision, 10:48): no created date is exposed, so the MetaLine is location only.
- **ThreadDTO:** has no partner `avatarUrl`, so list rows show the Avatar initial fallback, which is what the mock shows anyway. Adding `partnerAvatarUrl` would be optional polish.
- **Open slots:** existing `getAvailability(userId)`, filtered to free + upcoming on the client.

#### 9. Open notes for design-lead / dispatcher

- **N-1:** consider `lg` (1024px) for the third column only. That would be `md:grid-cols-[240px_minmax(0,1fr)]` plus `lg:grid-cols-[240px_minmax(0,1fr)_240px]`, giving the pane at least 432px at md. Not adopted, because it conflicts with the dispatcher's constraint.
- **N-2:** the MessageBubble and MessageComposer restyles are global because they're shared components, so mobile pages change visually. The navigation model is unchanged. If "below md unchanged" must mean pixel-identical, frontend-dev needs a `variant` prop instead. I don't recommend that: two bubble colors for the same message across a resize reads as a bug.
- **N-3:** resolved. "+ New message" goes to `/search`, as ux-writer confirmed in `### Microcopy`.
- **N-4:** the dispatcher says the header "⋯" keeps the existing moderation menu. Visually that's settled: it's the `ModerationMenu` component, unchanged. Functionally, `ModerationMenu`'s `targetType` only accepts `announcement | comment | message`, and `canBlock` is false for `message`, so there's no family- or thread-level target today. Frontend-dev/tech-lead must decide what the header instance reports and blocks against. If nothing valid exists, render no trigger at all. Never ship a trigger with an empty menu.
- **N-5:** a11y-auditor to confirm sr-only per-bubble `<time>` plus visual TimeDividers, landmarks (two `<aside>`s with distinct labels, the pane as a labelled `<section>`, and an sr-only `h1` [messages.page.title] at md+, since the mock has no visible page title), and focus moving to the pane when a list row is selected. One mismatch to settle: ux-writer's `messages.about.landmark` ("Family details") labels the right `<aside>`, but with no selection that aside holds only "Families to say hi to". Either drop the aside's own label and rely on each card's heading-labelled `<section>`, or switch the label by state.
- **N-6:** RequestChip keeps its 🗓 glyph, unlike the mock. One-prop change if design-lead prefers it glyph-less.
- **N-7:** OpenSlots is hidden for a blocked partner. Backend and a11y to confirm that's the desired policy.
- **N-8:** resolved. "joined YYYY" is omitted (dispatcher decision).
- **Token-drift finding, pre-existing and not introduced here:** `PlaydateBadge` (and Home's inline copy) hardcode `text-[#8a5a12]`, a hex that isn't in the token table. It's reused unchanged here. Candidate for a future `color.brand.warm.ink` token via `/sanity-check design`.

### Microcopy

Voice: [[standards/design-system]] Voice & Tone. Rail headings are written in sentence case. The `uppercase tracking-wide` class does the capitalising, matching the existing rail headings ("Community", "Open for playdates this week"). `{…}` marks an interpolation. `…` is the single ellipsis character, matching the composer's "Write a message…". Strings marked *(reuse)* already ship and must stay byte-identical. Strings marked *(sr)* are visually hidden or are accessible names only.

**Page shell (md+)**

| key | string | notes |
|---|---|---|
| messages.page.title | Messages | `<h1>`, sr-only at md+ (the mock has no visible page title). Below md the existing visible `h1` and its subtitle stay as they are. |
| messages.page.subtitle | Your private conversations with other foster families. | *(reuse)*, below md only. |

**Left rail: conversation list**

| key | string | notes |
|---|---|---|
| messages.list.heading | Conversations | Rail `<h2>`. The rail is labelled by this heading (`aria-labelledby`). |
| messages.list.search.label | Search conversations | *(sr)* `<label>` for the filter input. A placeholder does not count as a label. |
| messages.list.search.placeholder | Search conversations… | |
| messages.list.search.clear | Clear search | *(sr)* name of the clear (×) button, if ui-designer adds one. |
| messages.list.search.noMatch | No conversations match "{query}". | Use curly quotes (“ ”) in code. Shown in place of the rows. Leave "+ New message" visible underneath. |
| messages.list.search.resultsCount | {count} conversations / 1 conversation | *(sr)* `aria-live="polite"` status after filtering. Pluralise properly. Say nothing while the input is empty. |
| messages.list.empty | No conversations yet. | Shown when the viewer has no threads at all. Replaces the old "No messages yet." "+ New message" stays below it. |
| messages.list.loading | Loading conversations… | *(sr)* The skeleton rows are `aria-hidden`. Same pattern as OpenPlaydatesRail. |
| messages.list.error | We couldn't load your conversations. | Replaces the old "Could not load threads." Show this string, never `error.message`. Matches "We couldn't load open playdates." |
| messages.list.retry | Try again | Button next to the error, if the frontend adds a refetch. |
| messages.list.row.unread | {count} unread / 1 unread | *(sr)* Goes inside the row link next to the visible badge number, so the link reads "Kuratars, let me know…, 3 unread". The badge digit is `aria-hidden`. |
| messages.list.row.partnerFallback | A former member | *(reuse)* `AUTHOR_FALLBACK` from `formatAuthor`. |
| messages.list.new | + New message | Links to `/search`, whose `h1` is "Find a family". **Confirmed: the label fits.** You start a message by choosing a family, and that is what the next page asks you to do. The "+" is a decorative glyph (`aria-hidden`), so the accessible name is "New message". Don't rename it to "Find a family": that is the job of the Discover nav item. |

The selected row uses `aria-current="page"` and has no extra copy. Timestamps keep `formatTimestamp` with no change.

**Center: open conversation**

| key | string | notes |
|---|---|---|
| messages.thread.landmark | Conversation with {familyName} | *(sr)* `aria-label` on the center `<section>`. Use `formatAuthor` for a missing name. |
| messages.thread.header.location | {city}, {state} | Show only what exists: "{city}", "{state}" or nothing. Never show a lone comma. |
| messages.thread.loading | Loading conversation… | *(sr)*, with a skeleton. |
| messages.thread.error | We couldn't load this conversation. | Replaces "Could not load thread." Show this string, never `error.message`. |
| messages.thread.empty | No messages yet — say hi. | *(reuse)* from MessageThread. Shown when you open a family from "Families to say hi to" before anyone has written. |
| messages.composer.* | Write a message… / Send / Sending… / Type a message. / Could not send. / Message (sr label) | *(reuse)* MessageComposer, unchanged. Copy follow-up, outside this feature: "Could not send." could become "We couldn't send that. Try again." |
| messages.thread.blocked.* | (BlockedThreadBanner, ThreadHeaderBlockedTag strings) | *(reuse)*, unchanged. |

**Center: empty states (md+, no conversation selected)**

| key | string | notes |
|---|---|---|
| messages.center.none.heading | Pick a conversation | Shown when the viewer has at least one thread. |
| messages.center.none.body | Choose a family on the left to read and reply here. | |
| messages.center.noThreads.heading | Start your first conversation | Shown when the viewer has no threads at all. |
| messages.center.noThreads.body | Say hello to a family nearby, or find one by name or city. | |
| messages.center.noThreads.cta | Find a family | Links to `/search`. Uses the same words as the Search page `h1`. |

**Right rail: About this family**

Render this card only when a conversation is selected. It has no "nothing selected" copy. ui-designer to confirm the column is blank, or shows only "Families to say hi to", in that case.

| key | string | notes |
|---|---|---|
| messages.about.landmark | Family details | *(sr)* `aria-label` on the right-column `<aside>`. Each card inside is a `<section>` labelled by its own heading. |
| messages.about.heading | About this family | Card `<h2>`. |
| messages.about.location | {city}, {state} | Same fallback rules as the thread header. |
| messages.about.joined | joined {year} | **Omit for now.** The mock shows "· joined 2026", but `FamilyDTO` has no created date. Add it only if backend-dev exposes one. Never invent it. |
| messages.about.bio.empty | This family hasn't added a bio yet. | Muted, italic. |
| messages.about.noFamily | This family hasn't set up their page yet. | Shown when the partner has no family row (`/family/:id` fails to resolve). Hide the slots and the "View family page" link. |
| messages.about.formerMember | This family's page is no longer available. | Shown when the partner name is null ("A former member"). |
| messages.about.loading | Loading family details… | *(sr)*, with a skeleton. |
| messages.about.error | We couldn't load this family's details. | |
| messages.about.slots.heading | Open playdates | `<h3>` subheading. |
| messages.about.slots.row | {shortDate} · {time} | e.g. "Sat, Aug 22 · 10am". Use `formatShortDate` and `formatTime` on the two halves of the floating start, never converted to another time zone. Note: the mock shows "10:00am", but the shipped `formatTime` writes "10am". Stay consistent with Search. |
| messages.about.slots.request | Request | *(reuse)* chip label from OpenPlaydatesRail. |
| messages.about.slots.request.a11y | Request a playdate with {familyName} on {spokenDate} at {time} | *(reuse)* Same template as OpenPlaydatesRail. `{spokenDate}` = "Saturday, August 22" (weekday, month, day in full). |
| messages.about.slots.none | No open playdates coming up. | Muted, italic. The "View family page" link below still leads to their full calendar. |
| messages.about.slots.loading | Loading open playdates… | *(reuse)* *(sr)* |
| messages.about.slots.error | We couldn't load open playdates. | *(reuse)* |
| messages.about.viewFamily | View family page → | The arrow is `aria-hidden`. |
| messages.about.viewFamily.a11y | View family page for {familyName} | *(sr)* The accessible name starts with the visible text (WCAG 2.5.3 Label in Name). |

**Right rail: Families to say hi to**

| key | string | notes |
|---|---|---|
| messages.suggest.heading | Families to say hi to | Card `<h2>`. The section is labelled by this heading. |
| messages.suggest.empty | — *(none, intentionally)* | **No empty-state copy.** User-approved rule (2026-11-27): when no family qualifies, the section is not rendered at all. No heading, no card, no placeholder. |
| messages.suggest.loading | — *(none)* | Recommended: render nothing until the data arrives, so the heading never appears and then vanishes when the list turns out empty. If ui-designer keeps a skeleton anyway, use the *(sr)* string "Loading families to say hi to…". |
| messages.suggest.error | — *(none)* | Recommended: hide the section on error. It is an optional nudge, and an error card would draw more attention than the feature deserves. If it must show: "We couldn't load suggestions right now." |
| messages.suggest.row.name | {familyName} | Links to `/family/{id}`. The accessible name is the family name, same as the Home Community rail. |
| messages.suggest.message | Message | Action link to `/messages/{ownerId}`. |
| messages.suggest.message.a11y | Message {familyName} | *(sr)* `aria-label`. The visible "Message" sits at the start of the name, as WCAG 2.5.3 requires. |

**Reason line: one per row, chosen by backend `reason`**

| reason | string | example | rules |
|---|---|---|---|
| `same_city` | Also in {city} | Also in Oakland | `{city}` is the suggested family's city, which equals the viewer's. If `city` is missing, fall back to the `same_state` string, then to no line. |
| `same_state` | Also in {state} | Also in CA | Show `{state}` exactly as stored. If it is missing, show no reason line. |
| `open_slot` | Open {weekday} {time} | Open Sat 10am | Use the date and clock halves of `nextFreeSlotStart` (floating, never converted to another time zone). `{weekday}` = short weekday (`en-US`), `{time}` = `formatTime`. **If the slot is 7 or more days away**, use "Open {Mon d}, {time}" (e.g. "Open Dec 12, 10am"), because a bare weekday would point to the wrong week. If `nextFreeSlotStart` is null or in the past, show no line. |
| `open_slot` *(sr)* | Open for a playdate {spokenDate} at {time} | Open for a playdate Saturday, December 12 at 10am | Visually hidden twin of the short line. The short line is `aria-hidden`. Gives screen-reader users the full day name instead of "Sat". |
| `recent` | Recently updated their page | — | Accurate: `recent` means `families.updated_at` (a recent profile edit). Do **not** say "Active now", "New to fofafu" or "Online". If the Open Question changes "recently active" to mean the last post or message, this string needs a new review. |
| *(unknown / missing)* | — | — | Show no reason line. Don't show a generic filler line. |

Everything below `md` keeps today's strings. The side rails are hidden there, so none of the right-rail strings appear.

### Accessibility

#### Spec-stage audit (2026-11-27)

Audited against WCAG 2.2 AA. Inputs: the approved mock (colours sampled from the PNG pixels, not guessed), the acceptance criteria, `### Microcopy` as written at 10:45, [[standards/design-system]], and the shipped code this page grows out of (`Messages.tsx`, `MessageThread.tsx`, `MessageBubble.tsx`, `MessageComposer.tsx`, `Layout.tsx`, `useFocusMainOnRouteChange.ts`, `Search.tsx`, `PlaydateBadge.tsx`, `OpenPlaydatesRail.tsx`). `### Visual` landed while this audit was running. It has been read in full, and every requirement below is reconciled against its class strings. Nothing is built yet, so these are requirements for frontend-dev, not findings against a page. Where this section is stricter than Visual or Microcopy, this section wins (same rule as [[features/search-browse-directory]]).

**32 requirements: 24 BLOCKING (one of them, 28, applies only if the header "…" is built), 8 NON-BLOCKING.** BLOCKING means the page fails a WCAG 2.2 A or AA criterion if the requirement is not met. NON-BLOCKING items should still be built, but they do not hold the ship. Each requirement ends with a test that frontend-dev or qa-engineer can write.

**For ui-designer (Visual).** Visual already meets several of these. Requirement 1 is met by V-1, which I endorse: `brand.primary.pressed` text gives 4.86:1 on card and 4.71:1 on `surface.warm`, and is never used on `surface.subtle`. Requirement 8 is met by Visual's "not rendered" rules for loading, empty and error and its "no empty `<aside>`" rule. The MessageAction `min-h-11`, the underline-only hover and the `PlaydateBadge` reuse also pass. Six changes are still needed. None needs a new token:
- **Requirement 2:** the composer textarea needs `placeholder:text-ink-muted`.
- **Requirement 3:** `border-ink-muted/30` on both inputs is 1.61:1. Use `/70`.
- **Requirement 4:** the selected row shows its state by the `surface.subtle` fill alone.
- **Requirement 32:** ViewFamilyLink and NewMessageLink need `min-h-6`.
- **Requirement 7:** the left column is `<nav>`, not `<aside>`.
- **Requirement 21:** TimeDivider is `aria-hidden`. This answers N-5 (the sr-only `<time>` in each bubble is confirmed).

**For ux-writer (Microcopy):** new strings are needed for requirements 20 (sender prefix), 22 (the "Messages" scroll-region label), 23 (new-message announcement), 24 ("Sent") and 28 (only if the "…" is built), plus the composer label in 25 (recommended). Requirement 7 replaces `messages.about.landmark` ("Family details").

**For frontend-dev:** requirements 15 and 16 change `useFocusMainOnRouteChange`. Requirement 20 changes the shared `MessageBubble`. That fixes the thread page below `md` too, so the layout there stays the same, but screen readers will read one extra word per message.

##### Contrast

Computed by script with the WCAG relative-luminance formula. Translucent colours are flattened onto the surface under them first. The mock is drawn at 2× scale, so none of its coloured text is large enough for the 3:1 allowance (large means 24px, or 18.66px bold). Text needs 4.5:1. Non-text parts needed to find or operate a control, or to show its state, need 3:1 (1.4.11).

| Where | Foreground on background | Ratio | Needs | Verdict |
|---|---|---|---|---|
| Names, message text, selected-row text | `ink.lead` `#1F1B18` on `surface.card`; on `surface.subtle` `#F4ECDF` (selected row); on `surface.warm` | 17.10; 14.58; 16.58 | 4.5 | Pass, also AAA |
| Previews, timestamps, eyebrows, location, date separator | `ink.muted` `#5E534B` on card; on `surface.subtle` (selected row) | 7.46; 6.36 | 4.5 | Pass, also AAA |
| Sent bubble (mock), Send button, unread badge | white on `brand.primary.pressed` `#3F7E54` | 4.86 | 4.5 | Pass AA, fail AAA |
| Sent bubble (shipped `MessageBubble`) | `ink.lead` on `brand.primary/10` over card (`#EDF4EF`) | 15.30 | 4.5 | Pass, also AAA. Either treatment is fine |
| Request chip at rest; on hover | `#8A5A12` on `brand.warm/20` over card (`#FCF0DC`, mock samples `#FDF1DC`); on `brand.warm/30` | 5.25 (mock 5.29); 4.92 | 4.5 | Pass AA. Same pair as the shipped `PlaydateBadge` |
| "Message", "View family page →", "+ New message" as mocked | `brand.primary` `#4D9463` on card | 3.66 | 4.5 | **Fail AA.** Requirement 1 |
| The same links as Visual specifies (V-1); the mobile "← All messages" link | `brand.primary.pressed` on card; on `surface.warm` | 4.86; 4.71 | 4.5 | Pass AA |
| V-1 green text on a `surface.subtle` fill (Visual forbids this) | `#3F7E54` on `#F4ECDF` | 4.14 | 4.5 | **Fail AA** if it ever happens. Requirement 1 |
| Input borders as Visual specifies (non-text) | `ink.muted/30` (`#CFCBC9`) against card | 1.61 | 3 | **Fail AA.** Requirement 3 |
| Hairlines (`ink.muted/20`) | against card | 1.35 | none | Decorative dividers, exempt |
| Time divider | `ink.muted` on `surface.warm` | 7.24 | 4.5 | Pass, also AAA |
| Input placeholders as mocked; Tailwind default (shipped composer) | `#8C8078` on card; `#9CA3AF` on card | 3.84; 2.54 | 4.5 | **Fail AA.** Requirement 2 |
| Search and composer input borders as mocked (non-text) | `#E5DACB` against card; against page | 1.38; 1.34 | 3 | **Fail AA.** Requirement 3 |
| Shipped `SearchForm` border, the fix (non-text) | `ink.muted/70` (`#8E8781`) against card | 3.54 | 3 | Pass |
| Selected row fill as the only state cue (non-text) | `surface.subtle` against card | 1.17 | 3 | **Fail AA.** Requirement 4 |
| Avatar initial as mocked | `brand.primary.pressed` on `#E6F0E8` | 4.16 | 4.5 | Exempt as decoration (the initial is `aria-hidden` and the name sits next to it). Requirement 5 |
| Errors | `feedback.error` `#B83B3B` on card; on page | 5.63; 5.47 | 4.5 | Pass AA |
| Focus ring (non-text) | `brand.primary` on card; on page; on selected row | 3.66; 3.55; 3.12 | 3 | Pass. Thin margin on the selected row |
| Focus ring against a `brand.primary.pressed` fill (Send, sent bubble) | `#4D9463` against `#3F7E54` | 1.33 | n/a | Needs `ring-offset-2`, as the shipped Search button has. Requirement 19 |
| Navbar badge (shipped, unchanged) | white on `feedback.error` | 5.63 | 4.5 | Pass |

Not required to reach 3:1: the Request chip outline (1.41, the label identifies the pill), white cards on the cream page (1.03), the row hover fill, and skeleton bones (decorative). The "NEW" ribbons and dashed outlines in the mock are annotations, not UI. Do not build them.

##### Requirements

**Contrast**

1. **BLOCKING** (1.4.3). "Message", "View family page →", "+ New message" and the mobile back link must not use `brand.primary` as their text colour. **Met by Visual V-1** (`brand.primary.pressed`: 4.86:1 on card, 4.71:1 on `surface.warm`), on one condition: no `surface.subtle` fill ever goes under that text (4.14:1). `ink.lead` is the fallback if a fill is ever needed. Test: these four elements carry `text-brand-primary-pressed` and no plain `text-brand-primary`. No hover or focus class adds `bg-surface-subtle` to them.
2. **BLOCKING** (1.4.3). Both placeholders ("Search conversations…", "Write a message…") use `placeholder:text-ink-muted` (7.46:1), the same class `SearchForm` ships. This also fixes the composer below `md`, which uses the Tailwind default today (2.54:1). Test: both inputs carry `placeholder:text-ink-muted`.
3. **BLOCKING** (1.4.11). The search and composer input borders must reach 3:1 against the card. The mock's border (1.38:1) and Visual's `border-ink-muted/30` (1.61:1) both fail. Use `SearchForm`'s shipped `border-ink-muted/70` (3.54:1). `/60` is 2.85:1 and also fails. Test: both inputs carry a border class from this table, or one ui-designer has checked at 3:1 or more.
4. **BLOCKING** (1.4.11, 1.4.1). The selected conversation row needs a visible cue other than the `surface.subtle` fill (1.17:1). It must reach 3:1 against both the card and the fill. For example, a 3–4px leading bar in `brand.primary.pressed` (4.86:1 on card, 4.14:1 on the fill), or a weight or border change that meets the same ratio. ui-designer picks the cue. Test: the `aria-current` row carries the cue's class.
5. NON-BLOCKING. Avatar initials: prefer `ink.lead` on the tint (14.50:1), as [[features/search-browse-directory]] did. Exempt today only because the initial is `aria-hidden` and the name sits next to it.

**Structure and landmarks**

6. **BLOCKING** (1.3.1, 2.4.6). Exactly one `<h1>` ("Messages", may be `sr-only` at `md`+, per Microcopy). These eyebrows are real `<h2>` elements, not styled paragraphs: "Conversations"; the center's partner name (or the empty-state heading when nothing is selected); "About this family"; "Families to say hi to". "Open playdates" is an `<h3>`. Test: one level-1 heading; `getByRole('heading', { level: 2, name: 'Conversations' })` and the same for each of the others.
7. **BLOCKING** (1.3.1; axe `landmark-unique`). Landmarks, all with unique names:
   - The left column is `<nav aria-labelledby={conversationsHeadingId}>`, not Visual's `<aside>`. This list is the page's main way to move between conversations, and its rows are links that change the URL. A `nav` landmark says that; "complementary" does not.
   - The center column is `<section aria-label="Conversation with {familyName}">` (Microcopy `messages.thread.landmark`). With nothing selected, it is labelled by its empty-state `<h2>`.
   - In the right column, **each card is its own `<aside aria-labelledby={cardHeadingId}>`**. This matches Visual N-5's "two `<aside>`s with distinct labels". The column itself is a plain `<div className="hidden md:block">`, not a landmark. That replaces the single wrapping `<aside>` in Visual's anatomy.

   This also replaces Microcopy's `messages.about.landmark` wrapper ("Family details"). With nothing selected, a wrapper with that name would contain only "Families to say hi to", which is wrong. With neither card rendered, it would be an empty landmark. Test: `getByRole('navigation', { name: 'Conversations' })`, `getByRole('region', { name: /^Conversation with/ })`, `getByRole('complementary', { name: 'About this family' })`.
8. **BLOCKING** (acceptance criterion; 1.3.1, 2.4.6). "Families to say hi to" is not rendered at all when no family qualifies. That means no `<aside>`, no heading, no `sr-only` text and no live region. It is also not rendered while loading or on error (this agrees with Microcopy's recommendation), so a landmark never appears and then disappears. Likewise, "About this family" is not rendered when no conversation is selected. Test: with an empty suggestions response, `queryByRole('complementary', { name: 'Families to say hi to' })` and `queryByText('Families to say hi to')` are both null, and the same holds while the request is pending.
9. **BLOCKING** (1.3.2, 2.4.3). DOM order matches visual order: left, then center, then right. Inside the center: header, messages, blocked banner, composer. **Do not use `flex-col-reverse` or CSS `order` to keep the message list pinned to the bottom.** Doing so makes screen readers and Tab read the newest message first. Pin to the bottom by scrolling the container instead. Test: `compareDocumentPosition` order of the three landmarks; no `flex-col-reverse` or `order-` class in the center column.
10. **BLOCKING** (acceptance criterion: below `md` unchanged). Anything hidden below `md` uses `hidden md:block` (`display: none`), never `sr-only`, `opacity-0`, `invisible` or an off-screen transform. Below `md`, the accessibility tree of `/messages` and `/messages/:userId` must match today's two pages, including "← All messages", and the existing `Messages.test.tsx`, `MessageThread.test.tsx` and `a11y.test.tsx` cases must still pass. Test: the existing suites stay green; at a mocked narrow viewport, `queryByRole('complementary')` is null.

**Conversation list**

11. **BLOCKING** (1.3.1, 4.1.2). The selected row's link carries `aria-current="page"`. No other row carries it, and no row carries it at `/messages`. Test: at `/messages/u1`, exactly one link has `aria-current="page"` and its name starts with u1's family name. At `/messages`, there are none.
12. **BLOCKING** (1.3.1). The unread badge digit is `aria-hidden`, and the row link contains the `sr-only` "{count} unread" (Microcopy `messages.list.row.unread`). The link text order is name, preview, unread, so a screen-reader list of links starts each entry with the family name. Test: `getByRole('link', { name: /^Kuratars.*3 unread$/ })`.
13. **BLOCKING** (1.3.1, 3.3.2, 4.1.3). The filter is an `<input type="search">` with a `<label>` ("Search conversations", may be `sr-only`). The results-count status (`role="status"`, Microcopy `messages.list.search.resultsCount`) is mounted from first render and kept empty while the input is empty. Don't render it conditionally, or screen readers won't announce it. Debounce updates (about 500ms) so it does not speak on every keystroke. The "No conversations match…" text must reach screen readers through the same status. Test: `getByRole('searchbox', { name: 'Search conversations' })`; typing a query that matches nothing puts the no-match text in `getByRole('status')`.
14. NON-BLOCKING (2.4.3). Selecting a conversation must not remount the list. Mount both `/messages` and `/messages/:userId` on the same page component at `md`+, so the filter text, the list's scroll position and the keyboard user's place survive the selection. Test: type in the filter, click a row, and the filter value is unchanged.

**Focus management**

15. **BLOCKING** (2.4.3). This governs focus when the URL moves between `/messages` and `/messages/:userId` at `md`+, however that happens: clicking a row, Enter on a row, a "Message" action under "Families to say hi to", programmatic `navigate()`, or browser back and forward. Focus does **not** go to `<main>`, because that would throw keyboard users back to the top of the list. It goes to the center column container. Rules:
   - The container has `tabIndex={-1}` and `focus:outline-none` (the same precedent as `<main>`). Its accessible name from requirement 7 is what gets announced, for example "Conversation with Kuratars, region". The next Tab reaches the first control in the conversation header.
   - Initial page load and deep links: no focus move. This is the existing rule from [[features/focus-reset-on-route-change]].
   - Below `md`, and when leaving the `/messages*` routes: the existing focus-to-`<main>` reset is unchanged.

   Implementation constraint: React runs child effects before parent effects, so a focus call in the page runs first and Layout's hook would then steal focus back to `<main>`. `useFocusMainOnRouteChange` therefore needs a skip rule. Skip when both the previous and next pathnames match `^/messages(/[^/]+)?$` and `matchMedia('(min-width: 768px)')` matches. The page then focuses the center itself, keyed on `userId`, skipping first mount. Don't use `navigate` state as the only signal: entries opened by deep link have no state when reached by back and forward. Tests, each asserting the final `document.activeElement` after effects settle: (a) clicking row u2 from `/messages/u1` focuses the center region named "Conversation with {u2}", not `#main`; (b) `navigate(-1)` back to `/messages/u1` focuses the region for u1; (c) back to `/messages` focuses the center region labelled by the empty-state heading; (d) from `/messages/u1` to `/` focuses `#main`; (e) a deep-link load of `/messages/u1` leaves focus on `body`; (f) at a narrow viewport, `/messages` to `/messages/u1` focuses `#main`.
16. **BLOCKING** (2.4.3). The center focus target exists and keeps its name in every state: loading, error, empty thread, nothing selected, and blocked partner. The center container renders in every state, even while Visual's header bones show. Its `aria-label` takes the name from the thread list (already cached) when there is one, then from the `family/:id` result (needed for a new conversation opened from "Families to say hi to"), then from `formatAuthor(null)`. It is never empty and never "Conversation with undefined". Focus never falls to `<body>` because the element it was on was removed, for example a suggestion row that drops out once a thread exists. If that happens, move focus to that card's heading container or to the center. Test: with the thread query pending, the focused element after selection is the named region.
17. NON-BLOCKING. Activating the row that is already selected (same pathname, so no route change) also moves focus to the center, so the behaviour is the same every time.
18. **BLOCKING** (2.1.1, 2.1.2). No keyboard traps. Every control is a native `<a>`, `<button>`, `<input>` or `<textarea>`. Menus (the header "…" and `ModerationMenu` on inbound bubbles) close on Escape and return focus to their trigger. NON-BLOCKING: do not autofocus the composer when a conversation is selected. It skips the history for screen-reader users, and focus is already in the right pane. Test: Escape on an open header menu closes it and `activeElement` is its trigger.
19. **BLOCKING** (2.4.7, 2.4.11). Every interactive element shows a `focus-visible` ring in `brand.primary` (contrast in the table above). Use `ring-offset-2` on `brand.primary.pressed` fills (Send). The grid carries Search's `[&_:is(a,button,input,textarea)]:scroll-my-20` (add `textarea` to Search's list) so nothing focused lands under the sticky navbar. If the center has a sticky header or composer inside its own scroll container, give that container a `scroll-padding` at least as tall as the sticky parts, so a focused bubble's menu is never hidden under them. Test: the grid has the `scroll-my-20` variant; Send has `focus-visible:ring-offset-2`.

**Conversation pane**

20. **BLOCKING** (1.3.1, 1.4.1). Each message states its sender in text, not only through left or right alignment and colour. Today's `MessageBubble` fails this. Add an `sr-only` prefix: "You:" for your own messages, "{familyName}:" for theirs (ux-writer to confirm the wording). Fix it in the shared `MessageBubble` so the thread page below `md` gets it too. Test: `getAllByRole('listitem')[i]` has text starting with "You:" or the partner's name.
21. **BLOCKING** (1.3.1). The history is an `<ol>` with one `<li>` per message, in time order. **The history must not have `role="log"` (which turns on `aria-live="polite"` automatically) or any `aria-live`.** Otherwise switching threads or refetching reads out the whole conversation. This answers Visual N-5: each bubble keeps its own `sr-only` `<time dateTime>`, and the visual TimeDivider is `aria-hidden="true"`, so screen readers don't hear the time twice. Render the divider inside the `<li>` of the message that follows it, so the list's item count equals the message count. Test: `within(centerRegion).getAllByRole('list')` includes the history `<ol>`; no ancestor of the history has `role="log"` or `aria-live`.
22. **BLOCKING** (2.1.1, 1.4.4, 1.4.10). Visual's MessageScroll and the list's rows area are internal scroll containers, so both must be keyboard-scrollable. MessageScroll gets `tabIndex={0}`, `role="region"` and `aria-label` "Messages" (ux-writer string), because a thread of only your own messages has nothing focusable in it (axe `scrollable-region-focusable`). The list's rows area always holds links, so it passes without extra attributes. Visual's `overflow-hidden` on the pane card is acceptable only because MessageScroll scrolls. No text container may clip. With a larger browser font size the composer must still be reachable; Visual's `md:min-h-[32rem]` plus normal page scroll covers that. Test: axe has no `scrollable-region-focusable` violation for a thread containing only `mine` messages.
23. NON-BLOCKING (new-message announcement policy; not a 4.1.3 status message, but a noisy region would make the page unusable with a screen reader):
   - Use one persistent `sr-only` `role="status"` element. Mount it from first render, outside any `aria-busy` wrapper.
   - Announce only when inbound messages are appended to the **open** thread after it has loaded. Group each refetch into one announcement: "New message from {familyName}" or "{n} new messages from {familyName}" (ux-writer to add the strings).
   - Never announce on first load, on a thread switch, for your own sends, for preview or unread changes in the list, or for other threads (the navbar badge covers those). Never read message bodies.
   - Test: seed a thread, refetch with one more inbound message, and the status text is the announcement. Switching threads leaves the status empty.
24. NON-BLOCKING. After a successful send the textarea clears with no other cue. Put a short "Sent" in the same status region (ux-writer string). Errors keep the shipped `role="alert"`.
25. **BLOCKING** (1.3.1, 3.3.1, 4.1.2). The composer:
   - Keeps a real `<label>` (`sr-only` is fine). Get the id from `useId()` instead of the hard-coded `message-content`.
   - Links the field error to the textarea with `aria-describedby` and sets `aria-invalid="true"` while it shows. Today the error is not linked to the field.

   NON-BLOCKING:
   - Name the recipient in the label ("Message {familyName}") so it is clear which family you are replying to when the pane changes in place. This differs from Microcopy's *(reuse)* "Message".
   - If Enter sends, Shift+Enter must add a new line, and Enter must not send while an IME composition is in progress (`event.nativeEvent.isComposing`).

   Test: `getByRole('textbox', { name: /^Message/ })`; submitting empty sets `aria-invalid` and `toHaveAccessibleDescription('Type a message.')`.

**Right rail and actions**

26. **BLOCKING** (2.5.3, 1.1.1). Each Request chip reuses `PlaydateBadge` with `to`. Its accessible name is Microcopy's `messages.about.slots.request.a11y`, which starts with the visible word "Request", and the 🗓 glyph stays `aria-hidden`. Slots go in a `<ul>`, each time in `<time dateTime>`. Test: `getByRole('link', { name: /^Request a playdate with Kuratars on Saturday, August 22 at/ })`.
27. **BLOCKING** (2.5.3). The accessible names "Message {familyName}" and "View family page for {familyName}" both start with their visible text, as Microcopy specifies. The → arrow is `aria-hidden`. Keep that order: names like "Say hi to {familyName}" or "Open the {familyName} page" would fail. Test: `getByRole('link', { name: 'Message Nguyen Family' })`.
28. **BLOCKING if built** (4.1.2, 2.4.6). Visual N-4 leaves out the center header "…". The dispatcher's 10:48 log line says the header "…" keeps the existing moderation menu. Design-lead needs to settle which one holds. If it is built:
   - It needs a name, `aria-haspopup`, `aria-expanded`, and a 44×44 size (`size.hitTarget.min`). `ModerationMenu`'s trigger already has all of these.
   - Its name must differ from the "More actions" kebabs on the inbound bubbles in the same pane. Otherwise a screen-reader user hears several identical "More actions" buttons and can't tell the conversation-level one apart. Use "More actions for {familyName}" (ux-writer string).

   Test: `getByRole('button', { name: /^More actions for Kuratars/ })` has `aria-expanded="false"`.
29. NON-BLOCKING. The "+" in "+ New message" is `aria-hidden`, so the name is "New message" (Microcopy says the same). Avatars stay `alt=""` or `aria-hidden`, as the shipped `Avatar` does.

**Loading, motion, target size**

30. NON-BLOCKING (the project's skeleton pattern, from `OpenPlaydatesRail`). Each column that loads wraps its rows in `aria-busy={loading}`. Skeleton bones are `aria-hidden`. An `sr-only` loading line (Microcopy `*.loading`) sits inside each column. Put `aria-busy` where Visual puts it: the list `<ul>`, MessageScroll, and the About card body. Never put it on `<main>`, on the center focus target, or on any ancestor of the requirement 23 status region. Test: while pending, the list wrapper has `aria-busy="true"` and the "Loading conversations…" text is present.
31. NON-BLOCKING (2.3.3 is AAA; project convention). Bones use `motion-reduce:animate-none`. Scrolling to the newest message uses `behavior: 'auto'` when `usePrefersReducedMotion()` is true, never `smooth`. Any pane-switch transition is turned off under reduced motion. Test: bones carry `motion-reduce:animate-none`.
32. **BLOCKING** (2.5.8). Every target is at least 24×24 CSS px.
   - Request chips: reusing `PlaydateBadge` unchanged (Visual) passes. Its `after:` hit area is about 45px tall. At Visual's slot-row pitch of about 36px, neighbouring hit areas overlap by a few px, which still leaves each chip well over 24px of target it owns. Don't shrink the slot rows below `py-2`.
   - ViewFamilyLink and NewMessageLink are `text-sm` blocks, about 20px tall. Add `min-h-6`, as Search's rail footer link does. Visual doesn't have this yet.
   - MessageAction (`min-h-11`), Send (`min-h-11`), the textarea (`min-h-11`) and conversation rows (about 56px, full width) pass as Visual specifies.
   - A clear (×) button in the filter, if added, is icon-only, so it gets `size.hitTarget.min` (44px). Test: class assertions on each of the above, as in [[features/search-browse-directory]].

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
