-- Block enforcement could be bypassed by a blocked sender backdating messages.created_at.
--
-- The "messages sent after a block are hidden from the blocking receiver" policy
-- (20260904000000_moderation_reports_blocks.sql) hides a message only when it was
-- sent after the block: `blocks.created_at <= messages.created_at`. The
-- `authenticated` role has table-wide INSERT, so a client can set created_at
-- explicitly. A blocked sender who backdates created_at to before the block
-- passes that check, and the blocker can read the message.
--
-- Force created_at server-side on INSERT for non-admin callers. Admins keep
-- the ability to set it, for support and backfill.
CREATE OR REPLACE FUNCTION public.force_messages_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_force_created_at ON messages;
CREATE TRIGGER messages_force_created_at
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION public.force_messages_created_at();
