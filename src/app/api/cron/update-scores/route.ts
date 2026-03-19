import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchESPNScoreboard, parseGameStatus, formatDateForESPN } from "@/lib/espn";
import { getRoundPoints, isUpset } from "@/lib/utils";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const today = formatDateForESPN(now);
  const yesterday = formatDateForESPN(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const twoDaysAgo = formatDateForESPN(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));

  // Fetch ESPN scoreboard for today, yesterday, and 2 days ago
  // (catches late-finishing games and games with incorrect scheduled dates)
  const [scoreboardToday, scoreboardYesterday, scoreboardTwoDaysAgo] = await Promise.all([
    fetchESPNScoreboard(today),
    fetchESPNScoreboard(yesterday),
    fetchESPNScoreboard(twoDaysAgo),
  ]);

  if (!scoreboardToday && !scoreboardYesterday && !scoreboardTwoDaysAgo) {
    return NextResponse.json(
      { message: "ESPN fetch failed, will retry next cycle" },
      { status: 200 }
    );
  }

  const allEvents = [
    ...(scoreboardTwoDaysAgo?.events || []),
    ...(scoreboardYesterday?.events || []),
    ...(scoreboardToday?.events || []),
  ];

  let gamesUpdated = 0;
  let scoresRecalculated = 0;
  let gamesDiscovered = 0;

  for (const event of allEvents) {
    for (const competition of event.competitions) {
      const espnGameId = competition.id;
      const status = parseGameStatus(competition.status.type.state);

      // Find matching game in our DB by espn_game_id
      let { data: game } = await supabase
        .from("games")
        .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
        .eq("espn_game_id", espnGameId)
        .single();

      // Auto-discover: if no match by espn_game_id, try matching by team ESPN IDs
      if (!game) {
        const competitors = competition.competitors;
        const espnTeamIds = competitors.map((c) => c.team.id).filter((id) => id !== "-1" && id !== "-2");
        if (espnTeamIds.length === 2) {
          // Find our teams that match these ESPN IDs
          const { data: matchedTeams } = await supabase
            .from("teams")
            .select("id")
            .in("espn_id", espnTeamIds);

          if (matchedTeams && matchedTeams.length === 2) {
            const teamIds = matchedTeams.map((t) => t.id);
            // Find a game with no espn_game_id that has both these teams
            const { data: candidates } = await supabase
              .from("games")
              .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
              .is("espn_game_id", null)
              .in("team_a_id", teamIds)
              .in("team_b_id", teamIds);

            if (candidates && candidates.length === 1) {
              // Set the espn_game_id for future lookups
              await supabase
                .from("games")
                .update({ espn_game_id: espnGameId })
                .eq("id", candidates[0].id);
              game = candidates[0];
              gamesDiscovered++;
            }
          }
        }
      }

      if (!game) continue;

      // Get scores from ESPN — match by ESPN team ID, not array position
      const competitors = competition.competitors;
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
        // Determine winner by matching ESPN team IDs
        const winnerCompetitor = competitors.find((c) => c.winner);
        if (winnerCompetitor) {
          // Match by ESPN ID
          if (
            game.team_a?.espn_id === winnerCompetitor.team.id
          ) {
            winnerId = game.team_a_id;
          } else if (
            game.team_b?.espn_id === winnerCompetitor.team.id
          ) {
            winnerId = game.team_b_id;
          }
        }
      }

      // Update game (idempotent) — also sync scheduled_at from ESPN
      const { error } = await supabase
        .from("games")
        .update({
          status,
          score_a: scoreA,
          score_b: scoreB,
          winner_id: winnerId,
          scheduled_at: competition.date,
        })
        .eq("id", game.id);

      if (!error) gamesUpdated++;

      // If game just went final, process results
      if (status === "final" && winnerId && game.status !== "final") {
        // Mark losing team as eliminated
        const loserId =
          winnerId === game.team_a_id ? game.team_b_id : game.team_a_id;
        if (loserId) {
          await supabase
            .from("teams")
            .update({ eliminated: true })
            .eq("id", loserId);
        }

        // Advance winner to next game
        if (game.next_game_slot) {
          const updateField =
            game.slot_position === "top" ? "team_a_id" : "team_b_id";
          await supabase
            .from("games")
            .update({ [updateField]: winnerId })
            .eq("game_slot", game.next_game_slot);

          // For First Four games: update any First Round picks that used
          // the convention team_a pick to point to the actual winner.
          // Users pick "TEX / NCST" as a unit; we store team_a's ID by
          // convention. If team_b won, swap picks to the real winner so
          // standard scoring (picked_team_id === winner_id) works.
          if (game.round === "first_four" && loserId) {
            await supabase
              .from("bracket_picks")
              .update({ picked_team_id: winnerId })
              .eq("game_slot", game.next_game_slot)
              .eq("picked_team_id", loserId);
          }
        }

        // Update bracket picks for this game
        const { data: picks } = await supabase
          .from("bracket_picks")
          .select("*, brackets!inner(user_id)")
          .eq("game_slot", game.game_slot);

        if (picks) {
          for (const pick of picks) {
            const correct = pick.picked_team_id === winnerId;
            let points = 0;

            if (correct) {
              const basePoints = getRoundPoints(game.round);
              // Check if upset
              const winnerTeam =
                winnerId === game.team_a_id ? game.team_a : game.team_b;
              const loserTeam =
                winnerId === game.team_a_id ? game.team_b : game.team_a;

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

            await supabase
              .from("bracket_picks")
              .update({ is_correct: correct, points_earned: points })
              .eq("id", pick.id);
          }
        }

        // Recalculate bracket scores
        const { data: allPicks } = await supabase
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
            await supabase
              .from("brackets")
              .update({ score })
              .eq("id", bracketId);
            scoresRecalculated++;
          }
        }

        // Queue notifications for affected users
        if (picks) {
          const userIds = [
            ...new Set(
              picks.map(
                (p) => (p.brackets as unknown as { user_id: string }).user_id
              )
            ),
          ];
          const notifications = userIds.map((uid) => ({
            user_id: uid,
            type: "game_result" as const,
            payload: {
              game_id: game.id,
              team_a: game.team_a?.name,
              team_b: game.team_b?.name,
              winner:
                winnerId === game.team_a_id
                  ? game.team_a?.name
                  : game.team_b?.name,
              score: `${scoreA}-${scoreB}`,
            },
            batch_key: `${today}-${new Date().getHours() < 18 ? "afternoon" : "evening"}`,
          }));

          await supabase.from("notification_queue").insert(notifications);
        }
      }
    }
  }

  return NextResponse.json({
    message: "Scores updated",
    gamesUpdated,
    gamesDiscovered,
    scoresRecalculated,
    timestamp: new Date().toISOString(),
  });
}
