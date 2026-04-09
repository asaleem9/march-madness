import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoundPoints, isUpset } from "@/lib/utils";

const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());

async function isAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && adminEmails.includes(user.email || "");
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Fetch all final games with winners, ordered by game_slot so earlier rounds process first
  const { data: finalGames, error: fetchError } = await adminClient
    .from("games")
    .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
    .eq("status", "final")
    .not("winner_id", "is", null)
    .order("game_slot", { ascending: true });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!finalGames || finalGames.length === 0) {
    return NextResponse.json({ message: "No final games found", fixed: 0 });
  }

  let advancementsFixed = 0;
  let eliminationsFixed = 0;
  let picksScored = 0;
  const details: string[] = [];

  for (const game of finalGames) {
    const winnerId = game.winner_id;

    // Fix elimination: mark loser as eliminated
    const loserId = winnerId === game.team_a_id ? game.team_b_id : game.team_a_id;
    if (loserId) {
      const { data: loserTeam } = await adminClient
        .from("teams")
        .select("eliminated, name")
        .eq("id", loserId)
        .single();

      if (loserTeam && !loserTeam.eliminated) {
        await adminClient
          .from("teams")
          .update({ eliminated: true })
          .eq("id", loserId);
        eliminationsFixed++;
        details.push(`Eliminated: ${loserTeam.name}`);
      }
    }

    // Fix advancement: place winner in next game slot
    if (game.next_game_slot) {
      const updateField = game.slot_position === "top" ? "team_a_id" : "team_b_id";

      // Check if the next game slot already has the correct team
      const { data: nextGame } = await adminClient
        .from("games")
        .select("team_a_id, team_b_id, game_slot")
        .eq("game_slot", game.next_game_slot)
        .single();

      if (nextGame) {
        const currentValue = updateField === "team_a_id" ? nextGame.team_a_id : nextGame.team_b_id;
        if (currentValue !== winnerId) {
          await adminClient
            .from("games")
            .update({ [updateField]: winnerId })
            .eq("game_slot", game.next_game_slot);
          advancementsFixed++;

          const winnerTeam = winnerId === game.team_a_id ? game.team_a : game.team_b;
          details.push(
            `Advanced: ${winnerTeam?.name || winnerId} → slot ${game.next_game_slot} (${updateField})`
          );
        }
      }
    }

    // Fix First Four pick swaps
    if (game.round === "first_four" && loserId) {
      const { count } = await adminClient
        .from("bracket_picks")
        .update({ picked_team_id: winnerId })
        .eq("game_slot", game.next_game_slot)
        .eq("picked_team_id", loserId);

      if (count && count > 0) {
        details.push(`Swapped ${count} First Four picks for slot ${game.next_game_slot}`);
      }
    }

    // Fix bracket pick scoring
    const { data: picks } = await adminClient
      .from("bracket_picks")
      .select("*")
      .eq("game_slot", game.game_slot)
      .is("is_correct", null);

    if (picks && picks.length > 0) {
      for (const pick of picks) {
        const correct = pick.picked_team_id === winnerId;
        let points = 0;
        if (correct) {
          const basePoints = getRoundPoints(game.round);
          const winnerTeam = winnerId === game.team_a_id ? game.team_a : game.team_b;
          const loserTeam = winnerId === game.team_a_id ? game.team_b : game.team_a;
          if (winnerTeam && loserTeam && isUpset(winnerTeam.seed, loserTeam.seed)) {
            points = Math.round(basePoints * 1.5);
          } else {
            points = basePoints;
          }
        }
        await adminClient
          .from("bracket_picks")
          .update({ is_correct: correct, points_earned: points })
          .eq("id", pick.id);
        picksScored++;
      }
    }
  }

  // Recalculate all bracket scores
  const { data: allPicks } = await adminClient
    .from("bracket_picks")
    .select("bracket_id, points_earned")
    .not("is_correct", "is", null);

  let bracketsRecalculated = 0;
  if (allPicks) {
    const scoresByBracket = new Map<string, number>();
    for (const pick of allPicks) {
      const current = scoresByBracket.get(pick.bracket_id) || 0;
      scoresByBracket.set(pick.bracket_id, current + (pick.points_earned || 0));
    }
    for (const [bracketId, score] of scoresByBracket) {
      await adminClient
        .from("brackets")
        .update({ score })
        .eq("id", bracketId);
      bracketsRecalculated++;
    }
  }

  return NextResponse.json({
    message: "Backfill complete",
    gamesProcessed: finalGames.length,
    advancementsFixed,
    eliminationsFixed,
    picksScored,
    bracketsRecalculated,
    details,
  });
}
