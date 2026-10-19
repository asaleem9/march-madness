CREATE TYPE "public"."achievement_type" AS ENUM('cinderella', 'perfect_region', 'chalk_walk', 'bracket_genius', 'fortune_teller');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'in_progress', 'final');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('game_result', 'bracket_update', 'wager_request', 'wager_result');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('east', 'west', 'south', 'midwest');--> statement-breakpoint
CREATE TYPE "public"."round" AS ENUM('first_four', 'first_round', 'second_round', 'sweet_16', 'elite_eight', 'final_four', 'championship');--> statement-breakpoint
CREATE TYPE "public"."slot_position" AS ENUM('top', 'bottom');--> statement-breakpoint
CREATE TYPE "public"."tournament_phase" AS ENUM('pre_tournament', 'first_four', 'first_round', 'second_round', 'sweet_16', 'elite_eight', 'final_four', 'championship', 'completed');--> statement-breakpoint
CREATE TYPE "public"."wager_status" AS ENUM('pending', 'accepted', 'declined', 'resolved');--> statement-breakpoint
CREATE TABLE "bracket_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"bracket_id" uuid NOT NULL,
	"game_slot" integer NOT NULL,
	"round" "round" NOT NULL,
	"picked_team_id" integer NOT NULL,
	"is_correct" boolean,
	"points_earned" integer DEFAULT 0,
	CONSTRAINT "bracket_picks_bracket_game_unique" UNIQUE("bracket_id","game_slot")
);
--> statement-breakpoint
CREATE TABLE "brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_primary" boolean DEFAULT true,
	"score" integer DEFAULT 0,
	"locked" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "email_waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"round" "round" NOT NULL,
	"region" "region",
	"game_slot" integer NOT NULL,
	"next_game_slot" integer,
	"slot_position" "slot_position",
	"team_a_id" integer,
	"team_b_id" integer,
	"winner_id" integer,
	"score_a" integer,
	"score_b" integer,
	"scheduled_at" timestamp with time zone,
	"status" "game_status" DEFAULT 'scheduled' NOT NULL,
	"espn_game_id" text,
	"clock" text,
	"period" integer,
	CONSTRAINT "games_game_slot_unique" UNIQUE("game_slot")
);
--> statement-breakpoint
CREATE TABLE "notification_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"sent" boolean DEFAULT false,
	"batch_key" text,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now(),
	"channel" "notification_channel" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"phone" text,
	"timezone" text DEFAULT 'America/New_York',
	"notification_preferences" jsonb DEFAULT '{"push":true,"sms":false,"email":false,"digest_only":false}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_display_name_unique" UNIQUE("display_name")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"seed" integer NOT NULL,
	"region" "region" NOT NULL,
	"record" text,
	"logo_url" text,
	"eliminated" boolean DEFAULT false,
	"espn_id" text
);
--> statement-breakpoint
CREATE TABLE "tournament_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"year" integer NOT NULL,
	"bracket_lock_deadline" timestamp with time zone NOT NULL,
	"wager_creation_deadline" timestamp with time zone NOT NULL,
	"scoring_multipliers" jsonb DEFAULT '{"first_round":10,"second_round":20,"sweet_16":40,"elite_eight":80,"final_four":160,"championship":320}'::jsonb,
	"active_phase" "tournament_phase" DEFAULT 'pre_tournament',
	"final_four_pairing" jsonb,
	"last_score_update_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_type" "achievement_type" NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_achievements_unique" UNIQUE("user_id","achievement_type")
);
--> statement-breakpoint
CREATE TABLE "wagers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"challenger_bracket_id" uuid NOT NULL,
	"opponent_bracket_id" uuid,
	"stakes" text NOT NULL,
	"status" "wager_status" DEFAULT 'pending' NOT NULL,
	"winner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bracket_picks" ADD CONSTRAINT "bracket_picks_bracket_id_brackets_id_fk" FOREIGN KEY ("bracket_id") REFERENCES "public"."brackets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bracket_picks" ADD CONSTRAINT "bracket_picks_picked_team_id_teams_id_fk" FOREIGN KEY ("picked_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brackets" ADD CONSTRAINT "brackets_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_team_a_id_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_team_b_id_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_teams_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_challenger_id_profiles_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_opponent_id_profiles_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_challenger_bracket_id_brackets_id_fk" FOREIGN KEY ("challenger_bracket_id") REFERENCES "public"."brackets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_opponent_bracket_id_brackets_id_fk" FOREIGN KEY ("opponent_bracket_id") REFERENCES "public"."brackets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_winner_id_profiles_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brackets_user_id_idx" ON "brackets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brackets_one_per_user" ON "brackets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_espn_game_id_idx" ON "games" USING btree ("espn_game_id");--> statement-breakpoint
CREATE INDEX "notification_queue_user_sent_batch_idx" ON "notification_queue" USING btree ("user_id","sent","batch_key");--> statement-breakpoint
CREATE INDEX "notifications_log_user_sent_idx" ON "notifications_log" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_region_seed_idx" ON "teams" USING btree ("region","seed");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_espn_id_unique" ON "teams" USING btree ("espn_id");--> statement-breakpoint
CREATE INDEX "wagers_challenger_id_idx" ON "wagers" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "wagers_opponent_id_idx" ON "wagers" USING btree ("opponent_id");