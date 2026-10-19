import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { bracketPicks, brackets, games, profiles, teams, tournamentConfig } from "@/db/schema";
import {
  fetchESPNScoreboard,
  parseGameStatus,
  formatDateForESPN,
  type ESPNEvent,
} from "@/lib/espn";
import { getRoundPoints, isUpset } from "@/lib/utils";
import { authorizeCronOrAdmin } from "@/lib/admin-auth";
import { getScoringMultipliers } from "@/lib/tournament-config";
import { processFinalGame } from "@/lib/process-final-game";

type ESPNCompetition = ESPNEvent["competitions"][number];

export const maxDuration = 300;

const gameWithTeams = { teamA: true, teamB: true } as const;

async function authorize(request: NextRequest): Promise<boolean> {
  return authorizeCronOrAdmin(request);
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("diagnose") === "true") {
    return handleDiagnose();
  }
  if (url.searchParams.get("sync") === "true") {
    return handleFullSync();
  }
  if (url.searchParams.get("verify") === "true") {
    return handleVerify();
  }
  if (url.searchParams.get("compare")) {
    return handleCompare(url.searchParams.get("compare")!);
  }
  return handleBackfill();
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return handleBackfill();
}

/** Every final game with a known winner, earliest slot first so earlier rounds process before later ones. */
function finalGamesWithTeams() {
  return db.query.games.findMany({
    where: and(eq(games.status, "final"), isNotNull(games.winnerId)),
    with: gameWithTeams,
    orderBy: asc(games.gameSlot),
  });
}

async function handleBackfill() {
  let finalGames: Awaited<ReturnType<typeof finalGamesWithTeams>>;
  try {
    finalGames = await finalGamesWithTeams();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch games" },
      { status: 500 }
    );
  }

  if (finalGames.length === 0) {
    return NextResponse.json({ message: "No final games found", fixed: 0 });
  }

  const config = await db.query.tournamentConfig.findFirst({
    where: eq(tournamentConfig.id, 1),
    columns: { scoringMultipliers: true },
  });
  const multipliers = getScoringMultipliers({
    scoring_multipliers: config?.scoringMultipliers ?? null,
  });

  let picksScored = 0;
  let bracketsRecalculated = 0;
  const details: string[] = [];

  // The shared pipeline is idempotent: eliminations, advancements, play-in pick
  // swaps and scoring are all re-applied, and only changed rows are written.
  for (const game of finalGames) {
    const result = await processFinalGame(db, {
      game,
      winnerId: game.winnerId!,
      scoreA: game.scoreA,
      scoreB: game.scoreB,
      multipliers,
      notify: false,
    });
    picksScored += result.picksScored;
    bracketsRecalculated = result.bracketsRecalculated;
    if (result.picksScored > 0) {
      details.push(`Slot ${game.gameSlot}: re-scored ${result.picksScored} picks`);
    }
  }

  return NextResponse.json({
    message: "Backfill complete",
    gamesProcessed: finalGames.length,
    picksScored,
    bracketsRecalculated,
    details,
  });
}

/** Advance `winnerId` into the next slot and eliminate the loser (no scoring). */
async function advanceWinner(
  game: { teamAId: number | null; teamBId: number | null; nextGameSlot: number | null; slotPosition: "top" | "bottom" | null },
  winnerId: number
) {
  const loserId = winnerId === game.teamAId ? game.teamBId : game.teamAId;
  if (loserId) {
    await db.update(teams).set({ eliminated: true }).where(eq(teams.id, loserId));
  }
  if (game.nextGameSlot) {
    await db
      .update(games)
      .set(game.slotPosition === "top" ? { teamAId: winnerId } : { teamBId: winnerId })
      .where(eq(games.gameSlot, game.nextGameSlot));
  }
}

async function handleFullSync() {
  const details: string[] = [];
  let gamesMatched = 0;
  let gamesUpdated = 0;

  // Scan every day of the tournament, derived from the scheduled games.
  const [[firstGame], [lastGame]] = await Promise.all([
    db
      .select({ scheduledAt: games.scheduledAt })
      .from(games)
      .where(isNotNull(games.scheduledAt))
      .orderBy(asc(games.scheduledAt))
      .limit(1),
    db
      .select({ scheduledAt: games.scheduledAt })
      .from(games)
      .where(isNotNull(games.scheduledAt))
      .orderBy(desc(games.scheduledAt))
      .limit(1),
  ]);
  if (!firstGame?.scheduledAt || !lastGame?.scheduledAt) {
    return NextResponse.json({ error: "No scheduled games to sync" }, { status: 400 });
  }
  const startDate = new Date(new Date(firstGame.scheduledAt).getTime() - 24 * 60 * 60 * 1000);
  const endDate = new Date(new Date(lastGame.scheduledAt).getTime() + 24 * 60 * 60 * 1000);
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(formatDateForESPN(d));
  }

  // Fetch games that need fixing: not final, OR final but missing winner/scores
  const unmatchedGames = await db.query.games.findMany({
    where: or(
      ne(games.status, "final"),
      isNull(games.winnerId),
      isNull(games.scoreA),
      isNull(games.scoreB)
    ),
    with: gameWithTeams,
    orderBy: asc(games.gameSlot),
  });

  if (unmatchedGames.length === 0) {
    return NextResponse.json({ message: "No unmatched games to sync", gamesMatched: 0 });
  }

  details.push(`Found ${unmatchedGames.length} non-final games to sync`);
  details.push(`Scanning ${dates.length} days of ESPN data...`);

  // Collect all ESPN events across the tournament
  const allEvents: Array<{ event: ESPNEvent; competition: ESPNCompetition }> = [];
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

  // Build ESPN event lookup by competition ID
  const espnById = new Map<string, ESPNCompetition>();
  for (const { competition } of allEvents) {
    espnById.set(competition.id, competition);
  }

  // First: fix games that already have espn_game_id but are missing winner/scores
  const gamesWithEspnId = unmatchedGames.filter((g) => g.espnGameId);
  for (const game of gamesWithEspnId) {
    const competition = espnById.get(game.espnGameId!);
    if (!competition) {
      details.push(`Slot ${game.gameSlot}: ESPN game ${game.espnGameId} not found in scanned data`);
      continue;
    }

    const status = parseGameStatus(competition.status.type.state);
    const competitors = competition.competitors;

    let scoreA: number | null = null;
    let scoreB: number | null = null;
    for (const c of competitors) {
      if (game.teamA?.espnId === c.team.id && c.score) scoreA = parseInt(c.score);
      else if (game.teamB?.espnId === c.team.id && c.score) scoreB = parseInt(c.score);
    }

    let winnerId: number | null = null;
    if (status === "final") {
      const winnerComp = competitors.find((c) => c.winner);
      if (winnerComp) {
        if (game.teamA?.espnId === winnerComp.team.id) winnerId = game.teamAId;
        else if (game.teamB?.espnId === winnerComp.team.id) winnerId = game.teamBId;
      }
    }

    const updates: Partial<typeof games.$inferInsert> = { status };
    if (scoreA != null) updates.scoreA = scoreA;
    if (scoreB != null) updates.scoreB = scoreB;
    if (winnerId) updates.winnerId = winnerId;

    await db.update(games).set(updates).where(eq(games.id, game.id));

    if (winnerId && game.nextGameSlot) {
      await advanceWinner(game, winnerId);
    }

    const winnerName = winnerId === game.teamAId ? game.teamA?.name : game.teamB?.name;
    details.push(
      `Re-synced slot ${game.gameSlot}: ${game.teamA?.name || "?"} vs ${game.teamB?.name || "?"} → ${status}${winnerId ? ` (winner: ${winnerName}, ${scoreA}-${scoreB})` : " (no winner found)"}`
    );
    if (winnerId) gamesMatched++;
  }

  // Build set of ESPN game IDs already claimed
  const claimedGames = await db
    .select({ espnGameId: games.espnGameId })
    .from(games)
    .where(isNotNull(games.espnGameId));
  const claimedIds = new Set(claimedGames.map((g) => g.espnGameId));

  // Multiple passes: match games with both teams first, then single-team matches
  // Process in game_slot order so earlier rounds resolve before later ones
  // Run up to 6 passes to resolve cascading dependencies
  for (let pass = 0; pass < 6; pass++) {
    // Re-fetch unmatched games each pass (teams may have been filled by previous pass)
    const currentUnmatched = await db.query.games.findMany({
      where: ne(games.status, "final"),
      with: gameWithTeams,
      orderBy: asc(games.gameSlot),
    });

    if (currentUnmatched.length === 0) break;

    let matchedThisPass = 0;

    for (const game of currentUnmatched) {
      if (!game.teamA && !game.teamB) continue;

      // Debug: log what we're looking for on first pass
      if (pass === 0) {
        details.push(
          `Slot ${game.gameSlot}: looking for ${game.teamA?.name || "TBD"} (espn:${game.teamA?.espnId || "null"}) vs ${game.teamB?.name || "TBD"} (espn:${game.teamB?.espnId || "null"})`
        );

        // For games with both teams, show unclaimed ESPN events that have a partial match
        if (game.teamA && game.teamB) {
          for (const { event, competition } of allEvents) {
            if (claimedIds.has(competition.id)) continue;
            const cIds = competition.competitors.map((c) => c.team.id);
            const cNames = competition.competitors.map((c) => c.team.displayName);
            const aHit = cIds.includes(game.teamA.espnId ?? "");
            const bHit = cIds.includes(game.teamB.espnId ?? "");
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
        const espnTeamIds = competitors.map((c) => c.team.id);

        const teamAMatch = !!game.teamA?.espnId && espnTeamIds.includes(game.teamA.espnId);
        const teamBMatch = !!game.teamB?.espnId && espnTeamIds.includes(game.teamB.espnId);

        // Need at least one team to match, and the other to either match or be null
        const hasMatch =
          (teamAMatch && teamBMatch) ||
          (teamAMatch && !game.teamB) ||
          (teamBMatch && !game.teamA);

        if (hasMatch) {
          const status = parseGameStatus(competition.status.type.state);

          // Get scores
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
            const winnerComp = competitors.find((c) => c.winner);
            if (winnerComp) {
              if (game.teamA?.espnId === winnerComp.team.id) {
                winnerId = game.teamAId;
              } else if (game.teamB?.espnId === winnerComp.team.id) {
                winnerId = game.teamBId;
              }
            }
          }

          await db
            .update(games)
            .set({
              espnGameId: competition.id,
              status,
              scoreA,
              scoreB,
              winnerId,
              scheduledAt: new Date(competition.date),
            })
            .where(eq(games.id, game.id));

          claimedIds.add(competition.id);

          // If final, advance winner to next slot immediately
          if (status === "final" && winnerId && game.nextGameSlot) {
            await advanceWinner(game, winnerId);
          }

          const winnerName = winnerId === game.teamAId ? game.teamA?.name : game.teamB?.name;
          details.push(
            `[pass ${pass + 1}] Matched slot ${game.gameSlot}: ${game.teamA?.name || "TBD"} vs ${game.teamB?.name || "TBD"} → ${status}${winnerId ? ` (winner: ${winnerName}, ${scoreA}-${scoreB})` : ""}`
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
  const finalGames = await finalGamesWithTeams();

  for (const game of finalGames) {
    const winnerId = game.winnerId!;
    const loserId = winnerId === game.teamAId ? game.teamBId : game.teamAId;

    if (loserId) {
      const loserTeam = await db.query.teams.findFirst({
        where: eq(teams.id, loserId),
        columns: { eliminated: true, name: true },
      });
      if (loserTeam && !loserTeam.eliminated) {
        await db.update(teams).set({ eliminated: true }).where(eq(teams.id, loserId));
        details.push(`Eliminated: ${loserTeam.name}`);
      }
    }

    if (game.nextGameSlot) {
      const nextGame = await db.query.games.findFirst({
        where: eq(games.gameSlot, game.nextGameSlot),
        columns: { teamAId: true, teamBId: true },
      });

      if (nextGame) {
        const isTop = game.slotPosition === "top";
        const currentValue = isTop ? nextGame.teamAId : nextGame.teamBId;
        if (currentValue !== winnerId) {
          await db
            .update(games)
            .set(isTop ? { teamAId: winnerId } : { teamBId: winnerId })
            .where(eq(games.gameSlot, game.nextGameSlot));
          gamesUpdated++;
          const winnerTeam = winnerId === game.teamAId ? game.teamA : game.teamB;
          details.push(`Advanced: ${winnerTeam?.name} → slot ${game.nextGameSlot}`);
        }
      }
    }
  }

  // Score any unscored picks
  let picksScored = 0;
  for (const game of finalGames) {
    const picks = await db
      .select()
      .from(bracketPicks)
      .where(and(eq(bracketPicks.gameSlot, game.gameSlot), isNull(bracketPicks.isCorrect)));

    for (const pick of picks) {
      const correct = pick.pickedTeamId === game.winnerId;
      let points = 0;
      if (correct) {
        const basePoints = getRoundPoints(game.round);
        const winnerTeam = game.winnerId === game.teamAId ? game.teamA : game.teamB;
        const loserTeam = game.winnerId === game.teamAId ? game.teamB : game.teamA;
        if (winnerTeam && loserTeam && isUpset(winnerTeam.seed, loserTeam.seed)) {
          points = Math.round(basePoints * 1.5);
        } else {
          points = basePoints;
        }
      }
      await db
        .update(bracketPicks)
        .set({ isCorrect: correct, pointsEarned: points })
        .where(eq(bracketPicks.id, pick.id));
      picksScored++;
    }
  }

  // Recalculate bracket scores
  const allPicks = await db
    .select({ bracketId: bracketPicks.bracketId, pointsEarned: bracketPicks.pointsEarned })
    .from(bracketPicks)
    .where(isNotNull(bracketPicks.isCorrect));

  let bracketsRecalculated = 0;
  const scoresByBracket = new Map<string, number>();
  for (const pick of allPicks) {
    const current = scoresByBracket.get(pick.bracketId) || 0;
    scoresByBracket.set(pick.bracketId, current + (pick.pointsEarned || 0));
  }
  for (const [bracketId, score] of scoresByBracket) {
    await db.update(brackets).set({ score }).where(eq(brackets.id, bracketId));
    bracketsRecalculated++;
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

async function handleVerify() {
  // Get all final games with teams
  let finalGames: Awaited<ReturnType<typeof finalGamesWithTeams>>;
  try {
    finalGames = await finalGamesWithTeams();
  } catch {
    return NextResponse.json({ error: "Failed to fetch games" }, { status: 500 });
  }

  // Build a map of game_slot -> game info for quick lookup
  const gameMap = new Map(finalGames.map((g) => [g.gameSlot, g]));

  // Get all brackets with user display names
  let allBrackets: { id: string; name: string; score: number | null; userId: string; locked: boolean | null }[];
  try {
    allBrackets = await db
      .select({
        id: brackets.id,
        name: brackets.name,
        score: brackets.score,
        userId: brackets.userId,
        locked: brackets.locked,
      })
      .from(brackets);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch brackets", detail: err instanceof Error ? err.message : undefined },
      { status: 500 }
    );
  }

  // Fetch profiles for display names
  const userIds = [...new Set(allBrackets.map((b) => b.userId))];
  const profileRows = userIds.length
    ? await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, userIds))
    : [];
  const profileMap = new Map(profileRows.map((p) => [p.id, p.displayName]));

  // Get all picks
  let allPicks: {
    id: number;
    bracketId: string;
    gameSlot: number;
    pickedTeamId: number;
    isCorrect: boolean | null;
    pointsEarned: number | null;
  }[];
  try {
    allPicks = await db
      .select({
        id: bracketPicks.id,
        bracketId: bracketPicks.bracketId,
        gameSlot: bracketPicks.gameSlot,
        pickedTeamId: bracketPicks.pickedTeamId,
        isCorrect: bracketPicks.isCorrect,
        pointsEarned: bracketPicks.pointsEarned,
      })
      .from(bracketPicks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch picks" }, { status: 500 });
  }

  // Group picks by bracket
  const picksByBracket = new Map<string, typeof allPicks>();
  for (const pick of allPicks) {
    const existing = picksByBracket.get(pick.bracketId) || [];
    existing.push(pick);
    picksByBracket.set(pick.bracketId, existing);
  }

  const bracketResults = [];

  for (const bracket of allBrackets) {
    const picks = picksByBracket.get(bracket.id) || [];
    let expectedScore = 0;
    const pickDetails: Array<{
      game_slot: number;
      round: string;
      picked_team_id: number;
      winner_id: number;
      correct: boolean;
      expectedPoints: number;
      storedPoints: number | null;
      storedCorrect: boolean | null;
      mismatch: boolean;
    }> = [];

    for (const pick of picks) {
      const game = gameMap.get(pick.gameSlot);
      if (!game) continue; // game not final yet

      const correct = pick.pickedTeamId === game.winnerId;
      let expectedPoints = 0;

      if (correct) {
        const basePoints = getRoundPoints(game.round);
        const winnerTeam = game.winnerId === game.teamAId ? game.teamA : game.teamB;
        const loserTeam = game.winnerId === game.teamAId ? game.teamB : game.teamA;
        if (winnerTeam && loserTeam && isUpset(winnerTeam.seed, loserTeam.seed)) {
          expectedPoints = Math.round(basePoints * 1.5);
        } else {
          expectedPoints = basePoints;
        }
      }

      expectedScore += expectedPoints;

      const hasMismatch =
        pick.isCorrect !== correct ||
        (pick.pointsEarned ?? 0) !== expectedPoints;

      if (hasMismatch) {
        pickDetails.push({
          game_slot: pick.gameSlot,
          round: game.round,
          picked_team_id: pick.pickedTeamId,
          winner_id: game.winnerId!,
          correct,
          expectedPoints,
          storedPoints: pick.pointsEarned,
          storedCorrect: pick.isCorrect,
          mismatch: true,
        });
      }
    }

    const storedScore = bracket.score ?? 0;
    const scoreMismatch = storedScore !== expectedScore;

    bracketResults.push({
      bracketId: bracket.id,
      name: bracket.name,
      user: profileMap.get(bracket.userId) || bracket.userId,
      storedScore,
      expectedScore,
      scoreMismatch,
      pickMismatches: pickDetails,
      totalPicks: picks.length,
      correctPicks: picks.filter((p) => {
        const g = gameMap.get(p.gameSlot);
        return g && p.pickedTeamId === g.winnerId;
      }).length,
    });
  }

  const allCorrect = bracketResults.every(
    (b) => !b.scoreMismatch && b.pickMismatches.length === 0
  );

  return NextResponse.json({
    verified: allCorrect,
    totalBrackets: bracketResults.length,
    totalGamesScored: finalGames.length,
    brackets: bracketResults,
  });
}

async function handleCompare(bracketIds: string) {
  const ids = bracketIds.split(",");

  // Get all final games
  let finalGames: Awaited<ReturnType<typeof finalGamesWithTeams>>;
  try {
    finalGames = await finalGamesWithTeams();
  } catch {
    return NextResponse.json({ error: "Failed to fetch games" }, { status: 500 });
  }

  // Get brackets
  let selected: { id: string; name: string; score: number | null; userId: string }[];
  try {
    selected = await db
      .select({ id: brackets.id, name: brackets.name, score: brackets.score, userId: brackets.userId })
      .from(brackets)
      .where(inArray(brackets.id, ids));
  } catch {
    return NextResponse.json({ error: "Failed to fetch brackets" }, { status: 500 });
  }

  const userIds = selected.map((b) => b.userId);
  const profileRows = userIds.length
    ? await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, userIds))
    : [];
  const profileMap = new Map(profileRows.map((p) => [p.id, p.displayName]));

  // Get all picks for these brackets
  let allPicks: {
    bracketId: string;
    gameSlot: number;
    pickedTeamId: number;
    isCorrect: boolean | null;
    pointsEarned: number | null;
  }[];
  try {
    allPicks = await db
      .select({
        bracketId: bracketPicks.bracketId,
        gameSlot: bracketPicks.gameSlot,
        pickedTeamId: bracketPicks.pickedTeamId,
        isCorrect: bracketPicks.isCorrect,
        pointsEarned: bracketPicks.pointsEarned,
      })
      .from(bracketPicks)
      .where(inArray(bracketPicks.bracketId, ids));
  } catch {
    return NextResponse.json({ error: "Failed to fetch picks" }, { status: 500 });
  }

  // Group picks: bracketId -> gameSlot -> pick
  const pickMap = new Map<string, Map<number, (typeof allPicks)[0]>>();
  for (const pick of allPicks) {
    if (!pickMap.has(pick.bracketId)) pickMap.set(pick.bracketId, new Map());
    pickMap.get(pick.bracketId)!.set(pick.gameSlot, pick);
  }

  // Build team name lookup from games
  const teamNames = new Map<number, string>();
  for (const g of finalGames) {
    if (g.teamA && g.teamAId) teamNames.set(g.teamAId, `(${g.teamA.seed}) ${g.teamA.name}`);
    if (g.teamB && g.teamBId) teamNames.set(g.teamBId, `(${g.teamB.seed}) ${g.teamB.name}`);
  }

  // Build comparison per game
  const comparison = finalGames.map((game) => {
    const winnerName = teamNames.get(game.winnerId!) || String(game.winnerId);

    const picksForGame = selected.map((b) => {
      const pick = pickMap.get(b.id)?.get(game.gameSlot);
      if (!pick) return { user: profileMap.get(b.userId) || b.name, picked: null, correct: null, points: 0 };
      return {
        user: profileMap.get(b.userId) || b.name,
        picked: teamNames.get(pick.pickedTeamId) || String(pick.pickedTeamId),
        correct: pick.isCorrect,
        points: pick.pointsEarned ?? 0,
      };
    });

    return {
      game_slot: game.gameSlot,
      round: game.round,
      region: game.region,
      matchup: `${game.teamA?.name || "?"} vs ${game.teamB?.name || "?"}`,
      score: `${game.scoreA}-${game.scoreB}`,
      winner: winnerName,
      picks: picksForGame,
    };
  });

  // Summary per bracket
  const summaries = selected.map((b) => {
    const picks = pickMap.get(b.id);
    let totalPoints = 0;
    let correctCount = 0;
    const byRound: Record<string, { correct: number; total: number; points: number }> = {};

    for (const game of finalGames) {
      const pick = picks?.get(game.gameSlot);
      if (!byRound[game.round]) byRound[game.round] = { correct: 0, total: 0, points: 0 };
      byRound[game.round].total++;
      if (pick) {
        const pts = pick.pointsEarned ?? 0;
        totalPoints += pts;
        if (pick.isCorrect) {
          correctCount++;
          byRound[game.round].correct++;
          byRound[game.round].points += pts;
        }
      }
    }

    return {
      user: profileMap.get(b.userId) || b.name,
      bracketName: b.name,
      totalPoints,
      storedScore: b.score,
      correctCount,
      byRound,
    };
  });

  return NextResponse.json({ summaries, games: comparison });
}

/** The diagnose report keeps the database column names the admin tools print. */
function diagnoseRow(g: {
  gameSlot: number;
  round: string;
  region: string | null;
  status: string;
  teamAId: number | null;
  teamBId: number | null;
}) {
  return {
    game_slot: g.gameSlot,
    round: g.round,
    region: g.region,
    status: g.status,
    team_a_id: g.teamAId,
    team_b_id: g.teamBId,
  };
}

async function handleDiagnose() {
  // Find games that are NOT final
  const incomplete = await db.query.games.findMany({
    where: ne(games.status, "final"),
    with: {
      teamA: { columns: { name: true, seed: true } },
      teamB: { columns: { name: true, seed: true } },
    },
    orderBy: asc(games.gameSlot),
  });

  // Find games with null teams (TBD)
  const [tbdGamesA, tbdGamesB] = await Promise.all([
    db.query.games.findMany({ where: isNull(games.teamAId), orderBy: asc(games.gameSlot) }),
    db.query.games.findMany({ where: isNull(games.teamBId), orderBy: asc(games.gameSlot) }),
  ]);

  return NextResponse.json({
    incompleteGames: incomplete.map((g) => ({
      ...diagnoseRow(g),
      winner_id: g.winnerId,
      espn_game_id: g.espnGameId,
      team_a: g.teamA,
      team_b: g.teamB,
    })),
    tbdSlots: {
      missingTeamA: tbdGamesA.map(diagnoseRow),
      missingTeamB: tbdGamesB.map(diagnoseRow),
    },
  });
}
