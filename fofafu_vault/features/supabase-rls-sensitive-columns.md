---
slug: supabase-rls-sensitive-columns
title: Supabase RLS Sensitive Columns
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: review                # drafting | speced | building | review | shipped | blocked | abandoned
priority: P0                  # P0 | P1 | P2
created: 2026-07-14
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Supabase RLS Sensitive Columns

## Problem

Supabase Security Advisor flagged `sensitive_columns_exposed`: a table with columns that likely contain sensitive data (e.g. passwords, personal identifiers) is reachable through the PostgREST API with no access restrictions. Any anon/API caller can currently read this data. Foster families' PII must not be publicly queryable — this is a P0 data-exposure risk, not a feature request.

## Acceptance criteria

- [ ] Identify the specific table(s)/column(s) the Supabase Security Advisor flagged (run the advisor/linter against the linked project `rlizubjugevyxsfzmpny`, or query `pg_tables` for tables with RLS disabled).
- [ ] Row Level Security (RLS) is enabled on the flagged table(s).
- [ ] Explicit RLS policies restrict SELECT (and other verbs as needed) to the intended audience — never a blanket `USING (true)` for sensitive columns.
- [ ] Any password/secret columns are excluded from the anon/authenticated API surface entirely (not just RLS-gated) — e.g. via a view that omits them, or column-level privileges.
- [ ] Migration is captured in `supabase/migrations/` so it's reproducible, not just applied ad hoc in the dashboard.
- [ ] Re-run Supabase Security Advisor and confirm `sensitive_columns_exposed` no longer fires.

## Out of scope

- Broader RLS policy design for tables unrelated to this advisory.
- Rotating any credentials that may have already been exposed (separate incident-response decision — flag to the user, don't do unilaterally).

## Open questions

- Which table did the advisor actually flag? (Not stated in the raw finding — needs to be looked up in the Supabase dashboard/advisor output before backend-dev can write the migration.)
- Was this table's data actually accessed by an unauthorized party while exposed, or is this a preventive fix? Determines whether this also needs an incident write-up.
- backend-dev (2026-07-14): could not confirm which single table/column the Security Advisor flagged — no advisor output is linked and this sandbox has no live Supabase CLI/dashboard access to re-run the linter. Shipped a defense-in-depth migration (`20260714000000_restrict_pii_to_authenticated.sql`) that restricts the `USING (true)` SELECT policies on `families`/`announcements`/`comments`/`reactions`/`availability_slots` to the `authenticated` role (previously anon-readable due to missing `TO` clause), on the theory that `families.kid_count`/`city`/`state` is the most plausible match for "sensitive columns" on this platform. A human should re-run the Security Advisor (or the introspection queries in QA's Test plan section) against the live project `rlizubjugevyxsfzmpny` after this migration is applied to (a) confirm `sensitive_columns_exposed` no longer fires, and (b) confirm this was in fact the flagged table — if not, the real flagged table is still unaddressed.

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend

**Investigation (static audit only — no live Advisor/dashboard access in this sandbox).**

Read all 6 pre-existing migrations in order:
`20260711000000_initial_schema.sql`, `20260711010000_auth_trigger_and_rls.sql`,
`20260711020000_family_location.sql`, `20260713000000_uploads_storage_bucket.sql`,
`20260713010000_fix_id_defaults.sql`, `20260713030000_repair_schema_drift.sql`.

Grepped every `CREATE TABLE` for password/token/secret/ssn/dob-shaped columns:
found none in the `public` schema. `email_tokens` and `password_reset_tokens`
were explicitly dropped (`20260713030000`) — Supabase Auth owns credentials in
`auth.users`, which PostgREST does not expose by default and nothing in this
repo grants access to it. So there is no literal `password_hash`-style column
sitting unprotected — the acceptance criterion "password/secret columns
excluded from the anon API surface" is already satisfied structurally.

Cross-referenced every `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` against
the tables: all 8 core tables (`families`, `announcements`, `comments`,
`reactions`, `messages`, `availability_slots`, `playdate_requests`,
`coach_events`) have RLS enabled with explicit policies — no table is fully
open. However, five of those policies —
`families`/`announcements`/`comments`/`reactions`/`availability_slots` —
use `FOR SELECT USING (true)` **with no `TO` clause**. In Postgres, a policy
with no `TO` clause applies to role `PUBLIC`, which under Supabase's default
PostgREST grants includes the `anon` role (unauthenticated callers using only
the public anon key), not just `authenticated`. The migration's own comment
says the intent was "Reads are broadly public **within the app**" — i.e.
readable by any logged-in community member — but as written it is readable
by anyone on the open internet with zero session, including `families.
kid_count`, `city`, `state`, `bio`, `avatar_url`. On a foster-family platform,
`kid_count` combined with approximate location (`city`/`state`) is PII about
a vulnerable population, not incidental app content. That is the closest
concrete match in this codebase to the advisory's description ("a table with
sensitive columns is reachable through the PostgREST API with no access
restriction") and is what this migration fixes.

**I cannot conclusively confirm this is the exact table the Security Advisor
flagged** — there is no advisor output linked in this feature file and no
live CLI/dashboard access in this sandbox to re-run the linter (see Open
Questions, both pre-existing and the bullet I've added below). Per the
dispatcher's instructions for this scenario, I did a defense-in-depth pass
instead of guessing a single table.

**Change (migration `supabase/migrations/20260714000000_restrict_pii_to_authenticated.sql`,
timestamped after all 6 existing migrations, idempotent via `DROP POLICY IF
EXISTS` before each `CREATE POLICY`):**

- Re-scoped the `USING (true)` SELECT policies on `families`, `announcements`,
  `comments`, `reactions`, `availability_slots` to `TO authenticated` (was:
  implicit `PUBLIC`/anon-inclusive). This preserves the intended in-app
  behavior (any logged-in member can read the community feed / family
  profiles / scheduling data) while closing off anonymous, unauthenticated
  reads of PII-bearing columns.
- Added `REVOKE SELECT ... FROM anon` on those same 5 tables as
  belt-and-suspenders against Supabase's default anon-SELECT grant on public
  tables (RLS policy scoping alone is the primary control; the REVOKE is
  defense-in-depth in case a future policy omits `TO`).
- Added the same `REVOKE SELECT ... FROM anon` on `messages`,
  `playdate_requests`, `coach_events` even though their existing policies
  already scope SELECT via `auth.uid()` (never anon-readable) — purely to
  make "anon has zero SELECT surface on any of these 8 tables" an explicit,
  auditable invariant rather than an implicit consequence of policy wording
  that a future change could silently break.
- Did NOT touch `storage.objects` (`uploads` bucket) — that bucket is
  documented (`20260713000000_uploads_storage_bucket.sql`) as intentionally
  public and faithful to the prior Express `express.static` behavior; out of
  scope per this feature's "Out of scope" section (no broader RLS redesign)
  and not sensitive (image URLs already served unauthenticated pre-migration).
- No new dependencies. No `backend/` application code touched (Phase-2
  Express/better-sqlite3 backend does not exist in this repo yet for this
  slug — this is Supabase-native SQL/RLS work only).

**Disagreement with QA's Test plan section (written concurrently in this same
pass):** QA's subsection models the pre-existing `USING (true)` policies as
"intentional design, not sensitive PII" and marks the feature FAIL on
completeness pending a backend-dev migration. I read the same evidence
differently — `families.kid_count`/`city`/`state` on a foster-care platform,
combined with the feature's own Problem statement ("Foster families' PII must
not be publicly queryable"), is exactly the kind of column the advisor's
`sensitive_columns_exposed` finding is about, and the missing `TO
authenticated` scoping is a real, fixable gap independent of whether it's the
literal table the Advisor flagged. Tech-lead should reconcile these two takes
against my migration file rather than treating QA's "nothing landed" framing
as still current.

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

**Method.** No live Supabase CLI/dashboard access in this sandbox, so the Security
Advisor cannot be re-run directly (acceptance criterion "Re-run Supabase Security
Advisor..." cannot be executed here). Verification is by static SQL introspection
of `supabase/migrations/*.sql`, modeling final RLS state per table, plus a
copy-pasteable query for a human/CI to run against the live project
(`rlizubjugevyxsfzmpny`) to close that criterion out.

**Migrations reviewed** (all 6 present as of this check; re-checked mid-task per
instructions — no 7th file landed from backend-dev):
`20260711000000_initial_schema.sql`, `20260711010000_auth_trigger_and_rls.sql`,
`20260711020000_family_location.sql`, `20260713000000_uploads_storage_bucket.sql`,
`20260713010000_fix_id_defaults.sql`, `20260713030000_repair_schema_drift.sql`.

**Modeled final RLS state (public schema):**

| Table | RLS enabled | SELECT policy | Notes |
|---|---|---|---|
| families | yes | `USING (true)` | intentionally public profile data (name/bio/city/state/avatar); no password/token columns present — credentials live in `auth.users`, owned by Supabase Auth, not exposed via PostgREST |
| announcements | yes | `USING (true)` | public feed content by design |
| comments | yes | `USING (true)` | public feed content by design |
| reactions | yes | `USING (true)` | public feed content by design |
| messages | yes | `sender_id = auth.uid() OR receiver_id = auth.uid()` | private; UPDATE column-restricted to `read` via REVOKE/GRANT |
| availability_slots | yes | `USING (true)` | public scheduling data by design |
| playdate_requests | yes | requester/owner family membership only | private; UPDATE column-restricted to `status` via REVOKE/GRANT |
| coach_events | yes | `auth.uid() = user_id` | private, no blanket policy |

No table in the current migration set has a password/secret/token column — those
fields (`password_hash`, `email_tokens`, `password_reset_tokens`) were dropped
in favor of Supabase Auth's `auth.users` (not itself exposed via PostgREST) per
`20260711000000`'s header comment and confirmed dropped again in
`20260713030000_repair_schema_drift.sql`. `families/announcements/comments/
reactions/availability_slots` use `USING (true)` for SELECT only, and that is a
deliberate design choice for public community-feed/profile content, not
sensitive PII — none of these columns are passwords/tokens/SSNs.

**FINDING — gap, not a pass:** As of this check, no new migration file from
backend-dev has landed in `supabase/migrations/` beyond the 6 listed above.
None of the existing 6 migrations reference a table/column that matches
`sensitive_columns_exposed` beyond what's modeled above. The feature's own
"Open questions" section says the flagged table/column was never identified
(no advisor output linked in the feature file). Without backend-dev's migration
identifying and fixing the specific flagged table, acceptance criteria 1
("Identify the specific table(s)/column(s)"), 5 ("Migration is captured"), and
6 ("Re-run Advisor and confirm clear") are **not yet satisfiable** from this
worktree's current state. If backend-dev's migration lands after this was
written, tech-lead/aggregator should re-run the introspection query below
against it before marking this criterion met — do not assume this Test plan
covers a migration that didn't exist at write time.

**Introspection query** (run against the live project via SQL editor or
`supabase db execute`/psql — substitutes for the Advisor since it's unavailable
here):

```sql
-- 1. Any public table with RLS disabled? (should return zero rows)
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT (
    SELECT relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = pg_tables.tablename AND n.nspname = 'public'
  );

-- 2. Any policy that is a blanket USING (true) on a table with a
--    password/token/secret-looking column? (should return zero rows)
SELECT p.schemaname, p.tablename, p.policyname, p.qual
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.qual = 'true'
  AND p.tablename IN (
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name ILIKE '%password%' OR column_name ILIKE '%token%'
           OR column_name ILIKE '%secret%' OR column_name ILIKE '%ssn%'
           OR column_name ILIKE '%credential%')
  );

-- 3. Any password/secret column still readable by anon/authenticated via
--    column privileges? (should return zero rows)
SELECT table_schema, table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type = 'SELECT'
  AND (column_name ILIKE '%password%' OR column_name ILIKE '%token%'
       OR column_name ILIKE '%secret%' OR column_name ILIKE '%credential%');

-- 4. Full RLS/policy inventory for manual review, all public tables.
SELECT c.relname AS table, c.relrowsecurity AS rls_enabled,
       p.policyname, p.cmd, p.qual, p.with_check
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname, p.policyname;
```

**Status: CONDITIONAL PASS on the migrations that exist; FAIL on completeness.**
Everything currently in `supabase/migrations/` is internally consistent (RLS on,
no blanket-true policies on sensitive data, column-level REVOKE/GRANT on
messages/playdate_requests) and would clear query 1-3 above if run today. But
the feature's core acceptance criteria — identifying and fixing the *specific*
table the Advisor actually flagged — are unaddressed pending backend-dev's
migration. Recommend tech-lead hold `status: review` until backend-dev's
subsection names the flagged table and a migration exists, then re-run query 4
above against it.

### Tech-lead reconciliation note (2026-07-14)

backend-dev and qa-engineer ran in parallel; qa-engineer's Test plan was written
before `supabase/migrations/20260714000000_restrict_pii_to_authenticated.sql`
landed, so its "FAIL on completeness / no migration exists" framing is now
stale — the migration exists and is reviewed below. Reconciling both takes
against the migration file directly:

- Confirmed the migration file re-scopes the `USING (true)` SELECT policies on
  `families`/`announcements`/`comments`/`reactions`/`availability_slots` to
  `TO authenticated` and adds `REVOKE SELECT ... FROM anon` on those 5 tables
  plus `messages`/`playdate_requests`/`coach_events` (belt-and-suspenders on
  tables that were never anon-readable to begin with). This directly answers
  qa-engineer's own introspection queries 1-4 in the affirmative once run
  against the live project.
- backend-dev's read (families.kid_count/city/state = PII on a foster-care
  platform, not incidental "public profile" content) is the correct call
  given this feature's own Problem statement ("Foster families' PII must not
  be publicly queryable") — qa-engineer's "intentional design, not sensitive
  PII" framing was reasonable given the pre-existing migrations' own comments
  ("Reads are broadly public within the app"), but that comment describes
  in-app-authenticated intent, not anon-open intent, so it doesn't contradict
  backend-dev's fix.
- Net: this is not a specialist disagreement that needs arbitration under
  the escalation charter (no backend↔frontend API-shape conflict) — it's a
  timing artifact of parallel execution. Backend and QA's evidence agree once
  read against the same migration file; only QA's summary sentence is stale.
- Two acceptance criteria remain genuinely open and are NOT closeable from
  this sandbox: (1) identifying the exact table the live Security Advisor
  flagged by name, and (6) re-running the Advisor to confirm the finding is
  cleared. Both require live Supabase dashboard/CLI access that does not
  exist here. backend-dev's defense-in-depth migration plus qa-engineer's
  copy-pasteable introspection queries (this file, Test plan, queries 1-4)
  give a human reviewer everything needed to close those two criteria after
  merge. This is a documented, accepted sandbox limitation, not a gap in the
  engineering work — flagged for the human review step, not buried.
- No frontend/E2E surface: this is Supabase-native SQL/RLS work with no
  `backend/` or `frontend/` application code touched, so frontend-dev and
  e2e-test-writer were correctly not spawned for this feature.

### E2E coverage
No E2E coverage — backend-only (Supabase SQL/RLS) change; no route, page, or
component was added or modified.

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
