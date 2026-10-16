import type { SupabaseClient } from "@supabase/supabase-js";
import type { Round, ScoringMultipliers } from "@/types";
import { getRoundPoints, isUpset, DEFAULT_SCORING } from "./utils";

/** A `games` row joined with its two teams, as the cron/admin/backfill routes select it. */
export interface FinalGameRow {
  id: number | string;
  game_slot: number;
  round: Round;
  region: string | null;
  team_a_id: number | null;
  team_b_id: number | null;
  next_game_slot: number | null;
  slot_position: "top" | "bottom" | null;
  team_a: { id: number; name: string; seed: number } | null;
  team_b: { id: number; name: string; seed: number } | null;
}

export interface ProcessFinalGameOptions {
  game: FinalGameRow;
  winnerId: number;
  scoreA: number | null;
  scoreB: number | null;
  multipliers?: ScoringMultipliers;
  /** Queue game_result notifications for everyone with a pick on this game. */
  notify?: boolean;
  batchKey?: string;
}

export interface ProcessFinalGameResult {
  loserId: number | null;
  picksScored: number;
  bracketsRecalculated: number;
  notificationsQueued: number;
}

/** Points a correct pick earns for this game (1.5× when the winner was the worse seed). */
export function pointsForWin(
  round: Round,
  winnerSeed: number | undefined,
  loserSeed: number | undefined,
  multipliers: ScoringMultipliers = DEFAULT_SCORING
): number {
  const base = getRoundPoints(round, multipliers);
  if (winnerSeed != null && loserSeed != null && isUpset(winnerSeed, loserSeed)) {
    return Math.round(base * 1.5);
  }
  return base;
}

/** Sum points_earned per bracket and write brackets.score. Returns the number of brackets touched. */
export async function recalculateBracketScores(
  admin: SupabaseClient
): Promise<number> {
  const { data: allPicks } = await admin
    .from("bracket_picks")
    .select("bracket_id, points_earned")
    .not("is_correct", "is", null);

  if (!allPicks) return 0;

  const scoresByBracket = new Map<string, number>();
  for (const pick of allPicks) {
    const current = scoresByBracket.get(pick.bracket_id) || 0;
    scoresByBracket.set(pick.bracket_id, current + (pick.points_earned || 0));
  }

  let recalculated = 0;
  for (const [bracketId, score] of scoresByBracket) {
    await admin.from("brackets").update({ score }).eq("id", bracketId);
    recalculated++;
  }
  return recalculated;
}

/**
 * Everything that must happen once a game's winner is known: eliminate the
 * loser, advance the winner into the next slot, resolve play-in picks, score
 * every pick on this game, recalculate bracket totals and (optionally) queue a
 * personalised notification per affected user. Idempotent — safe to re-run.
 */
export async function processFinalGame(
  admin: SupabaseClient,
  opts: ProcessFinalGameOptions
): Promise<ProcessFinalGameResult> {
  const { game, winnerId, scoreA, scoreB } = opts;
  const multipliers = opts.multipliers ?? DEFAULT_SCORING;
  const winnerIsA = winnerId === game.team_a_id;
  const loserId = winnerIsA ? game.team_b_id : game.team_a_id;
  const winnerTeam = winnerIsA ? game.team_a : game.team_b;
  const loserTeam = winnerIsA ? game.team_b : game.team_a;

  // 1. Eliminate the loser.
  if (loserId) {
    await admin.from("teams").update({ eliminated: true }).eq("id", loserId);
  }

  // 2. Advance the winner.
  if (game.next_game_slot) {
    const field = game.slot_position === "top" ? "team_a_id" : "team_b_id";
    await admin
      .from("games")
      .update({ [field]: winnerId })
      .eq("game_slot", game.next_game_slot);
  }

  // 3. Play-in games aren't picked. Users pick "winner of A / B" by choosing
  //    either team in the next round's tile, and may carry that team deeper.
  //    Rewrite every pick of the loser to the winner so standard scoring
  //    (picked_team_id === winner_id) works in every round.
  if (game.round === "first_four" && loserId) {
    await admin
      .from("bracket_picks")
      .update({ picked_team_id: winnerId })
      .eq("picked_team_id", loserId);
  }

  // 4. Score every pick on this game (re-scores on re-run so corrections stick).
  const { data: picks } = await admin
    .from("bracket_picks")
    .select("id, bracket_id, picked_team_id, is_correct, points_earned, brackets!inner(user_id)")
    .eq("game_slot", game.game_slot);

  const winPoints = pointsForWin(game.round, winnerTeam?.seed, loserTeam?.seed, multipliers);
  let picksScored = 0;
  const perUser: { userId: string; correct: boolean; points: number; pickedName: string }[] = [];

  for (const pick of picks ?? []) {
    const correct = pick.picked_team_id === winnerId;
    const points = correct ? winPoints : 0;
    if (pick.is_correct !== correct || (pick.points_earned ?? 0) !== points) {
      await admin
        .from("bracket_picks")
        .update({ is_correct: correct, points_earned: points })
        .eq("id", pick.id);
      picksScored++;
    }
    const userId = (pick.brackets as unknown as { user_id: string } | null)?.user_id;
    if (userId) {
      const pickedName =
        pick.picked_team_id === game.team_a_id
          ? game.team_a?.name
          : pick.picked_team_id === game.team_b_id
            ? game.team_b?.name
            : undefined;
      perUser.push({ userId, correct, points, pickedName: pickedName ?? "your pick" });
    }
  }

  // 5. Totals.
  const bracketsRecalculated = await recalculateBracketScores(admin);

  // 6. Notifications (one per user, with their own result so copy can be personal).
  let notificationsQueued = 0;
  if (opts.notify && perUser.length > 0) {
    const seen = new Set<string>();
    const rows = perUser
      .filter((u) => (seen.has(u.userId) ? false : (seen.add(u.userId), true)))
      .map((u) => ({
        user_id: u.userId,
        type: "game_result" as const,
        payload: {
          game_id: game.id,
          game_slot: game.game_slot,
          round: game.round,
          team_a: game.team_a?.name,
          team_b: game.team_b?.name,
          winner: winnerTeam?.name,
          loser: loserTeam?.name,
          winner_seed: winnerTeam?.seed,
          loser_seed: loserTeam?.seed,
          score: scoreA != null && scoreB != null ? `${scoreA}-${scoreB}` : null,
          picked: u.pickedName,
          correct: u.correct,
          points: u.points,
        },
        batch_key: opts.batchKey ?? null,
      }));
    const { error } = await admin.from("notification_queue").insert(rows);
    if (!error) notificationsQueued = rows.length;
  }

  return { loserId, picksScored, bracketsRecalculated, notificationsQueued };
}
