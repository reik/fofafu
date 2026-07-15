-- Fix for Supabase Security Advisor finding `sensitive_columns_exposed`.
--
-- Root cause: every "publicly readable" RLS policy created in
-- 20260711010000_auth_trigger_and_rls.sql / 20260713030000_repair_schema_drift.sql
-- uses `FOR SELECT USING (true)` with no `TO` clause. A CREATE POLICY with no
-- `TO` clause applies to role PUBLIC, which in Supabase's PostgREST setup
-- includes BOTH `anon` (unauthenticated, callable with only the public anon
-- key) and `authenticated`. "Publicly readable" was intended to mean
-- "readable by any logged-in community member" (per that migration's own
-- comment: "Reads are broadly public within the app"), but as written it
-- actually means "readable by anyone on the internet with no session at
-- all", including the row's underlying columns.
--
-- The table most affected is `families`: it carries genuine PII about a
-- vulnerable population -- kid_count (number/presence of foster children in
-- a home), city/state (a family's approximate physical location), bio, and
-- avatar_url -- and was fully queryable by the `anon` role with zero
-- restriction. That matches the advisory's description exactly: "a table
-- with sensitive columns is reachable through the PostgREST API with no
-- access restriction."
--
-- No password/token/secret column exists anywhere in the `public` schema --
-- Supabase Auth owns credentials in `auth.users`, which PostgREST does not
-- expose by default and this repo's migrations never grant access to. So
-- the "exclude secret columns from the anon API surface" acceptance
-- criterion is already satisfied structurally; nothing to do there. The
-- remaining gap is anon-role access to PII-bearing columns on the
-- publicly-readable app tables, fixed below by re-scoping every
-- `USING (true)` SELECT policy to `TO authenticated` and revoking the
-- table-level SELECT grant Supabase auto-issues to `anon` on public tables.
--
-- We cannot re-run the live Security Advisor in this sandbox to confirm
-- which single table it flagged by name, so this migration takes a
-- defense-in-depth pass across every table that currently grants anon-role
-- SELECT via a blanket `USING (true)` policy: families, announcements,
-- comments, reactions, availability_slots. (messages, playdate_requests,
-- coach_events already scope SELECT to the auth.uid()-derived owner, so
-- they were never anon-readable and are left as-is aside from the
-- belt-and-suspenders REVOKE below.) See the Open Questions section of
-- fofafu_vault/features/supabase-rls-sensitive-columns.md for the human
-- follow-up needed to confirm the exact flagged table via a live
-- dashboard/CLI run.

-- families: kid_count/city/state/bio/avatar_url are PII about foster
-- families and children. Restrict reads to authenticated app users only.
DROP POLICY IF EXISTS "families are publicly readable" ON families;
CREATE POLICY "families are readable by authenticated users" ON families
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON families FROM anon;

-- announcements: community feed content is meant for logged-in members,
-- not the open internet.
DROP POLICY IF EXISTS "announcements are publicly readable" ON announcements;
CREATE POLICY "announcements are readable by authenticated users" ON announcements
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON announcements FROM anon;

-- comments: same reasoning as announcements; comment content can itself
-- reference personal/family details.
DROP POLICY IF EXISTS "comments are publicly readable" ON comments;
CREATE POLICY "comments are readable by authenticated users" ON comments
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON comments FROM anon;

-- reactions: reveals which authenticated user reacted to which
-- announcement (an identity/behavior signal) -- same reasoning as above.
DROP POLICY IF EXISTS "reactions are publicly readable" ON reactions;
CREATE POLICY "reactions are readable by authenticated users" ON reactions
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON reactions FROM anon;

-- availability_slots: keyed to a specific family_id; the note field is
-- free text and the whole row indicates when a specific foster family's
-- home is free/busy, which is a safety-relevant signal that should stay
-- inside the authenticated community, not exposed to anon.
DROP POLICY IF EXISTS "availability slots are publicly readable" ON availability_slots;
CREATE POLICY "availability slots are readable by authenticated users" ON availability_slots
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON availability_slots FROM anon;

-- Defense-in-depth: messages / playdate_requests / coach_events already
-- restrict SELECT via auth.uid()-scoped policies (never anon-readable),
-- but explicitly revoke the table-level anon SELECT grant too so a future
-- policy change can't silently reopen anon access by omitting `TO`.
REVOKE SELECT ON messages FROM anon;
REVOKE SELECT ON playdate_requests FROM anon;
REVOKE SELECT ON coach_events FROM anon;
