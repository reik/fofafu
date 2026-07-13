-- Fixes a gap left by dropping the sqlite `users` table in favor of
-- auth.users: search.controller.ts joined families to users.city/users.state,
-- but auth.users isn't queryable via PostgREST (not exposed by default).
-- Denormalize city/state onto families (the only public-facing profile
-- table) and populate them from signUp's user metadata via the trigger,
-- alongside the existing name-derived family row.

ALTER TABLE families ADD COLUMN IF NOT EXISTS city  text NOT NULL DEFAULT '';
ALTER TABLE families ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';

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
