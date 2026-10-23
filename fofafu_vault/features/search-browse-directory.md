---
slug: search-browse-directory
title: Search Browse Directory
owner: engineering            # primary team: engineering | design | marketing
collaborators: [design]       # additional teams; dispatcher infers if empty
status: review                # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-10-03
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: "docs/screenshots/search-browse-directory/mock.png"
---

# Search Browse Directory

## Problem

`/search` renders in the default 480px column and is blank until a query is submitted, so on a desktop most of the page is empty and a family that arrives with nothing specific to type has nowhere to go. Home's Community rail makes it worse: its "View all →" link lands on this blank page. There is also no way to narrow the list to families nearby or to families who have a playdate slot open, even though the data for both already exists. Success is a foster parent opening `/search` and immediately seeing families they could reach out to, with the two filters that matter to them on the left and this week's open playdate slots on the right.

Human-approved mock (2026-10-03): `docs/screenshots/search-browse-directory/mock.png`. It uses sample data and is the layout reference, not a pixel contract.

## Acceptance criteria

- [ ] `/search` uses the wide (1100px) layout. At `md` and up it has three columns, matching Home's `240px / 1fr / 240px` grid: filters (left), families (centre), "Open for playdates this week" (right).
- [ ] Before any query is submitted, the centre column lists families newest first instead of the "Try a name…" hint. Each card shows the avatar, "The <name> family", city and state, a two-line bio, and the "🗓 Playdate" badge when the family has a future free slot.
- [ ] Submitting a query of two or more characters shows the matching families in the same card format, including city/state and the playdate badge. Clearing the query returns to the browse list.
- [ ] "Near me" narrows the list to families in the signed-in user's city and state. "Open for playdates" narrows it to families with a future free slot. The two combine, apply to both the browse list and query results, and "Clear filters" resets them. The count line above the list reflects the filtered result.
- [ ] The right column lists up to 5 families whose next free slot starts within the next 7 days, soonest first. Each row shows the family name, the slot's day and start time, and a "Request" badge linking to the existing request flow (`/family/:id?requestSlot=<slotId>`). It shows an empty state when there are none.
- [ ] Below `md` the page is a single column: the filters stay reachable above the list, and the right column is hidden (same treatment as Home's rails).
- [ ] Every column has loading, empty and error states. Families the user has blocked stay excluded, as today.
- [ ] `search` and `community` Edge Function responses carry `city`, `state`, `nextFreeSlotId` and `nextFreeSlotStart` (ISO timestamp, null when there is no future free slot) for every family row. The frontend must still render against a backend that has not been redeployed yet (missing fields treated as null).

## Out of scope

- Pagination or infinite scroll beyond the endpoints' existing limits.
- Distance-based search, a state dropdown, or any filter on children's ages.
- Changes to Home's Community rail or to the public family page.
- Seeding sample families (tracked separately).

## Open questions

- Should the filters and query persist in the URL (`?q=&near=1&open=1`) so a filtered view is shareable and survives reload? Recommendation: yes; tech-lead to confirm.
- "Near me" when the signed-in user has no city/state on file: recommendation is to disable the checkbox with a short hint rather than hide it; ux-writer to supply the copy.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Stack.** Supabase Edge Functions (Deno) under `supabase/functions/`, not the legacy `backend/` Express workspace. No migration, no new dependency. Nothing is deployed: the live `search` and `community` functions still return the old shape until someone runs `supabase functions deploy`.

**Endpoints.** Paths and auth are unchanged. Both accept one new optional query param, `now`, and `limit` is now bounded.

| Endpoint | Returns | `limit` default | `limit` max |
|---|---|---|---|
| `GET community/recent?limit=N&now=…` | Other families, newest `updated_at` first. 401 when signed out. Never includes the caller's own family. | 12 | 50 |
| `GET search/families?q=&limit=N&now=…` | Families whose name, bio, city or state contains `q`. Includes the caller's own family when it matches (`isOwner: true`). | 20 | 50 |

Both still leave out families the caller has blocked. That query code is untouched and its existing tests pass unmodified in their assertions.

**The `limit` param.** Parsed by one shared `parseLimit(raw, fallback)`. Added after an automated security review of the first commit found that `limit` was passed to the database unchecked, so one request could ask for any number of families and fan out into as many slot queries.

- A plain whole number from 1 to 50 is used as is. Anything above 50 is clamped to 50 (`MAX_FAMILIES`).
- Missing, empty, `0`, negative, fractional (`1.5`, `5.0`) or non-numeric (`abc`, `1e3`) values use the endpoint's default. It never produces a 400.
- Consequence for the page: one request returns at most 50 families, and neither endpoint has an offset or cursor. The browse list and both filters therefore work on at most the 50 most recently updated families. The deployed frontend sends 12 (Home) or nothing (Search), so it is unaffected.

**The `now` param.** The caller's current local wall-clock time, in exactly the format `nextFreeSlotStart` uses: `YYYY-MM-DDTHH:MM:SS`, no `Z`, no offset, no milliseconds. Example:

```
GET community/recent?limit=50&now=2026-10-03T20:45:00
```

- Build it from the browser's local clock. `Date.prototype.toISOString()` is the wrong source: it is UTC, ends in `Z` and has milliseconds, so the server would discard it.
- It is validated with a strict pattern plus a real-calendar-date check, and the year must be between 1000 and 2999. A missing or malformed `now` is ignored and the request behaves as if it were absent. It never produces a 400, so a frontend that predates the param keeps working.
- The server only compares strings, so the caller may round `now` (to the minute, say) to keep request URLs stable. `:` may be sent raw or percent-encoded.

**Row shape.** Identical on both endpoints, because both now build rows with one mapper (`toListedFamily` in `supabase/functions/_shared/familyListing.ts`):

```json
{
  "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "ownerId": "0b9f6c1e-3d2a-4f5b-8c7d-1e2f3a4b5c6d",
  "name": "Lee",
  "bio": "Two kids and a dog.",
  "kidCount": null,
  "avatarUrl": null,
  "isOwner": false,
  "updatedAt": "2026-10-01T12:00:00+00:00",
  "city": "Austin",
  "state": "TX",
  "nextFreeSlotId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  "nextFreeSlotStart": "2026-10-06T10:00:00"
}
```

| Field | Type | Notes |
|---|---|---|
| `city`, `state` | `string \| null` | Straight from `families.city` / `families.state`. Those columns are `NOT NULL DEFAULT ''`, so a family with no location on file comes back as `""`, not `null`. Treat the empty string as "no location" (Home already does). |
| `nextFreeSlotId` | `string \| null` | `availability_slots.id` of the family's next free slot. |
| `nextFreeSlotStart` | `string \| null` | Start of that same slot. `null` exactly when `nextFreeSlotId` is `null`. |

The first eight fields are the existing `FamilyDTO`, unchanged. `search` rows gain four keys; `community` rows gain one (`nextFreeSlotStart`). The frontend's Zod schemas are non-strict, so the currently deployed frontend keeps parsing either shape.

**`nextFreeSlotStart` format and timezone.** `YYYY-MM-DDTHH:MM:SS` with no `Z` and no offset, for example `2026-10-06T10:00:00`. It is `availability_slots.date` (Postgres `date`) joined to `availability_slots.start_time` (free text holding a 24-hour `HH:MM` wall-clock time) plus `:00` seconds.

- The slot table stores no timezone, so the value is a floating local time on purpose. `new Date("2026-10-06T10:00:00")` reads an offset-less ISO date-time as the browser's local time, so a slot saved as 10:00 shows as 10:00 to every viewer. That is the same reading `/family/:id` and `/playdates` already give `startTime`.
- Assumption: host and viewer are in the same timezone. A viewer elsewhere sees the host's clock time, not a converted one.
- Do not append `Z` and do not parse only the date part: a date-only string parses as UTC and can land on the previous day.

**What counts as the next free slot.** Decided by the dispatcher on 2026-10-03, after the first pass of this work flagged that a slot from earlier today could be returned and hide tomorrow's: the viewer supplies the reference time, because slot times are floating local time and the server cannot know the viewer's timezone.

- With a valid `now`: the family's earliest `availability_slots` row with `status = 'free'` whose start is strictly later than `now`. The query asks for `date >=` the date part of `now`, then same-day slots at or before `now`'s time are dropped before the earliest is chosen. A slot starting exactly at `now` is not returned. So a family with a 9:00 slot that has passed and one tomorrow is reported with tomorrow's; a family whose only slot has passed gets `null` for both fields.
- Without a valid `now`: the earliest free slot with `date >=` the server's UTC calendar date. This is the behaviour Home's badge already had, kept so the deployed frontend is unaffected. On this path a slot from earlier today can still be returned, and from 00:00 UTC (5 pm Pacific, 8 pm Eastern in summer) until local midnight, slots later that same local evening are not returned. The new `/search` page should always send `now`.

In both cases `nextFreeSlotId` and `nextFreeSlotStart` come from the same slot and are null together.

In both cases the lookup only considers slots dated within 60 days of its starting date (the date part of `now`, or the server's UTC date). A family whose next free slot is further out than that gets `null` for both fields. This is part of the contract, not an implementation detail: "has a free slot" on this page means "within the next 60 days".

**Shared lookup.** `nextFreeSlotsByFamily(supabase, familyIds, rawNow)` in the same `_shared/familyListing.ts`, used by both functions. Each handler passes the raw `now` query value; validation (`parseLocalNow`) lives in the shared file.

It issues one query per listed family and no other kind: `family_id = <id>`, `status = 'free'`, the date floor, the 60-day ceiling, earliest first (date, then start time) and a 50-row limit. The queries run 10 at a time. This is the dispatcher's redesign of 2026-10-04, made after the security review of the third commit. The batch query over 25 families and its full-batch fallback are gone.

Its work per request is bounded, each bound a named constant in that file:

| Bound | Constant | Value | Effect |
|---|---|---|---|
| Families looked up | `MAX_FAMILIES` | 50 | Ids past the first 50 are ignored inside the lookup itself, so a future caller that forgets to clamp its own limit still cannot fan out. There is one slot query per family, so this is also the most slot queries one request can issue. |
| Date window | `SLOT_HORIZON_DAYS` | 60 | Every slot query has a `date <=` ceiling 60 days after its starting date. |
| Rows per slot query | `MAX_SLOT_ROWS_PER_FAMILY` | 50 | An explicit `limit`, applied after ordering by date then start time. Each query is scoped to one family, so only that family's own slots can use it up. |
| Slot queries in flight at once | `SLOT_LOOKUP_CONCURRENCY` | 10 | The queries are not all fired together. A small worker pool in the same file (plain TypeScript, no dependency) starts the next query only when one of the 10 in flight has settled. |

**Per-family guarantee.** Nothing limits how many free slots one family can create (no cap in `playdates/index.ts` or the schema). The two earlier designs shared one row cap between several families, and a security review found a problem with each:

- Second commit. One family with 500 or more slots in the window could fill a batch's row cap and leave the other 24 families in it with no next slot, so one signed-in user could switch off other families' playdate badges.
- Third commit, which treated a batch of exactly 500 rows as cut and then looked up each missing family on its own. First, that inference only held while PostgREST's own `max-rows` setting was 500 or higher. That setting is not in this repo, and with a lower value a cut batch would have gone undetected with no error. Second, one family storing 500 slots made every request that listed it issue up to 25 extra queries at once (52 per request at worst), so the cost of a request depended on another family's data.

What holds now:

- A family's result is computed only from the answer to its own query. No query covers two families, and no row count is used to infer anything, so the guarantee does not depend on any server setting. If `max-rows` were below 50, a family's query would be cut at that lower number and still contain only its own rows.
- The number of slot queries equals the number of families listed: 12 at `community`'s default limit, up to 20 at `search`'s, 50 at the maximum. It does not change with what any family has stored. A query that fails is not retried.
- At most 10 are in flight at a time. A request for the maximum of 50 families therefore waits for about 5 query round trips where the batch design waited for 1.
- The one way left to show no slot while having one is self-inflicted: 50 or more of a family's own free slots earlier on the same day than `now`. Rows come earliest first for the zero-padded `HH:MM` times the app writes.
- A lookup that errors leaves that one family with `null` slot fields. It does not fail the request and does not change any other family's result.

Cost of the redesign: a request that used to issue 1 slot query now issues one per listed family. That is the query shape `community` shipped with before this feature (one query per family, all fired at once, no family cap and no date ceiling); it now also applies to `search`. Each query is a range scan on the existing `idx_slots_family_date (family_id, date)` index.

**Where each caller-influenced size is bounded.** One pass over `_shared/familyListing.ts` and both handlers.

| Size | Bounded where | Bound |
|---|---|---|
| `limit` | `parseLimit`, the only place either handler reads it | 1 to 50; default 12 or 20 |
| `now` | `parseLocalNow` | Exactly 19 characters in a fixed pattern, a real calendar date, year 1000 to 2999. It moves the 60-day window; it cannot widen it. |
| `q` (search only) | `search/index.ts`, before it reaches the filter | Filter-syntax characters stripped, then cut to 100 characters. Unchanged by this feature. |
| Family ids passed to the slot lookup | Families query `limit`, then `slice` inside `nextFreeSlotsByFamily` | 50 |
| Family rows returned | Families query `limit` | 50 |
| Slot queries per request | One per listed family, after the `slice` inside `nextFreeSlotsByFamily` | Exactly the number of families listed, so at most 50; at most 10 in flight at once |
| Slot rows read per request | `limit` on every slot query, inside the 60-day window | 50 × 50 = 2,500 worst case |
| Blocked-family ids in `not in (…)`, and the `blocks` rows behind them | Not bounded | See below |
| Length of `name` and `bio` in each row | Not bounded server-side | See below |

Found and fixed in this pass: a `now` with an out-of-range year (for example `9999-12-31T23:59:59`) passed validation, and its 60-day ceiling then stopped being a valid date, so the slot query errored and that caller got `null` slot fields. Years outside 1000 to 2999 are now treated as a malformed `now`.

Found and left as fast-follows, because both predate this feature and are owned elsewhere:

- Blocked-family ids (moderation). The `blocks` select has no limit and its ids are joined into the `not in (…)` filter. A caller with a very large block list can only break their own listing, since they only ever see their own blocks.
- `name` and `bio` length (family profiles). The `family` PATCH has no server-side length check and the schema has no constraint; only the frontend form limits them (80 and 2000 characters). Each listing returns up to 50 rows of whatever is stored. The bound belongs at write time, in `family/index.ts` plus a migration. Cutting the text in the listing would only shorten what the browser receives, not what the database sends the function, and would silently change a field other pages show in full.

Other lookup behaviour:

- The earliest slot is chosen in the function by composed start, so the result does not depend on row order.
- A slot whose `start_time` is not a clock time is skipped rather than given an invented time; the family's next valid slot is used. Previously `community` would have returned that slot's id. The app's own slot form cannot produce such a value, but the column has no check constraint.
- If a family's slot query fails, that family's row is returned with both slot fields `null` and the request still succeeds. This matches the lookup `community` had before this feature, which also ignored its error.

**Reporting a failed slot lookup: one warning per request in the function logs, response unchanged (2026-10-05).** The dispatcher asked for the established convention to be followed if there is one. There is none for this case:

- Every other Edge Function reports an unexpected query error to the caller, either as `json({ error: error.message }, 500)` or by throwing. That cannot be used here, because a failed slot lookup must not fail the request.
- There is no shared logger under `supabase/functions/`. The only log call in any function is one `console.warn(JSON.stringify({ msg, … }))` in `coach/index.ts`, on its own swallowed-failure path. One call site in one function is a precedent, not a convention.

So the first pass logged nothing. Code review (nice-to-have 1) asked for the failure to be visible before the functions are deployed, and the dispatcher assigned it on 2026-10-05 with the `coach` line as the pattern. When one or more of a request's slot lookups fail, `nextFreeSlotsByFamily` now writes one line with `console.warn`, however many failed:

```json
{"msg":"slot lookup failure","failed":2,"total":3,"message":"permission denied for table availability_slots"}
```

- `failed` and `total` count that request's lookups, so `total` is at most 50. `message` is the error message of the first failed lookup in listing order, or `unknown error` when the error has none. Nothing else is written: no family id, no user id, no row.
- No line is written when every lookup succeeds.
- The response is the same as before in both cases. A failed lookup still costs only that family its slot fields and is not retried, and neither handler changed.
- `message` is cut to its first 200 characters (`MAX_FAILURE_MESSAGE_LENGTH`) before it is logged. supabase-js puts a non-JSON error response (a gateway's HTML error page, say) into `message` whole, and the first version of this warning would have logged that body in full. The dispatcher asked for the cap the same day. A `message` that is missing or is not a string is reported as `unknown error` and cannot throw.
- Tests: 8 added to `_shared/familyListing.test.ts` (55 to 63), with `console.warn` swapped for a recorder and restored in a `finally`. Four were red before the code they cover (one warning for two failures out of three, its exact content, the `unknown error` fallback, and a 5,000-character message logged at 200). Four passed before and after and are guards (no warning when all succeed, the result map in both cases, and four non-string `message` shapes).
- Gates, 2026-10-05: `deno test --allow-all` 159 passed, 0 failed (151 before). `deno check` clean on the two touched files, both handlers and their tests. `deno lint community search _shared` the same 9 findings. `_shared/familyListing.ts` still 100% of lines and branches under the three feature suites. Longest function in the file is 16 lines.
- Five existing tests fail a lookup on purpose (3 in the shared file, 1 in each handler) and now print that line in the test output. They are unchanged.
- Not verified: nothing is deployed, so the line has not been seen in Supabase's function logs.

**Files.** `supabase/functions/_shared/familyListing.ts` (new), `_shared/familyListing.test.ts` (new), `community/index.ts`, `community/index.test.ts`, `search/index.ts`, `search/index.test.ts`. Six files, backend only. The 2026-10-04 redesign changed four of them: the shared file and the three test files. Neither handler changed, and the response shape of both endpoints is the same.

**Tests and gates** (run from `supabase/functions/`, last run 2026-10-04).

| Gate | Result |
|---|---|
| `deno test --allow-all` | 122 passed, 0 failed. Was 50 before this feature. New: 46 in `_shared/familyListing.test.ts`, 12 in `community` (5 to 17), 14 in `search` (4 to 18). Of those 72, 20 cover the `now` param, 16 cover the limit clamp and the slot-query bounds, and 12 cover the one-query-per-family lookup (10 in the shared file, 1 in each handler). The total is the same as before the redesign because 9 batch tests were removed and 9 added. Also green under `TZ=UTC`, `America/Los_Angeles`, `Asia/Tokyo` and `Pacific/Kiritimati`. |
| `deno check` on the six touched files | Clean. |
| `deno check` on every function | 8 errors, all in `announcement/index.ts` (7) and `coach/index.ts` (1), neither touched here. Both are already recorded as pre-existing in [[features/moderation-report-block]] and [[features/coach-verdict-tool]]. |
| `deno lint community search _shared` | 9 findings, the same 9 as before the redesign: 7 present before this feature, plus 2 `no-import-prefix` on the two new files' `jsr:` imports, which is the import style every file in this directory uses. Lint is not wired into CI. |

Tests were written first and seen failing before each implementation pass: 9 handler tests red and the helper suite failing to load for the row shape; then 6 handler tests red and the helper suite failing type-check for `now`; then 4 handler tests red for the limit clamp and 6 helper tests red for the slot-query bounds; then 6 helper tests red for the year range on `now` and the third commit's batch fallback (those batch tests are now removed).

For the redesign: 23 red against the batch code (13 in the shared file, 5 in each handler), 99 green; then 122 green. In the shared file, 9 batch tests were removed (the 7 full-batch ones, "one query for many families" and "batches of 25"), 5 were rewritten in place and 9 are new. The 12 lookup tests cover:

- Query shape. Three listed families produce exactly three `availability_slots` queries, and each one, as received by the fake client call by call, has `eq family_id`, `eq status free`, the date floor and ceiling, both orderings and `limit 50`.
- Isolation. One family with 600 early slots next to a family with one later slot: the second family's slot is unchanged, the first keeps its own earliest slot, and there are still exactly two queries.
- Concurrency. The fake client counts queries in flight. With 50 families the peak is exactly 10, and the constant is 10. With 25 families whose first answer arrives last, every family still gets its own slot.
- Errors. One of three lookups errors: that family has no slot, the other two keep theirs, and there are still exactly three queries.
- Each handler. One `availability_slots` query per listed family, each scoped to that family.

The fake client in the shared test file has no `in` method, so a query covering several families throws. The in-flight test was also run once against a pool deliberately left unbounded and failed there, so it does detect the regression it is for.

The bounds tests cover a limit above the maximum (clamped to 50), limits of `0`, `-5`, `1.5`, `abc` and empty (endpoint default), the lookup given 60 ids (only the first 50 queried, each exactly once), and the date ceiling and row limit as received by the fake client. The `now` tests cover a past slot today plus one tomorrow (tomorrow's is returned), a later slot today (returned), only a past slot today (null and null), a slot starting exactly at `now` (not returned), a malformed `now` (same result as none) and no `now` (unchanged). The 10 `now` tests in the shared file were not edited for the redesign and passed before and after it.

Handler test changes for the redesign, beyond the one rewritten test in each file: the fixture `directorySupabase` now answers each `availability_slots` query with the rows of the family that query is scoped to, because one queued response can no longer serve two queries; and `in` was dropped from both fake clients' method lists, where it had been added for the batch query. No other handler assertion changed.

**Not verified.** All tests run against a fake Supabase client. The slot queries, including the date ceiling and row limit, have not been run against real PostgREST or Postgres, and nothing was deployed, per the dispatch rules. The added queries (12 per request at Home's default limit, up to 50 at the maximum, 10 at a time) have not been timed against the real database.

### Frontend

**What was built.** `/search` is now the wide three-column directory: filters on the left, the browse list or query results in the centre, "Open for playdates this week" on the right. The query and both filters live in the URL (`?q=`, `near=1`, `open=1`) and everything the page shows is derived from it. Frontend only, no new dependency. `tailwind.config.js`, `Avatar`, `Layout`, `Navbar` and `Home.tsx` are untouched.

**Files.** Twelve under `frontend/src`, which is the whole budget, plus two screenshots.

| File | Change |
|---|---|
| `frontend/src/api/community.ts` | `ListedFamilyDTO`, the row both endpoints return. The four new fields may be missing; a missing or empty `city` / `state` reads as `null`; a `nextFreeSlotStart` that is not in the floating format reads as `null`. `toLocalNow(date)` builds `now` from the local wall clock. `getRecentCommunity(limit?, now?)`. `CommunityFamilyDTO` stays as an alias. |
| `frontend/src/api/search.ts` | `searchFamilies(q, limit?, now?)`, parsed with the same `ListedFamilyDTO`. |
| `frontend/src/pages/Search.tsx` | The page: `Layout wide`, Home's grid string, the three columns. |
| `frontend/src/pages/Search.test.tsx` | 56 tests: the 2 shipped ones, assertions unchanged, and 54 new. (119 as committed: qa-engineer added 61 and the 2026-10-05 follow-up added 2. Count added by tech-lead.) |
| `frontend/src/features/search/hooks/useFamilyDirectory.ts` | All page logic: URL state, the two queries, filtering, the rail, and the count, empty, error and announcement strings. |
| `frontend/src/features/search/components/SearchForm.tsx` | The React Hook Form + Zod search form. |
| `frontend/src/features/search/components/FilterCard.tsx` | Filters at `md` and up. |
| `frontend/src/features/search/components/FilterBar.tsx` | The same filters below `md`. |
| `frontend/src/features/search/components/FamilyResults.tsx` | Count line with the status element, skeleton, empty line, error with Retry, the list. |
| `frontend/src/features/search/components/FamilyResultCard.tsx` | One family card. |
| `frontend/src/features/search/components/PlaydateBadge.tsx` | The badge: static on a card, a link in the rail. |
| `frontend/src/features/search/components/OpenPlaydatesRail.tsx` | The right-hand rail. |
| `docs/screenshots/search-browse-directory/before.png`, `after.png` | See Screenshots below. |

**Acceptance criteria.**

| # | Criterion | How it is met | Checked by |
|---|---|---|---|
| 1 | Wide layout, three columns at `md` | `<Layout wide>` and Home's grid string, DOM order filters, families, rail. | Live at 1280px: `main` is 1100px wide, computed columns `240px 524px 240px`. |
| 2 | Browse list before any query | `community/recent?limit=50&now=…` runs on load. Cards show the avatar, "The <name> family", city and state, a two-line bio, and the Playdate badge when the slot is in the future. The "Try a name…" hint and "Back home" are gone. | 8 tests; `after.png`. |
| 3 | Query of 2+ characters, same cards; clearing returns to browse | `search/families?q=…&limit=50&now=…`. Submitting an empty box removes `q` and shows the browse list again. One character shows "At least 2 characters." and sends nothing. | 7 tests; live. |
| 4 | "Near me", "Open for playdates", combined, on both lists, "Clear filters", count line | Applied in the browser to whichever list is showing. The count line and the empty lines are the Microcopy strings for each combination. | 11 filter tests, 14 count and empty-line tests; live, including a reload. |
| 5 | Rail: up to 5 families, next 7 days, soonest first, Request link, empty state | Taken from the browse list. Each row has the name, "Wed, Oct 7 · 3:30pm" and a Request link to `/family/:id?requestSlot=<slotId>`. | 8 tests; live click lands on that URL. |
| 6 | Below `md`: one column, filters reachable, rail hidden | `FilterBar` sits between the form and the count line; both asides are `hidden md:block`. | Live at 375px: both asides `display: none`, bar visible and working. No sideways scroll at 375px or 320px. |
| 7 | Loading, empty and error states per column; blocked families stay excluded | Centre: skeleton, empty line, error with "Try again". Rail: skeleton, empty line, error line. The filter column fetches nothing, so it has no such states. Blocked families are left out by the server, as before; the page adds nothing back. | Tests for each state; live for loading, error and both empty states. |
| 8 | Renders against a backend that is not redeployed | The schemas accept rows without the four fields. | 2 tests, plus the shipped query test, whose fixture is the old shape; live with an old-shape stub for the browse endpoint only. |

**Decisions the spec left to the build.** Each is one place in `useFamilyDirectory.ts`.

- A family has an open slot only when both `nextFreeSlotId` and `nextFreeSlotStart` arrived and the start is later than the browser's local time. The two are compared as strings in the floating format, so nothing is converted between time zones.
- Consequence against the backend that is live today: `community` rows carry a slot id but no start, and `search` rows carry neither. The page renders, with no badges, an "Open for playdates" filter that matches nothing, and the rail's empty line. Badges and the rail start working when the functions are deployed.
- "Next 7 days" means later than now and no later than the same clock time 7 days on.
- "Near me" is an exact match on city and state, ignoring case and surrounding spaces.
- Query requests also ask for `limit=50`. The brief pinned 50 for browse only; without it the filters would see only the first 20 matches. It is one constant (`DIRECTORY_LIMIT`) if tech-lead wants the default back.
- `now` is read when each request is made and is not part of any query key.
- Submitting a query adds a history entry; toggling a filter or clearing filters replaces the current one. After a search, Back returns to the previous list and the search box follows it.
- A `q` shorter than 2 characters in the URL is treated as no query. `near=1` is ignored while the user has no city or no state.
- The rail always comes from the browse list, so neither the query nor the filters narrow it (the mock shows an Alameda family in the rail with "Near me" on). It never contains the user's own family.
- "Try again" resets the query instead of refetching it, which is what puts the list back into its loading state.
- The avatar initial skips a leading "The", "A" or "An", the rule Home's rail uses, so a family stored as "The Brooks Family" shows "B" on the card and in the rail.

**Deviations from `### Visual`.**

1. Badge text colour is the literal `text-[#8a5a12]`, not `text-brand-warm-ink`. Dispatcher decision: no new token in this change.
2. The family card's root is a `div`, and the family name is its one link, stretched over the whole card with the focus ring drawn on that stretched box (Accessibility 21). It looks and clicks the same. The link's name is "The <name> family"; location and "Open playdate slot" are its description.
3. "Near me" when unavailable is `aria-disabled="true"` and stays in the tab order, where Visual has native `disabled` (Accessibility 14). Visual has no styling for that, so I dimmed the box to 50% and restore it while it has keyboard focus, which keeps the ring at full contrast.
4. The results block uses `mt-3` on the list wrapper instead of `space-y-3` on the block. The status paragraph is always mounted and there is a hidden heading above it, and `space-y-3` would add a 12px gap for each. With data on screen the spacing is the same.
5. The card badge shows only for a slot in the future, not whenever `nextFreeSlotId` is set. Dispatcher decision.
6. Badge content is one run of text, glyph then a space then the label, as on Home and in the mock. The recipe's `gap-1` therefore has nothing to separate.
7. The grid carries one extra class, `[&_:is(a,button,input)]:scroll-my-20`, for Accessibility 26.

**Deviations from `### Microcopy`.** None. All strings are as written after the 2026-10-04 reconciliation, including `search.count.announce.query` and "Open playdate slot". One thing to know: because of Visual deviation 2, "Open playdate slot" is part of the card link's description, not its name.

**Accessibility requirements.** All 17 blocking ones are built, and 10 of the 11 non-blocking ones.

- Not applied in the 2026-10-04 build: 10 (`text-[0.625rem]` on the badge). The dispatcher asked for Home's literal classes and Visual keeps `text-[10px]`. Since applied, in commit `f647722`; see the next paragraph. (Dated by tech-lead, 2026-10-05, because the committed badge now carries `text-[0.625rem]`.)
- 26 is done with the grid class above, not the global rule in `index.css`. That rule would change every page and would have been a thirteenth file. Tech-lead may prefer it as a follow-up.

**Follow-ups from the build-stage audit (2026-10-05).** Requirement 10 is now applied, replacing "Not applied" above: the badge ships `text-[0.625rem]`, the same 10px at the default font size, which departs from Visual's `text-[10px]` on the dispatcher's instruction; Home's badge is untouched. In the rail, the visually hidden "Loading open playdates…" moved from inside the `aria-busy` wrapper to just above it, with no live region added.
Two tests were written first and both failed before the change; 43 files, 346 passed, typecheck and build clean. No new screenshots, because neither change alters what is drawn at the default font size. Neither was re-checked in a browser or with a screen reader.

**Where the 12-file budget bent the house rules.**

- Three files hold private helper components next to the one they export: `FamilyCardSkeleton` and `ResultsError` in `FamilyResults.tsx`, `FilterCardOption` in `FilterCard.tsx`, `OpenPlaydateRow` and `OpenPlaydateRowSkeleton` in `OpenPlaydatesRail.tsx`. They keep every function under 40 lines (the longest is 39). Giving each its own file would add five.
- All tests are in `pages/Search.test.tsx`. The seven components and the hook have no test file of their own; each is exercised through the page.
- No `features/search/index.ts` barrel. The page imports the component paths directly, as `Home.tsx` does for `features/feed`.
- `FilterBar` imports the checkbox class string from `FilterCard` so the two cannot drift.
- `src/tests/a11y.test.tsx` is not edited. Its `Search` case registers no `community/recent` handler, so it now checks the list-error state, and passes. qa-engineer still needs to extend it to the four states the audit names.

**Tests and gates** (last run 2026-10-04, after the final edit).

| Gate | Result |
|---|---|
| `npm run test --workspace frontend -- --run` | 43 files, 283 passed, 0 failed. 229 before this change. |
| `npm run typecheck --workspace frontend` | Clean. |
| `npm run build --workspace frontend` | Clean. |

Tests were written first: 53 of the first 55 failed against the shipped page, and the 2 that passed were the shipped tests. One test was added after the implementation (`near=1` is honoured once the signed-in user is known, and not before) and passed on its first run, so it is a guard, not a red-then-green test. "Now" is fixed in the tests by faking `Date` only.

**Screenshots.** Both were captured live.

- Setup: this worktree's Vite dev server on port 5391, Playwright Chromium, 1280×800 viewport at 2× scale, full-page capture. Auth mocked as `frontend/e2e/README.md` describes (a synthetic session in `localStorage`); Edge Function responses stubbed with `page.route`; browser clock fixed at Monday 5 October 2026, 09:00.
- Demo data, the same for both: Hernandez Family in Oakland, CA, and the mock's five families, three with slots on Oct 7, 10 and 11.
- `before.png` is the shipped page as it loads: nothing listed until a query is submitted. It was taken before any code changed.
- `after.png` is the same URL and data on the rebuilt page. It is taller than 800px because the page now scrolls.
- The server is stopped, the scripts are deleted, and no `.env` was created.

**Also checked live, same setup, nothing committed.**

- axe-core in the browser with the contrast rule on, in seven states (browse, filtered empty, 375px, "Near me" unavailable, list error, empty directory, old-shape backend): nothing reported against this page. See "Found, not fixed" for what it did report.
- Tab order at 1280px and 375px matches the two sequences in Accessibility 3.
- Target sizes: Request hit area 90×43, "Your playdates" 24 tall, "Clear filters" 28, "Try again" 28, bar pills and bar "Clear filters" 44.
- Shift+Tab up the list at 1280×600: no focused control ends under the navbar. At 375×667 the focused family name stays above the tab bar; the lower part of its card can sit behind the bar, so the ring is partly covered, not hidden.
- Focus stays on the control used after each filter change, lands on the results block after "Try again", and is in the input while the field error shows.
- A filtered URL (`/search?q=oak&near=1&open=1`) survived 6 cold loads and 6 reloads on a production bundle.

**Not verified.**

- Nothing ran against real Supabase. Every response was a stub, in the new shape or the old one, and the sign-in was synthetic.
- Reload with a real session. `RequireAuth` redirects to `/login` whenever `token` is null without waiting for `initialized`, and `Login` then sends a signed-in user to `/`. In the 12 loads above the session was restored before the first render every time. If a real session ever restores late, for example when it needs a token refresh, the user lands on `/` and the filtered URL is lost. That is how every protected route behaves today and is not changed here.
- No screen reader. The status element, descriptions and names were checked through the DOM and axe only.
- Chromium only. Firefox and Safari were not run.
- The 768px to 900px range that Visual flags as cramped was not looked at.
- The family page that the Request link opens. The link's URL was checked; that page was not stubbed.

**Found, not fixed, because it is outside this change.**

- On every page, axe reports a contrast failure for the active label in the mobile tab bar (`text-brand-primary` on `surface.warm`, in `Navbar.tsx`). It also reports the navbar wordmark, which Accessibility treats as an exempt logotype.
- `font-mono` names JetBrains Mono, which the app does not load, so the count line falls back to whatever monospace face the browser picks. Headless Chromium used two different fallback faces between first paint and later paints. The class string is the shipped one.
- "The <name> family" doubles for names stored as "The X Family". Already raised by ux-writer.

### Test plan

**Result.** Every acceptance criterion now has tests that fail when the behaviour is broken. No product bug was found. 90 tests were added to the four existing test files: no new file, and no non-test code changed. Final sweep (2026-10-05): Vitest 344 of 344, Deno 151 of 151, `tsc` clean, build clean.

Added by tech-lead, 2026-10-05: two follow-up commits landed after this sweep and added 2 Vitest tests and 8 Deno tests, so the committed totals are 346 and 159. The counts in this subsection are otherwise left as qa-engineer wrote them. See "Tech-lead reconciliation" at the end of the engineering section.

**Method.** The implementation had landed before this pass, so none of the added tests was seen red against product code. Each test was judged by what it would let through instead. A copy of the sources outside the repo was broken one behaviour at a time and the suites were run against it. The product files in the worktree were never edited.

| Suite | Behaviours broken | Caught by the tests as they were | Caught now |
|---|---|---|---|
| `Search.test.tsx` (56 tests before) | 50 | 17 | 50 |
| The three Deno suites (81 tests before) | 28 | 12 | 28 |

So 33 frontend behaviours and 16 backend behaviours could be broken with every existing test green. Those are the gaps. Each is listed under its criterion below.

**Where the tests live.**

| File | Runner | Before | Added | Now |
|---|---|---|---|---|
| `frontend/src/pages/Search.test.tsx` | Vitest + RTL, msw at the network boundary | 56 | 61 | 117 |
| `supabase/functions/_shared/familyListing.test.ts` | `deno test`, fake Supabase client | 46 | 9 | 55 |
| `supabase/functions/community/index.test.ts` | `deno test`, fake Supabase client | 17 | 10 | 27 |
| `supabase/functions/search/index.test.ts` | `deno test`, fake Supabase client | 18 | 10 | 28 |

Browser tests for this page are in `### E2E coverage` (e2e-test-writer, 18 scenarios). I did not run or edit them. Where a criterion can only be shown in a browser, the table says so.

**Criterion-to-test table.** "Page" is `Search.test.tsx`; "lookup", "community" and "search" are the three Deno files. The tests are named in the lists under the table.

| # | Criterion | Type | Before this pass | Added | Cannot be shown here |
|---|---|---|---|---|---|
| 1 | Wide layout, three columns at `md` | Unit, page | Gap. No test at all. | 2 page | Rendered widths. jsdom applies no CSS, so these two pin class names. Browser proof: E2E "AC1. Three columns at 1280px". |
| 2 | Browse list, newest first, card contents, badge for a future slot | Integration, page; unit, community | Card contents and API order proven. Three gaps. | 3 page, 2 community | Nothing. |
| 3 | Query of 2+ characters, same cards, clearing returns to browse | Integration, page; unit, search | Proven on the page. Gap on the server: nothing tested the `q` filter. | 3 page, 3 search | Real `ilike` matching in Postgres. |
| 4 | "Near me", "Open for playdates", combined, both lists, "Clear filters", count line | Integration, page | Partly. Seven gaps. | 9 page | Nothing. |
| 5 | Rail: up to 5, next 7 days, soonest first, Request link, empty state | Integration, page | Cap, order, inclusive 7-day end and link proven. One gap, plus the exactly-now case under 2. | 3 page | That the family page opens the request flow. Browser proof: E2E "AC5. A Request link navigates". |
| 6 | Below `md`: one column, filters reachable, rail hidden | Unit, page | Gap. The bar was shown to work, not to be the one on screen below `md`. | 2 page | The page at 375px. Browser proof: E2E "AC6. At 375px". |
| 7 | Loading, empty and error states per column; blocked families stay excluded | Integration, page; unit, community and search | States proven for the browse list. Five gaps. | 5 page, 3 community, 3 search | Exclusion in real PostgREST. See "Not verified". |
| 8 | Four new fields on both responses; page renders without them | Unit, lookup and both handlers; integration, page | Response shape proven. The page's tolerant parsing was mostly not under test. | 12 page, 2 community, 1 search, 4 lookup | The responses of the deployed functions. Nothing is deployed. |
| | `now` and the page's request (part of 8's contract) | Integration, page; unit, all three Deno files | Format proven. Local-versus-UTC was not, in CI's zone. Query-key independence was not. | 8 page, 3 community, 3 search, 5 lookup | Nothing. |
| | URL round trip (open question 1) | Integration, page | `?q=` on load and `?near=1&open=1` on load proven. Five gaps. | 6 page | A real reload. Browser proof: E2E "AC4 and open question 1". |
| | "Near me" with no city or state (open question 2) | Integration, page | One case proven (no city, mouse click). | 6 page | Nothing. |
| | Accessibility states the audit names | Integration, page | Browse with data; "Near me" unavailable plus list error. | 2 page | Contrast. The rule is off in jsdom. |

**1. Wide layout.** Dropping `wide` from `<Layout>` or replacing Home's grid string passed all 56 tests.

- Added: "uses the wide 1100px layout" (`main` carries `max-w-[1100px]`); "puts filters, families and the rail, in that order, on Home's three-column grid" (grid classes and child order).

**2. Browse list.**

- Proven before: "lists families in the order the API returns them before any query is submitted", "shows the location, the bio and the playdate badge on a card", "shows no badge when the next free slot has already started", "uses the first letter after a leading article as the avatar initial", "no longer shows the pre-search hint or the Back home link".
- Gap, server: "newest first" is the `community` function's `order`, and no test read it. Reversing the order, or no longer leaving out the caller's own family, passed all 81. Added in community: "lists families newest first by updated_at", "leaves the caller's own family out of the listing".
- Gap, page: a slot starting exactly now counted as future with all tests green. Added: "counts a slot as open only when it starts after now, to the second".
- Added: "clamps the bio on a card to two lines" (class pin); "shows the badge for a slot that is too far off for the rail" (the badge does not depend on the 7-day window).

**3. Query.**

- Proven before: "submits the query and renders result cards", "rejects too-short queries client-side without firing the API", "sends the query with limit 50 and now, and puts it in the URL", "shows location and the playdate badge on query results", "runs the query found in the URL and fills the search box with it", "returns to the browse list when the query is cleared", "ties the too-short error to the input and keeps focus there".
- Gap, server: no test read the filter `search` builds from `q`. Dropping a column, not stripping filter syntax, not escaping wildcards and not cutting to 100 characters each passed all 81. Added in search: "matches the query against name, bio, city and state", "strips filter-syntax characters from the query and escapes its wildcards", "cuts the query to 100 characters".
- Added on the page: "treats a one-character q in the URL as no query", "trims the q found in the URL before searching", "treats a started slot as no slot on query results as well".

**4. Filters.**

- Proven before: "narrows the list to the user's city and state with Near me", "narrows the list to families with a future free slot with Open for playdates", "combines both filters", "applies the filters to query results", "restores the filters from the URL", "resets both filters with Clear filters and leaves focus on the button", the count-line tests and the eight empty-line tests.
- Gaps. Each of these passed all 56:
  - "Near me" matching on city alone. Every family in the fixtures is in CA.
  - "Near me" being case- and space-sensitive.
  - "Open for playdates" trusting the slot id, so a family whose slot has started still matched.
  - "Open for playdates" not applied to query results. The one query-results test used "Near me" only.
  - "Clear filters" also clearing the query.
  - Submitting a query clearing the filters.
  - The sort note missing from a filtered browse count.
- Added: "needs both the city and the state to match", "ignores case and surrounding spaces on both sides", "keeps the sort note on a filtered browse count", "leaves a family whose slot has started, or has no start, out of Open for playdates", "applies Open for playdates to query results", "loads a URL that carries the query and both filters", "keeps the query when the filters are cleared", "keeps the filters when a query is submitted", "keeps the filters when the query is cleared". Between them they assert the two query-mode count lines that had no test (`search.count.query.open`, `search.count.query.nearOpen`).

**5. Rail.**

- Proven before: "lists only families whose slot starts after now and within the next 7 days" (includes a slot at exactly 7 days and leaves out one a second later), "caps the list at five families, soonest first" (six unsorted rows, so the cap is taken after sorting), "shows the family name, the slot day and time, and a Request link to the request flow", "is not narrowed by the filters or the query", "shows an empty line when no family has a slot this week".
- Gap: counting the window as 7 × 24 hours instead of "the same clock time 7 days on" passed all 56. The two differ in a week when the clocks change. Added: "ends the rail window at the same clock time 7 days on, across the end of daylight saving".
- Added: "orders slots on the same day by start time", "shows the empty line when every slot falls outside the window". The exactly-now test under 2 asserts the rail as well as the badge.

**6. Below `md`.** Showing the rail or the filter column below `md`, hiding the bar at every width, or moving the bar under the results passed all 56.

- Added: "hides both side columns below md" (both asides carry `hidden md:block`); "keeps the filters reachable below md in a bar between the search form and the count line" (`md:hidden`, inside the centre column, after the form and before the count line).

**7. States and blocked families.**

- Proven before: "has one status element from first render that goes from loading to the count", "announces Searching while a submitted query loads", the empty-line tests, "shows a fixed error for the browse list and reloads it with Try again", "shows a fixed error, not the raw message, when a search fails", and the rail's loading, empty and error tests. In both handlers: "excludes families the caller has blocked, with the exact blocked ids in the filter".
- Gap: "Try again" always reloading the browse list passed all 56, which leaves a failed search with a button that does nothing. Added: "re-runs a failed search with Try again, without reloading the browse list".
- Gap: after the user blocks a family, the page shows it until both lists are fetched again. That depends on the page's two query keys staying under the `['community']` and `['search']` prefixes that `useBlock.ts` invalidates. Renaming either key passed all 56. Added: "asks both endpoints again, so the family the server now leaves out goes from the list and the rail".
- Gap, server: a handler that ignored the block list whenever `now` is present, and one that ignored a failed families query, each passed all 81. Added in community and in search: "the request the directory page sends still excludes blocked families", "returns 500 when the families query fails, which is what puts the page in its error state".
- Gap: removing the busy flag from the results passed all 56. Added: "marks the list and the rail busy only while they load".
- Added without a gap behind them: "keeps its rows while a search fails" and "shows its own error while query results load fine" on the page (the two columns fail independently); "still returns the families, with null slot fields, when a slot lookup fails" in community and in search (the lookup's own tests already covered the failure; these show it at the handler).

**8. Response shape and tolerant parsing.**

- Proven before, server: "returns city and state on every family row", "returns the next free slot's id and start for a family that has one", "returns null for both slot fields on a family with no future free slot" (both handlers), "keeps the existing FamilyDTO fields alongside the new ones" (search only), the four `toListedFamily` tests and the six `composeSlotStart` tests.
- Proven before, page: "renders rows from a backend that does not send location or slot fields yet", plus the shipped query test, whose fixture is the old shape.
- Gap, page: both schema transforms could be removed with all 56 green. "leaves the location line out when city and state are empty strings" passes either way, because the card drops empty strings itself. Keeping blank text as text, or accepting any string as a slot start, was not caught.
- Added on the page (12): "reads a null city and state as no location"; "reads a city of only spaces as no city"; "treats a next free slot start with … as no slot" for seven shapes (a `Z`, milliseconds and a `Z`, an offset, a date only, a space instead of the `T`, no seconds, an empty string); "treats a start that arrives without a slot id as no slot"; "matches nothing with Open for playdates while the backend sends no slot start"; "matches nothing with Near me while search rows carry no location".
- Gap, server: marking every `community` row as the owner's, or no `search` row, passed all 81. The first would expose `kidCount`. Added: "every row carries the eight FamilyDTO keys and the four new ones" and "never exposes kidCount and marks no row as the caller's own" (community); "marks only the viewer's own family as isOwner and exposes kidCount for that row alone" (search).
- Added in lookup: "every composed start has the shape the frontend schema accepts" (the page treats any other shape as no slot); "picks by clock time, not text order, when a stored hour is not zero-padded"; "with now: an unpadded time earlier today counts as already started"; "with now: a slot one second after now is returned".

**`now` and the page's request.**

- Proven before: "asks for 50 families and sends the local wall-clock time as now" and the query equivalent assert the exact string `2026-10-05T09:00:00`.
- Gap: CI runs in UTC, where local time and UTC are the same string. With the process zone set to UTC, a `now` built from `toISOString().slice(0, 19)` passed all 56. It failed only on a machine away from UTC.
- Added: "sends the wall-clock time in … , not UTC, to both endpoints" for America/Los_Angeles, Asia/Tokyo and Pacific/Kiritimati. The test sets the zone itself, so it gives the same answer on any machine. Also "counts a slot later this evening as open in a zone behind UTC, where UTC is already tomorrow" and "counts a slot from this morning as started in a zone ahead of UTC, where UTC is still earlier", for the comparison the page makes in the browser.
- Gap: putting `now` in either query key passed all 56, because the tests freeze the clock. Added: "does not ask either endpoint again as time passes, because now is in neither query key" (the clock moves 30 minutes, a filter is toggled, each endpoint has still been called once); "judges a slot against the clock at the latest render, without a new request"; "reads the clock again for a retried request".
- Gap, server: every handler test sent `now` with a raw `:`. A browser sends `%3A`. A handler that read the value without decoding it passed all 81. Added in community and in search: "reads a percent-encoded now, which is how a browser sends it", "the request the directory page sends asks for 50 families", "uses the default of 12 when no limit is sent at all" (20 in search).
- Added in lookup: "parseLocalNow accepts the first and last supported years and rejects the year either side", "parseLocalNow accepts 29 February in a leap year only", "parseLocalNow rejects what Date.prototype.toISOString produces, with or without its Z", "with now: the 60-day ceiling carries over a year boundary", "with now: the last supported moment still gets a real calendar date as its ceiling".

**URL round trip.** These pin decisions listed under "Decisions the spec left to the build" in `### Frontend`. If the tech-lead reverses one, its test changes with it.

- Proven before: `?q=` on load, `?near=1&open=1` on load, and the URL after each single action.
- Each of these passed all 56: a filter change adding a history entry; a submitted query replacing one; any value of `near` or `open` switching the filter on; unrelated params being dropped on a filter change; text typed but not yet submitted being lost on a filter change.
- Added: "removes a filter from the URL when it is switched off", "switches a filter on only for the value 1", "leaves params it does not own in place when a filter changes", "keeps text typed but not yet submitted when a filter changes", "adds a history entry for a submitted query, so Back restores the previous list and the search box", "replaces the history entry when a filter changes, so Back skips over filter changes". Loading with all three params set is "loads a URL that carries the query and both filters", under 4.

**"Near me" with no city or state.**

- Proven before: "keeps Near me off and says why when the user has no city or state on file" (no city, mouse click, `near=1` in the URL) and "honours near=1 from the URL once the signed-in user becomes known, and not before".
- Gap: with the toggle's own guard removed, the checkbox stayed unchecked but the URL gained `near=1`, and all 56 passed.
- Added: "is unavailable with …, and near=1 in the URL is ignored" for no state, neither, and a city of only spaces; "stays in the tab order and cannot be switched on from the keyboard" (Shift+Tab reaches it, Space does nothing, the URL does not change); "leaves Open for playdates working and names no place in the count line"; "leaves Clear filters unavailable when the only filter in the URL is an ignored near=1".

**Accessibility states.** The audit asks for axe in four states. `Search.test.tsx` already ran it with data on screen and with "Near me" unavailable plus a list error. Added: "has no axe violations in a filtered empty state" and "has no axe violations on filtered query results". `src/tests/a11y.test.tsx` is not edited: it is outside this pass's file budget, and its `Search` case still renders the list-error state only.

**Gates** (2026-10-05, after the last edit).

| Gate | Result |
|---|---|
| `npm run test --workspace frontend -- --run` | 43 files, 344 passed, 0 failed. 283 before this pass. |
| `npm run typecheck --workspace frontend` | Clean. |
| `npm run build --workspace frontend` | Clean, 518 modules. |
| `deno test --allow-all` in `supabase/functions` | 151 passed, 0 failed. 122 before this pass. |
| Frontend linter | None exists. The workspace has no `lint` script and no ESLint config. |
| `deno check` on the three test files and the three files they cover | Clean. |
| `deno lint community search _shared` | 9 findings, the same 9 `### Backend` records. None is in an added test. Not wired into CI. |
| Other process zones | `Search.test.tsx` 117 of 117 with `TZ` set to UTC, Asia/Tokyo and Pacific/Kiritimati, as well as this machine's Los Angeles. The Deno suite 151 of 151 in the same three. |
| `deno test --coverage`, the three feature files | `_shared/familyListing.ts` 100% of lines and branches. `community/index.ts` 83.8% of lines. `search/index.ts` 84.6% of lines. |

**Not verified.**

- Red before green. The code existed first, so these are guards. The mutation runs above are the evidence that they discriminate.
- A real database. Every backend test uses a fake Supabase client. Blocked-family exclusion, the `q` filter and the slot queries are asserted as the calls the handler issues, not as rows Postgres returns. The repo has no harness for running an Edge Function against a real database and nothing is deployed, so the role's "integration test against a real DB for every endpoint" target is not met here.
- The rendered layout (criteria 1 and 6) and the request dialog behind the rail link (criterion 5). Class names and the link's URL are asserted here; the rest is in `### E2E coverage`, which I did not run.
- Frontend line coverage. `vitest run --coverage` needs `@vitest/coverage-v8`, which is not installed. Adding it is a dependency change outside this brief, so the 80% target is unmeasured for the frontend.
- Node 20. CI uses Node 20 and this pass ran on Node 24. The zone tests change `TZ` while the test runs, through `vi.stubEnv`, and rely on Vitest's default process pool.

**For the tech-lead.** None of these is a defect against an acceptance criterion.

- CI does not run the Deno tests. `.github/workflows/ci.yml` runs the two npm workspaces only, so the 151 Edge Function tests, including every backend test for this feature, run only when someone runs them by hand. This predates the feature.
- Code review items 4 and 5 describe current behaviour and the tests agree with them. The filters, the count line and the rail work on at most 50 rows. A family whose slot has started loses its badge at the next render and gets a later slot only after the next fetch; "judges a slot against the clock at the latest render, without a new request" asserts exactly that, so it changes if item 5's refetch is taken up.
- The request dialog's date bug that e2e-test-writer reports (`FamilyView.tsx:101`) is on the far side of the rail's Request link. No test here covers that page.

### E2E coverage

One spec, `frontend/e2e/community-search.spec.ts`, rewritten for the rebuilt page: 18 scenarios, Chromium only. Last run 2026-10-05: 18 ran, 18 passed, none skipped.

**How to run.**

```
npm run test:e2e --workspace frontend -- community-search.spec.ts
```

- Needs no backend, no `frontend/.env` and no seeded data. The Playwright config starts Vite on port 5273 and stops it when the run ends.
- Sign-in is `loginAs` as `anderson@dummy.test` (the synthetic session from `frontend/e2e/README.md`), so the viewer is in Portland, OR.
- Every Edge Function and PostgREST request is answered by a `page.route` stub inside the spec. A request the spec does not stub gets a 404, so nothing leaves the machine.
- Time is pinned. The browser clock is fixed at Monday 5 October 2026, 09:00, in `America/Los_Angeles`, and every stubbed slot time is computed from that clock (`fromNow({ days, hours, minutes })`). The result does not depend on the date or on the machine's time zone.
- Stub data: six families. Three are in Portland, OR. Four have a free slot still to come: three inside the next 7 days, one 30 minutes past that window. One has a slot that started 30 minutes ago and one has none.

AC numbers follow the table in `### Frontend`. `### Test plan` was still empty when this was written, so the scenarios come from the acceptance criteria and the dispatch brief, not from qa-engineer's list.

| Scenario | Spec | Status |
|---|---|---|
| AC2. Families are listed on arrival, in API order, under "6 families · newest first" | `community-search.spec.ts:172` | pass |
| Problem statement. Home's "View all →" lands on the populated directory | `community-search.spec.ts:179` | pass |
| AC2. A card carries location and bio, and the Playdate badge only for a slot still to come: not for a family with no slot, not for a slot that has started | `community-search.spec.ts:186` | pass |
| AC1. Three columns at 1280px: `main` is 1100px wide, both side columns are 240px, order is filters, families, rail | `community-search.spec.ts:195` | pass |
| AC8 contract. The browse request sends `limit=50` and `now` as the browser's local wall clock (`2026-10-05T09:00:00`, not the UTC 16:00) | `community-search.spec.ts:211` | pass |
| AC3. A 1-character query shows "At least 2 characters." and leaves the URL and the browse list alone | `community-search.spec.ts:222` | pass |
| AC3. A query narrows the list ("2 matching families"), results carry location and badge, and an empty box returns to the browse list | `community-search.spec.ts:232` | pass |
| AC3. A result card opens `/family/:id` | `community-search.spec.ts:248` | pass |
| AC4. "Near me" is described by "Portland, OR" and narrows the list to 3 families; the count line changes | `community-search.spec.ts:260` | pass |
| AC4. "Open for playdates" narrows the list to 4 families; the count line changes | `community-search.spec.ts:270` | pass |
| AC4. Both filters together give 2 families; "Clear filters" resets both boxes, the count and the URL | `community-search.spec.ts:279` | pass |
| AC4 and open question 1. A query with both filters gives `/search?q=portland&near=1&open=1`; a reload restores the search box, both boxes, the count line and the list | `community-search.spec.ts:296` | pass |
| AC5. The rail lists only the three slots inside the next 7 days, soonest first, each with its day and time | `community-search.spec.ts:319` | pass |
| AC5. A Request link navigates to `/family/:id?requestSlot=<slotId>`, and the family page then opens its request dialog for that family's slot | `community-search.spec.ts:329` | pass |
| Accessibility 3 and 15. Keyboard only: Tab reaches "Near me", Space turns it on and focus stays on it, then Tab stops at Open for playdates, Clear filters, the search box, Search and the first result, and Enter opens that result | `community-search.spec.ts:352` | pass |
| AC7. A 500 from the browse endpoint shows the list error and the rail error; "Try again" brings both back | `community-search.spec.ts:380` | pass |
| AC8, and AC5's empty state. Rows without `nextFreeSlotStart`, which is what the deployed `community` function sends today: the list renders, no badges, the rail shows "No free slots in the next 7 days." | `community-search.spec.ts:397` | pass |
| AC6. At 375px: one column, filter card and rail hidden, the filter bar sits between the form and the list, both filters and "Clear filters" work, no sideways scroll | `community-search.spec.ts:412` | pass |

**Executed.**

- The spec through the standard config, once, after the final edit: 18 of 18 passed in 7.3s. Run from `frontend/` as `npx playwright test community-search.spec.ts --reporter=list`, which is the npm script with a terminal reporter in place of the config's HTML one.
- The same spec three times over with the machine's time zone set to `Asia/Tokyo` (`--repeat-each=3`): 54 of 54 passed. This is the check that the pinned clock, not the machine, decides the result. The reload scenario did not flake in any run.
- The spec type-checked on its own with the repo's strict flags, because `frontend/tsconfig.json` does not include `e2e/`: clean.

**Not executed.**

- Nothing ran against a real Supabase project. Every data response is a stub. With real credentials `loginAs` signs in for real while the stubs still answer the data requests; that path was not run.
- Firefox and WebKit. The config has a Chromium project only.
- The rest of the e2e suite. Only this file was run, plus `home-community-rail.spec.ts` once (below).
- Left to `Search.test.tsx` and the backend tests, not repeated here: loading skeletons, "Near me" with no city or state on file, the rail's 5-row cap and exact 7-day boundary, and the exclusion of blocked families, which happens on the server and cannot be shown with stubs.

**Product bug found, not fixed. It is on the family page and predates this feature.**

- Where: `frontend/src/pages/FamilyView.tsx:101`, `format(new Date(slot.date), 'EEEE, MMMM d, yyyy')`. In the file since commit `1eba7eb4` (2026-06-18).
- What: the request dialog shows the slot one day early to a viewer west of UTC. `slot.date` is `YYYY-MM-DD`, which `new Date` reads as midnight UTC, and the formatter then prints it in local time.
- Steps: browser in `America/Los_Angeles`; open `/search`; the rail row reads "Wed, Oct 7 · 3:30pm"; press Request. The dialog reads "Tuesday, October 6, 2026" above "15:30 – 16:30".
- Seen in a real browser with a one-off probe that is no longer in the spec. The committed Request scenario does not assert the dialog's date, for this reason.

**Neighbouring spec `frontend/e2e/home-community-rail.spec.ts`: not broken by the rebuild, and not edited.**

- All 3 of its tests fail in this sandbox, each at its first wait for a seeded family name ("The Chen Family", "The Davis Family", "The Brooks Family"). The spec stubs nothing, so it needs a seeded Supabase project. `Home.tsx`, `FamilyView.tsx` and the spec itself are identical to `master`.
- Its three interactions were replayed on this branch against stubbed rows shaped like the seed data (one-off code, removed): the name click and the avatar click both reached `/family/:id`, and the cursor over the name was `pointer`.
- A separate fault, also older than this feature, in tests 1 and 2 (lines 18 and 32). `getByRole('heading', { name: /Chen/i })` and the `/Davis/i` one each match two headings on the family page, the `h1` and the "…'s availability" `h2` that `FamilyView.tsx` renders for any family that is not the viewer's own. `toBeVisible()` then fails on a strict-mode violation. The replay hit exactly that, so these two tests would fail with seeded data too. The old `community-search` test used the same locator; the rewrite asks for the level-1 heading.

### Code review
**Verdict.** 0 must-fix, 10 nice-to-have. The committed code (`7310076..0652c91`) can go to review as written; the only condition is about how the PRs are cut, not about the code (see "File budget and conventions").

**Summary.** Reviewed `git diff origin/master...HEAD -- supabase frontend`: 18 code files, 6 under `supabase/functions` and 12 under `frontend/src`, from commits `7310076`, `10bb85d`, `a03a20d`, `faa7538` and `0652c91`. I read every changed file in full, and the code they call: `_shared/client.ts`, the RLS migrations for `families` and `availability_slots`, `playdates/index.ts`, `stores/auth.ts`, `RequireAuth`, `useBlock.ts`, `utils/datetime.ts`, `Avatar` and `main.tsx`. I formed a view from the code first and then compared it with `### Backend` and `### Frontend`. I found no place where those write-ups and the code disagree.

- Spot-checks on the committed code: frontend `tsc --noEmit` clean; `pages/Search.test.tsx` 56 of 56; `deno test` on the three touched suites 81 of 81.
- ESLint was not run. The frontend workspace has no ESLint config and no `lint` script.
- A scan of the added lines found no `any` in product code, and no `@ts-ignore`, `console.*`, `useEffect`, inline `style`, `React.FC`, `TODO`, snapshot test or `vi.mock`. The longest function is 39 lines. Commit messages follow Conventional Commits.
  - Corrected by tech-lead, 2026-10-05. This bullet read "no `any`". The new test file has one: `supabase/functions/_shared/familyListing.test.ts:20`, `type Any = any` under a `deno-lint-ignore`, used to type the fake Supabase client. It was already there at `0652c91`. The four Edge Function test files on `master` (`admin`, `community`, `moderation`, `search`) carry the same alias, so it follows the existing test pattern and is not a must-fix.
- Not reviewed: the uncommitted edits to `frontend/e2e/community-search.spec.ts` and `frontend/src/pages/Search.test.tsx` that e2e-test-writer and qa-engineer are making in parallel.
- Nothing was run against real Supabase, by me or by the authors.

**Must-fix**

Must-fix: none.

**Nice-to-have**

1. `supabase/functions/_shared/familyListing.ts:139`. A failed slot lookup returns `[]` and leaves no trace. Degrading instead of failing the request is right. Staying silent is not, now that the slot fields drive a filter, the count line and the whole right column rather than one badge on Home.
   - Failure: if the lookups fail as a group (a policy or grant change on `availability_slots`, timeouts under the 10-wide fan-out), the endpoint still answers 200. The page then states "No families are open for playdates right now." and "No free slots in the next 7 days." as fact, and nothing is in the function logs.
   - Smallest fix: let `freeSlotRows` report that it failed, and have `nextFreeSlotsByFamily` write one line per request with the number of failed lookups and the first error message, no ids. `coach/index.ts:342` is the pattern (`console.warn(JSON.stringify({ msg, … }))`). About 8 lines and 1 test, no new file. Worth doing before the functions are deployed.
   - Fixed after this review, in commit `477f168` (noted by tech-lead, 2026-10-05). The lookup now writes one capped warning per request; see `### Backend`. The response is unchanged, so a failed lookup still shows as the empty state on the page.
2. `supabase/functions/_shared/familyListing.ts:194-195` with `:165-174`. All rows from all queries are pooled (`rows.flat()`) and then regrouped by each row's own `family_id`. That is correct today because every query has `.eq("family_id", id)`. Reducing each family's rows to its slot inside the pooled task, keyed by the id the query was issued for, would make "a family's result comes only from its own query" hold by construction, and `family_id` could leave the `select`.
3. `supabase/functions/playdates/index.ts:102-119` (not in this diff). Nothing caps how many slots a family stores: the insert has no limit, and the `FOR ALL` policy on `availability_slots` lets the owning family insert straight through PostgREST. The number of slot queries per request is now fixed, but the time one family's query takes still grows with the free rows it has on its earliest dates in the window. That cost lands on anyone whose listing includes that family. It is confined to that one query and is the shape `community` already had. The fix is a write-side cap enforced in the database, as its own feature. Not measured.
4. `frontend/src/features/search/hooks/useFamilyDirectory.ts:8`, `:212-219`, `:226-238`. Both filters, the count line and the rail are computed in the browser over at most 50 rows, and neither endpoint says when it cut the list.
   - Failure, once the directory passes 50 families: "3 families in Oakland, CA", "No families are open for playdates right now." and the rail's empty line can all be wrong. `search/index.ts:54-58` also has no `order`, so which 50 matches come back is arbitrary.
   - `### Backend` documents the ceiling and pagination is out of scope, so this is not a must-fix. It needs a feature file (server-side `near` and `open` filters, or a truncation flag) before the community reaches that size.
5. `frontend/src/features/search/hooks/useFamilyDirectory.ts:203-206` with `frontend/src/main.tsx:9`. The browse data is fetched on mount only: no refetch on focus and no interval. A family whose `nextFreeSlotStart` passes while the page stays open loses its badge and drops out of "Open for playdates" until the next mount, even if it has a later slot. It errs on the safe side (a past slot is never shown). Optional: refetch the browse list when the earliest start on screen has passed.
6. `frontend/src/api/community.ts:35-36`. `CommunityFamilyDTO` is now an alias with no importer anywhere in `frontend/src`. Drop it.
7. Pure helpers living outside `utils/`: `toLocalNow` (`frontend/src/api/community.ts:42-46`), `formatSpokenDate` (`OpenPlaydatesRail.tsx:11-13`) and `familyInitial` (`useFamilyDirectory.ts:93-97`, exported from a hook file and imported by two components). The first two belong beside `isoDate` and `formatLongDate` in `utils/datetime.ts`. That is one more changed file, so it is follow-up work.
8. `FamilyResults.tsx:6` and `OpenPlaydatesRail.tsx:7` declare the same `BONE` class string. Share it when the feed-skeleton components land.
9. `supabase/functions/community/index.ts:2` and `supabase/functions/search/index.ts:2`. The header comments still give the signature as `?limit=N`. Add `now`.
10. Convention follow-up, one PR after this one: `features/search/index.ts`, plus co-located tests for the seven components and the hook, moved out of `pages/Search.test.tsx`. See the next section for why this is not held against the current PR.

**The slot lookup, final state.** Answers to the dispatcher's questions about `_shared/familyListing.ts`.

- Sizes are bounded where they enter.
  - `limit`: `parseLimit` (`:89-93`), the only place either handler reads it (`community/index.ts:45`, `search/index.ts:42`).
  - Family ids: bounded again by `slice` inside the lookup (`:193`).
  - `now`: `parseLocalNow` (`:109-114`); only its 10-character date part reaches a filter.
  - Each slot query: `.lte` on the date (`:135`) and `.limit(50)` (`:138`).
  - Still unbounded: the caller's own block list. It is unchanged by this feature and can only hurt that caller.
- Nothing is inferred from row counts. No branch reads a result's length.
- One family's data cannot change another family's result. Every query is scoped to one family (item 2 would make that structural).
- Cost of someone else's request: the number of queries no longer depends on stored data (one per listed family, at most 50, 10 in flight, no retry). The duration of a single query still does, as in item 3.
- `now` is sound.
  - Both sides of every comparison are the same zero-padded 19-character format: `composeSlotStart` pads the hour, `LOCAL_NOW_RE` requires padding, and years are four digits on both sides. String order is therefore time order.
  - "Strictly later" on the server (`:169`) matches "strictly later" in the browser (`useFamilyDirectory.ts:205`).
  - A caller can move its own 60-day window but cannot widen it, and only its own response changes.
  - The assumption that host and viewer share a timezone is stated in `### Backend` and is a product decision.
- Swallowing a failed lookup: acceptable as a degrade, not acceptable as silence (item 1).

**Contract.** No drift.

- `toListedFamily` returns the 12 keys `### Backend` declares, and `ListedFamilyDTO` reads the same 12 with matching types.
- A backend that has not been redeployed: the four new keys are `.nullish()` and read as null (`community.ts:16-32`; tests at `Search.test.tsx:230`). An old `community` row carries a slot id with no start; `futureSlot` requires both, so it shows no badge.
- Empty-string `city` and `state` read as null (`community.ts:16-19`; test at `Search.test.tsx:244`).
- `toLocalNow` produces exactly what `LOCAL_NOW_RE` accepts, from local getters.

**Frontend state.**

- Query and filters are read from the URL on every render (`useFamilyDirectory.ts:99-112`, `:145-170`). Nothing is mirrored into state and the diff adds no `useEffect`.
- The search box follows the URL through React Hook Form's `values` option, not a hand-written sync.
- `now` is read inside each `queryFn` and is in neither key (`:183-191`).
- A slot whose start is not after the render-time clock counts as no slot (`:203-206`; test at `Search.test.tsx:221`).
- The filter checkboxes are hand-controlled. I do not count that against the React Hook Form rule: they are toggles whose state is the URL, with no submit and no validation, and putting them in a form would create a second copy of that state.
- `near` depends on the signed-in user, who is restored asynchronously. `stores/auth.ts` sets `token` and `user` in one update and the route is behind `RequireAuth`, so the page never renders with a token and no user. The case is still tested (`Search.test.tsx:492`).

**Auth, input, exposure.** Nothing found.

- Auth. The request client forwards the caller's token with the anon key, so RLS applies. `families` and `availability_slots` are readable by authenticated users only (`20260714000000_restrict_pii_to_authenticated.sql`). `search` still has no 401 of its own; for a signed-out caller it lists no families and therefore issues no slot queries.
- Input reaching a PostgREST filter. `limit` arrives as a clamped integer. `now` contributes only a validated date to `.gte` and `.lte`. Family ids reach `.eq` from database rows. The `q` sanitising and the UUID filter on blocked ids are untouched.
- Exposure. New on `search` rows: `city`, `state` and the next slot's id and start. Any signed-in user can already read all four on `/family/:id`. `kidCount` stays owner-only through the shared mapper.
- Blocks. `useBlock.ts:19-20` invalidates the `['community']` and `['search']` prefixes, which cover both new query keys.
- Pre-existing and unchanged, so not counted: a `q` made only of stripped characters (or no `q`) matches every family, and `*` acts as a wildcard in PostgREST's `ilike`.

**File budget and conventions.** Ruling: none of the three breaches is a must-fix. None causes a failure, and the under-16-files rule is the hard one.

| Breach | Ruling | Why | Cost to fix |
|---|---|---|---|
| Five private helper components in three files (`FamilyResults.tsx:11`, `:32`; `FilterCard.tsx:19`; `OpenPlaydatesRail.tsx:15`, `:36`) | Acceptable. No follow-up needed. | None is exported and none holds state beyond `useId`. Six files on `master` already keep private sub-components the same way (`FamilyView.tsx`, `PlaydatesPage.tsx`, the three `AdminPage` views, `RegisterForm.tsx`). | +5 files |
| One test file for seven components and a hook | Acceptable for this PR. Follow-up recommended. | This is the one that departs from what the repo actually does: every other feature folder has per-component tests. The substance of the smoke-test rule is met, since each component and the hook is rendered and asserted on through the page with msw at the network boundary. | +7 files, +8 with the hook |
| No `features/search/index.ts`; `Search.tsx:3-8` imports six deep paths | Nice-to-have, as the role file classes a missed barrel. | Five of the six existing feature folders have no barrel, and `Home.tsx` imports `features/feed` the same way. | +1 file |

- The arithmetic. A frontend PR is 12 files under `frontend/src`, plus `before.png` and `after.png`, plus the e2e spec being rewritten now: 15, which is the most the rule allows. No fix above fits, not even the one-file barrel, and any vault file that rides along (this spec, the log, a kanban) takes it over.
- If the tech-lead wants any of them, the route the rule itself prescribes is a second layer against `master` after this one merges. The smallest version: `features/search/index.ts`, seven component tests and one hook test (9 new files), with `Search.tsx` and `Search.test.tsx` edited. 11 files, no behaviour change. That is item 10. The helpers stay where they are.
- The branch as it stands is 27 changed files and mixes backend, frontend and vault. Opened as one PR it breaks both the file limit and the backend/frontend split. No PR exists yet. Backend first (6 code files), then the frontend rebuilt on `master`; the frontend already renders against the old response shape, so that order is safe.

**For the tech-lead.**

- The page always asks for `limit=50`, so every visit to `/search` issues 50 slot queries in 5 waves, and a submitted query adds up to 50 more. `### Backend` says this has not been timed. Time it before deploying. If it is slow, a SQL function with a per-family `LIMIT 1` gives the same isolation in one round trip, at the cost of a migration. The one-query-per-family design is a locked dispatcher decision, so this is a note, not a finding.
- "Newest first" is `updated_at` order, as on Home, so a family that edits its profile moves to the top.

**Acceptance criteria spot-check**

- [x] Wide layout, three columns at `md` — `<Layout wide>` and Home's grid string (`Search.tsx:13-14`, `:21-22`).
- [x] Browse list before any query — `community/recent?limit=50&now=…` on load; the card shows avatar, name, location, two-line bio, and the badge only for a future slot.
- [x] Query of two or more characters, same cards; clearing returns to browse — an empty submit removes `q`; one character shows the field error and sends nothing.
- [x] "Near me", "Open for playdates", combined, on both lists, "Clear filters", count line — correct over the rows fetched; see item 4 for the 50-row ceiling.
- [x] Rail: up to 5, next 7 days, soonest first, Request link, empty state — taken from the browse list (`useFamilyDirectory.ts:226-238`); the link is `/family/:id?requestSlot=<id>`, and `FamilyView` already handles that parameter.
- [x] Below `md`: single column, filters reachable, rail hidden — `FilterBar` is `md:hidden`, both asides are `hidden md:block`. Not checked in a browser by me.
- [x] Loading, empty and error states; blocked families excluded — present for the centre and the rail. A failed slot lookup shows as the empty state, not the error state (item 1). Exclusion is still server-side and untouched.
- [x] Four new fields on both responses; frontend renders without them — one shared mapper on the server, a tolerant schema on the client, both tested.

### Tech-lead reconciliation (2026-10-05)

Audit of the five subsections above against the acceptance criteria and the committed branch (`5e3ec85`; last code commit `477f168`). All five are filled and no placeholder is left. The row shape in `### Backend` and `ListedFamilyDTO` in `frontend/src/api/community.ts` carry the same 12 keys with matching types, and `toLocalNow` produces the `now` format the server accepts. No new dependency. Code review reported 0 must-fix, so the must-fix gate did not run.

**Re-run by tech-lead on the committed branch.**

| Gate | Result |
|---|---|
| `npm run test --workspace frontend -- --run` | 43 files, 346 passed, 0 failed |
| `npm run typecheck --workspace frontend` | Clean |
| `npm run build --workspace frontend` | Clean |
| `deno test --allow-all` in `supabase/functions` | 159 passed, 0 failed |
| `npx playwright test community-search.spec.ts --reporter=list` | 18 passed. Chromium, mocked auth, every response stubbed. |

Not re-run: the coverage figures in `### Test plan`, `deno check` and `deno lint`. Nothing ran against real Supabase and nothing is deployed.

**How the counts in the subsections add up.** Each count was right on the day it was written.

- Vitest: 283 after frontend-dev's build, 344 after qa-engineer (+61), 346 after the two accessibility follow-up tests. `Search.test.tsx` holds 119.
- Deno: 122 after backend-dev's redesign, 151 after qa-engineer (+29), 159 after the failed-lookup warning (+8). `_shared/familyListing.test.ts` holds 63, `community/index.test.ts` 27, `search/index.test.ts` 28.
- So the 344 and 151 in `### Test plan`, and the 117 and 55 in its "Now" column, are the totals before the two follow-up commits.

**Corrected in place.** Each is marked where it stands.

- `### Code review`: "no `any`" in the added lines. One test file has a `type Any = any` alias.
- `### Code review`, nice-to-have 1: marked fixed in `477f168`.
- `### Frontend`: "Not applied: 10" is dated, because the committed badge carries `text-[0.625rem]`.
- `### Frontend`, files table: the test count of `Search.test.tsx` as committed.

**What no subsection says.**

- Line numbers in `### Code review` are those of `0652c91`. In `_shared/familyListing.ts`, everything from the slot query down moved in `477f168`.
- Two code commits landed after the code review and were not seen by code-reviewer: `f647722` (one class in `PlaydateBadge.tsx`, one moved line in `OpenPlaydatesRail.tsx`) and `477f168` (the warning in `_shared/familyListing.ts`). The same goes for qa-engineer's 90 tests and the e2e spec. Tech-lead read both product diffs and has nothing to raise on either.
- The 09:15 entry in `log/2026-10-05.md` gives 157 Deno tests and an uncapped message. The committed code caps the message at 200 characters and has 159 tests. The log is append-only, so the roll-up entry carries the final numbers.

**Open question 1.** Confirmed: the query and both filters stay in the URL.

**Follow-ups. None blocks review; each needs its own feature file.**

1. The request dialog shows the slot one day early to a viewer west of UTC (`frontend/src/pages/FamilyView.tsx:101`). It predates this feature, but it is now one click from the rail: the row reads "Wed, Oct 7" and the dialog reads "Tuesday, October 6". Fix before the frontend change is deployed.
2. `RequireAuth` sends the visitor to `/login` whenever `token` is null and keeps only the pathname. The store has an `initialized` flag that nothing reads. When a session restores late (a token refresh), a filtered `/search` URL is lost. It predates this feature and affects every protected route.
3. Both filters, the count line and the rail work on at most 50 families, and `search` has no `order` (code review 4).
4. Time the slot queries on the first deploy: 50 per `/search` visit, up to 50 more per submitted query. If slow, one SQL function with a per-family `LIMIT 1`.
5. `features/search/index.ts` and co-located tests for the seven components and the hook (code review 10), with the small tidy-ups in code review 2, 6, 7, 8 and 9.
6. CI does not run `deno test`, so the 159 Edge Function tests gate nothing.
7. Write-side limits that predate this feature: slots per family (code review 3), `name` and `bio` length, the block list.

## Design — Spec

### Visual

Specifies the approved mock (`docs/screenshots/search-browse-directory/mock.png` and its HTML source). The layout is not changed. Where the mock is silent (small screens, interaction states, loading) or conflicts with [[standards/design-system]], the decision is made here and listed under "Deviations from the mock".

- Strings are referenced by their `### Microcopy` key. Text in the sketches is illustrative.
- Landmarks, live regions, focus order and target-size rulings belong to `### Accessibility`. Where that section is stricter than this one, it wins.
- Component names are suggestions for frontend-dev. The class strings are the contract.

**Revised 2026-10-04 after the spec-stage accessibility audit.** Every changed class or rule carries a tag `[A11Y-n]`, where n is the requirement number in `### Accessibility`. Search this section for `[A11Y-`. Six places changed:

- `[A11Y-7]` search input placeholder colour (anatomy, Tokens)
- `[A11Y-8]` search input border strength (anatomy, Tokens)
- `[A11Y-24]` rail footer link height (anatomy)
- `[A11Y-6]` `FieldError`: classes unchanged, attributes now deferred to Accessibility (anatomy)
- `[A11Y-14]` Clear filters with no filter on: dim the text, not the element (States)
- `[A11Y-16]` `ResultCount` in loading, empty and error: what "not rendered" means (States)

Deviations 8 and 9 record the visible effect, and "For design-lead" item 6 covers the judgement call in 8. Two sentences were reworded only to stay accurate and change nothing to build: the form's "only layout change" bullet and Deviation 2. Nothing else in this section changed.

**Design-lead note, 2026-10-05: where the build differs from this section.** Added at aggregation. The text below is ui-designer's and is left as written. I read the shipped components against it (`frontend/src/features/search/components/` and `pages/Search.tsx`, at `5e3ec85`). They follow it except in the places below. `### Frontend` lists all seven under "Deviations from `### Visual`"; these are the ones a reader of this section would get wrong. All are accepted, and the rulings are under "Design-lead disposition" at the end of `## Design — Spec`.

- `PlaydateBadge` text size ships as `text-[0.625rem]`, not `text-[10px]` (Accessibility 10, commit `f647722`). It is the same 10px at the default font size. This supersedes the recipe line and the "Kept as mocked" bullet that name `text-[10px]`. `py-0.5` is unchanged.
- `PlaydateBadge` text colour ships as the literal `text-[#8a5a12]`, not `text-brand-warm-ink`. Same hex. The token is not in `tailwind.config.js` or [[standards/design-system]].
- `FamilyResultCard`'s root is a `div`. The family name is the card's one link, stretched over the card, and the focus ring is drawn on that stretched box (Accessibility 21).
- The card badge shows only for a slot that starts in the future, not whenever `nextFreeSlotId` is set.
- "Near me" unavailable is `aria-disabled="true"` and stays in the tab order, not native `disabled` (Accessibility 14). Its box is dimmed to 50% and restored while it has keyboard focus.
- The list wrapper carries `mt-3` in place of `space-y-3` on `ResultsBlock`, and the grid carries `[&_:is(a,button,input)]:scroll-my-20` (Accessibility 26).

#### Layout

Wrapper: `<Layout wide>` (`max-w-[1100px] px-4 py-6 md:px-6`), then the same grid string as `Home.tsx:42`:

`grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)_240px]`

| # | Column | Element | Width at `md`+ | Below `md` |
|---|---|---|---|---|
| 1 | Filters | `<aside className="hidden md:block">` holding `FilterCard` | 240px | hidden; `FilterBar` inside column 2 takes over |
| 2 | Families | `<section className="min-w-0">` | `minmax(0,1fr)`, 524px at full width | the only column |
| 3 | Open playdates | `<aside className="hidden md:block">` holding `OpenPlaydatesRail` | 240px | hidden, no replacement (same as Home's rails) |

- DOM order is 1, 2, 3, as in the mock. Column gap is 24px (`gap-6`). Cards sit at the top of their column. Neither side card is sticky.
- The title, intro and search form live inside column 2. They do not span the grid.

`md` and up:

```
 240px              minmax(0,1fr)                                240px
┌───────────────┐   Find a family                                ┌───────────────────┐
│ FILTER        │   Search by name, what they wrote …            │ OPEN FOR PLAYDATES │
│ [x] Near me   │   ( Name, city, anything…         ) ( Search ) │ THIS WEEK          │
│     Oakland…  │                                                │ (A) Anderson Fam…  │
│ [ ] Open for  │   5 FAMILIES IN OAKLAND, CA · NEWEST FIRST     │     Wed, Oct 7 · … │
│     playdates │   ┌────────────────────────────────────────┐   │     [Request]      │
│     Has a f…  │   │ (A) The Anderson family   [Playdate]   │   │ (K) …              │
│ ───────────── │   │     Oakland, CA                        │   │ (N) …              │
│ Clear filters │   │     Fostering since 2019. Two dogs, …  │   │ Your playdates →   │
└───────────────┘   └────────────────────────────────────────┘   └───────────────────┘
```

Below `md`:

```
Find a family
Search by name, what they wrote …
( Name, city, anything…        ) ( Search )
[ [x] Near me ]  [ [ ] Open for playdates ]
  Clear filters
5 FAMILIES IN OAKLAND, CA · NEWEST FIRST
┌──────────────────────────────────────┐
│ (A) The Anderson family  [Playdate]  │
│     Oakland, CA                      │
│     Fostering since 2019. Two dogs … │
└──────────────────────────────────────┘
(no right rail)
```

**Filters below `md`.** The mock hides the filter aside below `md` (`hidden md:block`, mock HTML line 29), which does not meet the acceptance criterion. Below `md` the filters become `FilterBar`: a wrapping row of pills, one per filter, each holding its native checkbox and label, followed by the Clear filters control. It sits inside column 2, between the search form (and its field error) and the count line, and carries `md:hidden`.

`FilterCard` and `FilterBar` are two presentations of one filter state. Each is `display: none` at the other breakpoint, so only one set of controls is in the tab order and the accessibility tree at a time. jsdom does not apply breakpoints, so component tests will find both; scope those queries to the container.

**768px to about 900px.** Home's grid leaves column 2 only 192px wide at a 768px viewport (720 − 240 − 240 − 24 − 24) and 324px at 900px. The acceptance criteria pin three columns at `md`, so the breakpoint stays. Two guards keep it from breaking: the search form wraps (see `SearchHeader`), and card text wraps instead of overflowing (`min-w-0`, `break-words`). Raised for design-lead below.

#### Component anatomy

**SearchHeader** (carried over from `Search.tsx`)

```
h1            text-3xl font-semibold tracking-tight                         search.title
p  Intro      mt-2 text-sm text-ink-muted                                   search.intro
form          mt-6 flex flex-wrap items-center gap-2
├ input       min-w-0 grow basis-40 rounded-full border border-ink-muted/70        ← [A11Y-8] was border-ink-muted/20
│             bg-surface-card px-4 py-2 placeholder:text-ink-muted          ← [A11Y-7] placeholder class added
│                                                                           search.input.*
└ button      inline-flex items-center gap-1.5 rounded-full bg-brand-primary-pressed
              px-5 py-2 text-sm font-semibold text-white shadow-lift
              + SearchIcon h-4 w-4 (unchanged)                              search.submit
p  FieldError mt-2 text-xs text-feedback-error                              search.input.error.tooShort
              classes unchanged; role and ARIA wiring per Accessibility 6   ← [A11Y-6]
```

Full input class string at rest: `min-w-0 grow basis-40 rounded-full border border-ink-muted/70 bg-surface-card px-4 py-2 placeholder:text-ink-muted`. The focus classes in States are unchanged.

- `[A11Y-7]` Placeholder: `placeholder:text-ink-muted`, 7.46:1 on the input's white fill. Without a placeholder class Tailwind applies a default grey at 2.54:1.
- `[A11Y-8]` Border: `border-ink-muted/70`, replacing `/20` (1.32:1 against the page). This is the compliant treatment closest to the mock: the same 1px line, in the same hue, on the same pill, with no label or icon added. Only its strength changes. It is the lightest step that passes with room: 3.55:1 against the input's fill and 3.44:1 against the page (the auditor's script; I re-derived both by hand and got the same). The alternatives were worse fits:
  - `/65` is 3.08:1 against the page, too thin a margin to rely on.
  - Solid `border-ink-muted` (7.24:1) is darker than the requirement needs and moves further from the mock.
  - A visible label would lift the requirement, but adds an element the approved mock does not have.

  The bar pills keep `border-ink-muted/20`, as Accessibility 8 allows: each shows its checkbox and label.
- `flex-wrap` plus `grow basis-40` on the input is the only layout change to the form. At the mock's width it renders the same. Below roughly 850px viewport, while still three columns, the button drops under the input instead of squeezing it to about 80px.
- The shipped "Back home" link is not in the mock. Remove it.

**FilterCard** (`md`+)

```
section                    rounded-lg bg-surface-card p-4 shadow-lift
├ h2  Heading              mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted    search.filters.heading
├ FilterOption ×2 (label)  -mx-2 flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-sm
│  ├ CheckboxSlot (span)   flex h-5 items-center
│  │  └ input[checkbox]    h-4 w-4 accent-brand-primary-pressed
│  └ Text (span)           min-w-0
│     ├ Label              block font-medium                    search.filters.near.label / .open.label
│     └ Hint               block text-xs text-ink-muted         search.filters.near.hint / .open.hint
└ Footer (div)             mt-3 border-t border-ink-muted/10 pt-3
   └ ClearFilters (button) -ml-2 rounded-full px-2 py-1 text-sm font-medium text-ink-muted    search.filters.clear
```

- The whole `label` is the click target (about 52px tall).
- `CheckboxSlot` centres the 16px box on the label's first line. It replaces the mock's `mt-0.5` nudge.
- `-mx-2 px-2` on the row and `-ml-2 px-2` on the button keep the text on the card's 16px inset while leaving room for a hover fill.

**FilterBar** (below `md`)

```
div                        mt-4 flex flex-wrap items-center gap-2 md:hidden
├ FilterPill ×2 (label)    inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full
│  │                       border border-ink-muted/20 bg-surface-card px-3 text-sm font-medium
│  ├ input[checkbox]       h-4 w-4 accent-brand-primary-pressed
│  └ Label                 same keys as FilterCard
├ ClearFilters (button)    min-h-11 rounded-full px-3 text-sm font-medium text-ink-muted    search.filters.clear
└ UnavailableHint (p)      basis-full text-xs text-ink-muted    search.filters.near.hint.unavailable
                           rendered only while "Near me" is disabled
```

- The checkbox stays visible inside the pill, so on/off never depends on colour alone.
- The two regular hints are not shown here. The count line and the empty states already name the city and state when "Near me" is on.
- The row is expected to wrap on phones (Clear filters usually lands on a second row). That is intended.

**ResultsBlock, ResultCount**

```
div  ResultsBlock    mt-6 space-y-3 md:mt-8
├ p  ResultCount     font-mono text-xs uppercase tracking-wide text-ink-muted    search.count.* (+ search.count.sort)
└ ul                 space-y-3
   └ li → FamilyResultCard
```

`ResultCount` may wrap to two lines in a narrow column. Per Microcopy it is not rendered at zero.

**FamilyResultCard**

```
a  (→ /family/:id)         block rounded-lg bg-surface-card p-4 shadow-lift
└ div                      flex items-start gap-3
   ├ Avatar                <Avatar size="sm"> (40px); initial in ink.lead, see call-outs
   └ div                   min-w-0 flex-1
      ├ TitleRow (div)     flex flex-wrap items-center gap-2
      │  ├ Name (p)        min-w-0 break-words font-semibold                  search.card.name
      │  └ PlaydateBadge   static <span>; only when nextFreeSlotId is set     search.card.badge
      ├ Location (p)       text-xs text-ink-muted                             search.card.location
      └ Bio (p)            mt-1 line-clamp-2 text-sm text-ink-muted
```

- One link per card. The badge inside it is an indicator, not a link: no nested anchors, one tab stop per card.
- `items-start`, as in the mock (shipped `Search.tsx` uses `items-center`).
- `Location` is omitted when city and state are both empty, and shows the one that exists when only one does. `Bio` is omitted when empty. A long name wraps and the badge drops to the next line.

**PlaydateBadge** (one component, used in the card and the rail)

`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-brand-warm/50 bg-brand-warm/20 px-2 py-0.5 text-[10px] font-bold text-brand-warm-ink`

- Content: the calendar glyph (U+1F5D3, the one in the acceptance criteria and on Home), then the label.
- This is Home's shipped badge (`Home.tsx:138`) with its raw `text-[#8a5a12]` replaced by the proposed token class. Same hex, no visual change.
- Card: static `span`, label `search.card.badge`. Rail: `Link`, label `search.rail.request`.

**OpenPlaydatesRail**

```
section                       rounded-lg bg-surface-card p-4 shadow-lift
├ h2  Heading                 mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted    search.rail.heading
├ ul                          space-y-3      up to 5 rows, soonest first
│  └ OpenPlaydateRow (li)     flex items-start gap-2
│     ├ RowAvatar (32px)      image:   h-8 w-8 shrink-0 rounded-full object-cover
│     │                       initial: flex h-8 w-8 shrink-0 items-center justify-center
│     │                                rounded-full bg-surface-warm text-sm font-bold text-ink-lead
│     └ span                  min-w-0 flex-1
│        ├ Name               block truncate text-sm font-semibold      search.rail.name
│        ├ SlotTime           block text-xs text-ink-muted              search.rail.slot
│        └ span               mt-1 block
│           └ RequestBadge    Link → /family/:id?requestSlot=<nextFreeSlotId>      search.rail.request
│                             PlaydateBadge recipe, plus
│                             relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']
└ FooterLink                  Link → /playdates      search.rail.footer
                              mt-3 block min-h-6 text-sm font-semibold text-ink-lead underline-offset-4      ← [A11Y-24] min-h-6 added
```

- `[A11Y-24]` `min-h-6` makes the footer link 24px tall; it was 20px. The text stays where the mock has it and the extra 4px sits under it, so the rail card is 4px taller. The Request badge's `after:` box, the label-wrapped checkboxes and `py-1` on Clear filters and Retry are unchanged, as Accessibility 24 asks.
- The Request badge is the row's only link. Name and time are plain text, and the row has no hover fill.
- The `after:` box grows the badge's hit area from about 21px to about 45px tall (`size.hitTarget.min`) without changing how it looks. It reaches into the 12px gaps above and below the pill, which hold no other target.
- Heading and footer link are shown in every state.

#### Tokens

Existing tokens only, with one proposal.

| Token | Classes | Used for |
|---|---|---|
| `color.surface.warm` | `bg-surface-warm` | page (via `Layout`), result-card hover, filter-row hover, rail initial fill |
| `color.surface.card` | `bg-surface-card` | the three card types, search input, bar pills |
| `color.surface.subtle` | `bg-surface-subtle` | skeleton bones; hover fill of text pills (Clear filters, Retry) and of an unchecked bar pill |
| `color.ink.lead` | inherited from `body`; `text-ink-lead` | title, names, option labels, avatar initials, footer link, Retry |
| `color.ink.muted` | `text-ink-muted`, `placeholder:text-ink-muted`, `text-ink-muted/50`, `border-ink-muted/10`, `border-ink-muted/20`, `border-ink-muted/70` | intro, hints, location, bio, slot time, count line, card headings, Clear filters, empty lines; search placeholder `[A11Y-7]`; Clear filters with no filter on (`/50`) `[A11Y-14]`; card divider (`/10`), bar pill borders (`/20`), search input border (`/70`) `[A11Y-8]` |
| `color.brand.primary` | `ring-brand-primary`, `border-brand-primary`, `bg-brand-primary/15` | focus rings, input focus border, checked bar pill, avatar fill. Never text. |
| `color.brand.primary.pressed` | `bg-brand-primary-pressed`, `accent-brand-primary-pressed` | Search button fill under white text, checkbox accent |
| `color.brand.warm` | `bg-brand-warm/20`, `bg-brand-warm/30`, `border-brand-warm/50` | playdate badge fill, hover fill, border |
| `color.feedback.error` | `text-feedback-error` | field error, list error, rail error |
| `shadow.lift` | `shadow-lift` | cards, Search button, `Avatar` |
| radius 16 / 9999 / 8 / 4 | `rounded-lg` / `rounded-full` / `rounded` / `rounded-sm` | cards / pills, avatars, input / filter-row hover / bones |
| space 4, 8, 12, 16, 24, 32 | `gap-1 mt-1` / `gap-2 px-2 py-2 mb-2` / `gap-3 space-y-3 mt-3 pt-3 px-3 mb-3` / `p-4 mt-4 px-4` / `gap-6 mt-6` / `mt-8` | as in the anatomy |
| `size.hitTarget.min` | `min-h-11`, the Request badge's `after:` box | bar pills, Clear filters in the bar, Request badge |
| type | sans throughout; `font-mono` on `ResultCount` only | mono stays a kicker label |

**Proposed token: `color.brand.warm.ink` = `#8A5A12`.** Text colour for labels set on `brand.warm` tints, which today means the playdate badge.

- Why the existing set does not cover it: `brand.warm` is documented as "used in blocks, not text", and no text token carries the warm hue. The badge already ships this exact hex as a raw literal (`Home.tsx:138`), and this feature adds two more uses. Naming it adds no colour to the product and removes a literal that the design sanity sweep's hex-drift check counts as a finding.
- Tailwind: `brand.warm` becomes `{ DEFAULT: '#F0B24F', ink: '#8A5A12' }`, the same shape as `brand.primary.pressed`. Class `text-brand-warm-ink`. Existing `bg-brand-warm/20` and friends keep working.
- Contrast, by my own calculation with the WCAG luminance formula (a11y-auditor to confirm): about 5.2:1 at rest on a white card, 4.9:1 on the Request hover fill, 5.1:1 when the result card under the badge is hovered.
- If design-lead declines it: use `text-ink-lead` on the same fill. No new token, passes, but the badge no longer matches the mock or Home.

#### States

Focus ring, used wherever "ring" appears below (house convention, `Navbar.tsx:141`): `outline-none focus-visible:ring-2 focus-visible:ring-brand-primary`.

**SearchHeader form**

| State | Spec |
|---|---|
| default | as anatomy |
| hover | none; `brand.primary.pressed` is both the rest and hover fill (shipped) |
| focus-visible | input: `outline-none focus:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary`. Button: ring plus `focus-visible:ring-offset-2 focus-visible:ring-offset-surface-warm`, so the ring is not lost against the green fill |
| disabled | none; the button stays enabled while a search is in flight |
| loading | the form does not change; `ResultsBlock` shows the skeleton |
| empty | not an error; an empty box returns to the browse list (per Microcopy) |
| error | `FieldError` line under the form |

**FilterOption** (card row and bar pill)

| State | Card row (`md`+) | Bar pill (below `md`) |
|---|---|---|
| default | unchecked native checkbox; label in `ink.lead`; hint in `ink.muted` | `border-ink-muted/20 bg-surface-card`, label in `ink.lead` |
| checked | native check on `accent-brand-primary-pressed`; nothing else changes | `border-brand-primary bg-brand-primary/15`; label stays `ink.lead` |
| hover | `hover:bg-surface-warm` on the row | unchecked: `hover:bg-surface-subtle`. Checked: no change |
| focus-visible | on the checkbox: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2` | same |
| disabled ("Near me", user has no city or no state) | checkbox `disabled` and unchecked; label becomes `text-ink-muted`; hint swaps to `search.filters.near.hint.unavailable`, still `text-xs text-ink-muted` at full opacity because it is the explanation; `cursor-not-allowed`; no hover fill | label `text-ink-muted`; `cursor-not-allowed`; no hover fill; `UnavailableHint` on its own row under the pills |
| loading | none of its own: city and state come from the auth store, already in memory. The controls stay enabled while results reload | same |
| empty | n/a, the two options are fixed | same |
| error | n/a, it fetches nothing; list errors show in column 2 | same |

**ClearFilters** (card and bar)

| State | Spec |
|---|---|
| default (at least one filter on) | `text-ink-muted`, no fill |
| hover | `hover:bg-surface-subtle hover:text-ink-lead` |
| focus-visible | ring |
| disabled (no filter on) | `[A11Y-14]` still rendered and still focusable: `text-ink-muted/50 cursor-not-allowed`, no hover fill and no hover text change. Was `opacity-50` on the element; no `opacity-*` now, so its focus ring keeps full strength. It never unmounts, so the card keeps its height and focus is not dropped when it is used. Marked up with `aria-disabled="true"`, not `disabled`, per Accessibility 14 |
| loading / empty / error | n/a |

**ResultCount**

| State | Spec |
|---|---|
| default | as anatomy |
| hover / focus-visible / disabled | n/a, static text |
| loading | one bone, `h-4 w-1/2 rounded-sm`, `aria-hidden="true"` (same 16px line height, so nothing shifts) |
| empty | no visible count text; the empty line takes its place |
| error | no visible count text |

`[A11Y-16]` "Not rendered", here and in the anatomy note, means no visible count text. The element that carries `role="status"` stays mounted in every state, as Accessibility 16 requires; that requirement describes one build (a single `<p>` that switches between the count style and the empty-line style). The loading bone sits outside the `role="status"` element. What the user sees in each state is unchanged.

**FamilyResultCard and its list**

| State | Spec |
|---|---|
| default | as anatomy |
| hover | `hover:bg-surface-warm` on the card (shipped behaviour, `Search.tsx:84`) |
| focus-visible | ring on the `a`; it follows `rounded-lg` |
| disabled | n/a; blocked families are left out, never shown disabled |
| loading | `FamilyCardSkeleton` ×4 in place of the list |
| empty | in place of count line and list: `p` `text-sm italic text-ink-muted` with the matching `search.empty.*` string. `search.empty.query.hint` is a second `p` in the same style with `mt-1` |
| error | in place of count line and list: `p` `text-sm text-feedback-error` (`search.results.error.*`), then `Retry` with `mt-2` |

`Retry` (button, `search.retry`): `-ml-3 rounded-full px-3 py-1 text-sm font-semibold text-ink-lead hover:bg-surface-subtle` plus ring. Pressing it puts the list back into its loading state.

**OpenPlaydatesRail**

| State | Spec |
|---|---|
| default | 1 to 5 rows |
| hover | Request badge `hover:bg-brand-warm/30` (as Home); footer link `hover:underline`; rows none |
| focus-visible | Request badge: ring plus `focus-visible:ring-offset-2`. Footer link: `rounded-sm` plus ring |
| disabled | n/a; a family with no slot in the window is not listed |
| loading | `OpenPlaydateRowSkeleton` ×3 in place of the rows |
| empty | `p` `text-sm italic text-ink-muted` (`search.rail.empty`) in place of the rows |
| error | `p` `text-sm text-feedback-error` (`search.rail.error`) in place of the rows; no retry control |

#### Loading skeletons

**The feed-skeleton-loading components are not on this branch.** [[features/feed-skeleton-loading]] (status `review`) documents `AnnouncementCardSkeleton`, `CommunityRowSkeleton` / `CommunityRailSkeleton` and `usePrefersReducedMotion`. None of those files exists under `frontend/src` here, and `Home.tsx` on this branch still renders `Loading…`. Local refs named `feat/feed-skeleton-loading*` exist; I could not check whether they are merged. This spec therefore does not depend on them.

Fit, judged from that feature's written anatomy only (the source is not here to read):

- `AnnouncementCardSkeleton` does not fit the family card. It is a header-over-body card with `p-5`, an "Open" pill bone and an always-rendered row of five reaction pills. The family card has none of those, so reusing it would cause the very layout jump a skeleton is there to prevent.
- `CommunityRowSkeleton` is close to the rail row (avatar plus two lines) but has no third bone for the Request badge, so each loading row would be shorter than its loaded row. Not reused as-is.

Build two small skeletons for this page, using the bone recipe that feature documents so they match it once it lands.

Bone: `bg-surface-subtle animate-pulse motion-reduce:animate-none`. Skeleton roots are `aria-hidden="true"` and contain nothing focusable. If `usePrefersReducedMotion` is on `master` by build time, also drop `animate-pulse` through it as that feature does; the `motion-reduce:` variant is enough on its own otherwise.

```
FamilyCardSkeleton (×4)    rounded-lg bg-surface-card p-4 shadow-lift
└ div                      flex items-start gap-3
   ├ bone                  h-10 w-10 shrink-0 rounded-full
   └ div                   min-w-0 flex-1 space-y-2
      ├ bone  name         h-4 w-1/2 rounded-sm
      ├ bone  location     h-3 w-1/4 rounded-sm
      ├ bone  bio 1        h-3 w-full rounded-sm
      └ bone  bio 2        h-3 w-2/3 rounded-sm

OpenPlaydateRowSkeleton (×3)   flex items-start gap-2
├ bone                     h-8 w-8 shrink-0 rounded-full
└ div                      min-w-0 flex-1 space-y-2
   ├ bone  name            h-3 w-3/4 rounded-sm
   ├ bone  time            h-3 w-1/2 rounded-sm
   └ bone  badge           h-4 w-16 rounded-full
```

- The card skeleton is 108px tall against 96 to 116px for a loaded card; the row skeleton is 56px against about 61px.
- The skeleton shows whenever the list query is pending: first load, and a newly submitted or cleared query. A filter change resolved on the client re-renders at once with no skeleton.
- `search.results.loading.*` and `search.rail.loading` become the screen-reader status text, not visible text. The mechanism is Accessibility's.

#### `brand.primary` as text: call-outs

`brand.primary` (`#4D9463`) as text on this page's light backgrounds computes to roughly 3.1 to 3.7:1 against a 4.5:1 floor (my calculation; a11y-auditor to confirm).

| Site | Source | Problem | Compliant class |
|---|---|---|---|
| Result-card avatar initial | mock HTML line 61, which is the shared `Avatar` fallback (`Avatar.tsx:36`) | `text-brand-primary` on `bg-brand-primary/15`, about 3.1:1 | `text-ink-lead`, passed as `className` to `Avatar`. `text-brand-primary-pressed` is not enough on this fill (about 4.1:1) |
| Rail avatar initial | mock HTML line 147, copied from `Home.tsx:119` | `text-brand-primary` on `bg-surface-warm`, about 3.6:1 | `text-ink-lead` |
| Home rail footer "View all →" | `Home.tsx:154` | `text-brand-primary` on `surface.card`, about 3.7:1 | `text-ink-lead underline-offset-4 hover:underline`. The mock's rail footer (line 173) already uses this. Do not copy Home's class |
| "Back home" link | `Search.tsx:108` | `text-brand-primary` on `surface.warm`, about 3.6:1 | removed (not in the mock). If engineering keeps it: `text-ink-lead underline-offset-4 hover:underline` |

Compliant as mocked, no change: Search button (white on `brand.primary.pressed`), checkbox accent (`pressed`), focus rings and the input focus border (non-text).

Outside this feature, so not fixed here: `Home.tsx:119`, `Home.tsx:154` and `Avatar.tsx:36` themselves. All three are already named in the recurrence note in [[standards/design-system]].

#### Decisions on Microcopy's conditionals

- Retry control: yes, in column 2 only (`search.retry`). The rail has none.
- A clear-filters action inside the filtered empty state: no. The filter card or bar, with its own Clear filters control, is always on screen beside the empty line; a second control with the same name adds nothing.
- "Back home": removed.
- Loading strings: screen-reader status text, since both lists use skeletons.

#### Deviations from the mock

1. **Filters below `md`.** The mock hides them. Added `FilterBar` to meet the acceptance criterion.
2. **Avatar initials** are `ink.lead`, not `brand.primary`, in both the cards and the rail (design-system contrast rule). One of two visible colour changes at the mock's width; the other is item 8.
3. **Badge text colour** is a named token instead of a raw hex. Same value.
4. **Filter rows** use `py-2` instead of `py-1.5`, and a centring slot instead of `mt-0.5`, to stay on the space scale. Each row is 4px taller.
5. **Clear filters** is a button shaped as a text pill instead of a bare `<a>`. It looks the same at rest, gains a hover fill, and shows as disabled when no filter is on.
6. **Search form** gains `flex-wrap` and `basis-40`. No change at the mock's width.
7. **States the static mock does not show** are added: hover, focus rings, disabled, skeletons, empty and error lines, the Retry control, and the enlarged Request hit area.
8. **Search input** `[A11Y-7]` `[A11Y-8]`. The border is `ink.muted/70` instead of `/20`, and the placeholder is `ink.muted` instead of the default grey. Both are visibly darker than the mock, and both are required for contrast.
9. **Rail footer link** `[A11Y-24]` is 24px tall instead of 20px. The text does not move; the rail card is 4px taller.

Kept as mocked although they sit awkwardly with the canon:

- The hairline above Clear filters (`border-t border-ink-muted/10`). The adoption notes say "no inner borders". Kept because the human approved it. If design-lead rules against it, drop `border-t` and `pt-3` and use `mt-4`.
- The badge's `text-[10px]` and `py-0.5` (2px). Kept so the badge matches Home's shipped one exactly. There is no type-size token to map 10px to.
- Card headings in bold uppercase sans rather than mono. This matches Home's "Community" heading.

#### For design-lead

1. Decide on `color.brand.warm.ink` (see Tokens). frontend-dev needs the answer before building `PlaydateBadge`.
2. The skeleton components this dispatch expected to reuse are not on this branch (see Loading skeletons).
3. The 768 to 900px range is cramped on both this page and Home because of the shared grid. A follow-up could move both to three columns at `lg`. Not done here: the acceptance criteria pin `md`, and Home is out of scope.
4. `Home.tsx:138` keeps its raw hex until Home adopts the shared `PlaydateBadge`.
5. Contrast figures in this section are hand calculations, not tool output.
6. `[A11Y-8]` Accessibility calls requirement 8 a judgement call. If you rule that the border is not what identifies the search field, the input border can go back to the mock's `/20`. Until then `/70` stands. The placeholder change (7) stays either way.

### Microcopy

One table: 54 keys, 62 strings (the eight count-line rows each carry a singular and a plural form). Placeholders: `{n}` number of families listed; `{city}`, `{state}` the signed-in user's own, as stored; `{query}` the submitted query; `{name}` the family's stored name. Strings are written in sentence case; the count line and the two card headings are uppercased by CSS, as in the mock.

**Changed on 2026-10-04** for Accessibility requirements 13, 16 and 20. No key was renamed or removed. Each affected row is marked in its last column.

- `search.count.announce`: changed. In query mode the announcement now names the query.
- `search.count.announce.query`: added. The visually hidden suffix that names it.
- `search.card.badge.aria`: changed, from "Open for playdates" to "Open playdate slot".
- `search.filters.near.hint.unavailable`: note added, string unchanged.

| key | string | where it appears |
|---|---|---|
| **Page and search form** | | |
| `search.title` | Find a family | Page `h1`. Shipped, unchanged. |
| `search.intro` | Search by name, what they wrote about their family, or where they are. | Under the `h1`. Shipped, unchanged. |
| `search.input.label` | Search | Visually hidden `<label>` of the search input. Shipped, unchanged. |
| `search.input.placeholder` | Name, city, anything… | Search input. Shipped, unchanged. |
| `search.submit` | Search | Submit pill. Shipped, unchanged. |
| `search.input.error.tooShort` | At least 2 characters. | Field error under the form, for a 1-character query. Shipped, unchanged. An empty box is not an error: it returns to the browse list. |
| **Filter card (left)** | | |
| `search.filters.heading` | Filter | Card heading. |
| `search.filters.near.label` | Near me | First checkbox label. |
| `search.filters.near.hint` | {city}, {state} | Hint under "Near me", e.g. "Oakland, CA". |
| `search.filters.near.hint.unavailable` | We don't have a city and state for your family. | Replaces the hint when the user has no city or no state on file. The checkbox is disabled and unchecked. **NOTE 2026-10-04, string unchanged:** this is always-visible text and also the checkbox's accessible description (`aria-describedby`), in the filter card and in the bar below `md`. Never a `title` or a tooltip (Accessibility requirement 13). |
| `search.filters.open.label` | Open for playdates | Second checkbox label. |
| `search.filters.open.hint` | Has a free slot coming up | Hint under "Open for playdates". |
| `search.filters.clear` | Clear filters | Card footer action. Reuse the same label for a clear-filters action inside a filtered empty state, if ui-designer specs one. |
| **Count line (centre, above the list; shown when `{n}` is 1 or more)** | | |
| `search.count.browse` | `1 family` / `{n} families` | Browsing, no filters. |
| `search.count.browse.near` | `1 family in {city}, {state}` / `{n} families in {city}, {state}` | Browsing, "Near me" on. |
| `search.count.browse.open` | `1 family open for playdates` / `{n} families open for playdates` | Browsing, "Open for playdates" on. |
| `search.count.browse.nearOpen` | `1 family open for playdates in {city}, {state}` / `{n} families open for playdates in {city}, {state}` | Browsing, both filters on. |
| `search.count.sort` | ` · newest first` | Appended to the four browse rows when `{n}` is 2 or more, e.g. "5 families in Oakland, CA · newest first". Not used for one family, and not used in query mode. |
| `search.count.query` | `1 matching family` / `{n} matching families` | Query submitted, no filters. Replaces shipped "{n} result(s)". |
| `search.count.query.near` | `1 matching family in {city}, {state}` / `{n} matching families in {city}, {state}` | Query submitted, "Near me" on. |
| `search.count.query.open` | `1 matching family open for playdates` / `{n} matching families open for playdates` | Query submitted, "Open for playdates" on. |
| `search.count.query.nearOpen` | `1 matching family open for playdates in {city}, {state}` / `{n} matching families open for playdates in {city}, {state}` | Query submitted, both filters on. |
| **Empty states (centre; shown in place of the count line and list when `{n}` is 0)** | | |
| `search.empty.browse` | No other families yet. They'll show up here as they join. | Browsing, no filters: no families at all. First sentence matches Home's Community rail. |
| `search.empty.browse.near` | No other families in {city}, {state} yet. | Browsing, "Near me" on. |
| `search.empty.browse.open` | No families are open for playdates right now. | Browsing, "Open for playdates" on. |
| `search.empty.browse.nearOpen` | No families in {city}, {state} are open for playdates right now. | Browsing, both filters on. |
| `search.empty.query` | No families matched “{query}”. | Query submitted, no filters. Shipped, unchanged. |
| `search.empty.query.hint` | Try a name, a city, or a few words from their bio. | Second line under `search.empty.query` only. Shipped wording, moved here from the pre-search hint. |
| `search.empty.query.near` | No families in {city}, {state} matched “{query}”. | Query submitted, "Near me" on. |
| `search.empty.query.open` | No families open for playdates matched “{query}”. | Query submitted, "Open for playdates" on. |
| `search.empty.query.nearOpen` | No families open for playdates in {city}, {state} matched “{query}”. | Query submitted, both filters on. |
| **Loading and errors (centre)** | | |
| `search.results.loading.browse` | Loading families… | While the browse list loads. Visible text, or the screen-reader status text if ui-designer specs skeletons. |
| `search.results.loading.query` | Searching… | While a submitted query loads. Shipped, unchanged. |
| `search.results.error.browse` | We couldn't load families. Try again in a moment. | Browse list failed to load. |
| `search.results.error.query` | We couldn't run that search. Try again in a moment. | Query failed. Replaces shipped "Could not search." |
| `search.retry` | Try again | Label for a retry control beside either error, only if ui-designer specs one. |
| **Family card (centre list)** | | |
| `search.card.name` | The {name} family | Card title. Shipped, unchanged. |
| `search.card.location` | {city}, {state} | Line under the title, the family's own city and state. Show whichever parts exist joined by ", "; omit the line when both are missing (same as Home's rail). |
| `search.card.badge` | Playdate | Badge beside the title when the family has a future free slot. Preceded by the 🗓 glyph, as on Home. |
| **Open playdates rail (right)** | | |
| `search.rail.heading` | Open for playdates this week | Card heading. |
| `search.rail.name` | {name} | First line of each row: the stored name with no "The … family" wrapper, same as Home's rail. |
| `search.rail.slot` | {weekday}, {month} {day} · {time} | Second line of each row, e.g. "Wed, Oct 7 · 3:30pm", "Sat, Oct 10 · 10am". Exact format below the table. |
| `search.rail.request` | Request | Badge link under each row, preceded by the 🗓 glyph. Links to `/family/:id?requestSlot=<slotId>`. |
| `search.rail.empty` | No free slots in the next 7 days. | Shown in place of the rows when no family qualifies. |
| `search.rail.loading` | Loading open playdates… | While the rail loads. Visible text, or the screen-reader status text if ui-designer specs skeletons. |
| `search.rail.error` | We couldn't load open playdates. | Rail failed to load. |
| `search.rail.footer` | Your playdates → | Footer link to `/playdates`. Always shown, including in the empty state. |
| **Accessible names and announcements** | | |
| `search.landmark.filters` | Filters | `aria-label` of the left `<aside>`. |
| `search.landmark.results` | Families | `aria-label` of the centre `<section>`. |
| `search.landmark.rail` | Open for playdates this week | Accessible name of the right `<aside>`: identical to its visible heading, so label it by that heading. |
| `search.rail.request.aria` | Request a playdate with {name} on {weekday}, {month} {day} at {time} | `aria-label` of each Request badge link, with weekday and month spelled out, e.g. "Request a playdate with Anderson Family on Wednesday, October 7 at 3:30pm". Starts with the visible label "Request". |
| `search.card.badge.aria` | Open playdate slot | **CHANGED 2026-10-04** (was "Open for playdates"). What assistive tech reads in place of the visible "🗓 Playdate" badge on a family card. The badge sits inside the card link, and a link's name must contain its visible text (Accessibility requirement 20). The old string had "playdates" but not the visible word "Playdate". Same wording as Home's shipped badge tooltip. |
| `search.count.announce` | The count line without `search.count.sort`. In query mode, followed by `search.count.announce.query`. At zero, the empty-state string for that state. | **CHANGED 2026-10-04** (the query is now named, Accessibility requirement 16). Text of the one `role="status"` element once the list settles after a submit, a cleared query, a filter change, "Clear filters" or Retry. Every combination is written out under "Announced text" below. |
| `search.count.announce.query` | `, for “{query}”` | **ADDED 2026-10-04.** Visually hidden suffix placed straight after the count text inside the status element. Query mode only, when `{n}` is 1 or more. Not used at zero, because all four `search.empty.query*` strings already name the query. Not used when browsing. |

**Announced text, every combination (added 2026-10-04).** What the status element reads once the list settles. `search.count.sort` and `search.empty.query.hint` are never part of it. `{query}` is the submitted query, trimmed, in the curly quotes used elsewhere.

- Browsing, no filters. One: "1 family". Other: "{n} families". Zero: "No other families yet. They'll show up here as they join."
- Browsing, "Near me" on. One: "1 family in {city}, {state}". Other: "{n} families in {city}, {state}". Zero: "No other families in {city}, {state} yet."
- Browsing, "Open for playdates" on. One: "1 family open for playdates". Other: "{n} families open for playdates". Zero: "No families are open for playdates right now."
- Browsing, both on. One: "1 family open for playdates in {city}, {state}". Other: "{n} families open for playdates in {city}, {state}". Zero: "No families in {city}, {state} are open for playdates right now."
- Query, no filters. One: "1 matching family, for “{query}”". Other: "{n} matching families, for “{query}”". Zero: "No families matched “{query}”."
- Query, "Near me" on. One: "1 matching family in {city}, {state}, for “{query}”". Other: "{n} matching families in {city}, {state}, for “{query}”". Zero: "No families in {city}, {state} matched “{query}”."
- Query, "Open for playdates" on. One: "1 matching family open for playdates, for “{query}”". Other: "{n} matching families open for playdates, for “{query}”". Zero: "No families open for playdates matched “{query}”."
- Query, both on. One: "1 matching family open for playdates in {city}, {state}, for “{query}”". Other: "{n} matching families open for playdates in {city}, {state}, for “{query}”". Zero: "No families open for playdates in {city}, {state} matched “{query}”."

Example: the count line shows "3 matching families in Oakland, CA" and the status element reads "3 matching families in Oakland, CA, for “anderson”". The browsing rows and all eight zero strings are the same as before this change. The suffix leaves the visible count line untouched, so the announcement always starts with the text on screen and nothing is read twice.

**Date and time format (rail).**

- Visible: `EEE, MMM d · h[:mm]a`. Short weekday, comma, short month, day with no leading zero, space + middle dot (U+00B7) + space, then 12-hour time with lowercase `am`/`pm`, no space before it, and minutes left out on the hour. "Wed, Oct 7 · 3:30pm", "Sat, Oct 10 · 10am", "Sun, Oct 11 · 12pm". No year.
- This is what the shipped helpers in `frontend/src/utils/datetime.ts` already produce (`formatShortDate` for the date, `formatTime` for the time), so the rail matches the calendar the Request link opens onto.
- In `search.rail.request.aria`: `EEEE, MMMM d` ("Wednesday, October 7") and the same time string.
- Show the slot's start as the host family entered it. Backend sends `nextFreeSlotStart` as a floating local time (no `Z`, no offset), so it must not be shifted to the viewer's time zone.

**Rules.**

- The count line is not rendered at zero. The empty-state string says the same thing in a full sentence, so showing both would repeat it.
- The 🗓 glyph on both badges is decorative: hide it from assistive tech. The acceptance criteria name it for the Playdate badge; the Request badge carries it because the approved mock does.
- Show the error strings above as written rather than the raw `error.message` (shipped `Search.tsx` shows the raw message first). Home's rail already uses a fixed string.
- Punctuation as shipped: curly quotes around `{query}`, straight apostrophes, the single-character ellipsis "…".
- Shipped tests find the input with `getByLabel('Search')` / `getByLabelText(/search/i)` and the button by the exact name "Search" (`frontend/src/pages/Search.test.tsx`, `frontend/e2e/community-search.spec.ts`, which also asserts "At least 2 characters."). None of the accessible names above contains "search"; keep it that way or those queries match more than one element.

**Shipped strings changed (3).**

1. `{n} result` / `{n} results` becomes `search.count.query*`. "Results open for playdates" does not read, and the query line now mirrors the browse line.
2. `Could not search.` becomes `search.results.error.query`. It gave no next step and sat outside the "we" voice the two new error strings on this page use.
3. `Try a name, a city, or a few words from their bio.` is no longer the pre-search hint (the browse list replaces it, per the acceptance criteria). The wording is kept as the second line of the no-match state.

`Back home` (shipped footer link) is not in the approved mock. If ui-designer keeps it, the string is unchanged.

**Departures from the approved mock (3).**

1. Count line says "in Oakland, CA", not "near Oakland, CA". The filter is an exact city-and-state match, so "near" promises families the list will not show. The mock's own sample list has Berkeley, San Leandro and Alameda rows under a checked "Near me"; the real filter hides those. The checkbox label stays "Near me" (named in the acceptance criteria), with the city and state in its hint.
2. On-the-hour times read "10am", not "10:00am", to match the shipped calendar format.
3. The right landmark is named "Open for playdates this week", not "Open for playdates". The mock's name is identical to the checkbox label, which gives a landmark and a control the same accessible name.

**For design-lead.**

- "Near me" unavailable: I found City and State fields only in `RegisterForm.tsx`; there is no place to change them after signup. The hint therefore states the reason and offers no action. If a location edit ships, add a link here.
- "The {name} family" doubles the word when the stored name already ends in "Family" ("The Anderson Family family"). The mock shows "Anderson Family" in the rail and "The Anderson family" in the centre, which cannot both come from one stored name. Not checked against real data. Pre-existing in `Search.tsx` and `FamilyHeader.tsx`.
- The rail heading says "this week"; the window is the next 7 days. Each row carries its weekday and date, and the empty state says "next 7 days", so I kept the heading from the acceptance criteria.
- Home's rail still says "Could not load community." in the older voice. Out of scope here; worth a follow-up so the two rails match.

### Accessibility

#### Spec-stage audit (2026-10-04)

Audited against WCAG 2.2 AA: the approved mock and its HTML source, the acceptance criteria, `### Visual` and `### Microcopy` above, and the shipped code this page is built from (`Search.tsx`, Home's Community rail, `Layout.tsx`, `Navbar.tsx`, `Avatar.tsx`). Nothing is built yet, so these are requirements for frontend-dev, not findings against a page. Per Visual, where this section is stricter it wins.

28 requirements: 17 BLOCKING, 11 NON-BLOCKING. BLOCKING means the page fails a WCAG 2.2 Level A or AA criterion if the requirement is not met. NON-BLOCKING ones should still be built; they do not hold the ship.

**What has to change in the sections above.**

- Visual, search input class string: the placeholder (2.54:1) and the border (1.32:1) fail contrast. Both are carried over from the shipped page. Requirements 7 and 8.
- Visual, rail footer link: "Your playdates →" is 20px tall. Requirement 24.
- Visual, "Clear filters" with no filter on: `opacity-50` also dims its focus ring. Requirement 14, non-blocking.
- Microcopy, `search.count.announce`: in query mode the announcement must name the query. One string to add. Requirement 16.
- Not specified by either section yet, so new work for frontend-dev: requirements 6, 11, 13, 15, 16, 22 and 26.

Blocking requirements 1, 3, 4, 9, 19, 20 and 25 are already met by Visual and Microcopy as written. They are listed so they survive the build.

**The two changes since the mock.** The filter pill bar below `md` is sound: it fixes the mock's hidden filters and keeps focus order matching the screen (requirements 3 and 4), subject to unique ids (11) and a group label (2). Moving avatar initials from `brand.primary` to `ink.lead` takes them from 3.11:1 and 3.55:1 to 14.50:1 and 16.58:1.

**Token verdict.** `color.brand.warm.ink` (`#8A5A12`), the one token Visual proposes, passes AA everywhere Visual uses it. Visual's hand calculations are confirmed by script: 5.23:1, 4.92:1 and 5.10:1 for the badge; 3.11:1, 3.55:1, 3.66:1 and 4.12:1 for the `brand.primary` call-outs.

**Contrast.** Computed by script with the WCAG relative-luminance formula. Translucent colours are flattened onto the surface under them first. Text needs 4.5:1; no coloured text on this page is large enough for the 3:1 allowance (the badge is 10px bold, and large means 24px, or 18.66px bold). Non-text parts needed to find or operate a control need 3:1 (1.4.11).

| Where | Foreground on background | Ratio | Needs | Verdict |
|---|---|---|---|---|
| `h1`, Retry | `ink.lead` `#1F1B18` on `surface.warm` `#FFFBF5` | 16.58:1 | 4.5 | Pass, also AAA |
| Family names, option labels, footer link | `ink.lead` on `surface.card` `#FFFFFF` | 17.10:1 | 4.5 | Pass, also AAA |
| Intro, count line, centre empty lines, "Clear filters" in the bar; card and filter-row text on hover | `ink.muted` `#5E534B` on `surface.warm` | 7.24:1 | 4.5 | Pass, also AAA |
| Location, bio, hints, card headings, slot time, "Clear filters", rail empty line, disabled "Near me" label | `ink.muted` on `surface.card` | 7.46:1 | 4.5 | Pass, also AAA |
| Search placeholder | Tailwind default `#9CA3AF` on `surface.card` | 2.54:1 | 4.5 | **Fail AA.** Requirement 7 |
| Search button label and icon | white on `brand.primary.pressed` `#3F7E54` | 4.86:1 | 4.5 | Pass AA, fail AAA |
| Badge text at rest | `brand.warm.ink` `#8A5A12` on `brand.warm/20` over card (`#FCF0DC`) | 5.23:1 | 4.5 | Pass AA, fail AAA |
| Request badge on hover | `brand.warm.ink` on `brand.warm/30` over card (`#FBE8CA`) | 4.92:1 | 4.5 | Pass AA |
| Card badge while the card hovers to `surface.warm` | `brand.warm.ink` on `brand.warm/20` over `surface.warm` (`#FCECD4`) | 5.10:1 | 4.5 | Pass AA |
| Field error and list error; rail error | `feedback.error` `#B83B3B` on `surface.warm`; on `surface.card` | 5.47:1; 5.63:1 | 4.5 | Pass AA |
| Avatar initials as Visual specifies | `ink.lead` on `brand.primary/15` over card (`#E4EFE8`); on `surface.warm` | 14.50:1; 16.58:1 | 4.5 | Pass, also AAA |
| Avatar initials as the mock draws them | `brand.primary` `#4D9463` on `#E4EFE8`; on `surface.warm` | 3.11:1; 3.55:1 | 4.5 | Fail as text. Removed by Visual's change |
| Any other `brand.primary` text (shipped "Back home", Home's "View all →") | `brand.primary` on `surface.warm`; on `surface.card` | 3.55:1; 3.66:1 | 4.5 | **Fail AA** if used. Requirement 9 |
| Checked bar pill label | `ink.lead` on `brand.primary/15` over the page (`#E4ECDF`) | 14.10:1 | 4.5 | Pass, also AAA |
| Hover fill on an unchecked bar pill, "Clear filters", Retry | `ink.lead` on `surface.subtle` `#F4ECDF` | 14.58:1 | 4.5 | Pass, also AAA |
| "Clear filters" with no filter on (`opacity-50`) | `ink.muted` at 50% on card; on the page | 2.33:1; 2.30:1 | none | Exempt as an inactive control. See requirement 14 for its ring |
| Search input border (non-text) | `ink.muted/20` over card (`#DFDDDB`) against the white fill; against the page | 1.36:1; 1.32:1 | 3 | **Fail AA.** Requirement 8 |
| Checked checkbox fill (non-text) | `brand.primary.pressed` on `surface.card` | 4.86:1 | 3 | Pass |
| Checked bar pill border (non-text) | `brand.primary` against the page; against the pill's own fill | 3.55:1; 3.02:1 | 3 | Pass, with no margin on the fill side. The tick also shows the state |
| Focus ring (non-text) | `brand.primary` on card; on the page; on a checked pill's fill | 3.66:1; 3.55:1; 3.02:1 | 3 | Pass |
| Focus ring against the Search button's own fill | `brand.primary` against `#3F7E54` | 1.33:1 | n/a | Visual's `ring-offset-2` separates the two |
| Navbar (shipped, unchanged) | white on `brand.primary.pressed`; white on `feedback.error`; `ink.lead` on card; wordmark `brand.primary` on card | 4.86:1; 5.63:1; 17.10:1; 3.66:1 | 4.5 | Pass. The wordmark is exempt as a logotype |

Not required to reach 3:1: the unchecked checkbox box (drawn by the browser, exempt while unstyled), the unchecked bar pill border (1.32:1; the checkbox and label identify the pill), white cards on the cream page (1.03:1), the badge outline (1.36:1) and skeleton bones (1.17:1, decorative).

**Structure and order**

1. **BLOCKING** (1.3.1). One `<h1>` (`search.title`). `search.filters.heading` and `search.rail.heading` are `<h2>` elements, and result cards and rail rows are `<li>` in a `<ul>`. Visual specifies all of this; do not turn the headings into styled paragraphs. Test: one heading at level 1; each card heading found by `getByRole('heading', { level: 2, name })`.

2. **NON-BLOCKING**. Landmark names follow Microcopy: left `<aside>` `search.landmark.filters`, centre `<section>` `search.landmark.results`, right `<aside>` named by its `<h2>` through `aria-labelledby`. Keep one `role="search"` form. Three additions:
   - `FilterBar` has no heading or landmark of its own, so below `md` the two checkboxes have no group name. Give its wrapper `role="group"` and `aria-label` `search.landmark.filters`. At `md` and up the labelled `<aside>` does this job.
   - A visually hidden `<h2>` carrying `search.landmark.results` directly above the count line, so the list can be reached by heading. Family names are not headings.
   - `role="list"` on both `<ul>`s. Tailwind's `list-style: none` makes Safari with VoiceOver drop the list role and its item count.

3. **BLOCKING** (2.4.3, 1.3.2). Focus order follows source order, and source order matches the screen at every width. Visual's layout does this: DOM order is filters, centre, rail, with `FilterBar` inside the centre column after the search form. At `md` and up Tab runs Near me, Open for playdates, Clear filters, search input, Search, cards, Request links, "Your playdates →". Below `md` it runs search input, Search, Near me, Open for playdates, Clear filters, cards. Two conditions keep it true:
   - `FilterCard` and `FilterBar` are switched with `display: none` (`hidden md:block`, `md:hidden`), never `sr-only`, `opacity-0` or off-screen positioning, so exactly one set of filter controls is focusable and exposed.
   - No `order-*`, `flex-*-reverse`, `grid-flow-dense` or positive `tabindex` on the page.

   Test at the build audit: Tab through at 1280px and 375px and compare with the two sequences above.

4. **BLOCKING** (1.4.10, 2.1.1). The filters are operable below `md`. Visual's `FilterBar` does this. The mock's bare `hidden md:block` would have removed them for phones and for a desktop user at 200% zoom (a 1280px window becomes 640 CSS px, under the 768px breakpoint). No sideways scrolling at 320 CSS px. Test: at 375px both checkboxes are found by role and toggle; at 320px `documentElement.scrollWidth` equals `clientWidth`.

5. **NON-BLOCKING** (1.4.10). Hiding the rail below `md` is acceptable only because the same slots stay reachable through the "Open for playdates" filter and the card badge, then the family page. A user at 200% zoom still loses the day-and-time shortcut. design-lead should know that is the trade.

**Search form**

6. **BLOCKING** (1.3.1, 4.1.2, 3.3.1, 4.1.3). The input keeps its visually hidden `<label for>` (`search.input.label`), as shipped; the placeholder is not a label. While `search.input.error.tooShort` shows, the input has `aria-invalid="true"` and `aria-describedby` pointing at `FieldError`, `FieldError` has `role="alert"` (the repo's convention for field errors), and focus is in the input. The shipped page does none of the three and Visual leaves `FieldError` unchanged. Test: `getByLabelText('Search')`; after submitting "a", `getByRole('alert')` holds the string and the input has it as its accessible description.

**Colour**

7. **BLOCKING** (1.4.3). Add `placeholder:text-ink-muted` (7.46:1) to the search input. With no placeholder class Tailwind applies `#9CA3AF`, which is 2.54:1.

8. **BLOCKING** (1.4.11). The search input's border reaches 3:1 against the page. The label is hidden and the placeholder goes once the user types, so the outline is what shows where the field is, and `border-ink-muted/20` is 1.32:1. `border-ink-muted/70` gives 3.55:1 against the fill and 3.44:1 against the page. `/65` gives 3.08:1 against the page, too close to rely on. Solid `border-ink-muted` gives 7.24:1. ui-designer picks the value. This is a judgement call: 1.4.11 applies only when the border is what identifies the control, and a visible label would lift it. The bar pills can keep `/20`, because each shows its checkbox and label.

9. **BLOCKING** (1.4.3). Two guards. Visual meets both as written.
   - No `brand.primary` text. `text-brand-primary` is 3.66:1 on card and 3.55:1 on the page. `text-brand-primary-pressed` passes on card (4.86:1) and on the page (4.71:1) but not on `brand.primary/15` (4.12:1) or `surface.subtle` (4.14:1).
   - Badge text stays `brand.warm.ink` on a fill no stronger than `brand.warm/40` over card or `surface.warm` (4.62:1 and 4.53:1; `/45` fails at 4.48:1 and 4.40:1). Over `surface.subtle` only `/20` passes (4.59:1; `/30` is 4.38:1). No `opacity-*` on the badge or anything around it.

10. **NON-BLOCKING**. Badge text is 10px, the smallest on the page, and "Request" is the rail's one action. WCAG sets no minimum size and Visual keeps it to match Home. If it stays, write it as `text-[0.625rem]` so it follows the user's browser font size.

**Filters**

11. **BLOCKING** (2.1.1, 4.1.2). Controls are native elements and their ids are unique.
    - Each filter is `<input type="checkbox">` inside its `<label>`. "Clear filters" and Retry are `<button type="button">`. Request and "Your playdates →" are router `Link`s. Visual specifies all of these. The mock's `<a>` without `href` and its `<span>` badge would not take focus.
    - `FilterCard` and `FilterBar` are both in the DOM, so every `id` used by `for`, `aria-labelledby` or `aria-describedby` comes from `useId()`, never a literal. A duplicated id makes the reference resolve to the hidden copy.

    Test: in jsdom, where both presentations render, no `id` value appears twice.

12. **NON-BLOCKING** (1.3.1). In `FilterCard` the checkbox's name is the label alone and the hint is its description. Keep both spans inside `<label>` so the whole row stays clickable, and set `aria-labelledby` (label span) and `aria-describedby` (hint span) on the input. Otherwise the name reads "Near me Oakland, CA". Test: `getByRole('checkbox', { name: 'Near me' })` has the accessible description "Oakland, CA".

13. **BLOCKING** (4.1.2, 1.3.1, 1.4.3). "Near me" with no city or state on file:
    - The state is in the markup (`disabled` or `aria-disabled="true"`), the box is unchecked, and nothing turns it on: not a click, not Space, not a URL parameter.
    - The reason (`search.filters.near.hint.unavailable`) is always-visible text, referenced from the checkbox by `aria-describedby`. In `FilterBar` it comes after two other controls, so that reference is the only thing tying it to "Near me". Not a `title`, not a tooltip.
    - The reason stays at full `ink.muted` (7.46:1), as Visual specifies. Dimming a wrapper around it would fail: `opacity-80` gives 4.48:1.

14. **NON-BLOCKING**. Rulings on the two disabled states. Visual left the first to this section.
    - "Clear filters" with no filter on: `aria-disabled="true"`, still focusable, click does nothing. Not `disabled`: it becomes unavailable at the moment it is pressed, while it holds focus, and browsers differ on what happens to focus on a button that disables itself.
    - Visual's `opacity-50` would also dim that button's focus ring to 1.80:1. Dim the text (`text-ink-muted/50`, the same 2.33:1) and leave the element alone. ui-designer to confirm.
    - "Near me" unavailable: the same treatment is preferred (`aria-disabled="true"`, controlled `checked={false}`, left in the tab order) so a keyboard user lands on it and hears the reason. Native `disabled`, which Visual specifies, takes it out of the tab order. The cost is styling the dimmed box by hand.

**Results**

15. **BLOCKING** (3.2.2, 2.4.3). Submitting a query, toggling a filter and clearing filters update the list in place and leave focus on the control that was used. No `focus()` on the results, no `scrollIntoView`, no route change. If the filters and query go in the URL (the open question; it helps here, because a reload or Back then restores the user's place), change only the query string: `useFocusMainOnRouteChange` watches `pathname` and `hash`, so a query-string change leaves focus alone and a hash change would not. One exception: Retry unmounts when pressed, so its handler moves focus to `ResultsBlock` (`tabIndex={-1}` and `focus:outline-none`, as `Layout` does for `<main>`). Test: after each action `document.activeElement` is the control used, or `ResultsBlock` after Retry; never `<body>`.

16. **BLOCKING** (4.1.3). Results are announced without moving focus.
    - One `role="status"` element, in the DOM from first render, never conditionally rendered, and not inside an `aria-busy` element. When the list settles after a submit, a cleared query, a filter change, "Clear filters" or Retry, its text is `search.count.announce`.
    - While a list query is pending its text is `search.results.loading.query` or `.browse`, visually hidden. This is the mechanism Visual asked for.
    - Typing announces nothing. The list and the status text change on submit, not per keystroke. If search-as-you-type is ever added, debounce at least 500 ms and announce only the settled result.
    - A background refetch (window focus, reconnect) announces nothing. Drive the text from the query and filters, not from `isFetching`.
    - In query mode the text also names the query, in a visually hidden suffix. Two different searches can both give "3 matching families", repeated text is not announced, and a cached result skips the loading step. `search.count.announce` has no wording for this; ux-writer to add it.
    - The visible text is not read twice. One build that does all of the above: keep one `<p>` mounted in every state where Visual puts the count line, switching its classes between the count style and the empty-line style, with a `<span role="status">` inside it. The span holds the hidden loading string while pending, the count when there are results, the empty-state sentence at zero, and nothing on error. `search.count.sort` follows the span and `search.empty.query.hint` stays a separate `<p>`, so neither is announced.
    - The list error (`search.results.error.*`) has `role="alert"`.

    Test: `getByRole('status')` exists before data arrives; it holds the count string after a submit resolves; it is unchanged after typing without submitting.

17. **NON-BLOCKING**. The rail has no live region. Its empty and error lines are ordinary text, and `search.rail.loading` is visually hidden ordinary text beside the skeleton. The rail loads without the user asking, so `role="alert"` or `role="status"` there would speak on every page load.

18. **NON-BLOCKING**. `aria-busy="true"` on the results `<ul>` or its wrapper while a list query is pending, removed on settle; the same on the rail's list. Skeleton roots are `aria-hidden="true"` with nothing focusable inside, as Visual specifies, and are not `<li>` items of the real list.

**Cards and rail rows**

19. **BLOCKING** (4.1.2, 1.3.1). No link or button inside another. Visual meets this: one `<a>` per card with a static badge, and Request is each rail row's only link. A link inside a link is invalid HTML, React warns about it, and screen readers expose the inner one unpredictably. If a later change gives a card or row two destinations, they become siblings: the container is `relative`, the family name is the link with `after:absolute after:inset-0` stretching its hit area, and the second link sits above it with `relative z-10`. Test: for every `a, button` on the page, `parentElement.closest('a, button')` is null.

20. **BLOCKING** (2.4.4, 2.5.3, 4.1.2). Every link has a non-empty accessible name that contains its visible text.
    - Card link: the name begins with `search.card.name` as rendered ("The Anderson family"). The `<a>` around the card gets this from its content. Do not add an `aria-label` holding the bare `{name}`, as Home's rail does: here the visible text has the "The … family" wrapper, and the mismatch fails 2.5.3 for speech-input users.
    - Request link: `search.rail.request.aria` as its `aria-label`. It starts with the visible word and names the family and slot, so five links do not all read "Request".
    - No `title` attributes. Home's badge relies on one; `title` is not a name and is not reachable by keyboard or touch.

    Test: `getByRole('link', { name: /^The Anderson family/ })`; `getByRole('link', { name: 'Request a playdate with Anderson Family on Wednesday, October 7 at 3:30pm' })`.

21. **NON-BLOCKING**. Keep the card link's name short. One `<a>` around the card computes to name, badge, location and the whole bio (`line-clamp` trims only what is seen), read out at every Tab stop. The same look with a shorter name: make `Name` the link, stretch it over the card with `after:absolute after:inset-0`, draw the ring on the pseudo-element (`focus-visible:after:ring-2`), and point `aria-describedby` at the location line and the badge's hidden text.

22. **BLOCKING** (1.1.1). Avatars are decorative. Card avatars use the shared `Avatar`, which sets `alt=""` on the image and `aria-hidden="true"` on the initial. The rail's 32px `RowAvatar` is hand-built, so it sets both itself. An `<img>` with no `alt` is read out by file name.

23. **NON-BLOCKING**. As Microcopy says, the calendar glyph sits in `<span aria-hidden="true">` on both badges. On the static card badge the visible "Playdate" is also `aria-hidden` and is followed by a `sr-only` span holding `search.card.badge.aria`. Not `aria-label` on the badge `<span>`: ARIA prohibits it on an element with no role and screen readers do not reliably read it. Wrap the slot start in `<time dateTime>`.

**Pointer targets, focus, motion**

24. **BLOCKING** (2.5.8). Pointer targets are at least 24 by 24 CSS px. Visual's sizes meet this with one exception.
    - "Your playdates →" is 20px tall. It could pass only on the exception for small targets with clear space around them, and the Request badge's enlarged hit area ends within about 2px of it, which is too close to call. Add `min-h-6` or `py-0.5`.
    - Keep what makes the rest pass: the `after:` box on the Request badge (the pill alone is about 21px tall), the `<label>` wrapping each 16px checkbox (52px row, 44px pill), and `py-1` on "Clear filters" and Retry (28px).

    Test at the build audit: `getBoundingClientRect()` of each target, or of its `::after` box, is at least 24 in both directions.

25. **BLOCKING** (2.4.7, 1.4.11). Every interactive element shows a visible focus indicator. Visual's ring (`focus-visible:ring-2 focus-visible:ring-brand-primary`, 3.66:1 on card and 3.55:1 on the page) covers the input, Search, both checkboxes, "Clear filters", cards, Request, the footer link and Retry, with offsets where the ring would otherwise touch its own fill. Never ship `outline-none` without it, and do not treat `hover:bg-surface-warm` as a focus style. Inside a checked bar pill the ring is 3.02:1 against the pill's fill, which passes with no margin, so do not darken that fill.

26. **BLOCKING** (2.4.11). A focused control is never completely hidden under the sticky navbar (66px with its border) or, below `md`, the fixed bottom tab bar (`Layout` reserves 64px for it). The filter rows, Request links and text links are all shorter than either bar. Add one global rule, `html { scroll-padding-block: 5rem; }` in `index.css`, or `scroll-mt-20 scroll-mb-20` on this page's focusable elements. The cause is the shipped Navbar, not this feature, and it cannot be reproduced before the page exists. Test at the build audit: Shift+Tab up from the list at 1280 by 600, and Tab down it at 375 by 667.

27. **NON-BLOCKING** (2.3.3). Visual's bones carry `motion-reduce:animate-none`. Any transition added while building carries `motion-reduce:transition-none`. No smooth scrolling.

28. **NON-BLOCKING** (1.4.4, 1.4.12). No fixed heights on cards, rail rows or the filter card, so text can grow at 200% zoom and with wider text spacing. `truncate` on a rail name is acceptable because the Request link's name carries the family name in full.

**Checks at the build audit.** axe-core on the built page in a real browser with the contrast rule on (the jsdom helper in `src/tests/a11y.ts` turns `color-contrast` off), in four states: browse list with data, a filtered empty state, "Near me" unavailable, and a list error. The existing `Search` case in `src/tests/a11y.test.tsx` renders only the pre-search page with no data; qa-engineer should extend it to the same four states. Then a keyboard pass at 1280px and 375px for requirements 3, 15, 25 and 26, and measured target sizes for 24.

**For design-lead.**

- Requirement 8 is a judgement call under 1.4.11. If you rule the border is not what identifies the field, it drops to non-blocking; requirement 7 does not.
- Home's Community rail, the pattern this page copies, has two of the defects above: its Playdate link is about 21px tall on top of the row's stretched link (2.5.8), and its purpose is carried by `title`. Home is out of scope here.
- [[standards/design-system]] gives white on `brand.primary` as "~3.26:1" and `brand-contrast.test.ts` says "~3.4:1". It computes to 3.66:1; the same script reproduces the documented 4.86:1 for `.pressed`. The verdict (fails 4.5:1) does not change.
- The document title is "fofafu" on every route (`index.html`; nothing in `frontend/src` sets `document.title`). That is an app-wide 2.4.2 gap, not this page's.
- Requirement 26 is app-wide too. The one global rule fixes every page.

#### Build-stage re-verify (2026-10-05)

The rebuilt `/search` page meets all 17 blocking requirements. 27 of the 28 pass. The one that fails is non-blocking requirement 10 (the badge's font size is in `px`), which frontend-dev left out on purpose. Nothing in this part holds the ship.

**Design-lead note, 2026-10-05: two findings below were fixed after this re-verify.** Added at aggregation. The auditor's text is left as written and describes commit `0652c91`. Commit `f647722` then changed two things. I checked both by reading the code at `5e3ec85` and by running `Search.test.tsx` and `src/tests/a11y.test.tsx`, which hold the two tests written for them (130 of 130 pass). Neither change was re-run in a browser, with axe-core or with a screen reader, so the 14-state axe result and the measurements below are still those of `0652c91`.

- Requirement 10: `PlaydateBadge.tsx:7` now ships `text-[0.625rem]`. This answers row 10, "The one failure", deliberate choice 3 and "For design-lead" item 1. The class change is approved. The auditor's FAIL has not been re-measured with a raised browser font size.
- Rail loading text: the visually hidden "Loading open playdates…" is now at `OpenPlaydatesRail.tsx:84`, a sibling above the `aria-busy` wrapper at line 85. This answers the second "Also found" item and moves row 17's line references. The rail still has no live region, so row 17's verdict stands.

**How it was checked.** In a real browser, from the rendered page and the code, not from frontend-dev's description of it.

- Playwright's Chromium 148, headless, against a production build of this worktree at commit `0652c91`, served with `vite preview` on port 5437.
- Signed in with the synthetic session that `frontend/e2e/README.md` describes. Every Edge Function response was a stub. The browser clock was fixed at Monday 5 October 2026, 09:00.
- Data: the five demo families plus seven more (12 in all), including one with a photo avatar, one with a 64-character name and one with no location or bio. A second signed-in user with no city or state for the "Near me" cases.
- axe-core 4.11.4, already a dev dependency, run inside the page with the contrast rule on.
- `Search.test.tsx` and `src/tests/a11y.test.tsx` were also run: 126 of 126 pass.
- Nothing was added to the repo. The server is stopped, and the build, scripts and screenshots are deleted.

In the table, "browser" means measured on the rendered page. File names without a path are in `frontend/src/features/search/components/`.

| # | Level | Verdict | Evidence |
|---|---|---|---|
| 1 | BLOCKING | PASS | Browser accessibility tree: one level-1 heading, "Find a family"; level-2 headings "Filter", "Families" (visually hidden) and "Open for playdates this week". Both lists are `ul` with only `li` children (12 cards, 5 rail rows). `pages/Search.tsx:28`, `FilterCard.tsx:61`, `OpenPlaydatesRail.tsx:81`. |
| 2 | NON-BLOCKING | PASS | Browser: complementary "Filters", region "Families", complementary "Open for playdates this week" (named by its heading), one `search`. All three additions are built: `role="group"` named "Filters" on the bar (`FilterBar.tsx:32`), the hidden `h2` (`FamilyResults.tsx:70`), `role="list"` on both lists (`FamilyResults.tsx:85`, `OpenPlaydatesRail.tsx:98`). |
| 3 | BLOCKING | PASS | Browser: tabbed through at 1280×800 and 375×667. Both sequences match the requirement exactly. The presentation not in use computes to `display: none` at each width and is absent from the accessibility tree. No `order-*`, reverse or dense class and no positive `tabindex` on the page. |
| 4 | BLOCKING | PASS | Browser: at 375 and 320 both checkboxes are found by role inside the group "Filters" and toggle by Space and by pointer. `scrollWidth` equals `clientWidth` at 320, 375, 640 (a 1280 window at 200%), 767, 768, 800, 900 and 1280, with the 64-character name in the list. No element extends past the viewport at any of them. |
| 5 | NON-BLOCKING | PASS | Built as ruled. Browser: the rail is `display: none` below `md`, so also at 200% zoom on a 1280 window. The "Open for playdates" pill and the card badge are present and working at 320 and 375. The trade stands: the day-and-time shortcut is not there. |
| 6 | BLOCKING | PASS | Browser: the textbox is named "Search" by its hidden label. After submitting "a" with Enter, and separately with the Search button: one `role="alert"` holding "At least 2 characters.", `aria-invalid="true"`, that text as the input's description, focus in the input. All three are gone after a valid submit. `SearchForm.tsx:39-58`. |
| 7 | BLOCKING | PASS | Browser: computed `::placeholder` colour `rgb(94, 83, 75)` at opacity 1 on white, 7.46:1. `SearchForm.tsx:26`. |
| 8 | BLOCKING | PASS | Browser: computed border `rgba(94, 83, 75, 0.7)`, 1px. 3.55:1 against the fill, 3.44:1 against the page. `SearchForm.tsx:26`. |
| 9 | BLOCKING | PASS | Browser: every visible text node in `<main>` swept in six states. None uses `brand.primary`. Badge text is `#8A5A12` on `brand.warm/20` at rest and `/30` on Request hover, with no `opacity` on the badge or any ancestor. Lowest text ratio on the page: 4.86:1 (Search button). See the contrast table. |
| 10 | NON-BLOCKING | **FAIL** | `PlaydateBadge.tsx:6` ships `text-[10px]`. Browser: with the root font size doubled, both badges stay at 10px while all other text doubles. See "The one failure". |
| 11 | BLOCKING | PASS | Browser: checkboxes inside their labels, `button type="button"` for "Clear filters" and "Try again", router links for cards, Request and the footer link, no anchor without `href`. With both filter presentations in the DOM there is no duplicate `id`, and all 22 `for`, `aria-labelledby` and `aria-describedby` references resolve to exactly one element. Every id comes from `useId()`. |
| 12 | NON-BLOCKING | PASS | Browser accessibility tree: checkbox "Near me", description "Oakland, CA"; checkbox "Open for playdates", description "Has a free slot coming up". The whole 224×52 row is the click target. `FilterCard.tsx:31-47`. |
| 13 | BLOCKING | PASS | Browser: signed in with no city or state and loaded as `/search?near=1&open=1`, at 1280 and 375. The checkbox is exposed as unchecked and disabled, with the reason as its description. A click on the box, a click on the label, Space, and `near=1` in the URL all leave it unchecked and the count line unchanged. The reason is visible text at full `ink.muted` with no dimmed ancestor (7.46:1 in the card, 7.24:1 in the bar) and there is no `title`. `FilterCard.tsx:35-46`, `FilterBar.tsx:39-40` and `54-58`, `hooks/useFamilyDirectory.ts:106` and `155-157`. |
| 14 | NON-BLOCKING | PASS | Browser: "Clear filters" with no filter on is `aria-disabled="true"`, still a Tab stop, and pressing it does nothing and keeps focus. Its text is `rgba(94, 83, 75, 0.5)` and the element's own opacity is 1, so its ring is full strength. "Near me" unavailable is `aria-disabled` and a Tab stop; the box is at 50% at rest and 100% while it has keyboard focus. `FilterCard.tsx:12` and `69-72`, `FilterBar.tsx:16` and `49`. |
| 15 | BLOCKING | PASS | Browser, at 1280 and 375: after a filter toggled by Space and by click, "Clear filters" by Enter and by click, a query submitted by Enter and by the Search button, a cleared query, and Back, `document.activeElement` is the control used, never `<body>` or `<main>`. Only the query string changes and `scrollY` does not move. After "Try again", focus is on the results block (`div tabindex="-1"`) and the next Tab lands on the first card. `FamilyResults.tsx:63-66` and `71`. |
| 16 | BLOCKING | PASS | Browser: a mutation log attached before first render. One `role="status"` element, present at first render, the same node throughout, never inside `aria-busy="true"`. Its text at each step is listed under "Live region, as recorded". Typing changes nothing. A background refetch (reconnect) changes nothing. The sort note and the empty hint are outside it. On a list error it is empty and the error is a `role="alert"`. `FamilyResults.tsx:72-81`, `hooks/useFamilyDirectory.ts:259-281`. |
| 17 | NON-BLOCKING | PASS | Browser: no `role="status"`, `role="alert"` or `aria-live` inside the rail while loading, empty, failed or loaded. "Loading open playdates…" is a visually hidden `<p>`. `OpenPlaydatesRail.tsx:85` and `93-96`. |
| 18 | NON-BLOCKING | PASS | Browser: while pending, `aria-busy="true"` on the wrapper of the centre list and of the rail list; `"false"` once settled. Skeleton roots are `aria-hidden="true"`, hold nothing focusable and are not inside a `ul`. One note under "Also found". |
| 19 | BLOCKING | PASS | Browser: for every `a` and `button` in `<main>`, `parentElement.closest('a, button')` is null. One link per card; Request is each rail row's only link. |
| 20 | BLOCKING | PASS | Browser accessibility tree: card links are named exactly "The Anderson family" and so on. Request links are named "Request a playdate with Anderson on Wednesday, October 7 at 3:30pm" and so on, each starting with the visible word. No `title` attribute anywhere in `<main>`. `FamilyResultCard.tsx:31-37`, `OpenPlaydatesRail.tsx:61`. |
| 21 | NON-BLOCKING | PASS | Built as recommended. The link's name is the family name only and its description is "Oakland, CA Open playdate slot". See "The three deliberate choices". |
| 22 | BLOCKING | PASS | Browser, with a photo avatar in the data: both images (40px card, 32px rail) have `alt=""`, initials are `aria-hidden="true"`, and the accessibility tree has no image node in `<main>`. `components/Avatar/Avatar.tsx`, `OpenPlaydatesRail.tsx:43-50`. |
| 23 | NON-BLOCKING | PASS | Browser: glyph and visible label sit in `<span aria-hidden="true">` on both badges. The card badge adds a visually hidden "Open playdate slot". The static badge has no `aria-label`. The slot time is `<time datetime="2026-10-07T15:30:00">`. `PlaydateBadge.tsx:24` and `35-39`, `OpenPlaydatesRail.tsx:54`. |
| 24 | BLOCKING | PASS | Browser: hit areas measured by probing the page point by point, so `::after` boxes count. Every target is at least 24px both ways; the smallest is "Your playdates →" at 208×24. The last Request badge's enlarged area ends exactly where the footer link's box begins and takes none of it. See "Target sizes, as measured". |
| 25 | BLOCKING | PASS, Chromium only | Browser: every Tab stop in `<main>` at 1280 and 375 matched `:focus-visible` and had a computed 2px `rgb(77, 148, 99)` ring, on `::after` for cards. Screenshots of a focused checkbox, "Clear filters", the input, Search, a card, Request and the footer link show the ring. In forced-colours mode every stop gets a solid 2px outline instead. Firefox and Safari were not run. |
| 26 | BLOCKING | PASS | Browser: computed `scroll-margin` is 80px top and bottom on every link, button and input in the grid (`pages/Search.tsx:14`). Tab down and Shift+Tab up at 1280×600, 375×667 and 320×480 with 12 families: no focused control is ever fully hidden, and each control's own box is fully visible at every stop. Below `md` the ring of a focused card can be partly behind the tab bar; at worst 39% of the ring box is visible (320×480), with the family name fully visible. That meets 2.4.11. It would not meet AAA 2.4.12. |
| 27 | NON-BLOCKING | PASS | Browser: with reduced motion emulated, all 33 bones compute `animation-name: none` (`pulse` otherwise). No element in `<main>` has a transition. `scroll-behavior` is `auto`. |
| 28 | NON-BLOCKING | PASS | Browser: with the WCAG 1.4.12 text spacing applied, cards grow from 116px to 200px and nothing is cut off except the two-line bio clamp and the rail name's `truncate`, both by design. No sideways scroll at 1280 or 320. The full family name is in the Request link's name. |

**The one failure: requirement 10 (non-blocking).**

- Where: `PlaydateBadge.tsx:6`, `text-[10px]`, used by the card badge and by the Request link.
- What a user experiences: someone who has raised their browser's default font size gets every other text on the page scaled and the two badges left at 10px. Measured with the root size doubled: the family name goes from 16px to 32px, location and slot time from 12px to 24px, and both badges stay at 10px. "Request" is the rail's only action.
- Why it does not block: WCAG sets no minimum size, and 1.4.4 is met through page zoom, which scales `px`. The 200% layout (640px wide) has no sideways scroll and nothing cut off.
- Smallest fix: `text-[10px]` becomes `text-[0.625rem]` on that line. It is the same 10px at default settings, so the badge still matches Home pixel for pixel. It is a class change, so ui-designer and the dispatcher decide.

**The three deliberate choices.**

1. Card root is a `div` and the family name is the stretched link (`FamilyResultCard.tsx:25-37`). Sound.
   - Screen reader: each Tab stop is "The Anderson family", link, then the description "Oakland, CA Open playdate slot". The bio is no longer read at every stop.
   - Pointer: the link's `::after` covers the whole card. Probed at all four corners and over the avatar, badge, location and bio; a click on the bio opened `/family/f-anderson`. One link per card.
   - Keyboard: the ring is drawn on the card's edge with the card's 16px radius and is not clipped.
   - Costs, none of them a failure: card text cannot be selected with the pointer; below `md` the browser scrolls the name into view, not the whole card, which is why part of the ring can sit behind the tab bar (requirement 26); in forced-colours mode the outline is around the name, not the card.
2. "Near me" unavailable is `aria-disabled` and stays focusable. Sound, and it is the treatment requirement 14 preferred. A keyboard user lands on it and gets the name, the unchecked and unavailable state, and the reason. Nothing turns it on (requirement 13). The hand-dimmed box returns to full opacity while it has keyboard focus, so its ring is at full contrast.
3. Requirement 10 not applied. This is the one failure above. It is non-blocking, and the fix is one class.

**Contrast, recomputed for the classes that shipped.** Same method as the spec stage: the WCAG luminance formula on the `tailwind.config.js` values, with translucent colours flattened first. Every text pair, the placeholder, the input border and the hover fills on the card, the Request badge, the filter row, "Clear filters" and "Try again" were also read back from the browser's computed styles and match. The unchecked pill's hover fill is from its class only.

| Where | Shipped classes | Ratio | Needs | Verdict |
|---|---|---|---|---|
| `h1`, "Try again" | `ink.lead` on `surface.warm` | 16.58:1 | 4.5 | Pass, also AAA |
| Family names, filter labels, rail names, footer link, typed search text | `ink.lead` on `surface.card` | 17.10:1 | 4.5 | Pass, also AAA |
| Intro, count line, centre empty lines and hint, the bar's "Clear filters" and its "Near me" reason; card and filter-row text on hover | `text-ink-muted` on `surface.warm` | 7.24:1 | 4.5 | Pass, also AAA |
| Location, bio, filter hints, card headings, slot time, the card's "Clear filters", rail empty line, the unavailable "Near me" label (card and pill) and its reason in the card | `text-ink-muted` on `surface.card` | 7.46:1 | 4.5 | Pass, also AAA |
| Search placeholder | `placeholder:text-ink-muted` on `surface.card` | 7.46:1 | 4.5 | Pass, also AAA. Was 2.54:1 |
| Search button label and icon | `text-white` on `bg-brand-primary-pressed` | 4.86:1 | 4.5 | Pass AA, fail AAA |
| Badge text at rest | `text-[#8a5a12]` on `bg-brand-warm/20` over card (`#FCF0DC`) | 5.23:1 | 4.5 | Pass AA, fail AAA |
| Card badge while its card is hovered | the same text on `brand.warm/20` over `surface.warm` (`#FCECD4`) | 5.10:1 | 4.5 | Pass AA |
| Request badge on hover | the same text on `hover:bg-brand-warm/30` over card (`#FBE8CA`) | 4.92:1 | 4.5 | Pass AA |
| Field error and list error; rail error | `text-feedback-error` on `surface.warm`; on `surface.card` | 5.47:1; 5.63:1 | 4.5 | Pass AA |
| Card avatar initial; while its card is hovered | `text-ink-lead` on `bg-brand-primary/15` over card (`#E4EFE8`); over `surface.warm` (`#E4ECDF`) | 14.50:1; 14.10:1 | 4.5 | Pass, also AAA |
| Rail avatar initial | `text-ink-lead` on `bg-surface-warm` | 16.58:1 | 4.5 | Pass, also AAA |
| Checked bar pill label | `ink.lead` on `bg-brand-primary/15` over the page (`#E4ECDF`) | 14.10:1 | 4.5 | Pass, also AAA |
| Hover fill on an unchecked bar pill, an active "Clear filters", "Try again" | `ink.lead` on `surface.subtle` | 14.58:1 | 4.5 | Pass, also AAA |
| "Clear filters" with no filter on | `text-ink-muted/50` on card; on the page | 2.33:1; 2.30:1 | none | Exempt as an inactive control. The element is not dimmed, so its ring is not either |
| Search input border (non-text) | `border-ink-muted/70` (`#8E8781` over the fill) against the fill; against the page | 3.55:1; 3.44:1 | 3 | Pass. Was 1.36:1 and 1.32:1 |
| Checked checkbox fill (non-text) | `accent-brand-primary-pressed` on card | 4.86:1 | 3 | Pass |
| Checked bar pill border (non-text) | `border-brand-primary` against the page; against the pill's fill | 3.55:1; 3.02:1 | 3 | Pass, with no margin on the fill side |
| Focus ring (non-text) | `ring-brand-primary` on card and on its white offset; on the page and on a hovered card; beside a checked pill's fill | 3.66:1; 3.55:1; 3.02:1 | 3 | Pass |

No `brand.primary` text shipped in `<main>`, so the two failing text rows of the spec-stage table have no counterpart here. Still exempt, as at the spec stage: the unchecked checkbox box (and the unavailable one at 50%, an inactive control), the unchecked bar pill's border (1.32:1; its checkbox and label identify it), the badge outline and the bones.

**Live region, as recorded.** The text of the one status element after each action, 1280 and 375 alike, with 12 families and the signed-in user in Oakland, CA.

- Load: "Loading families…" (visually hidden), then "12 families".
- "Near me" on: "4 families in Oakland, CA". "Open for playdates" also on: "3 families open for playdates in Oakland, CA". "Near me" off: "5 families open for playdates". "Clear filters": "12 families".
- Typing "oak" without submitting: no change.
- Submit "oak": "Searching…" (visually hidden), then "4 matching families, for “oak”". Submitting it again unchanged: no change.
- "Open for playdates" on in query mode: "3 matching families open for playdates, for “oak”".
- Submit "CA": "Searching…", then "11 matching families, for “CA”". Submit "oak" again, now cached: straight to "4 matching families, for “oak”" with no loading step.
- Submit "zzzz": "Searching…", then "No families matched “zzzz”." The hint line is outside the element.
- Submit "a": no change; the field error is announced by its own `role="alert"`.
- Empty box submitted: "12 families". Back: "No families matched “zzzz”.", and the search box shows "zzzz" again.
- List fails: the element is empty and "We couldn't load families. Try again in a moment." is a `role="alert"`. "Try again" that fails: "Loading families…", then empty, and the alert is inserted again. "Try again" that succeeds: "Loading families…", then "12 families".
- Also seen: "No families in Oakland, CA are open for playdates right now." and "No other families yet. They'll show up here as they join."

All of these match Microcopy's "Announced text". The combinations not exercised live (singular forms, "Near me" in query mode) are covered by the count and empty-line unit tests, which pass.

**Target sizes, as measured.** Box is the element; hit area is what a pointer actually reaches.

| Target | Box | Hit area | Width |
|---|---|---|---|
| Filter row in the card (label and checkbox) | 224×52 | 224×52 | 1280 |
| "Clear filters" in the card | 92×28 | 93×28 | 1280 |
| Search input | 407×42; 226×42; 171×42 | the same | 1280; 375; 320 |
| Search button | 109×36 | 110×36 | all |
| Family card link | name text, 18px tall | the whole card: 524×96 to 524×149; 343×96 and up; 288×72 to 288×217 | 1280; 375; 320 |
| Request badge | 76×21 | 90×43 | 1280 |
| "Your playdates →" | 208×24 | 208×24 | 1280 |
| "Try again" | 86×28 | 87×28 | 1280 |
| Bar pills | 106×44 and 175×44 | the same | 375, 320 |
| "Clear filters" in the bar | 100×44 | 101×44 | 375, 320 |

**axe-core in the browser.** 14 states: browse with data, both filters on, filtered empty, list error, query results, query with no match, empty directory, field error showing and old-shape backend rows at 1280; one pill checked, filtered empty and list error at 375; browse at 320; three columns at 768. It was also run with "Near me" unavailable at 1280 and 375 and in the loading state. Result: no violation and nothing marked "needs review" on this page's content in any state. It reports two contrast violations in the shipped navbar; see the first item below.

**Also found. None of it blocks this feature.**

- Navbar, outside this change. Below `md` the active tab's label in the bottom tab bar, "Community" on this page, is `text-brand-primary` on `surface.warm` at 12px: 3.55:1 against the 4.5:1 it needs (1.4.3). `frontend/src/components/Navbar.tsx:239`. A low-vision user on a phone reads the label of the tab they are on at lower contrast than every other label. It predates this feature, is the same on every page for its own tab, and the spec-stage table's Navbar row did not list this pair. It needs its own feature file. The smallest fix is one class, `text-brand-primary-pressed` (4.71:1 on `surface.warm`); ui-designer decides. axe also reports the navbar wordmark (3.66:1), which the spec stage treats as an exempt logotype.
- Rail loading text sits inside the busy wrapper. `OpenPlaydatesRail.tsx:84-85`: the visually hidden "Loading open playdates…" is a child of the `div` that has `aria-busy="true"`, so assistive technology that waits for a busy region to settle may never read it. The centre column has this right (its status element is outside the busy wrapper). Smallest fix: move that `<p>` above the `div`.
- Search placeholder is cut off at two widths. "Name, city, anything…" needs 160px and has 137px at a 320px viewport and 158px at 768px, so its last characters are clipped with no ellipsis. The hidden label and the intro line still say what the field is for. `SearchForm.tsx:26`; ui-designer's call.
- The first heading in the DOM is the `h2` "Filter", and the `h1` comes second, because the filters come first in source order (requirement 3). A screen-reader user moving by heading meets "Filter" first. axe accepts it and Home has the same order.

**Not verified, and why.**

- No screen reader was run. Names, descriptions and the live-region text come from Chromium's accessibility tree and a DOM mutation log. They show what is exposed, not what VoiceOver, NVDA or JAWS speaks.
- Firefox and Safari. Only the Chromium build for the installed Playwright (1.60.0) is on this machine, and I did not download the others. The one thing worth a manual look in Safari is the focus ring on the two native checkboxes, which is a `box-shadow` with the outline removed (`FilterCard.tsx:12`).
- Real Supabase. Every response was a stub and the sign-in was synthetic.
- 768px to 900px was checked for overflow and with axe, not for comfort. Nothing breaks; it is as cramped as Visual said.
- The family page that the card and Request links open.

**For design-lead.**

1. Requirement 10: accept the badge at `text-[10px]`, or have ui-designer approve the one-class change.
2. The navbar tab label needs a follow-up feature file.

#### Design-lead disposition (2026-10-05)

Rulings on the "For design-lead" lists in the three subsections above. Checked against `mock.png`, `after.png` and the shipped components. All 54 Microcopy keys match the strings in the code, and every key that Visual and Accessibility name is in the table. I recomputed the contrast figures the rulings rest on; they agree with the auditor's to within 0.02.

1. **`color.brand.warm.ink` (`#8A5A12`): accepted, as a tracked follow-up.** It is not added to [[standards/design-system]] in this change. The value is sound: it passes AA on every fill it sits on (lowest 4.92:1), and the hex now ships as a literal in two places (`Home.tsx:138`, `PlaydateBadge.tsx:7`). But it is not in `tailwind.config.js` and no component uses the class. Listing it in the canon now would describe a token that does not exist, and would stop the sanity sweep's hex-drift check from reporting the two literals. The follow-up needs its own feature file: add `brand.warm.ink` to Tailwind, replace both literals, and move Home's rail to the shared `PlaydateBadge`, which is also where the two Home rail defects from the spec-stage audit get looked at. The token row is promoted when that ships.
2. **Requirement 8: the border is what identifies the search field.** The label is hidden, the placeholder goes on the first keystroke, and the white fill on the cream page is 1.03:1. `border-ink-muted/70` stands and the requirement stays blocking. It is built and passes.
3. **Requirement 10: `text-[0.625rem]` is approved.** Same size at the default font size, nothing drawn differently.
4. **Kept as mocked: all three accepted for this page.** The hairline above "Clear filters" stays because the human approved it in the mock; it is not a precedent against "no inner borders". The badge's 10px size and `py-0.5` stay for parity with Home's shipped badge. Card headings stay bold uppercase sans for parity with Home's "Community". Mono is on the count line only.
5. **"Near me" unavailable hint: accepted as written.** It gives the reason and promises no action, which is accurate. City and State fields exist only in `RegisterForm.tsx`, and signup requires both (`api/auth.ts:8-9`), so few accounts should reach this state; I did not check real data. Editing a location after signup is a product gap and needs its own feature file. When it ships, ux-writer adds the link.
6. **Navbar active tab label: not fixed here.** Confirmed at `Navbar.tsx:239-241`: `text-brand-primary` at 12px on `surface.warm`, 3.55:1 against 4.5:1. It is the `brand.primary`-as-text pattern in the recurrence note in [[standards/design-system]], which already names `Navbar.tsx`. It predates this feature and this feature does not touch the file. It needs its own feature file, tagged `#design-debt`. `text-brand-primary-pressed` (4.71:1) is the likely fix; ui-designer decides there.
7. **Search placeholder clipped at 320px and 768px: accepted for this feature.** No criterion fails: the hidden label names the field and the intro line says what it searches. It is 2px short at 768px and 23px short at 320px. The string is shipped and stays. It goes with the follow-up for the cramped 768 to 900px range (Visual, "For design-lead" item 3), where ui-designer decides the fix.
8. **Noted, no change here.**
   - The filter pill bar below `md` is the one surface the approved mock did not show. It matches Visual class for class and the auditor measured it in a browser at 375px and 320px, but no screenshot of it is committed. A human reviewer should look at `/search` at phone width.
   - The page-local skeletons use the bone recipe from [[features/feed-skeleton-loading]] and can be folded into its components once both are on `master`.
   - The rail is hidden below `md`, so the day-and-time shortcut is lost there (Accessibility 5). The acceptance criteria ask for that.
   - `font-mono` names JetBrains Mono, which the app does not load (`tailwind.config.js:34`; nothing imports the font), so the count line renders in the browser's fallback monospace. App-wide and older than this feature.
   - Outside this feature: "The {name} family" doubling, the "this week" heading, Home's older error voice, the app-wide document title, and the global `scroll-padding` rule.
   - The canon gives white on `brand.primary` as "~3.26:1". It computes to 3.66:1. The verdict (fails 4.5:1) is the same; I will correct the figure at the next change to that file.

Nothing in `### Visual`, `### Microcopy` or `### Accessibility` blocks a human review.

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
