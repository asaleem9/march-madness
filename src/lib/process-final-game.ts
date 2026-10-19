import { eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { bracketPicks, brackets, games, notificationQueue, teams } from "@/db/schema";
import type { Round, ScoringMultipliers } from "@/types";
import { getRoundPoints, isUpset, DEFAULT_SCORING } from "./utils";

/** A Drizzle transaction handle, so helpers can run inside `db.transaction()`. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

/**
 * A `games` row joined with its two teams, as the cron/admin/backfill routes
 * load it (`db.query.games.findFirst({ with: { teamA: true, teamB: true } })`).
 */
export interface FinalGameRow {
  id: number;
  gameSlot: number;
  round: Round;
  region: string | null;
  teamAId: number | null;
  teamBId: number | null;
  nextGameSlot: number | null;
  slotPosition: "top" | "bottom" | null;
  teamA: { id: number; name: string; seed: number } | null;
  teamB: { id: number; name: string; seed: number } | null;
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

/**
 * Sum `points_earned` over scored picks per bracket and write `brackets.score`.
 * Returns the number of brackets touched (those with at least one scored pick).
 */
export async function recalculateBracketScores(db: DbLike): Promise<number> {
  const totals = db
    .select({
      bracketId: bracketPicks.bracketId,
      total: sql<number>`coalesce(sum(${bracketPicks.pointsEarned}), 0)::int`.as("total"),
    })
    .from(bracketPicks)
    .where(isNotNull(bracketPicks.isCorrect))
    .groupBy(bracketPicks.bracketId)
    .as("totals");

  const updated = await db
    .update(brackets)
    .set({ score: sql`${totals.total}` })
    .from(totals)
    .where(eq(brackets.id, totals.bracketId))
    .returning({ id: brackets.id });

  return updated.length;
}

/**
 * Everything that must happen once a game's winner is known: eliminate the
 * loser, advance the winner into the next slot, resolve play-in picks, score
 * every pick on this game, recalculate bracket totals and (optionally) queue a
 * personalised notification per affected user. Idempotent — safe to re-run.
 *
 * The bracket writes run in one transaction; notifications are queued after it
 * commits so a queue failure can't undo the scoring.
 */
export async function processFinalGame(
  db: Db,
  opts: ProcessFinalGameOptions
): Promise<ProcessFinalGameResult> {
  const { game, winnerId, scoreA, scoreB } = opts;
  const multipliers = opts.multipliers ?? DEFAULT_SCORING;
  const winnerIsA = winnerId === game.teamAId;
  const loserId = winnerIsA ? game.teamBId : game.teamAId;
  const winnerTeam = winnerIsA ? game.teamA : game.teamB;
  const loserTeam = winnerIsA ? game.teamB : game.teamA;
  const winPoints = pointsForWin(game.round, winnerTeam?.seed, loserTeam?.seed, multipliers);

  const perUser: { userId: string; correct: boolean; points: number; pickedName: string }[] = [];

  const { picksScored, bracketsRecalculated } = await db.transaction(async (tx) => {
    // 1. Eliminate the loser.
    if (loserId) {
      await tx.update(teams).set({ eliminated: true }).where(eq(teams.id, loserId));
    }

    // 2. Advance the winner.
    if (game.nextGameSlot) {
      await tx
        .update(games)
        .set(game.slotPosition === "top" ? { teamAId: winnerId } : { teamBId: winnerId })
        .where(eq(games.gameSlot, game.nextGameSlot));
    }

    // 3. Play-in games aren't picked. Users pick "winner of A / B" by choosing
    //    either team in the next round's tile, and may carry that team deeper.
    //    Rewrite every pick of the loser to the winner so standard scoring
    //    (picked_team_id === winner_id) works in every round.
    if (game.round === "first_four" && loserId) {
      await tx
        .update(bracketPicks)
        .set({ pickedTeamId: winnerId })
        .where(eq(bracketPicks.pickedTeamId, loserId));
    }

    // 4. Score every pick on this game (re-scores on re-run so corrections stick).
    const picks = await tx
      .select({
        id: bracketPicks.id,
        pickedTeamId: bracketPicks.pickedTeamId,
        isCorrect: bracketPicks.isCorrect,
        pointsEarned: bracketPicks.pointsEarned,
        userId: brackets.userId,
      })
      .from(bracketPicks)
      .innerJoin(brackets, eq(brackets.id, bracketPicks.bracketId))
      .where(eq(bracketPicks.gameSlot, game.gameSlot))
      .orderBy(bracketPicks.id);

    let scored = 0;
    for (const pick of picks) {
      const correct = pick.pickedTeamId === winnerId;
      const points = correct ? winPoints : 0;
      if (pick.isCorrect !== correct || (pick.pointsEarned ?? 0) !== points) {
        await tx
          .update(bracketPicks)
          .set({ isCorrect: correct, pointsEarned: points })
          .where(eq(bracketPicks.id, pick.id));
        scored++;
      }
      const pickedName =
        pick.pickedTeamId === game.teamAId
          ? game.teamA?.name
          : pick.pickedTeamId === game.teamBId
            ? game.teamB?.name
            : undefined;
      perUser.push({ userId: pick.userId, correct, points, pickedName: pickedName ?? "your pick" });
    }

    // 5. Totals.
    const recalculated = await recalculateBracketScores(tx);
    return { picksScored: scored, bracketsRecalculated: recalculated };
  });

  // 6. Notifications (one per user, with their own result so copy can be personal).
  let notificationsQueued = 0;
  if (opts.notify && perUser.length > 0) {
    const seen = new Set<string>();
    const rows = perUser
      .filter((u) => (seen.has(u.userId) ? false : (seen.add(u.userId), true)))
      .map((u) => ({
        userId: u.userId,
        type: "game_result" as const,
        payload: {
          game_id: game.id,
          game_slot: game.gameSlot,
          round: game.round,
          team_a: game.teamA?.name,
          team_b: game.teamB?.name,
          winner: winnerTeam?.name,
          loser: loserTeam?.name,
          winner_seed: winnerTeam?.seed,
          loser_seed: loserTeam?.seed,
          score: scoreA != null && scoreB != null ? `${scoreA}-${scoreB}` : null,
          picked: u.pickedName,
          correct: u.correct,
          points: u.points,
        },
        batchKey: opts.batchKey ?? null,
      }));
    try {
      await db.insert(notificationQueue).values(rows);
      notificationsQueued = rows.length;
    } catch (err) {
      console.error("processFinalGame: failed to queue notifications:", err);
    }
  }

  return { loserId, picksScored, bracketsRecalculated, notificationsQueued };
}
