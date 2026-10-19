import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  brackets,
  games,
  notificationQueue,
  profiles,
  teams,
  tournamentConfig,
  wagers,
} from "@/db/schema";
import {
  fetchESPNScoreboard,
  parseGameStatus,
  formatDateForESPN,
  isTbdCompetitor,
} from "@/lib/espn";
import { authorizeCronOrAdmin } from "@/lib/admin-auth";
import { getScoringMultipliers } from "@/lib/tournament-config";
import { processFinalGame } from "@/lib/process-final-game";
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

const gameWithTeams = { teamA: true, teamB: true } as const;

async function handleUpdateScores(request: NextRequest) {
  if (!(await authorizeCronOrAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const config = await db.query.tournamentConfig.findFirst({
    where: eq(tournamentConfig.id, 1),
  });
  const multipliers = getScoringMultipliers({
    scoring_multipliers: config?.scoringMultipliers ?? null,
  });

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
      let game = await db.query.games.findFirst({
        where: eq(games.espnGameId, espnGameId),
        with: gameWithTeams,
      });

      // Auto-discover: if no match by espn_game_id, try matching by team ESPN IDs
      if (!game) {
        const competitors = competition.competitors;
        const espnTeamIds = competitors
          .filter((c) => !isTbdCompetitor(c))
          .map((c) => c.team.id);
        if (espnTeamIds.length === 2) {
          const matchedTeams = await db
            .select({ id: teams.id })
            .from(teams)
            .where(inArray(teams.espnId, espnTeamIds));

          if (matchedTeams.length === 2) {
            const teamIds = matchedTeams.map((t) => t.id);
            const candidates = await db.query.games.findMany({
              where: and(
                isNull(games.espnGameId),
                inArray(games.teamAId, teamIds),
                inArray(games.teamBId, teamIds)
              ),
              with: gameWithTeams,
            });

            if (candidates.length === 1) {
              await db
                .update(games)
                .set({ espnGameId })
                .where(eq(games.id, candidates[0].id));
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
        if (game.teamA?.espnId === c.team.id && c.score) {
          scoreA = parseInt(c.score);
        } else if (game.teamB?.espnId === c.team.id && c.score) {
          scoreB = parseInt(c.score);
        }
      }

      let winnerId: number | null = null;
      if (status === "final") {
        const winnerCompetitor = competitors.find((c) => c.winner);
        if (winnerCompetitor) {
          if (game.teamA?.espnId === winnerCompetitor.team.id) {
            winnerId = game.teamAId;
          } else if (game.teamB?.espnId === winnerCompetitor.team.id) {
            winnerId = game.teamBId;
          }
        }
      }

      // Build the update defensively so a partial/regressed ESPN payload can't
      // clobber a good final: never downgrade a recorded final, never null out
      // an existing score or winner.
      const updates: Partial<typeof games.$inferInsert> = {
        scheduledAt: new Date(competition.date),
      };
      if (!(game.status === "final" && status !== "final")) {
        updates.status = status;
      }
      if (scoreA !== null) updates.scoreA = scoreA;
      if (scoreB !== null) updates.scoreB = scoreB;
      if (winnerId) updates.winnerId = winnerId;
      if (status === "in_progress") {
        updates.clock = competition.status.displayClock ?? null;
        updates.period = competition.status.period ?? null;
      } else if (status === "final") {
        updates.clock = null;
        updates.period = null;
      }

      try {
        await db.update(games).set(updates).where(eq(games.id, game.id));
        gamesUpdated++;
      } catch (err) {
        console.error(`Failed to update game ${game.id} (slot ${game.gameSlot}):`, err);
      }

      // Once a winner is known, run the (idempotent) post-final pipeline every
      // cycle so missed advancements self-heal. Notify only when the winner
      // first becomes known — which also covers games ESPN marks final before
      // it sets the winner flag.
      const winnerNewlyKnown = !!winnerId && winnerId !== game.winnerId;
      if (status === "final" && winnerId) {
        const result = await processFinalGame(db, {
          game,
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
  const lock = await lockBracketsPastDeadline(db, now);

  // Once the tournament is over, settle any accepted wagers and hand out badges.
  const wagersResolved = await resolveCompletedWagers();
  const achievementsAwarded = await awardAchievements(db);

  await db
    .update(tournamentConfig)
    .set({ lastScoreUpdateAt: now })
    .where(eq(tournamentConfig.id, 1));

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
async function resolveCompletedWagers(): Promise<number> {
  const champ = await db.query.games.findFirst({
    where: eq(games.round, "championship"),
    columns: { status: true, winnerId: true },
  });

  if (!champ || champ.status !== "final" || !champ.winnerId) return 0;

  const accepted = await db.query.wagers.findMany({
    where: eq(wagers.status, "accepted"),
  });

  if (accepted.length === 0) return 0;

  let resolved = 0;
  const resolvedAt = new Date();

  // Display names for the notification copy ("You beat Ali: loser buys dinner").
  const userIds = [...new Set(accepted.flatMap((w) => [w.challengerId, w.opponentId]))];
  const names = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(inArray(profiles.id, userIds));
  const nameOf = new Map(names.map((p) => [p.id, p.displayName]));

  const bracketScore = async (bracketId: string): Promise<number> => {
    const row = await db.query.brackets.findFirst({
      where: eq(brackets.id, bracketId),
      columns: { score: true },
    });
    return row?.score ?? 0;
  };

  for (const wager of accepted) {
    const challengerScore = await bracketScore(wager.challengerBracketId);

    // Use the explicitly-wagered opponent bracket, else fall back to their
    // primary bracket.
    let opponentScore = 0;
    if (wager.opponentBracketId) {
      opponentScore = await bracketScore(wager.opponentBracketId);
    } else {
      const row = await db.query.brackets.findFirst({
        where: and(eq(brackets.userId, wager.opponentId), eq(brackets.isPrimary, true)),
        columns: { score: true },
      });
      opponentScore = row?.score ?? 0;
    }

    let winnerId: string | null = null;
    if (challengerScore > opponentScore) winnerId = wager.challengerId;
    else if (opponentScore > challengerScore) winnerId = wager.opponentId;
    // Equal scores → resolved with no winner (a tie).

    await db.transaction(async (tx) => {
      await tx
        .update(wagers)
        .set({ status: "resolved", winnerId, resolvedAt })
        .where(eq(wagers.id, wager.id));

      await tx.insert(notificationQueue).values([
        {
          userId: wager.challengerId,
          type: "wager_result",
          payload: {
            wager_id: wager.id,
            stakes: wager.stakes,
            opponent_id: wager.opponentId,
            opponent_name: nameOf.get(wager.opponentId) ?? null,
            your_score: challengerScore,
            their_score: opponentScore,
            won: winnerId === wager.challengerId,
            tie: winnerId === null,
          },
        },
        {
          userId: wager.opponentId,
          type: "wager_result",
          payload: {
            wager_id: wager.id,
            stakes: wager.stakes,
            opponent_id: wager.challengerId,
            opponent_name: nameOf.get(wager.challengerId) ?? null,
            your_score: opponentScore,
            their_score: challengerScore,
            won: winnerId === wager.opponentId,
            tie: winnerId === null,
          },
        },
      ]);
    });

    resolved++;
  }

  return resolved;
}
