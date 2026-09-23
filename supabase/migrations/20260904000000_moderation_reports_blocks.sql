-- Moderation: report + block. fofafu_vault/features/moderation-report-block.md
--
-- Two new tables:
--   * reports -- one row per report submitted against an announcement,
--     comment, or DM. No reader exists yet (admin moderation queue is out of
--     scope for this feature -- "the data lands; reading it is a separate
--     feature"), so this migration only needs the row to land with the right
--     shape and stay readable by a *future* admin query built the same way
--     supabase/functions/admin/index.ts already reads every other table:
--     the caller's own forwarded-auth client, gated by is_admin() (defined
--     in 20260823000000_admin_access.sql, which this migration depends on
--     running first).
--   * blocks -- one row per (blocker family, blocked family) pair. Presence
--     of a row IS the block; block = insert, unblock = delete. No UPDATE
--     path is needed or granted beyond what FOR ALL incidentally allows.
--
-- Plus block-aware visibility for the three content tables named in the
-- acceptance criteria that key directly off an author's auth.uid()
-- (announcements, comments, messages) via RESTRICTIVE RLS policies -- see
-- the dedicated section below for why RESTRICTIVE (not another PERMISSIVE
-- policy) is required to actually narrow access, and why `families` itself
-- is deliberately NOT touched here (community/index.ts and search/index.ts
-- instead do query-level exclusion -- see those files' own comments).

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Fixed, small, and stable -- part of the feature's own contract (A), not
  -- a product-editable taxonomy, so a CHECK is appropriate here (unlike
  -- `category` below).
  target_type text NOT NULL CHECK (target_type IN ('announcement', 'comment', 'message')),
  target_id   uuid NOT NULL,
  -- Deliberately NOT a CHECK/ENUM: ux-writer owns the final category set and
  -- label wording (### Microcopy in the feature file). Validated instead in
  -- supabase/functions/moderation/index.ts against a small, clearly-named,
  -- freely-editable array (REPORT_CATEGORIES), so landing the final values
  -- is a one-line code change with no migration required.
  category    text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_target   ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- reporter_id is always server-derived from auth.uid() in the Edge Function
-- (never accepted from the request body -- contract A), but this WITH CHECK
-- enforces it at the database layer too, same defense-in-depth reasoning as
-- admin_audit_log's own insert policy.
CREATE POLICY "reports are insertable by their reporter" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Lets the reporter read back the row they just created (their own POST
-- response uses .insert(...).select("*").single(), which -- per Postgres
-- RLS semantics -- also needs a satisfied SELECT policy for the RETURNING
-- data, not just the INSERT's WITH CHECK). Does NOT let a reporter list or
-- browse other families' reports.
CREATE POLICY "reports are readable by their reporter" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- The "future admin/service-role query" contract (G): same shape as every
-- other admin-visible table in 20260823000000_admin_access.sql. No admin
-- queue reads this today, but nothing has to change here when one exists.
CREATE POLICY "admin has full access to reports" ON reports
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

REVOKE ALL ON reports FROM anon;

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  blocked_family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_family_id <> blocked_family_id),
  UNIQUE (blocker_family_id, blocked_family_id)
);

-- The UNIQUE constraint above self-indexes (blocker_family_id,
-- blocked_family_id) -- fast enough for every blocker-led lookup this
-- feature does (list my blocks, "have I blocked X", the RESTRICTIVE
-- policies below). blocked_family_id alone isn't covered by that composite
-- index; kept for ON DELETE CASCADE lookups when a family row is removed
-- and for any future admin "who has blocked family X" query.
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_family ON blocks(blocked_family_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- One-way and never surfaced to the blocked family (acceptance criterion:
-- "the blocked family is not notified") -- this is the ONLY policy granting
-- non-admin access to `blocks`, and it is scoped entirely to rows where the
-- caller IS the blocker. A blocked family has no policy path to read rows
-- where they are the blocked_family_id, so they can't discover who has
-- blocked them via this table either.
CREATE POLICY "blocks are manageable by the blocking family" ON blocks
  FOR ALL USING (
    blocker_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  ) WITH CHECK (
    blocker_family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
    AND blocked_family_id <> blocker_family_id
  );

CREATE POLICY "admin has full access to blocks" ON blocks
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

REVOKE ALL ON blocks FROM anon;

-- ---------------------------------------------------------------------------
-- Block-aware visibility for announcements / comments / messages.
--
-- A second PERMISSIVE policy can only ADD access (permissive policies for
-- the same command OR together) -- see 20260823000000_admin_access.sql's own
-- comment on exactly this point re: the admin FOR ALL policies. Actually
-- narrowing what the existing "readable by authenticated users" / "readable
-- by sender or receiver" policies already allow requires a RESTRICTIVE
-- policy instead: RESTRICTIVE policies AND against the OR'd set of
-- permissive ones, so the effective visible set becomes
-- (any permissive policy) AND (every restrictive policy). is_admin() is
-- checked first in each USING clause so admin visibility (moderation
-- support) is unaffected by any family's block list.
--
-- `families` is deliberately NOT given an equivalent policy here: v1's
-- unblock UX lives entirely on the previously-blocked family's own profile
-- page (no block-list screen -- see the feature file's Out of scope), which
-- requires the blocker to still be able to load that family's profile row
-- directly even after blocking them. RLS can't distinguish "the feed" from
-- "a direct profile fetch" -- both are just SELECT on `families` -- so
-- hiding the row here would also break the only way to unblock. Community
-- and search filter this at the query level instead (see community/index.ts
-- and search/index.ts).
--
-- Historical vs. future content: this repo's Open Questions section leaves
-- "should a block hide historical comments in already-read threads, or just
-- future ones" unresolved (unlike the DM question below, which WAS
-- resolved). There's also no per-user read-state for announcements/comments
-- to build a "future only" version against, the way messages.created_at +
-- blocks.created_at makes possible for DMs below. Given the AC's own
-- wording ("their announcements vanish from the feed / their comments
-- vanish from threads" -- no historical carve-out stated), this migration
-- hides BOTH historical and future announcements/comments uniformly. Flagged
-- explicitly in the ### Backend section as an assumption, not a resolved
-- product decision.
-- ---------------------------------------------------------------------------

CREATE POLICY "blocked authors' announcements are hidden from the blocking viewer" ON announcements
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    is_admin()
    OR NOT EXISTS (
      SELECT 1 FROM blocks b
      JOIN families blocker ON blocker.id = b.blocker_family_id
      JOIN families author  ON author.id  = b.blocked_family_id
      WHERE blocker.user_id = auth.uid()
        AND author.user_id  = announcements.user_id
    )
  );

CREATE POLICY "blocked authors' comments are hidden from the blocking viewer" ON comments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    is_admin()
    OR NOT EXISTS (
      SELECT 1 FROM blocks b
      JOIN families blocker ON blocker.id = b.blocker_family_id
      JOIN families author  ON author.id  = b.blocked_family_id
      WHERE blocker.user_id = auth.uid()
        AND author.user_id  = comments.user_id
    )
  );

-- messages: precisely implements the resolved Open Question (2026-07-08) --
-- "conversation history stays readable for the blocker (A); only new
-- messages from the blocked family (B) are prevented going forward; the
-- thread does not vanish from A's inbox" -- NOT the general AC bullet ("DMs
-- vanish from the threads list"), which that resolution explicitly
-- overrides for messages specifically.
--
-- `FOR ALL` (not just SELECT) so this also governs the "mark thread read"
-- UPDATE in message/index.ts: without it, A's bulk
-- `.update({read:true}).eq("sender_id", partnerId)` would silently flip
-- `read` to true on a message A can't even see via any GET, which a later
-- SELECT of that same row from B's OWN side (B viewing their own sent
-- messages) would then surface as "read: true" -- a signal leak that A saw
-- something they, per this feature, never actually received. `auth.uid() <>
-- receiver_id` makes this a no-op for INSERT (the sender is never the
-- row's receiver_id, so a blocked sender's own send always passes this
-- check regardless of the block -- see message/index.ts's own comment for
-- why the send path needs zero code changes as a result) and for the
-- sender's own read of their sent messages.
CREATE POLICY "messages sent after a block are hidden from the blocking receiver" ON messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    is_admin()
    OR auth.uid() <> receiver_id
    OR NOT EXISTS (
      SELECT 1 FROM blocks b
      JOIN families blocker ON blocker.id = b.blocker_family_id
      JOIN families sndr    ON sndr.id    = b.blocked_family_id
      WHERE blocker.user_id = messages.receiver_id
        AND sndr.user_id    = messages.sender_id
        AND b.created_at   <= messages.created_at
    )
  );
