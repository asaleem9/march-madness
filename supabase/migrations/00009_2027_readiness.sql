-- 2027 readiness: ESPN import, admin-configurable Final Four pairing, cron
-- health stamp, live clock on games, and multi-device push subscriptions.

-- Teams are upserted by ESPN id when the bracket is imported.
CREATE UNIQUE INDEX IF NOT EXISTS teams_espn_id_unique ON teams (espn_id);

-- Which regions meet in each national semifinal (set from the official bracket
-- on Selection Sunday) and when the score cron last ran.
ALTER TABLE tournament_config
  ADD COLUMN IF NOT EXISTS final_four_pairing JSONB,
  ADD COLUMN IF NOT EXISTS last_score_update_at TIMESTAMPTZ;

-- Live game clock/period from ESPN for the schedule page.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS clock TEXT,
  ADD COLUMN IF NOT EXISTS period INTEGER;

-- One push subscription per *device*, not per user: enabling push on a laptop
-- used to silently replace the phone's subscription.
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);
