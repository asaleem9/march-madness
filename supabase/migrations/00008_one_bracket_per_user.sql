-- "One bracket per user" was only enforced in the API (brackets/route.ts). The
-- RLS INSERT policy checks only ownership, so a direct anon-client insert could
-- create multiple brackets → duplicate leaderboard rows. Enforce it in the DB.
--
-- If existing data already violates this (shouldn't pre-launch), the index
-- creation will fail — dedupe first, then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS brackets_one_per_user
  ON brackets (user_id);
