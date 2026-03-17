import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  serial,
  timestamp,
  jsonb,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const regionEnum = pgEnum("region", [
  "east",
  "west",
  "south",
  "midwest",
]);

export const roundEnum = pgEnum("round", [
  "first_four",
  "first_round",
  "second_round",
  "sweet_16",
  "elite_eight",
  "final_four",
  "championship",
]);

export const gameStatusEnum = pgEnum("game_status", [
  "scheduled",
  "in_progress",
  "final",
]);

export const slotPositionEnum = pgEnum("slot_position", ["top", "bottom"]);

export const wagerStatusEnum = pgEnum("wager_status", [
  "pending",
  "accepted",
  "declined",
  "resolved",
]);

export const achievementTypeEnum = pgEnum("achievement_type", [
  "cinderella",
  "perfect_region",
  "chalk_walk",
  "bracket_genius",
  "fortune_teller",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "game_result",
  "bracket_update",
  "wager_request",
  "wager_result",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "push",
  "sms",
  "email",
]);

export const tournamentPhaseEnum = pgEnum("tournament_phase", [
  "pre_tournament",
  "first_four",
  "first_round",
  "second_round",
  "sweet_16",
  "elite_eight",
  "final_four",
  "championship",
  "completed",
]);

// Tables
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").unique(),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  timezone: text("timezone").default("America/New_York"),
  notificationPreferences: jsonb("notification_preferences")
    .$type<{
      push: boolean;
      sms: boolean;
      email: boolean;
      digest_only: boolean;
    }>()
    .default({ push: true, sms: false, email: false, digest_only: false }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => profiles.id)
    .unique()
    .notNull(),
  endpoint: text("endpoint").notNull(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    abbreviation: text("abbreviation").notNull(),
    seed: integer("seed").notNull(),
    region: regionEnum("region").notNull(),
    record: text("record"),
    logoUrl: text("logo_url"),
    eliminated: boolean("eliminated").default(false),
    espnId: text("espn_id"),
  },
  (table) => [index("teams_region_seed_idx").on(table.region, table.seed)]
);

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    round: roundEnum("round").notNull(),
    region: regionEnum("region"),
    gameSlot: integer("game_slot").notNull().unique(),
    nextGameSlot: integer("next_game_slot"),
    slotPosition: slotPositionEnum("slot_position"),
    teamAId: integer("team_a_id").references(() => teams.id),
    teamBId: integer("team_b_id").references(() => teams.id),
    winnerId: integer("winner_id").references(() => teams.id),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    status: gameStatusEnum("status").default("scheduled").notNull(),
    espnGameId: text("espn_game_id"),
  },
  (table) => [
    index("games_status_idx").on(table.status),
    index("games_espn_game_id_idx").on(table.espnGameId),
  ]
);

export const brackets = pgTable(
  "brackets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => profiles.id)
      .notNull(),
    name: text("name").notNull(),
    isPrimary: boolean("is_primary").default(true),
    score: integer("score").default(0),
    locked: boolean("locked").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("brackets_user_id_idx").on(table.userId)]
);

export const bracketPicks = pgTable(
  "bracket_picks",
  {
    id: serial("id").primaryKey(),
    bracketId: uuid("bracket_id")
      .references(() => brackets.id)
      .notNull(),
    gameSlot: integer("game_slot").notNull(),
    round: roundEnum("round").notNull(),
    pickedTeamId: integer("picked_team_id")
      .references(() => teams.id)
      .notNull(),
    isCorrect: boolean("is_correct"),
    pointsEarned: integer("points_earned").default(0),
  },
  (table) => [
    unique("bracket_picks_bracket_game_unique").on(
      table.bracketId,
      table.gameSlot
    ),
  ]
);

export const wagers = pgTable(
  "wagers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengerId: uuid("challenger_id")
      .references(() => profiles.id)
      .notNull(),
    opponentId: uuid("opponent_id")
      .references(() => profiles.id)
      .notNull(),
    challengerBracketId: uuid("challenger_bracket_id")
      .references(() => brackets.id)
      .notNull(),
    opponentBracketId: uuid("opponent_bracket_id").references(
      () => brackets.id
    ),
    stakes: text("stakes").notNull(),
    status: wagerStatusEnum("status").default("pending").notNull(),
    winnerId: uuid("winner_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("wagers_challenger_id_idx").on(table.challengerId),
    index("wagers_opponent_id_idx").on(table.opponentId),
  ]
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => profiles.id)
      .notNull(),
    achievementType: achievementTypeEnum("achievement_type").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("user_achievements_unique").on(table.userId, table.achievementType),
  ]
);

export const notificationQueue = pgTable(
  "notification_queue",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => profiles.id)
      .notNull(),
    type: notificationTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    sent: boolean("sent").default(false),
    batchKey: text("batch_key"),
  },
  (table) => [
    index("notification_queue_user_sent_batch_idx").on(
      table.userId,
      table.sent,
      table.batchKey
    ),
  ]
);

export const notificationsLog = pgTable(
  "notifications_log",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => profiles.id)
      .notNull(),
    message: text("message").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
    channel: notificationChannelEnum("channel").notNull(),
  },
  (table) => [
    index("notifications_log_user_sent_idx").on(table.userId, table.sentAt),
  ]
);

export const tournamentConfig = pgTable("tournament_config", {
  id: integer("id").primaryKey().default(1),
  year: integer("year").notNull(),
  bracketLockDeadline: timestamp("bracket_lock_deadline", {
    withTimezone: true,
  }).notNull(),
  wagerCreationDeadline: timestamp("wager_creation_deadline", {
    withTimezone: true,
  }).notNull(),
  scoringMultipliers: jsonb("scoring_multipliers")
    .$type<{
      first_round: number;
      second_round: number;
      sweet_16: number;
      elite_eight: number;
      final_four: number;
      championship: number;
    }>()
    .default({
      first_round: 10,
      second_round: 20,
      sweet_16: 40,
      elite_eight: 80,
      final_four: 160,
      championship: 320,
    }),
  activePhase: tournamentPhaseEnum("active_phase").default("pre_tournament"),
});
