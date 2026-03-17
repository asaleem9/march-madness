-- Enums
CREATE TYPE region AS ENUM ('east', 'west', 'south', 'midwest');
CREATE TYPE round AS ENUM ('first_four', 'first_round', 'second_round', 'sweet_16', 'elite_eight', 'final_four', 'championship');
CREATE TYPE game_status AS ENUM ('scheduled', 'in_progress', 'final');
CREATE TYPE slot_position AS ENUM ('top', 'bottom');
CREATE TYPE wager_status AS ENUM ('pending', 'accepted', 'declined', 'resolved');
CREATE TYPE achievement_type AS ENUM ('cinderella', 'perfect_region', 'chalk_walk', 'bracket_genius', 'fortune_teller');
CREATE TYPE notification_type AS ENUM ('game_result', 'bracket_update', 'wager_request', 'wager_result');
CREATE TYPE notification_channel AS ENUM ('push', 'sms', 'email');
CREATE TYPE tournament_phase AS ENUM ('pre_tournament', 'first_four', 'first_round', 'second_round', 'sweet_16', 'elite_eight', 'final_four', 'championship', 'completed');

-- Tables
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT UNIQUE,
  avatar_url TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  notification_preferences JSONB DEFAULT '{"push": true, "sms": false, "email": false, "digest_only": false}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  seed INTEGER NOT NULL,
  region region NOT NULL,
  record TEXT,
  logo_url TEXT,
  eliminated BOOLEAN DEFAULT FALSE,
  espn_id TEXT
);
CREATE INDEX teams_region_seed_idx ON teams(region, seed);

CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  round round NOT NULL,
  region region,
  game_slot INTEGER NOT NULL UNIQUE,
  next_game_slot INTEGER,
  slot_position slot_position,
  team_a_id INTEGER REFERENCES teams(id),
  team_b_id INTEGER REFERENCES teams(id),
  winner_id INTEGER REFERENCES teams(id),
  score_a INTEGER,
  score_b INTEGER,
  scheduled_at TIMESTAMPTZ,
  status game_status NOT NULL DEFAULT 'scheduled',
  espn_game_id TEXT
);
CREATE INDEX games_status_idx ON games(status);
CREATE INDEX games_espn_game_id_idx ON games(espn_game_id);

CREATE TABLE brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT TRUE,
  score INTEGER DEFAULT 0,
  locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX brackets_user_id_idx ON brackets(user_id);

CREATE TABLE bracket_picks (
  id SERIAL PRIMARY KEY,
  bracket_id UUID NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
  game_slot INTEGER NOT NULL,
  round round NOT NULL,
  picked_team_id INTEGER NOT NULL REFERENCES teams(id),
  is_correct BOOLEAN,
  points_earned INTEGER DEFAULT 0,
  UNIQUE(bracket_id, game_slot)
);

CREATE TABLE wagers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID NOT NULL REFERENCES profiles(id),
  opponent_id UUID NOT NULL REFERENCES profiles(id),
  challenger_bracket_id UUID NOT NULL REFERENCES brackets(id),
  opponent_bracket_id UUID REFERENCES brackets(id),
  stakes TEXT NOT NULL,
  status wager_status NOT NULL DEFAULT 'pending',
  winner_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX wagers_challenger_id_idx ON wagers(challenger_id);
CREATE INDEX wagers_opponent_id_idx ON wagers(opponent_id);

CREATE TABLE user_achievements (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_type achievement_type NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_type)
);

CREATE TABLE notification_queue (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent BOOLEAN DEFAULT FALSE,
  batch_key TEXT
);
CREATE INDEX notification_queue_user_sent_batch_idx ON notification_queue(user_id, sent, batch_key);

CREATE TABLE notifications_log (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  channel notification_channel NOT NULL
);
CREATE INDEX notifications_log_user_sent_idx ON notifications_log(user_id, sent_at);

CREATE TABLE tournament_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  year INTEGER NOT NULL,
  bracket_lock_deadline TIMESTAMPTZ NOT NULL,
  wager_creation_deadline TIMESTAMPTZ NOT NULL,
  scoring_multipliers JSONB DEFAULT '{"first_round": 10, "second_round": 20, "sweet_16": 40, "elite_eight": 80, "final_four": 160, "championship": 320}',
  active_phase tournament_phase DEFAULT 'pre_tournament'
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wagers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_config ENABLE ROW LEVEL SECURITY;

-- Profiles: read all, update own
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Push subscriptions: own only
CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Teams: read all
CREATE POLICY "Teams are viewable by all authenticated users" ON teams
  FOR SELECT TO authenticated USING (true);

-- Games: read all
CREATE POLICY "Games are viewable by all authenticated users" ON games
  FOR SELECT TO authenticated USING (true);

-- Brackets: read all, write own (if not locked)
CREATE POLICY "Brackets are viewable by all authenticated users" ON brackets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create own brackets" ON brackets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own unlocked brackets" ON brackets
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    AND locked = false
    AND NOW() < (SELECT bracket_lock_deadline FROM tournament_config WHERE id = 1)
  );

-- Bracket picks: read all, write own (if bracket unlocked)
CREATE POLICY "Bracket picks are viewable by all authenticated users" ON bracket_picks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage picks for own unlocked brackets" ON bracket_picks
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM brackets
      WHERE brackets.id = bracket_picks.bracket_id
      AND brackets.user_id = auth.uid()
      AND brackets.locked = false
      AND NOW() < (SELECT bracket_lock_deadline FROM tournament_config WHERE id = 1)
    )
  );
CREATE POLICY "Users can update picks for own unlocked brackets" ON bracket_picks
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM brackets
      WHERE brackets.id = bracket_picks.bracket_id
      AND brackets.user_id = auth.uid()
      AND brackets.locked = false
    )
  );
CREATE POLICY "Users can delete picks for own unlocked brackets" ON bracket_picks
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM brackets
      WHERE brackets.id = bracket_picks.bracket_id
      AND brackets.user_id = auth.uid()
      AND brackets.locked = false
    )
  );

-- Wagers: see own, create as challenger, respond as opponent
CREATE POLICY "Users can see own wagers" ON wagers
  FOR SELECT TO authenticated USING (
    auth.uid() IN (challenger_id, opponent_id)
  );
CREATE POLICY "Users can create wagers as challenger" ON wagers
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = challenger_id
    AND NOW() < (SELECT wager_creation_deadline FROM tournament_config WHERE id = 1)
  );
CREATE POLICY "Opponents can respond to wagers" ON wagers
  FOR UPDATE TO authenticated USING (
    auth.uid() = opponent_id AND status = 'pending'
  );

-- User achievements: read all
CREATE POLICY "Achievements are viewable by all authenticated users" ON user_achievements
  FOR SELECT TO authenticated USING (true);

-- Notification queue: read own
CREATE POLICY "Users can see own notification queue" ON notification_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Notifications log: read own
CREATE POLICY "Users can see own notification log" ON notifications_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Tournament config: read all
CREATE POLICY "Config is viewable by all authenticated users" ON tournament_config
  FOR SELECT TO authenticated USING (true);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, timezone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'America/New_York'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime on games table
ALTER PUBLICATION supabase_realtime ADD TABLE games;
