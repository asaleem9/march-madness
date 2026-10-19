import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { bracketPicks, brackets, games, userAchievements } from "@/db/schema";
import type { AchievementType } from "@/types";

export const ACHIEVEMENT_INFO: Record<
  AchievementType,
  { label: string; icon: string; description: string }
> = {
  fortune_teller: {
    label: "Fortune Teller",
    icon: "/images/badges/fortune-teller.png",
    description: "Picked the national champion.",
  },
  bracket_genius: {
    label: "Bracket Genius",
    icon: "/images/badges/bracket-genius.png",
    description: "Finished with the highest score in the pool.",
  },
  perfect_region: {
    label: "Perfect Region",
    icon: "/images/badges/perfect-region.png",
    description: "Got all 15 picks right in one region.",
  },
  cinderella: {
    label: "Cinderella Story",
    icon: "/images/badges/cinderella.png",
    description: "Correctly sent a 12 seed or worse to the Sweet 16.",
  },
  chalk_walk: {
    label: "Chalk Walk",
    icon: "/images/badges/chalk-walk.png",
    description: "Picked the better seed in every game and still finished in the top half.",
  },
};

export const ACHIEVEMENT_ORDER: AchievementType[] = [
  "bracket_genius",
  "fortune_teller",
  "perfect_region",
  "cinderella",
  "chalk_walk",
];

interface GameLite {
  gameSlot: number;
  round: string;
  region: string | null;
  status: string;
  winnerId: number | null;
  teamAId: number | null;
  teamBId: number | null;
  teamA: { seed: number } | null;
  teamB: { seed: number } | null;
}

interface PickLite {
  bracketId: string;
  gameSlot: number;
  round: string;
  pickedTeamId: number;
  isCorrect: boolean | null;
}

interface BracketLite {
  id: string;
  userId: string;
  score: number | null;
  locked: boolean | null;
}

/**
 * Pure evaluation of which badges each bracket earned. Exported for tests;
 * `awardAchievements` wraps it with the DB reads/writes.
 */
export function evaluateAchievements(
  brackets: BracketLite[],
  picks: PickLite[],
  games: GameLite[]
): Map<string, AchievementType[]> {
  const result = new Map<string, AchievementType[]>();
  const eligible = brackets.filter((b) => b.locked);
  if (eligible.length === 0) return result;

  const gameBySlot = new Map(games.map((g) => [g.gameSlot, g]));
  const championship = games.find((g) => g.round === "championship");
  const picksByBracket = new Map<string, PickLite[]>();
  for (const p of picks) {
    const list = picksByBracket.get(p.bracketId) ?? [];
    list.push(p);
    picksByBracket.set(p.bracketId, list);
  }

  const scores = eligible.map((b) => b.score ?? 0).sort((a, b) => a - b);
  const topScore = Math.max(...scores);
  const median = scores[Math.floor(scores.length / 2)];

  const regionSlots = new Map<string, number[]>();
  for (const g of games) {
    if (!g.region || g.round === "first_four") continue;
    const list = regionSlots.get(g.region) ?? [];
    list.push(g.gameSlot);
    regionSlots.set(g.region, list);
  }

  for (const b of eligible) {
    const earned: AchievementType[] = [];
    const myPicks = picksByBracket.get(b.id) ?? [];
    const pickBySlot = new Map(myPicks.map((p) => [p.gameSlot, p]));

    if ((b.score ?? 0) === topScore) earned.push("bracket_genius");

    if (championship?.winnerId) {
      const champPick = pickBySlot.get(championship.gameSlot);
      if (champPick?.pickedTeamId === championship.winnerId) earned.push("fortune_teller");
    }

    for (const slots of regionSlots.values()) {
      if (slots.length === 0) continue;
      const perfect = slots.every((s) => pickBySlot.get(s)?.isCorrect === true);
      if (perfect) {
        earned.push("perfect_region");
        break;
      }
    }

    // Cinderella: a correct Sweet 16 *appearance* — i.e. a correct second-round
    // pick of a team seeded 12 or worse.
    const cinderella = myPicks.some((p) => {
      if (p.round !== "second_round" || p.isCorrect !== true) return false;
      const g = gameBySlot.get(p.gameSlot);
      const seed = p.pickedTeamId === g?.teamAId ? g?.teamA?.seed : g?.teamB?.seed;
      return seed != null && seed >= 12;
    });
    if (cinderella) earned.push("cinderella");

    // Chalk walk: every pick was the better (lower-numbered) seed in its game,
    // judged against the teams that actually played, and the score is at least
    // the pool median.
    const allChalk =
      myPicks.length > 0 &&
      myPicks.every((p) => {
        const g = gameBySlot.get(p.gameSlot);
        if (!g || !g.teamA || !g.teamB) return true; // undecided matchup: can't judge
        const pickedSeed = p.pickedTeamId === g.teamAId ? g.teamA.seed : g.teamB.seed;
        const otherSeed = p.pickedTeamId === g.teamAId ? g.teamB.seed : g.teamA.seed;
        return pickedSeed <= otherSeed;
      });
    if (allChalk && (b.score ?? 0) >= median) earned.push("chalk_walk");

    if (earned.length > 0) result.set(b.userId, earned);
  }
  return result;
}

/**
 * Award badges once the championship is final. Idempotent: the unique
 * (user_id, achievement_type) constraint makes re-runs no-ops.
 */
export async function awardAchievements(db: Db): Promise<number> {
  const champ = await db.query.games.findFirst({
    where: eq(games.round, "championship"),
    columns: { status: true, winnerId: true },
  });
  if (!champ || champ.status !== "final" || !champ.winnerId) return 0;

  const [bracketRows, pickRows, gameRows] = await Promise.all([
    db
      .select({ id: brackets.id, userId: brackets.userId, score: brackets.score, locked: brackets.locked })
      .from(brackets),
    db
      .select({
        bracketId: bracketPicks.bracketId,
        gameSlot: bracketPicks.gameSlot,
        round: bracketPicks.round,
        pickedTeamId: bracketPicks.pickedTeamId,
        isCorrect: bracketPicks.isCorrect,
      })
      .from(bracketPicks),
    db.query.games.findMany({
      columns: {
        gameSlot: true,
        round: true,
        region: true,
        status: true,
        winnerId: true,
        teamAId: true,
        teamBId: true,
      },
      with: { teamA: { columns: { seed: true } }, teamB: { columns: { seed: true } } },
    }),
  ]);

  const earned = evaluateAchievements(bracketRows, pickRows, gameRows);
  const rows: { userId: string; achievementType: AchievementType }[] = [];
  for (const [userId, types] of earned) {
    for (const t of types) rows.push({ userId, achievementType: t });
  }
  if (rows.length === 0) return 0;

  try {
    const inserted = await db
      .insert(userAchievements)
      .values(rows)
      .onConflictDoNothing({ target: [userAchievements.userId, userAchievements.achievementType] })
      .returning({ id: userAchievements.id });
    return inserted.length;
  } catch (err) {
    console.error("awardAchievements failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
