import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchESPNScoreboard,
  parseGameStatus,
  formatDateForESPN,
  isTbdCompetitor,
} from "@/lib/espn";
import { authorizeCronOrAdmin } from "@/lib/admin-auth";
import { getScoringMultipliers } from "@/lib/tournament-config";
import { processFinalGame, type FinalGameRow } from "@/lib/process-final-game";
import { lockBracketsPastDeadline } from "@/lib/lock-brackets";
import { awardAchievements } from "@/lib/achievements";

export const maxDuration = 60;

// Schedulers call GET; the admin page's "Run score update now" button POSTs.
export async function GET(request: NextRequest) {
  return handleUpdateScores(request);
}

export async function POST(request: NextRequest) {
  return handleUpdateScores(request);
}

async function handleUpdateScores(request: NextRequest) {
  if (!(await authorizeCronOrAdmin(request))) {
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

  const { data: config } = await supabase
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const multipliers = getScoringMultipliers(config);

  const allEvents = [
    ...(scoreboardTwoDaysAgo?.events || []),
    ...(scoreboardYesterday?.events || []),
    ...(scoreboardToday?.events || []),
  ];

  let gamesUpdated = 0;
  let scoresRecalculated = 0;
  let gamesDiscovered = 0;
  let notificationsQueued = 0;

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
        const espnTeamIds = competitors
          .filter((c) => !isTbdCompetitor(c))
          .map((c) => c.team.id);
        if (espnTeamIds.length === 2) {
          const { data: matchedTeams } = await supabase
            .from("teams")
            .select("id")
            .in("espn_id", espnTeamIds);

          if (matchedTeams && matchedTeams.length === 2) {
            const teamIds = matchedTeams.map((t) => t.id);
            const { data: candidates } = await supabase
              .from("games")
              .select("*, team_a:teams!team_a_id(*), team_b:teams!team_b_id(*)")
              .is("espn_game_id", null)
              .in("team_a_id", teamIds)
              .in("team_b_id", teamIds);

            if (candidates && candidates.length === 1) {
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
        const winnerCompetitor = competitors.find((c) => c.winner);
        if (winnerCompetitor) {
          if (game.team_a?.espn_id === winnerCompetitor.team.id) {
            winnerId = game.team_a_id;
          } else if (game.team_b?.espn_id === winnerCompetitor.team.id) {
            winnerId = game.team_b_id;
          }
        }
      }

      // Build the update defensively so a partial/regressed ESPN payload can't
      // clobber a good final: never downgrade a recorded final, never null out
      // an existing score or winner.
      const updates: Record<string, unknown> = {
        scheduled_at: competition.date,
      };
      if (!(game.status === "final" && status !== "final")) {
        updates.status = status;
      }
      if (scoreA !== null) updates.score_a = scoreA;
      if (scoreB !== null) updates.score_b = scoreB;
      if (winnerId) updates.winner_id = winnerId;
      if (status === "in_progress") {
        updates.clock = competition.status.displayClock ?? null;
        updates.period = competition.status.period ?? null;
      } else if (status === "final") {
        updates.clock = null;
        updates.period = null;
      }

      const { error } = await supabase
        .from("games")
        .update(updates)
        .eq("id", game.id);

      if (!error) gamesUpdated++;

      // Once a winner is known, run the (idempotent) post-final pipeline every
      // cycle so missed advancements self-heal. Notify only when the winner
      // first becomes known — which also covers games ESPN marks final before
      // it sets the winner flag.
      const winnerNewlyKnown = !!winnerId && winnerId !== game.winner_id;
      if (status === "final" && winnerId) {
        const result = await processFinalGame(supabase, {
          game: game as unknown as FinalGameRow,
          winnerId,
          scoreA,
          scoreB,
          multipliers,
          notify: winnerNewlyKnown,
          batchKey: `${today}-${now.getUTCHours() < 18 ? "afternoon" : "evening"}`,
        });
        scoresRecalculated += result.bracketsRecalculated;
        notificationsQueued += result.notificationsQueued;
      }
    }
  }

  // Past the lock deadline, finalize complete drafts so they count.
  const lock = await lockBracketsPastDeadline(supabase, now);

  // Once the tournament is over, settle any accepted wagers and hand out badges.
  const wagersResolved = await resolveCompletedWagers(supabase);
  const achievementsAwarded = await awardAchievements(supabase);

  await supabase
    .from("tournament_config")
    .update({ last_score_update_at: now.toISOString() })
    .eq("id", 1);

  return NextResponse.json({
    message: "Scores updated",
    gamesUpdated,
    gamesDiscovered,
    scoresRecalculated,
    notificationsQueued,
    bracketsLocked: lock.locked,
    incompleteDrafts: lock.incomplete,
    wagersResolved,
    achievementsAwarded,
    timestamp: now.toISOString(),
  });
}

// Resolve accepted wagers by comparing final bracket scores. Runs only after
// the championship is final; idempotent because it only touches wagers still
// in the "accepted" state.
async function resolveCompletedWagers(
  supabase: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { data: champ } = await supabase
    .from("games")
    .select("status, winner_id")
    .eq("round", "championship")
    .maybeSingle();

  if (!champ || champ.status !== "final" || !champ.winner_id) return 0;

  const { data: wagers } = await supabase
    .from("wagers")
    .select("*")
    .eq("status", "accepted");

  if (!wagers || wagers.length === 0) return 0;

  let resolved = 0;
  const nowIso = new Date().toISOString();

  for (const wager of wagers) {
    const { data: challengerBracket } = await supabase
      .from("brackets")
      .select("score")
      .eq("id", wager.challenger_bracket_id)
      .single();

    // Use the explicitly-wagered opponent bracket, else fall back to their
    // primary bracket.
    let opponentScore = 0;
    if (wager.opponent_bracket_id) {
      const { data } = await supabase
        .from("brackets")
        .select("score")
        .eq("id", wager.opponent_bracket_id)
        .single();
      opponentScore = data?.score ?? 0;
    } else {
      const { data } = await supabase
        .from("brackets")
        .select("score")
        .eq("user_id", wager.opponent_id)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();
      opponentScore = data?.score ?? 0;
    }

    const challengerScore = challengerBracket?.score ?? 0;

    let winnerId: string | null = null;
    if (challengerScore > opponentScore) winnerId = wager.challenger_id;
    else if (opponentScore > challengerScore) winnerId = wager.opponent_id;
    // Equal scores → resolved with no winner (a tie).

    await supabase
      .from("wagers")
      .update({ status: "resolved", winner_id: winnerId, resolved_at: nowIso })
      .eq("id", wager.id);

    await supabase.from("notification_queue").insert([
      {
        user_id: wager.challenger_id,
        type: "wager_result" as const,
        payload: {
          wager_id: wager.id,
          stakes: wager.stakes,
          opponent_id: wager.opponent_id,
          your_score: challengerScore,
          their_score: opponentScore,
          won: winnerId === wager.challenger_id,
          tie: winnerId === null,
        },
      },
      {
        user_id: wager.opponent_id,
        type: "wager_result" as const,
        payload: {
          wager_id: wager.id,
          stakes: wager.stakes,
          opponent_id: wager.challenger_id,
          your_score: opponentScore,
          their_score: challengerScore,
          won: winnerId === wager.opponent_id,
          tie: winnerId === null,
        },
      },
    ]);

    resolved++;
  }

  return resolved;
}
