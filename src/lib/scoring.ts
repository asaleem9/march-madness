import type { Round, ScoringMultipliers } from "@/types";
import { getRoundPoints, isUpset, DEFAULT_SCORING } from "./utils";

interface PickResult {
  round: Round;
  isCorrect: boolean;
  pickedTeamSeed: number;
  opponentSeed: number;
}

export function calculatePickPoints(
  pick: PickResult,
  multipliers: ScoringMultipliers = DEFAULT_SCORING
): number {
  if (!pick.isCorrect) return 0;

  const basePoints = getRoundPoints(pick.round, multipliers);

  // 1.5x multiplier for correctly picking upsets
  if (isUpset(pick.pickedTeamSeed, pick.opponentSeed)) {
    return Math.round(basePoints * 1.5);
  }

  return basePoints;
}

export function calculateBracketScore(
  picks: PickResult[],
  multipliers: ScoringMultipliers = DEFAULT_SCORING
): number {
  return picks.reduce(
    (total, pick) => total + calculatePickPoints(pick, multipliers),
    0
  );
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bracketId: string;
  bracketName: string;
  score: number;
  correctPicks: number;
  totalPicks: number;
  rank: number;
}

export function buildLeaderboard(
  entries: Omit<LeaderboardEntry, "rank">[]
): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);

  return sorted.map((entry, index) => ({
    ...entry,
    rank:
      index > 0 && sorted[index - 1].score === entry.score
        ? sorted
            .slice(0, index)
            .findIndex((e) => e.score === entry.score) + 1
        : index + 1,
  }));
}

export interface MaxPossibleGame {
  gameSlot: number;
  round: Round;
  status: "scheduled" | "in_progress" | "final";
  winnerId: number | null;
}

export interface MaxPossiblePick {
  gameSlot: number;
  pickedTeamId: number;
  pointsEarned: number | null;
  isCorrect: boolean | null;
}

/**
 * Points a bracket can still reach: everything already earned plus the base
 * points of every undecided pick whose team is still alive. Upset bonuses on
 * future games aren't counted (they're unknowable), so this is a floor on the
 * ceiling — good enough for "max possible" on the leaderboard.
 */
export function maxPossiblePoints(
  picks: MaxPossiblePick[],
  games: MaxPossibleGame[],
  eliminatedTeamIds: Set<number>,
  multipliers: ScoringMultipliers = DEFAULT_SCORING
): number {
  const gameBySlot = new Map(games.map((g) => [g.gameSlot, g]));
  let total = 0;
  for (const pick of picks) {
    const game = gameBySlot.get(pick.gameSlot);
    if (!game) continue;
    if (game.status === "final" && game.winnerId) {
      total += pick.pointsEarned ?? 0;
      continue;
    }
    if (eliminatedTeamIds.has(pick.pickedTeamId)) continue;
    total += getRoundPoints(game.round, multipliers);
  }
  return total;
}
