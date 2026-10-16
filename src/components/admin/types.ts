import type { Region, TournamentPhase } from "@/types";
import type { FinalFourPairing } from "@/lib/tournament-structure";

export const PHASES: readonly TournamentPhase[] = [
  "pre_tournament",
  "first_four",
  "first_round",
  "second_round",
  "sweet_16",
  "elite_eight",
  "final_four",
  "championship",
  "completed",
];

/** Human label — the DB keeps `first_four` for the 12-game Opening Round. */
export function phaseLabel(phase: string): string {
  if (phase === "first_four") return "Opening Round";
  return phase.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const MULTIPLIER_KEYS = [
  "first_round",
  "second_round",
  "sweet_16",
  "elite_eight",
  "final_four",
  "championship",
] as const;
export type MultiplierKey = (typeof MULTIPLIER_KEYS)[number];
export type Multipliers = Record<MultiplierKey, number>;

export const DEFAULT_MULTIPLIERS: Multipliers = {
  first_round: 10,
  second_round: 20,
  sweet_16: 40,
  elite_eight: 80,
  final_four: 160,
  championship: 320,
};

/** Row returned by GET /api/admin/config. */
export interface AdminConfig {
  id: number;
  year: number;
  bracket_lock_deadline: string;
  wager_creation_deadline: string;
  active_phase: TournamentPhase;
  scoring_multipliers: Partial<Multipliers> | null;
  final_four_pairing: FinalFourPairing | null;
  last_score_update_at: string | null;
  /** Unsent notification_queue rows (service-role count). */
  queue_depth?: number | null;
}

export interface AdminTeam {
  id: number;
  name: string;
  seed: number;
}

/** Game row as read by the admin page (browser client, joined teams). */
export interface GameForAdmin {
  id: number;
  round: string;
  region: Region | null;
  game_slot: number;
  status: string;
  score_a: number | null;
  score_b: number | null;
  winner_id: number | null;
  espn_game_id: string | null;
  clock: string | null;
  period: number | null;
  team_a: AdminTeam | null;
  team_b: AdminTeam | null;
}

/** Parse `{ error }` from a failed admin API response without throwing on non-JSON bodies. */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (json && typeof json.error === "string" && json.error) return json.error;
  } catch {
    /* non-JSON body */
  }
  return `${fallback} (HTTP ${res.status})`;
}
