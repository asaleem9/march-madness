import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { games, tournamentConfig } from "@/db/schema";
import { isAdminUser } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/sanitizeError";
import { getScoringMultipliers } from "@/lib/tournament-config";
import { processFinalGame } from "@/lib/process-final-game";

/**
 * Manual score entry (fallback when ESPN is down or wrong). Runs the same
 * post-final pipeline as the cron, so advancement, scoring, notifications and
 * wager resolution all behave identically. Re-submitting a final game
 * re-scores it idempotently.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { game_id, score_a, score_b, status } = body;
  let { winner_id } = body as { winner_id?: number | null };

  if (!game_id) {
    return NextResponse.json({ error: "game_id is required" }, { status: 400 });
  }

  const finalStatus = status || "final";
  const existing = await db.query.games.findFirst({
    where: eq(games.id, game_id),
    with: { teamA: true, teamB: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Derive the winner from the scores when the admin didn't choose one.
  if (finalStatus === "final" && !winner_id && score_a != null && score_b != null) {
    if (score_a > score_b) winner_id = existing.teamAId;
    else if (score_b > score_a) winner_id = existing.teamBId;
  }
  if (finalStatus === "final" && winner_id && score_a != null && score_b != null) {
    const scoreSaysA = score_a > score_b;
    if ((scoreSaysA && winner_id !== existing.teamAId) || (!scoreSaysA && score_a !== score_b && winner_id !== existing.teamBId)) {
      return NextResponse.json(
        { error: "Winner contradicts the scores" },
        { status: 400 }
      );
    }
  }

  try {
    await db
      .update(games)
      .set({
        scoreA: score_a ?? null,
        scoreB: score_b ?? null,
        winnerId: finalStatus === "final" ? winner_id ?? null : null,
        status: finalStatus,
        clock: null,
        period: null,
      })
      .where(eq(games.id, game_id));
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err instanceof Error ? err.message : null) },
      { status: 500 }
    );
  }

  if (finalStatus === "final" && winner_id) {
    const config = await db.query.tournamentConfig.findFirst({
      where: eq(tournamentConfig.id, 1),
      columns: { scoringMultipliers: true },
    });

    const result = await processFinalGame(db, {
      game: existing,
      winnerId: winner_id,
      scoreA: score_a ?? null,
      scoreB: score_b ?? null,
      multipliers: getScoringMultipliers({ scoring_multipliers: config?.scoringMultipliers ?? null }),
      notify: existing.winnerId !== winner_id,
      batchKey: `manual-${new Date().toISOString().slice(0, 10)}`,
    });
    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ success: true });
}
