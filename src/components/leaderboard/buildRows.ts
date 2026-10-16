import type { AchievementType, Round, ScoringMultipliers } from "@/types";
import { ACHIEVEMENT_ORDER } from "@/lib/achievements";
import { buildLeaderboard, maxPossiblePoints } from "@/lib/scoring";

/** Pure assembly of leaderboard rows from raw query results. No I/O. */

export interface BracketRowInput {
  id: string;
  user_id: string;
  name: string | null;
  score: number | null;
  profiles: { id: string; display_name: string | null; avatar_url: string | null } | null;
}

export interface PickRowInput {
  bracket_id: string;
  game_slot: number;
  picked_team_id: number;
  points_earned: number | null;
  is_correct: boolean | null;
}

export interface GameRowInput {
  game_slot: number;
  round: Round | string;
  status: string;
  winner_id: number | null;
}

export interface TeamRowInput {
  id: number;
  name: string;
  abbreviation: string;
  logo_url: string | null;
  eliminated: boolean | null;
}

export interface ChampionPick {
  teamId: number;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
  /** The picked team has lost. */
  eliminated: boolean;
  /** The picked team actually won the title. */
  isChampion: boolean;
}

export interface LeaderboardRow {
  rank: number;
  bracketId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  /** Picks marked correct so far. */
  correctPicks: number;
  /** Picks whose game has been decided (is_correct is set). */
  decidedPicks: number;
  totalPicks: number;
  maxPossible: number;
  badges: AchievementType[];
  champion: ChampionPick | null;
}

export function buildRows(input: {
  brackets: BracketRowInput[];
  picks: PickRowInput[];
  games: GameRowInput[];
  teams: TeamRowInput[];
  achievements: { user_id: string; achievement_type: string }[];
  multipliers: ScoringMultipliers;
}): LeaderboardRow[] {
  const { brackets, picks, games, teams, achievements, multipliers } = input;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const eliminated = new Set(teams.filter((t) => t.eliminated).map((t) => t.id));
  const championshipGame = games.find((g) => g.round === "championship") ?? null;
  const championId =
    championshipGame?.status === "final" ? championshipGame.winner_id : null;

  const picksByBracket = new Map<string, PickRowInput[]>();
  for (const p of picks) {
    const list = picksByBracket.get(p.bracket_id);
    if (list) list.push(p);
    else picksByBracket.set(p.bracket_id, [p]);
  }

  const badgesByUser = new Map<string, AchievementType[]>();
  for (const a of achievements) {
    const list = badgesByUser.get(a.user_id) ?? [];
    list.push(a.achievement_type as AchievementType);
    badgesByUser.set(a.user_id, list);
  }

  const scoringGames = games.map((g) => ({
    gameSlot: g.game_slot,
    round: g.round as Round,
    status: g.status as "scheduled" | "in_progress" | "final",
    winnerId: g.winner_id,
  }));

  const ranked = buildLeaderboard(
    brackets.map((b) => {
      const bp = picksByBracket.get(b.id) ?? [];
      return {
        userId: b.user_id,
        displayName: b.profiles?.display_name?.trim() || "Anonymous",
        avatarUrl: b.profiles?.avatar_url ?? null,
        bracketId: b.id,
        bracketName: b.name ?? "",
        score: b.score ?? 0,
        correctPicks: bp.filter((p) => p.is_correct === true).length,
        totalPicks: bp.length,
      };
    })
  );

  return ranked.map((entry) => {
    const bp = picksByBracket.get(entry.bracketId) ?? [];
    const decidedPicks = bp.filter((p) => p.is_correct !== null).length;

    const maxPossible = maxPossiblePoints(
      bp.map((p) => ({
        gameSlot: p.game_slot,
        pickedTeamId: p.picked_team_id,
        pointsEarned: p.points_earned,
        isCorrect: p.is_correct,
      })),
      scoringGames,
      eliminated,
      multipliers
    );

    let champion: ChampionPick | null = null;
    if (championshipGame) {
      const pick = bp.find((p) => p.game_slot === championshipGame.game_slot);
      const team = pick ? teamById.get(pick.picked_team_id) : undefined;
      if (pick && team) {
        champion = {
          teamId: team.id,
          name: team.name,
          abbreviation: team.abbreviation,
          logoUrl: team.logo_url,
          eliminated: eliminated.has(team.id) && championId !== team.id,
          isChampion: championId === team.id,
        };
      }
    }

    const badges = (badgesByUser.get(entry.userId) ?? [])
      .filter((b, i, arr) => arr.indexOf(b) === i)
      .sort((a, b) => ACHIEVEMENT_ORDER.indexOf(a) - ACHIEVEMENT_ORDER.indexOf(b));

    return {
      rank: entry.rank,
      bracketId: entry.bracketId,
      userId: entry.userId,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      score: entry.score,
      correctPicks: entry.correctPicks,
      decidedPicks,
      totalPicks: entry.totalPicks,
      maxPossible,
      badges,
      champion,
    };
  });
}
