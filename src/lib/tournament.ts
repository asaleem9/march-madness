import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Team } from "@/types";
import {
  getEffectivePhase,
  getSeasonInfo,
  type SeasonInfo,
  type TournamentConfigRow,
} from "./tournament-config";
import type { TournamentPhase } from "@/types";

export * from "./tournament-config";

/** Per-request cached read of the config row. Uses the admin client because public pages render it too. */
export const getTournamentConfig = cache(
  async (): Promise<TournamentConfigRow | null> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tournament_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return (data as TournamentConfigRow | null) ?? null;
  }
);

export interface ChampionInfo {
  winner: Team;
  runnerUp: Team | null;
  winnerScore: number | null;
  loserScore: number | null;
}

function toTeam(row: Record<string, unknown> | null): Team | null {
  if (!row) return null;
  return {
    id: row.id as number,
    name: row.name as string,
    abbreviation: row.abbreviation as string,
    seed: row.seed as number,
    region: row.region as Team["region"],
    record: (row.record as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    eliminated: !!row.eliminated,
    espnId: (row.espn_id as string | null) ?? null,
  };
}

/** The decided national champion, or null while the title game is unplayed. */
export const getChampion = cache(async (): Promise<ChampionInfo | null> => {
  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select(
      "winner_id, team_a_id, team_b_id, score_a, score_b, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)"
    )
    .eq("round", "championship")
    .eq("status", "final")
    .not("winner_id", "is", null)
    .maybeSingle();

  if (!game) return null;
  const teamA = toTeam(game.team_a as unknown as Record<string, unknown> | null);
  const teamB = toTeam(game.team_b as unknown as Record<string, unknown> | null);
  const winnerIsA = game.winner_id === game.team_a_id;
  const winner = winnerIsA ? teamA : teamB;
  if (!winner) return null;
  return {
    winner,
    runnerUp: winnerIsA ? teamB : teamA,
    winnerScore: winnerIsA ? game.score_a : game.score_b,
    loserScore: winnerIsA ? game.score_b : game.score_a,
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
