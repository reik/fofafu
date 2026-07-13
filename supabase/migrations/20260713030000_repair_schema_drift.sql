-- Root-cause repair for widespread drift between the migration files in
-- this repo and what actually exists on the linked production project.
-- Evidence gathered via information_schema/pg_catalog before writing this:
--
--   * announcements/comments/reactions/coach_events/messages/
--     availability_slots/playdate_requests are still the legacy
--     pre-Supabase-Auth tables (text ids, FKs to a stray legacy
--     public.users table) — CREATE TABLE IF NOT EXISTS in
--     20260711000000_initial_schema.sql silently kept the old tables
--     instead of creating the new uuid-keyed ones described in that file.
--     All of them are empty (verified via count(*)), so they are safe to
--     drop and recreate rather than convert in place.
--   * families has real data (2 rows) and its user_id was already
--     correctly repointed to auth.users(id) uuid at some point, but its
--     own id column is still text (existing values are valid UUID
--     strings, so a straight type conversion is safe and lossless).
--   * RLS is disabled on every one of these tables (pg_class.relrowsecurity
--     = false) and pg_policies is empty — the ENABLE ROW LEVEL SECURITY /
--     CREATE POLICY statements in 20260711000000/20260711010000 never
--     actually took effect in production, despite migration history
--     marking both as applied.
--   * The on_auth_user_created trigger on auth.users does not exist
--     (handle_new_user() the function does exist), so new signups are not
--     getting a families row created automatically.
--
-- This migration brings production in line with what 20260711000000 +
-- 20260711010000 + 20260711020000 already describe as intended.

-- Legacy leftovers with no place in the current schema (Supabase Auth owns
-- credential/verification flows; see 20260711000000's header comment).
DROP TABLE IF EXISTS email_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;

-- Legacy empty tables: drop (before converting families.id below, since
-- availability_slots/playdate_requests hold text-typed FKs into families.id
-- that would block the type change) and recreate with the schema
-- 20260711000000_initial_schema.sql already describes.
DROP TABLE IF EXISTS playdate_requests CASCADE;
DROP TABLE IF EXISTS availability_slots CASCADE;
DROP TABLE IF EXISTS coach_events CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS reactions CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;

-- Stray legacy public.users table (empty, nothing left referencing it once
-- the tables above are dropped).
DROP TABLE IF EXISTS users CASCADE;

-- families.id: text -> uuid (data-preserving; existing values are already
-- valid UUID strings)
ALTER TABLE families ALTER COLUMN id TYPE uuid USING id::uuid;
ALTER TABLE families ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  media_url   text,
  media_type  text CHECK (media_type IN ('image', 'video') OR media_type IS NULL),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX idx_announcements_user    ON announcements(user_id);

CREATE TABLE comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_announcement ON comments(announcement_id, created_at);

CREATE TABLE reactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('like', 'love', 'hug', 'celebrate', 'support')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);
CREATE INDEX idx_reactions_announcement ON reactions(announcement_id);

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_sender   ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_pair     ON messages(sender_id, receiver_id, created_at);

CREATE TABLE availability_slots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date       date NOT NULL,
  start_time text NOT NULL,
  end_time   text NOT NULL,
  status     text NOT NULL CHECK (status IN ('free', 'busy')) DEFAULT 'free',
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_slots_family_date ON availability_slots(family_id, date);

CREATE TABLE playdate_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id             uuid NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
  requester_family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message             text,
  status              text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_requests_requester ON playdate_requests(requester_family_id);
CREATE INDEX idx_requests_owner     ON playdate_requests(owner_family_id);
CREATE INDEX idx_requests_slot      ON playdate_requests(slot_id);

CREATE TABLE coach_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verdict     text NOT NULL CHECK (verdict IN ('ok', 'suggest')),
  category    text,
  outcome     text NOT NULL CHECK (outcome IN ('shown', 'accepted', 'edited', 'dismissed', 'none')) DEFAULT 'none',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_events_user    ON coach_events(user_id, created_at);
CREATE INDEX idx_coach_events_created ON coach_events(created_at);

ALTER TABLE families            ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_events        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "families are publicly readable" ON families
  FOR SELECT USING (true);
CREATE POLICY "families are editable by their owner" ON families
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "announcements are publicly readable" ON announcements
  FOR SELECT USING (true);
CREATE POLICY "announcements are insertable by their author" ON announcements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "announcements are editable by their author" ON announcements
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "announcements are deletable by their author" ON announcements
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "comments are publicly readable" ON comments
  FOR SELECT USING (true);
CREATE POLICY "comments are insertable by their author" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments are editable by their author" ON comments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments are deletable by their author" ON comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "reactions are publicly readable" ON reactions
  FOR SELECT USING (true);
CREATE POLICY "reactions are insertable by their author" ON reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions are deletable by their author" ON reactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "messages are readable by sender or receiver" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages are insertable by the sender" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages are markable read by the receiver" ON messages
  FOR UPDATE USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
REVOKE UPDATE ON messages FROM authenticated;
GRANT UPDATE (read) ON messages TO authenticated;

CREATE POLICY "availability slots are publicly readable" ON availability_slots
  FOR SELECT USING (true);
CREATE POLICY "availability slots are writable by the owning family" ON availability_slots
  FOR ALL USING (
    family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  ) WITH CHECK (
    family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );

CREATE POLICY "playdate requests are readable by requester or owner family" ON playdate_requests
  FOR SELECT USING (
    requester_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
    OR owner_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );
CREATE POLICY "playdate requests are insertable by the requesting family" ON playdate_requests
  FOR INSERT WITH CHECK (
    requester_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );
CREATE POLICY "playdate requests are updatable by requester or owner family" ON playdate_requests
  FOR UPDATE USING (
    requester_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
    OR owner_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  )
  WITH CHECK (
    requester_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
    OR owner_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );
REVOKE UPDATE ON playdate_requests FROM authenticated;
GRANT UPDATE (status) ON playdate_requests TO authenticated;

CREATE POLICY "coach events are readable by their user" ON coach_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coach events are insertable by their user" ON coach_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Recreate the missing signup trigger (function already existed on the live
-- project; CREATE OR REPLACE here to guarantee it matches the
-- city/state-aware version from 20260711020000_family_location.sql).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.families (user_id, name, bio, city, state)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    '',
    COALESCE(NEW.raw_user_meta_data ->> 'city', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'state', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
