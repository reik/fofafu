-- announcements, comments, and reactions were created with id uuid PRIMARY KEY
-- DEFAULT gen_random_uuid() in the initial schema migration, but the live
-- table's id column ended up with no default (confirmed via
-- information_schema.columns: column_default was null for all three, while
-- families.id correctly had gen_random_uuid()). Restores the intended default
-- so inserts that omit id (as the announcement Edge Function does) succeed.
ALTER TABLE announcements ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE comments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE reactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
