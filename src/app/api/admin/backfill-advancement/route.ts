import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchESPNScoreboard, parseGameStatus, formatDateForESPN } from "@/lib/espn";
import { getRoundPoints, isUpset } from "@/lib/utils";

const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());

async function isAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && adminEmails.includes(user.email || "");
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("diagnose") === "true") {
    return handleDiagnose();
  }
  if (url.searchParams.get("sync") === "true") {
    return handleFullSync();
  }
  return handleBackfill();
}

export async function POST(request: NextRequest) {
  return handleBackfill();
}

async function handleBackfill() {
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

async function handleFullSync() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const details: string[] = [];
  let gamesMatched = 0;
  let gamesUpdated = 0;

  // Scan every day of the tournament (March 17 – April 7, 2026)
  const startDate = new Date("2026-03-17");
  const endDate = new Date("2026-04-08");
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(formatDateForESPN(d));
  }

  // Fetch all unmatched games (no espn_game_id or not final)
  const { data: unmatchedGames } = await adminClient
    .from("games")
    .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
    .neq("status", "final")
    .order("game_slot", { ascending: true });

  if (!unmatchedGames || unmatchedGames.length === 0) {
    return NextResponse.json({ message: "No unmatched games to sync", gamesMatched: 0 });
  }

  details.push(`Found ${unmatchedGames.length} non-final games to sync`);
  details.push(`Scanning ${dates.length} days of ESPN data...`);

  // Collect all ESPN events across the tournament
  const allEvents: Array<{ event: any; competition: any }> = [];
  for (const date of dates) {
    const scoreboard = await fetchESPNScoreboard(date);
    if (scoreboard) {
      for (const event of scoreboard.events) {
        for (const competition of event.competitions) {
          allEvents.push({ event, competition });
        }
      }
    }
  }

  details.push(`Found ${allEvents.length} total ESPN games across tournament`);

  // Build set of ESPN game IDs already claimed by final games
  const { data: claimedGames } = await adminClient
    .from("games")
    .select("espn_game_id")
    .eq("status", "final")
    .not("espn_game_id", "is", null);
  const claimedIds = new Set((claimedGames || []).map((g) => g.espn_game_id));

  // Multiple passes: match games with both teams first, then single-team matches
  // Process in game_slot order so earlier rounds resolve before later ones
  // Run up to 6 passes to resolve cascading dependencies
  for (let pass = 0; pass < 6; pass++) {
    // Re-fetch unmatched games each pass (teams may have been filled by previous pass)
    const { data: currentUnmatched } = await adminClient
      .from("games")
      .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
      .neq("status", "final")
      .order("game_slot", { ascending: true });

    if (!currentUnmatched || currentUnmatched.length === 0) break;

    let matchedThisPass = 0;

    for (const game of currentUnmatched) {
      if (!game.team_a && !game.team_b) continue;

      // Debug: log what we're looking for on first pass
      if (pass === 0) {
        details.push(
          `Slot ${game.game_slot}: looking for ${game.team_a?.name || "TBD"} (espn:${game.team_a?.espn_id || "null"}) vs ${game.team_b?.name || "TBD"} (espn:${game.team_b?.espn_id || "null"})`
        );

        // For games with both teams, show unclaimed ESPN events that have a partial match
        if (game.team_a && game.team_b) {
          for (const { event, competition } of allEvents) {
            if (claimedIds.has(competition.id)) continue;
            const cIds = competition.competitors.map((c: any) => c.team.id);
            const cNames = competition.competitors.map((c: any) => c.team.displayName);
            const aHit = cIds.includes(game.team_a.espn_id);
            const bHit = cIds.includes(game.team_b.espn_id);
            if (aHit || bHit) {
              details.push(
                `  ESPN partial: ${cNames.join(" vs ")} (ids: ${cIds.join(",")}) aHit=${aHit} bHit=${bHit} event="${event.shortName}"`
              );
            }
          }
        }
      }

      for (const { competition } of allEvents) {
        if (claimedIds.has(competition.id)) continue;

        const competitors = competition.competitors;
        const espnTeamIds = competitors.map((c: any) => c.team.id);

        const teamAMatch = game.team_a && espnTeamIds.includes(game.team_a.espn_id);
        const teamBMatch = game.team_b && espnTeamIds.includes(game.team_b.espn_id);

        // Need at least one team to match, and the other to either match or be null
        const hasMatch =
          (teamAMatch && teamBMatch) ||
          (teamAMatch && !game.team_b) ||
          (teamBMatch && !game.team_a);

        if (hasMatch) {
          const status = parseGameStatus(competition.status.type.state);

          // Get scores
          let scoreA: number | null = null;
          let scoreB: number | null = null;
          for (const c of competitors) {
            if (game.team_a?.espn_id === c.team.id && c.score) {
              scoreA = parseInt(c.score);
            } else if (game.team_b?.espn_id === c.team.id && c.score) {
              scoreB = parseInt(c.score);
            }
          }

          let winnerId: number | null = null;
          if (status === "final") {
            const winnerComp = competitors.find((c: any) => c.winner);
            if (winnerComp) {
              if (game.team_a?.espn_id === winnerComp.team.id) {
                winnerId = game.team_a_id;
              } else if (game.team_b?.espn_id === winnerComp.team.id) {
                winnerId = game.team_b_id;
              }
            }
          }

          await adminClient
            .from("games")
            .update({
              espn_game_id: competition.id,
              status,
              score_a: scoreA,
              score_b: scoreB,
              winner_id: winnerId,
              scheduled_at: competition.date,
            })
            .eq("id", game.id);

          claimedIds.add(competition.id);

          // If final, advance winner to next slot immediately
          if (status === "final" && winnerId && game.next_game_slot) {
            const loserId = winnerId === game.team_a_id ? game.team_b_id : game.team_a_id;
            if (loserId) {
              await adminClient.from("teams").update({ eliminated: true }).eq("id", loserId);
            }
            const updateField = game.slot_position === "top" ? "team_a_id" : "team_b_id";
            await adminClient
              .from("games")
              .update({ [updateField]: winnerId })
              .eq("game_slot", game.next_game_slot);
          }

          const winnerName = winnerId === game.team_a_id ? game.team_a?.name : game.team_b?.name;
          details.push(
            `[pass ${pass + 1}] Matched slot ${game.game_slot}: ${game.team_a?.name || "TBD"} vs ${game.team_b?.name || "TBD"} → ${status}${winnerId ? ` (winner: ${winnerName}, ${scoreA}-${scoreB})` : ""}`
          );
          gamesMatched++;
          matchedThisPass++;
          break;
        }
      }
    }

    details.push(`Pass ${pass + 1}: matched ${matchedThisPass} games`);
    if (matchedThisPass === 0) break;
  }

  // Now run the standard backfill to advance winners from newly-final games
  // Re-fetch all final games since some may have just been updated
  const { data: finalGames } = await adminClient
    .from("games")
    .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
    .eq("status", "final")
    .not("winner_id", "is", null)
    .order("game_slot", { ascending: true });

  if (finalGames) {
    for (const game of finalGames) {
      const winnerId = game.winner_id;
      const loserId = winnerId === game.team_a_id ? game.team_b_id : game.team_a_id;

      if (loserId) {
        const { data: loserTeam } = await adminClient
          .from("teams")
          .select("eliminated, name")
          .eq("id", loserId)
          .single();
        if (loserTeam && !loserTeam.eliminated) {
          await adminClient.from("teams").update({ eliminated: true }).eq("id", loserId);
          details.push(`Eliminated: ${loserTeam.name}`);
        }
      }

      if (game.next_game_slot) {
        const updateField = game.slot_position === "top" ? "team_a_id" : "team_b_id";
        const { data: nextGame } = await adminClient
          .from("games")
          .select("team_a_id, team_b_id")
          .eq("game_slot", game.next_game_slot)
          .single();

        if (nextGame) {
          const currentValue = updateField === "team_a_id" ? nextGame.team_a_id : nextGame.team_b_id;
          if (currentValue !== winnerId) {
            await adminClient
              .from("games")
              .update({ [updateField]: winnerId })
              .eq("game_slot", game.next_game_slot);
            gamesUpdated++;
            const winnerTeam = winnerId === game.team_a_id ? game.team_a : game.team_b;
            details.push(`Advanced: ${winnerTeam?.name} → slot ${game.next_game_slot}`);
          }
        }
      }
    }
  }

  // Score any unscored picks
  let picksScored = 0;
  if (finalGames) {
    for (const game of finalGames) {
      const { data: picks } = await adminClient
        .from("bracket_picks")
        .select("*")
        .eq("game_slot", game.game_slot)
        .is("is_correct", null);

      if (picks && picks.length > 0) {
        for (const pick of picks) {
          const correct = pick.picked_team_id === game.winner_id;
          let points = 0;
          if (correct) {
            const basePoints = getRoundPoints(game.round);
            const winnerTeam = game.winner_id === game.team_a_id ? game.team_a : game.team_b;
            const loserTeam = game.winner_id === game.team_a_id ? game.team_b : game.team_a;
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
  }

  // Recalculate bracket scores
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
      await adminClient.from("brackets").update({ score }).eq("id", bracketId);
      bracketsRecalculated++;
    }
  }

  return NextResponse.json({
    message: "Full sync complete",
    espnEventsScanned: allEvents.length,
    gamesMatched,
    advancementsFixed: gamesUpdated,
    picksScored,
    bracketsRecalculated,
    details,
  });
}

async function handleDiagnose() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Find games that are NOT final
  const { data: incompleteGames } = await adminClient
    .from("games")
    .select("game_slot, round, region, status, team_a_id, team_b_id, winner_id, espn_game_id, team_a:teams!team_a_id(name, seed), team_b:teams!team_b_id(name, seed)")
    .neq("status", "final")
    .order("game_slot", { ascending: true });

  // Find games with null teams (TBD)
  const { data: tbdGamesA } = await adminClient
    .from("games")
    .select("game_slot, round, region, status, team_a_id, team_b_id")
    .is("team_a_id", null)
    .order("game_slot", { ascending: true });

  const { data: tbdGamesB } = await adminClient
    .from("games")
    .select("game_slot, round, region, status, team_a_id, team_b_id")
    .is("team_b_id", null)
    .order("game_slot", { ascending: true });

  return NextResponse.json({
    incompleteGames,
    tbdSlots: {
      missingTeamA: tbdGamesA,
      missingTeamB: tbdGamesB,
    },
  });
}
