import type { ScoringMultipliers, TournamentPhase } from "@/types";
import { DEFAULT_SCORING } from "./utils";
import type { FinalFourPairing } from "./tournament-structure";

/** Pure helpers over the single `tournament_config` row. No I/O — safe in tests and client code. */

export type { FinalFourPairing };

export interface TournamentConfigRow {
  id: number;
  year: number;
  bracket_lock_deadline: string;
  wager_creation_deadline: string;
  scoring_multipliers: ScoringMultipliers | null;
  active_phase: TournamentPhase | null;
  final_four_pairing: FinalFourPairing | null;
  last_score_update_at: string | null;
}

export function isPastDeadline(
  config: Pick<TournamentConfigRow, "bracket_lock_deadline"> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!config?.bracket_lock_deadline) return false;
  return now.getTime() > new Date(config.bracket_lock_deadline).getTime();
}

export function isPastWagerDeadline(
  config: Pick<TournamentConfigRow, "wager_creation_deadline"> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!config?.wager_creation_deadline) return false;
  return now.getTime() > new Date(config.wager_creation_deadline).getTime();
}

export function getScoringMultipliers(
  config: Pick<TournamentConfigRow, "scoring_multipliers"> | null | undefined
): ScoringMultipliers {
  const m = config?.scoring_multipliers;
  if (!m) return DEFAULT_SCORING;
  return { ...DEFAULT_SCORING, ...m };
}

/**
 * The phase the app should behave as if it's in. The stored `active_phase` is
 * set by hand, so derive the two states that matter from data: a decided
 * championship means "completed", and a passed lock deadline means the
 * tournament is underway even if nobody flipped the dropdown.
 */
export function getEffectivePhase(
  config: Pick<TournamentConfigRow, "active_phase" | "bracket_lock_deadline"> | null | undefined,
  hasChampion: boolean,
  now: Date = new Date()
): TournamentPhase {
  if (hasChampion) return "completed";
  const stored = config?.active_phase ?? "pre_tournament";
  if (stored === "pre_tournament" && isPastDeadline(config, now)) return "first_round";
  return stored;
}

export function isPreTournament(phase: TournamentPhase): boolean {
  return phase === "pre_tournament";
}

export function isTournamentOver(phase: TournamentPhase): boolean {
  return phase === "completed";
}
