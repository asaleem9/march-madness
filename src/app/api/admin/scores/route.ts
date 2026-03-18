import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoundPoints, isUpset } from "@/lib/utils";
import { sanitizeError } from "@/lib/sanitizeError";

const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());

async function isAdmin(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && adminEmails.includes(user.email || "");
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const body = await request.json();
  const { game_id, score_a, score_b, winner_id, status } = body;

  // Update game
  const { error } = await adminClient
    .from("games")
    .update({
      score_a,
      score_b,
      winner_id,
      status: status || "final",
    })
    .eq("id", game_id);

  if (error) {
    return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
  }

  // If final, process results (same logic as cron)
  if ((status || "final") === "final" && winner_id) {
    const { data: game } = await adminClient
      .from("games")
      .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
      .eq("id", game_id)
      .single();

    if (game) {
      // Mark loser as eliminated
      const loserId =
        winner_id === game.team_a_id ? game.team_b_id : game.team_a_id;
      if (loserId) {
        await adminClient
          .from("teams")
          .update({ eliminated: true })
          .eq("id", loserId);
      }

      // Advance winner
      if (game.next_game_slot) {
        const updateField =
          game.slot_position === "top" ? "team_a_id" : "team_b_id";
        await adminClient
          .from("games")
          .update({ [updateField]: winner_id })
          .eq("game_slot", game.next_game_slot);
      }

      // Update bracket picks
      const { data: picks } = await adminClient
        .from("bracket_picks")
        .select("*")
        .eq("game_slot", game.game_slot);

      if (picks) {
        for (const pick of picks) {
          const correct = pick.picked_team_id === winner_id;
          let points = 0;
          if (correct) {
            const basePoints = getRoundPoints(game.round);
            const winnerTeam =
              winner_id === game.team_a_id ? game.team_a : game.team_b;
            const loserTeam =
              winner_id === game.team_a_id ? game.team_b : game.team_a;
            if (
              winnerTeam &&
              loserTeam &&
              isUpset(winnerTeam.seed, loserTeam.seed)
            ) {
              points = Math.round(basePoints * 1.5);
            } else {
              points = basePoints;
            }
          }
          await adminClient
            .from("bracket_picks")
            .update({ is_correct: correct, points_earned: points })
            .eq("id", pick.id);
        }
      }

      // Recalculate all bracket scores
      const { data: allPicks } = await adminClient
        .from("bracket_picks")
        .select("bracket_id, points_earned")
        .not("is_correct", "is", null);

      if (allPicks) {
        const scoresByBracket = new Map<string, number>();
        for (const pick of allPicks) {
          const current = scoresByBracket.get(pick.bracket_id) || 0;
          scoresByBracket.set(
            pick.bracket_id,
            current + (pick.points_earned || 0)
          );
        }
        for (const [bracketId, score] of scoresByBracket) {
          await adminClient
            .from("brackets")
            .update({ score })
            .eq("id", bracketId);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
