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
