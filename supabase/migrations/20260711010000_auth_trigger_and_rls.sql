-- eng-infra-4: auth replaces backend/src/controllers/auth.controller.ts + auth.routes.ts.
-- Supabase Auth (signUp/signInWithPassword/resetPasswordForEmail/updateUser) owns
-- credentials, hashing, email verification and password reset directly from the
-- frontend client — no Edge Function needed for the auth surface itself.
--
-- The one piece of custom register-time logic to preserve is auth.controller.ts's
-- transaction that also inserts a `families` row (id, user_id, name, bio) when a
-- user registers. That becomes a trigger on auth.users insert here, reading
-- `name` out of the signUp call's user metadata (frontend must pass
-- `options.data.name` to supabase.auth.signUp()).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.families (user_id, name, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    ''
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies, deferred from 20260711000000_initial_schema.sql pending this
-- auth pattern. Ownership model: a row's owner is whoever created it
-- (announcements/comments/reactions/coach_events: user_id = auth.uid();
-- messages: sender_id or receiver_id = auth.uid(); families: user_id =
-- auth.uid(); availability_slots/playdate_requests: owning family's user_id).
-- Reads are broadly public within the app (community feed, family profiles,
-- playdate slots) except messages and coach_events, which are private.

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
-- RLS alone can't stop the receiver from also rewriting sender_id/content on
-- that same UPDATE — restrict column-level grants so only `read` is writable
-- by app users; sender_id/content/created_at stay immutable regardless of
-- what the policy's WITH CHECK allows.
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
-- Same column-privilege reasoning as messages: requester/owner should only
-- ever flip `status` (accept/decline), never reassign requester_family_id or
-- owner_family_id to a third family.
REVOKE UPDATE ON playdate_requests FROM authenticated;
GRANT UPDATE (status) ON playdate_requests TO authenticated;

CREATE POLICY "coach events are readable by their user" ON coach_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coach events are insertable by their user" ON coach_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
