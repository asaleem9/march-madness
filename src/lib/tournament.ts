import "server-only";
import { cache } from "react";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { games, teams, tournamentConfig } from "@/db/schema";
import type { Team } from "@/types";
import {
  getEffectivePhase,
  getSeasonInfo,
  type SeasonInfo,
  type TournamentConfigRow,
} from "./tournament-config";
import type { TournamentPhase } from "@/types";

export * from "./tournament-config";

/** The config row as the pure helpers expect it: snake_case with ISO-string timestamps. */
export function toTournamentConfigRow(
  row: typeof tournamentConfig.$inferSelect
): TournamentConfigRow {
  return {
    id: row.id,
    year: row.year,
    bracket_lock_deadline: row.bracketLockDeadline.toISOString(),
    wager_creation_deadline: row.wagerCreationDeadline.toISOString(),
    scoring_multipliers: row.scoringMultipliers ?? null,
    active_phase: row.activePhase ?? null,
    final_four_pairing: (row.finalFourPairing as TournamentConfigRow["final_four_pairing"]) ?? null,
    last_score_update_at: row.lastScoreUpdateAt ? row.lastScoreUpdateAt.toISOString() : null,
  };
}

/** Per-request cached read of the config row. Public pages render it too, so no auth is involved. */
export const getTournamentConfig = cache(
  async (): Promise<TournamentConfigRow | null> => {
    const row = await db.query.tournamentConfig.findFirst({
      where: eq(tournamentConfig.id, 1),
    });
    return row ? toTournamentConfigRow(row) : null;
  }
);

export interface ChampionInfo {
  winner: Team;
  runnerUp: Team | null;
  winnerScore: number | null;
  loserScore: number | null;
}

function toTeam(row: typeof teams.$inferSelect | null): Team | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    seed: row.seed,
    region: row.region,
    record: row.record ?? null,
    logoUrl: row.logoUrl ?? null,
    eliminated: !!row.eliminated,
    espnId: row.espnId ?? null,
  };
}

/** The decided national champion, or null while the title game is unplayed. */
export const getChampion = cache(async (): Promise<ChampionInfo | null> => {
  const game = await db.query.games.findFirst({
    where: and(
      eq(games.round, "championship"),
      eq(games.status, "final"),
      isNotNull(games.winnerId)
    ),
    with: { teamA: true, teamB: true },
  });

  if (!game) return null;
  const teamA = toTeam(game.teamA);
  const teamB = toTeam(game.teamB);
  const winnerIsA = game.winnerId === game.teamAId;
  const winner = winnerIsA ? teamA : teamB;
  if (!winner) return null;
  return {
    winner,
    runnerUp: winnerIsA ? teamB : teamA,
    winnerScore: winnerIsA ? game.scoreA : game.scoreB,
    loserScore: winnerIsA ? game.scoreB : game.scoreA,
  };
});

export interface Season extends SeasonInfo {
  config: TournamentConfigRow | null;
  champion: ChampionInfo | null;
  phase: TournamentPhase;
}

/** Config + champion + effective phase + season branding in one per-request cached read. */
export const getSeason = cache(async (): Promise<Season> => {
  const [config, champion] = await Promise.all([getTournamentConfig(), getChampion()]);
  const phase = getEffectivePhase(config, !!champion);
  return { config, champion, phase, ...getSeasonInfo(config, phase) };
});
