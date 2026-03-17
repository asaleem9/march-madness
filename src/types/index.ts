export type Region = "east" | "west" | "south" | "midwest";

export type Round =
  | "first_four"
  | "first_round"
  | "second_round"
  | "sweet_16"
  | "elite_eight"
  | "final_four"
  | "championship";

export type GameStatus = "scheduled" | "in_progress" | "final";

export type SlotPosition = "top" | "bottom";

export type WagerStatus = "pending" | "accepted" | "declined" | "resolved";

export type AchievementType =
  | "cinderella"
  | "perfect_region"
  | "chalk_walk"
  | "bracket_genius"
  | "fortune_teller";

export type NotificationType =
  | "game_result"
  | "bracket_update"
  | "wager_request"
  | "wager_result";

export type NotificationChannel = "push" | "sms" | "email";

export type TournamentPhase =
  | "pre_tournament"
  | "first_four"
  | "first_round"
  | "second_round"
  | "sweet_16"
  | "elite_eight"
  | "final_four"
  | "championship"
  | "completed";

export interface NotificationPreferences {
  push: boolean;
  sms: boolean;
  email: boolean;
  digest_only: boolean;
}

export interface ScoringMultipliers {
  first_round: number;
  second_round: number;
  sweet_16: number;
  elite_eight: number;
  final_four: number;
  championship: number;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface Team {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
  region: Region;
  record: string;
  logoUrl: string | null;
  eliminated: boolean;
  espnId: string | null;
}

export interface Game {
  id: number;
  round: Round;
  region: Region | null;
  gameSlot: number;
  nextGameSlot: number | null;
  slotPosition: SlotPosition | null;
  teamAId: number | null;
  teamBId: number | null;
  winnerId: number | null;
  scoreA: number | null;
  scoreB: number | null;
  scheduledAt: Date | null;
  status: GameStatus;
  espnGameId: string | null;
}

export interface BracketPick {
  id: number;
  bracketId: string;
  gameSlot: number;
  round: Round;
  pickedTeamId: number;
  isCorrect: boolean | null;
  pointsEarned: number;
}

export interface GameWithTeams extends Game {
  teamA: Team | null;
  teamB: Team | null;
  winner: Team | null;
}
