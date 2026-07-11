-- Postgres translation of backend/src/migrate.ts (sqlite).
-- Deliberate deltas from sqlite, see fofafu_vault/features/migrate-render-to-vercel-supabase.md:
--   * users.id switches from app-generated TEXT to Supabase Auth's auth.users.id (uuid);
--     this table becomes a profile row keyed 1:1 to auth.users, password/verified columns
--     drop out (Supabase Auth owns credentials + email verification).
--   * email_tokens / password_reset_tokens drop out entirely (Supabase Auth owns these flows).
--   * INTEGER 0/1 booleans -> boolean.
--   * TEXT timestamps -> timestamptz, defaulting to now().
--   * media_type / reaction type / playdate status CHECKs kept as-is (Postgres supports the
--     same CHECK (col IN (...)) syntax as sqlite).

CREATE TABLE IF NOT EXISTS families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  bio         text NOT NULL DEFAULT '',
  kid_count   integer,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_families_user ON families(user_id);

CREATE TABLE IF NOT EXISTS announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  media_url   text,
  media_type  text CHECK (media_type IN ('image', 'video') OR media_type IS NULL),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_user    ON announcements(user_id);

CREATE TABLE IF NOT EXISTS comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_announcement ON comments(announcement_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('like', 'love', 'hug', 'celebrate', 'support')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_announcement ON reactions(announcement_id);

CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_pair     ON messages(sender_id, receiver_id, created_at);

-- Availability slots, keyed to families(id) (matches the /family/:id surface).
CREATE TABLE IF NOT EXISTS availability_slots (
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

CREATE INDEX IF NOT EXISTS idx_slots_family_date ON availability_slots(family_id, date);

-- Playdate requests. Same family_id keying rationale as availability_slots.
CREATE TABLE IF NOT EXISTS playdate_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id             uuid NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
  requester_family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message             text,
  status              text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_requester ON playdate_requests(requester_family_id);
CREATE INDEX IF NOT EXISTS idx_requests_owner     ON playdate_requests(owner_family_id);
CREATE INDEX IF NOT EXISTS idx_requests_slot      ON playdate_requests(slot_id);

-- reply-coach-live: aggregate-only analytics for coach verdicts. NEVER add a
-- column here for draft/rewrite/reasoning text — see
-- fofafu_vault/features/reply-coach-live.md ## Out of scope.
CREATE TABLE IF NOT EXISTS coach_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verdict     text NOT NULL CHECK (verdict IN ('ok', 'suggest')),
  category    text,
  outcome     text NOT NULL CHECK (outcome IN ('shown', 'accepted', 'edited', 'dismissed', 'none')) DEFAULT 'none',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_events_user    ON coach_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coach_events_created ON coach_events(created_at);

-- Row Level Security: every table above is user-owned or references a
-- user-owned row. Enable RLS; policies are added in a follow-up migration
-- once the Edge Function auth pattern (service-role bypass vs. per-request
-- JWT) is settled in eng-infra-4/5/6, so these tables are locked down
-- (no policies = no access via anon/authenticated roles) until then.
ALTER TABLE families            ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_events        ENABLE ROW LEVEL SECURITY;
