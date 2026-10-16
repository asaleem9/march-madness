// Pre-tournament national-title odds, approximated by seed line. These are
// rough historical title rates for a single team on that line, shown on bracket
// tiles as a hint while picking. Per-team hand tuning goes in
// TEAM_ODDS_OVERRIDES (keyed by ESPN team id) and is optional each year.

export const SEED_TITLE_ODDS: Record<number, number> = {
  1: 16,
  2: 6,
  3: 3,
  4: 2,
  5: 1.2,
  6: 1,
  7: 0.6,
  8: 0.5,
  9: 0.4,
  10: 0.4,
  11: 0.4,
  12: 0.2,
  13: 0.1,
  14: 0.1,
  15: 0.1,
  16: 0.1,
};

/** Optional per-team overrides, keyed by ESPN team id (teams.espn_id). */
export const TEAM_ODDS_OVERRIDES: Record<string, number> = {};

export function getWinProbability(team: {
  seed: number;
  espnId?: string | null;
}): number {
  if (team.espnId && TEAM_ODDS_OVERRIDES[team.espnId] != null) {
    return TEAM_ODDS_OVERRIDES[team.espnId];
  }
  return SEED_TITLE_ODDS[team.seed] ?? 0.1;
}

export function formatOdds(probability: number): string {
  if (probability >= 10) return `${Math.round(probability)}%`;
  if (probability >= 1) return `${probability.toFixed(1)}%`;
  return `${probability.toFixed(1)}%`;
}
