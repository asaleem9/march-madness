import type { SupabaseClient } from "@supabase/supabase-js";
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
  game_slot: number;
  round: string;
  region: string | null;
  status: string;
  winner_id: number | null;
  team_a_id: number | null;
  team_b_id: number | null;
  team_a: { seed: number } | null;
  team_b: { seed: number } | null;
}

interface PickLite {
  bracket_id: string;
  game_slot: number;
  round: string;
  picked_team_id: number;
  is_correct: boolean | null;
}

interface BracketLite {
  id: string;
  user_id: string;
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

  const gameBySlot = new Map(games.map((g) => [g.game_slot, g]));
  const championship = games.find((g) => g.round === "championship");
  const picksByBracket = new Map<string, PickLite[]>();
  for (const p of picks) {
    const list = picksByBracket.get(p.bracket_id) ?? [];
    list.push(p);
    picksByBracket.set(p.bracket_id, list);
  }

  const scores = eligible.map((b) => b.score ?? 0).sort((a, b) => a - b);
  const topScore = Math.max(...scores);
  const median = scores[Math.floor(scores.length / 2)];

  const regionSlots = new Map<string, number[]>();
  for (const g of games) {
    if (!g.region || g.round === "first_four") continue;
    const list = regionSlots.get(g.region) ?? [];
    list.push(g.game_slot);
    regionSlots.set(g.region, list);
  }

  for (const b of eligible) {
    const earned: AchievementType[] = [];
    const myPicks = picksByBracket.get(b.id) ?? [];
    const pickBySlot = new Map(myPicks.map((p) => [p.game_slot, p]));

    if ((b.score ?? 0) === topScore) earned.push("bracket_genius");

    if (championship?.winner_id) {
      const champPick = pickBySlot.get(championship.game_slot);
      if (champPick?.picked_team_id === championship.winner_id) earned.push("fortune_teller");
    }

    for (const slots of regionSlots.values()) {
      if (slots.length === 0) continue;
      const perfect = slots.every((s) => pickBySlot.get(s)?.is_correct === true);
      if (perfect) {
        earned.push("perfect_region");
        break;
      }
    }

    // Cinderella: a correct Sweet 16 *appearance* — i.e. a correct second-round
    // pick of a team seeded 12 or worse.
    const cinderella = myPicks.some((p) => {
      if (p.round !== "second_round" || p.is_correct !== true) return false;
      const g = gameBySlot.get(p.game_slot);
      const seed =
        p.picked_team_id === g?.team_a_id ? g?.team_a?.seed : g?.team_b?.seed;
      return seed != null && seed >= 12;
    });
    if (cinderella) earned.push("cinderella");

    // Chalk walk: every pick was the better (lower-numbered) seed in its game,
    // judged against the teams that actually played, and the score is at least
    // the pool median.
    const allChalk =
      myPicks.length > 0 &&
      myPicks.every((p) => {
        const g = gameBySlot.get(p.game_slot);
        if (!g || !g.team_a || !g.team_b) return true; // undecided matchup: can't judge
        const pickedSeed =
          p.picked_team_id === g.team_a_id ? g.team_a.seed : g.team_b.seed;
        const otherSeed =
          p.picked_team_id === g.team_a_id ? g.team_b.seed : g.team_a.seed;
        return pickedSeed <= otherSeed;
      });
    if (allChalk && (b.score ?? 0) >= median) earned.push("chalk_walk");

    if (earned.length > 0) result.set(b.user_id, earned);
  }
  return result;
}

/**
 * Award badges once the championship is final. Idempotent: the unique
 * (user_id, achievement_type) constraint makes re-runs no-ops.
 */
export async function awardAchievements(admin: SupabaseClient): Promise<number> {
  const { data: champ } = await admin
    .from("games")
    .select("status, winner_id")
    .eq("round", "championship")
    .maybeSingle();
  if (!champ || champ.status !== "final" || !champ.winner_id) return 0;

  const [{ data: brackets }, { data: picks }, { data: games }] = await Promise.all([
    admin.from("brackets").select("id, user_id, score, locked"),
    admin
      .from("bracket_picks")
      .select("bracket_id, game_slot, round, picked_team_id, is_correct"),
    admin
      .from("games")
      .select(
        "game_slot, round, region, status, winner_id, team_a_id, team_b_id, team_a:teams!team_a_id(seed), team_b:teams!team_b_id(seed)"
      ),
  ]);
  if (!brackets || !picks || !games) return 0;

  const earned = evaluateAchievements(
    brackets as BracketLite[],
    picks as PickLite[],
    games as unknown as GameLite[]
  );
  const rows: { user_id: string; achievement_type: AchievementType }[] = [];
  for (const [userId, types] of earned) {
    for (const t of types) rows.push({ user_id: userId, achievement_type: t });
  }
  if (rows.length === 0) return 0;

  const { data, error } = await admin
    .from("user_achievements")
    .upsert(rows, { onConflict: "user_id,achievement_type", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("awardAchievements failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
