import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { brackets, games, profiles, teams, userAchievements, wagers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getScoringMultipliers,
  getSeason,
  isPastDeadline,
  isPastWagerDeadline,
} from "@/lib/tournament";
import { buildLeaderboard, maxPossiblePoints } from "@/lib/scoring";
import { REQUIRED_PICKS, type YearDefaults } from "@/lib/tournament-structure";
import { REGION_DISPLAY_NAMES, ROUND_DISPLAY_NAMES } from "@/lib/utils";
import type { TournamentPhase } from "@/types";
import { BracketStatusCard } from "@/components/dashboard/BracketStatusCard";
import { StandingCard, type ChampionPick } from "@/components/dashboard/StandingCard";
import { TodaysGames, type TodayGameRow } from "@/components/dashboard/TodaysGames";
import { MiniLeaderboard } from "@/components/dashboard/MiniLeaderboard";
import { WagersWidget, type WagerRow } from "@/components/dashboard/WagersWidget";
import { AchievementsCard } from "@/components/dashboard/AchievementsCard";
import {
  countRequiredPicks,
  formatEastern,
  formatEasternDate,
  formatEasternTime,
  isWithinHours,
  pickOutcome,
  summarizePicks,
  todaysGames,
  type PickLite,
} from "@/components/dashboard/helpers";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

function phaseLabel(phase: TournamentPhase): string {
  if (phase === "pre_tournament") return "Pre-tournament";
  if (phase === "completed") return "Completed";
  return ROUND_DISPLAY_NAMES[phase];
}

function selectionSundayCopy(upcoming: YearDefaults | null): string {
  return upcoming ? formatEasternDate(upcoming.selectionSunday) : "Selection Sunday";
}

function introCopy(opts: {
  phase: TournamentPhase;
  year: number;
  displayYear: number;
  upcoming: YearDefaults | null;
  hasBracket: boolean;
  locked: boolean;
}): string {
  const { phase, year, displayYear, upcoming, hasBracket, locked } = opts;
  if (phase === "completed")
    return `That's a wrap on ${year}. Here's how you finished. ${displayYear} brackets open ${selectionSundayCopy(upcoming)}.`;
  if (phase !== "pre_tournament")
    return "The tournament is underway. Follow today's games and track your standing below.";
  if (!hasBracket)
    return "Create your bracket, pick a winner for every game, then challenge your friends to a wager.";
  if (locked)
    return "Your bracket is finalized. You can challenge friends to wagers until the wager deadline, then watch the scores roll in.";
  return `Fill out all ${REQUIRED_PICKS} picks and finalize before the deadline. Wagers are open to everyone until the wager deadline — your bracket doesn't need to be finalized first.`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/dashboard");

  // Queries throw on failure, which surfaces in error.tsx instead of an empty dashboard.
  const [season, profile, bracket, ranked, gameRows, teamRows, wagerRows, achievementRows] =
    await Promise.all([
      getSeason(),
      db.query.profiles.findFirst({
        columns: { displayName: true },
        where: eq(profiles.id, user.id),
      }),
      db.query.brackets.findFirst({
        columns: { id: true, name: true, locked: true, score: true },
        where: eq(brackets.userId, user.id),
        with: {
          picks: {
            columns: {
              gameSlot: true,
              round: true,
              pickedTeamId: true,
              isCorrect: true,
              pointsEarned: true,
            },
          },
        },
      }),
      db.query.brackets.findMany({
        columns: { id: true, userId: true, name: true, score: true },
        where: and(eq(brackets.isPrimary, true), eq(brackets.locked, true)),
        with: { user: { columns: { displayName: true, avatarUrl: true } } },
      }),
      db
        .select({
          id: games.id,
          gameSlot: games.gameSlot,
          round: games.round,
          region: games.region,
          teamAId: games.teamAId,
          teamBId: games.teamBId,
          winnerId: games.winnerId,
          scoreA: games.scoreA,
          scoreB: games.scoreB,
          scheduledAt: games.scheduledAt,
          status: games.status,
        })
        .from(games)
        .orderBy(games.gameSlot),
      db
        .select({
          id: teams.id,
          name: teams.name,
          abbreviation: teams.abbreviation,
          seed: teams.seed,
          logoUrl: teams.logoUrl,
          eliminated: teams.eliminated,
        })
        .from(teams),
      db.query.wagers.findMany({
        columns: {
          id: true,
          stakes: true,
          status: true,
          challengerId: true,
          opponentId: true,
          winnerId: true,
        },
        where: and(
          or(eq(wagers.challengerId, user.id), eq(wagers.opponentId, user.id)),
          ne(wagers.status, "declined")
        ),
        with: {
          challenger: { columns: { displayName: true } },
          opponent: { columns: { displayName: true } },
        },
        orderBy: desc(wagers.createdAt),
        limit: 10,
      }),
      db
        .select({ achievementType: userAchievements.achievementType })
        .from(userAchievements)
        .where(eq(userAchievements.userId, user.id)),
    ]);

  // The dashboard widgets and pure helpers still take the row shapes they were
  // written against, so adapt the Drizzle rows here rather than in each widget.
  const gameList = gameRows.map((g) => ({
    ...g,
    scheduled_at: g.scheduledAt?.toISOString() ?? null,
    winner_id: g.winnerId,
  }));
  const wagerList: WagerRow[] = wagerRows.map((w) => ({
    id: w.id,
    stakes: w.stakes,
    status: w.status,
    challenger_id: w.challengerId,
    opponent_id: w.opponentId,
    winner_id: w.winnerId,
    challenger: w.challenger ? { display_name: w.challenger.displayName } : null,
    opponent: w.opponent ? { display_name: w.opponent.displayName } : null,
  }));
  const earnedBadges = achievementRows.map((a) => a.achievementType);

  const { config, phase, tournamentYear: year, displayYear, upcoming } = season;
  const preLock = phase === "pre_tournament";
  const completed = phase === "completed";
  const pastDeadline = isPastDeadline(config);
  const pastWagerDeadline = isPastWagerDeadline(config);
  const multipliers = getScoringMultipliers(config);

  const picks: PickLite[] = (bracket?.picks ?? []).map((p) => ({
    game_slot: p.gameSlot,
    round: p.round,
    picked_team_id: p.pickedTeamId,
    is_correct: p.isCorrect,
    points_earned: p.pointsEarned,
  }));
  const pickCount = countRequiredPicks(picks);
  const locked = !!bracket?.locked;
  const teamsById = new Map(teamRows.map((t) => [t.id, t]));
  const pickBySlot = new Map(picks.map((p) => [p.game_slot, p]));

  // --- Standing -----------------------------------------------------------
  // Only name/score/rank are rendered here, so the per-bracket pick counts the
  // leaderboard entry type carries aren't fetched for other players.
  const entries = buildLeaderboard(
    ranked.map((b) => ({
      userId: b.userId,
      displayName: b.user?.displayName || "Anonymous",
      avatarUrl: b.user?.avatarUrl ?? null,
      bracketId: b.id,
      bracketName: b.name,
      score: b.score ?? 0,
      correctPicks: 0,
      totalPicks: 0,
    }))
  );
  const myEntry = bracket ? entries.find((e) => e.bracketId === bracket.id) : undefined;
  const { correct, scored } = summarizePicks(picks);
  const eliminatedIds = new Set(teamRows.filter((t) => t.eliminated).map((t) => t.id));
  const maxPossible = maxPossiblePoints(
    picks.map((p) => ({
      gameSlot: p.game_slot,
      pickedTeamId: p.picked_team_id,
      pointsEarned: p.points_earned,
      isCorrect: p.is_correct,
    })),
    gameRows.map((g) => ({
      gameSlot: g.gameSlot,
      round: g.round,
      status: g.status,
      winnerId: g.winnerId,
    })),
    eliminatedIds,
    multipliers
  );

  const championshipGame = gameRows.find((g) => g.round === "championship");
  const champPickRow = championshipGame ? pickBySlot.get(championshipGame.gameSlot) : undefined;
  const champTeam = champPickRow ? teamsById.get(champPickRow.picked_team_id) : undefined;
  const championPick: ChampionPick | null = champTeam
    ? {
        name: champTeam.name,
        seed: champTeam.seed,
        logoUrl: champTeam.logoUrl,
        alive: !champTeam.eliminated,
      }
    : null;

  // --- Today's games --------------------------------------------------------
  const todayRows: TodayGameRow[] = todaysGames(gameList).map((g) => {
    const a = g.teamAId ? teamsById.get(g.teamAId) : undefined;
    const b = g.teamBId ? teamsById.get(g.teamBId) : undefined;
    const pick = pickBySlot.get(g.gameSlot);
    const pickedTeam = pick ? teamsById.get(pick.picked_team_id) : undefined;
    const regionLabel = g.region ? ` · ${REGION_DISPLAY_NAMES[g.region] ?? g.region}` : "";
    return {
      id: g.id,
      roundLabel: `${ROUND_DISPLAY_NAMES[g.round]}${regionLabel}`,
      teamA: a ? { seed: a.seed, name: a.name } : null,
      teamB: b ? { seed: b.seed, name: b.name } : null,
      scoreA: g.scoreA,
      scoreB: g.scoreB,
      status: g.status,
      tipTime: g.scheduled_at ? formatEasternTime(g.scheduled_at) : "TBD",
      pick: pickedTeam
        ? { name: pickedTeam.name, outcome: pickOutcome(g, pick?.picked_team_id) }
        : null,
    };
  });

  const displayName = profile?.displayName || "Player";
  const lockDeadline = config?.bracket_lock_deadline ?? null;
  const wagerDeadline = config?.wager_creation_deadline ?? null;
  const urgent = !locked && isWithinHours(lockDeadline, 24);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-2">Welcome, {displayName}</h1>
      <p className="font-body text-xs text-navy/60 mb-8 max-w-2xl">
        {introCopy({ phase, year, displayYear, upcoming, hasBracket: !!bracket, locked })}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {preLock ? (
            lockDeadline ? (
              <BracketStatusCard
                bracket={bracket ? { id: bracket.id, name: bracket.name, locked } : null}
                pickCount={pickCount}
                deadline={lockDeadline}
                urgent={urgent}
              />
            ) : (
              <div className="retro-card p-6">
                <p className="font-body text-sm text-navy/70">
                  The {year} tournament hasn&apos;t been set up yet. Check back soon.
                </p>
              </div>
            )
          ) : bracket && locked ? (
            <StandingCard
              bracketId={bracket.id}
              rank={myEntry?.rank ?? null}
              total={entries.length}
              score={bracket.score ?? 0}
              correct={correct}
              scored={scored}
              maxPossible={maxPossible}
              championPick={championPick}
              final={completed}
            />
          ) : (
            <div className="retro-card p-6">
              <h2 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2 mb-4">
                YOUR BRACKET
              </h2>
              {!bracket ? (
                completed ? (
                  <p className="font-body text-sm text-navy/70">
                    The {year} tournament is over. {displayYear} brackets open{" "}
                    {selectionSundayCopy(upcoming)} —{" "}
                    <Link href="/#waitlist" className="text-burnt-orange hover:underline">
                      join the waitlist
                    </Link>{" "}
                    to hear when. Until then, the{" "}
                    <Link href="/leaderboard" className="text-burnt-orange hover:underline">
                      final standings
                    </Link>{" "}
                    are up.
                  </p>
                ) : (
                <p className="font-body text-sm text-navy/70">
                  Brackets are closed for {year}. You can still follow every game on the{" "}
                  <Link href="/schedule" className="text-burnt-orange hover:underline">
                    schedule
                  </Link>{" "}
                  and watch the{" "}
                  <Link href="/leaderboard" className="text-burnt-orange hover:underline">
                    leaderboard
                  </Link>
                  .
                </p>
                )
              ) : pastDeadline && pickCount >= REQUIRED_PICKS ? (
                <p className="font-body text-sm text-navy/70">
                  The deadline passed with all {REQUIRED_PICKS} picks in — your bracket is
                  being locked in automatically.{" "}
                  <Link href={`/bracket/${bracket.id}`} className="text-burnt-orange hover:underline">
                    View bracket
                  </Link>
                </p>
              ) : (
                <p className="font-body text-sm text-navy/70">
                  The deadline passed with {pickCount}/{REQUIRED_PICKS} picks. Your bracket
                  isn&apos;t eligible for the leaderboard.{" "}
                  <Link href={`/bracket/${bracket.id}`} className="text-burnt-orange hover:underline">
                    View bracket
                  </Link>
                </p>
              )}
            </div>
          )}

          {!preLock && !completed && <TodaysGames games={todayRows} />}

          {completed && <AchievementsCard earned={earnedBadges} />}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {!preLock && (
            <MiniLeaderboard
              entries={entries}
              myBracketId={bracket?.id ?? null}
              title={completed ? "FINAL STANDINGS" : "LEADERBOARD"}
            />
          )}

          <WagersWidget
            wagers={completed ? wagerList : wagerList.filter((w) => w.status !== "resolved")}
            userId={user.id}
            wagerDeadline={wagerDeadline}
            pastWagerDeadline={pastWagerDeadline}
            showResults={completed}
          />

          <div className="retro-card p-4">
            <h3 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2 mb-3">
              TOURNAMENT
            </h3>
            <dl className="space-y-2 font-body text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-navy/60">Year</dt>
                <dd className="font-bold">{year}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-navy/60">Phase</dt>
                <dd className="font-bold">{phaseLabel(phase)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-navy/60 shrink-0">Brackets lock</dt>
                <dd className={`text-right ${pastDeadline ? "text-burnt-orange" : "text-forest"}`}>
                  {lockDeadline
                    ? pastDeadline
                      ? "Locked"
                      : formatEastern(lockDeadline)
                    : "TBD"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-navy/60 shrink-0">Wagers close</dt>
                <dd className={`text-right ${pastWagerDeadline ? "text-burnt-orange" : "text-forest"}`}>
                  {wagerDeadline
                    ? pastWagerDeadline
                      ? "Closed"
                      : formatEastern(wagerDeadline)
                    : "TBD"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
