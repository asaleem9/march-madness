import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/sanitizeError";
import { getScoringMultipliers } from "@/lib/tournament-config";
import { processFinalGame, type FinalGameRow } from "@/lib/process-final-game";

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

  const adminClient = createAdminClient();
  const body = await request.json();
  const { game_id, score_a, score_b, status } = body;
  let { winner_id } = body as { winner_id?: number | null };

  if (!game_id) {
    return NextResponse.json({ error: "game_id is required" }, { status: 400 });
  }

  const finalStatus = status || "final";
  const { data: existing } = await adminClient
    .from("games")
    .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
    .eq("id", game_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Derive the winner from the scores when the admin didn't choose one.
  if (finalStatus === "final" && !winner_id && score_a != null && score_b != null) {
    if (score_a > score_b) winner_id = existing.team_a_id;
    else if (score_b > score_a) winner_id = existing.team_b_id;
  }
  if (finalStatus === "final" && winner_id && score_a != null && score_b != null) {
    const scoreSaysA = score_a > score_b;
    if ((scoreSaysA && winner_id !== existing.team_a_id) || (!scoreSaysA && score_a !== score_b && winner_id !== existing.team_b_id)) {
      return NextResponse.json(
        { error: "Winner contradicts the scores" },
        { status: 400 }
      );
    }
  }

  const { error } = await adminClient
    .from("games")
    .update({
      score_a,
      score_b,
      winner_id: finalStatus === "final" ? winner_id ?? null : null,
      status: finalStatus,
      clock: null,
      period: null,
    })
    .eq("id", game_id);

  if (error) {
    return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
  }

  if (finalStatus === "final" && winner_id) {
    const { data: config } = await adminClient
      .from("tournament_config")
      .select("scoring_multipliers")
      .eq("id", 1)
      .maybeSingle();

    const result = await processFinalGame(adminClient, {
      game: existing as unknown as FinalGameRow,
      winnerId: winner_id,
      scoreA: score_a ?? null,
      scoreB: score_b ?? null,
      multipliers: getScoringMultipliers(config),
      notify: existing.winner_id !== winner_id,
      batchKey: `manual-${new Date().toISOString().slice(0, 10)}`,
    });
    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ success: true });
}
