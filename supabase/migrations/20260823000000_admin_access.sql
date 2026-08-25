-- Admin access: fofafu_vault/features/admin-access.md
--
-- One trusted account (kurarei+5@gmail.com, confirmed registered in the live
-- project) can view and correct any user's data across every RLS-enabled
-- table, including reading/editing private DMs between two other users, for
-- support/moderation. No role column, no multi-admin support in v1 (explicit
-- product decision) -- is_admin() is a single hardcoded-email check.
--
-- Every admin mutation is expected to also write a row to admin_audit_log in
-- the same request (enforced at the Edge Function layer, not by a trigger
-- here -- see supabase/functions/admin/index.ts). This migration only builds
-- the RLS-level capability + the append-only log table itself.

-- ---------------------------------------------------------------------------
-- is_admin(): single source of truth for admin identity.
--
-- Looks up the CURRENT auth.users.email for the caller's auth.uid(), rather
-- than trusting the JWT's embedded `email` claim (auth.email()) -- a claim
-- can be stale until the token refreshes; querying auth.users gets the live
-- value. SECURITY DEFINER is required for that lookup: `authenticated` has
-- no direct SELECT grant on auth.users. search_path is pinned to '' and every
-- reference is schema-qualified so this can't be hijacked by a session-level
-- search_path change (standard SECURITY DEFINER hardening).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'kurarei+5@gmail.com'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin RLS policies: FOR ALL USING(is_admin()) WITH CHECK(is_admin()) on
-- every RLS-enabled table, so the admin's own session token -- not a
-- service-role key -- can read and write any row. Permissive policies OR
-- together per command, so these only ever ADD access on top of each
-- table's existing owner-scoped policies; they can't weaken them.
--
-- families / announcements / comments / reactions / availability_slots have
-- no column-level privilege restrictions narrower than their row policies,
-- so a plain FOR ALL policy is sufficient for full admin read/write.
-- ---------------------------------------------------------------------------
CREATE POLICY "admin has full access to families" ON families
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin has full access to announcements" ON announcements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin has full access to comments" ON comments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin has full access to reactions" ON reactions
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin has full access to availability_slots" ON availability_slots
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- messages: 20260711010000_auth_trigger_and_rls.sql deliberately restricted
-- the `authenticated` role to `GRANT UPDATE (read)` only, specifically so a
-- receiver's RLS-permitted UPDATE couldn't also rewrite sender_id/content.
-- Column privileges are role-wide, not row-scoped -- they apply regardless
-- of which RLS policy lets the row through. So the FOR ALL policy above,
-- alone, would NOT let the admin edit message content/sender/receiver via
-- their own session token: the column grant would block it before RLS is
-- even consulted, silently reducing "full edit access to DMs" to "can only
-- ever toggle read". Fix: restore the full column grant, then use a BEFORE
-- UPDATE trigger (which, unlike a GRANT, can call is_admin()) to keep
-- enforcing the original non-admin restriction for everyone except the
-- admin.
-- ---------------------------------------------------------------------------
CREATE POLICY "admin has full access to messages" ON messages
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

GRANT UPDATE ON messages TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_messages_non_admin_readonly_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the read column may be updated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_non_admin_readonly_columns ON messages;
CREATE TRIGGER messages_non_admin_readonly_columns
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_non_admin_readonly_columns();

-- ---------------------------------------------------------------------------
-- playdate_requests: same column-grant issue as messages
-- (GRANT UPDATE (status) only), same trigger-exception fix. While auditing
-- this, found the existing non-admin path already calls
-- `.update({ status, updated_at })` (supabase/functions/playdates/index.ts,
-- respondToRequest) -- one column beyond what was ever granted, which looks
-- like a pre-existing latent bug (a real accept/decline would get "
-- permission denied for column updated_at" today). Out of scope to fix as
-- its own feature, but the column grant this admin policy needs to widen
-- anyway incidentally covers `updated_at` too, so the trigger below allows
-- exactly the {status, updated_at} pair the existing app code already
-- relies on for non-admins, same as before plus a no-longer-broken column.
-- ---------------------------------------------------------------------------
CREATE POLICY "admin has full access to playdate_requests" ON playdate_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

GRANT UPDATE ON playdate_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_playdate_requests_non_admin_readonly_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.slot_id IS DISTINCT FROM OLD.slot_id
     OR NEW.requester_family_id IS DISTINCT FROM OLD.requester_family_id
     OR NEW.owner_family_id IS DISTINCT FROM OLD.owner_family_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the status and updated_at columns may be updated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playdate_requests_non_admin_readonly_columns ON playdate_requests;
CREATE TRIGGER playdate_requests_non_admin_readonly_columns
  BEFORE UPDATE ON playdate_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_playdate_requests_non_admin_readonly_columns();

-- ---------------------------------------------------------------------------
-- coach_events: per the feature's Open Questions, admin gets read-only
-- access here (aggregate-only analytics, no draft/rewrite text -- see
-- fofafu_vault/features/reply-coach-live.md) rather than the FOR ALL grant
-- every other table gets. No write policy for admin unless a concrete need
-- shows up later.
-- ---------------------------------------------------------------------------
CREATE POLICY "admin can read all coach_events" ON coach_events
  FOR SELECT USING (is_admin());

-- ---------------------------------------------------------------------------
-- admin_audit_log: append-only. Readable only by the admin; no UPDATE or
-- DELETE policy exists at all, matching this vault's own log convention --
-- with RLS enabled and zero policies for a command, that command is refused
-- for every role outright, so this can't be edited or purged even by the
-- admin's own session token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     text,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin   ON admin_audit_log(admin_user_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin audit log readable only by admin" ON admin_audit_log
  FOR SELECT USING (is_admin());
-- Also pins admin_user_id to the caller's own auth.uid(), not just is_admin()
-- -- harmless overlap today (single admin), but keeps the audit table's own
-- accountability enforced by the database, not just by writeAuditLog always
-- passing the caller's own id.
CREATE POLICY "admin audit log insertable only by admin" ON admin_audit_log
  FOR INSERT WITH CHECK (is_admin() AND admin_user_id = auth.uid());
