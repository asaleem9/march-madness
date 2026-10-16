import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getChampion,
  getEffectivePhase,
  getScoringMultipliers,
  getTournamentConfig,
  isPastDeadline,
  isPastWagerDeadline,
} from "@/lib/tournament";
import { buildLeaderboard, maxPossiblePoints } from "@/lib/scoring";
import { REQUIRED_PICKS } from "@/lib/tournament-structure";
import { REGION_DISPLAY_NAMES, ROUND_DISPLAY_NAMES } from "@/lib/utils";
import type { AchievementType, GameStatus, Region, Round, TournamentPhase } from "@/types";
import { BracketStatusCard } from "@/components/dashboard/BracketStatusCard";
import { StandingCard, type ChampionPick } from "@/components/dashboard/StandingCard";
import { TodaysGames, type TodayGameRow } from "@/components/dashboard/TodaysGames";
import { MiniLeaderboard } from "@/components/dashboard/MiniLeaderboard";
import { WagersWidget, type WagerRow } from "@/components/dashboard/WagersWidget";
import { AchievementsCard } from "@/components/dashboard/AchievementsCard";
import {
  countRequiredPicks,
  formatEastern,
  formatEasternTime,
  isWithinHours,
  pickOutcome,
  summarizePicks,
  todaysGames,
  type PickLite,
} from "@/components/dashboard/helpers";

export const metadata: Metadata = { title: "Dashboard" };

interface TeamRow {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
  logo_url: string | null;
  eliminated: boolean | null;
}

interface GameRow {
  id: number;
  game_slot: number;
  round: Round;
  region: Region | null;
  team_a_id: number | null;
  team_b_id: number | null;
  winner_id: number | null;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
  status: GameStatus;
}

interface BracketRow {
  id: string;
  name: string;
  locked: boolean | null;
  score: number | null;
  bracket_picks: PickLite[] | null;
}

interface RankedBracketRow {
  id: string;
  user_id: string;
  name: string;
  score: number | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

function phaseLabel(phase: TournamentPhase): string {
  if (phase === "pre_tournament") return "Pre-tournament";
  if (phase === "completed") return "Completed";
  return ROUND_DISPLAY_NAMES[phase];
}

function introCopy(opts: {
  phase: TournamentPhase;
  year: number;
  hasBracket: boolean;
  locked: boolean;
}): string {
  const { phase, year, hasBracket, locked } = opts;
  if (phase === "completed") return `That's a wrap on ${year}. Here's how you finished.`;
  if (phase !== "pre_tournament")
    return "The tournament is underway. Follow today's games and track your standing below.";
  if (!hasBracket)
    return "Create your bracket, pick a winner for every game, then challenge your friends to a wager.";
  if (locked)
    return "Your bracket is finalized. You can challenge friends to wagers until the wager deadline, then watch the scores roll in.";
  return `Fill out all ${REQUIRED_PICKS} picks and finalize before the deadline. Wagers are open to everyone until the wager deadline — your bracket doesn't need to be finalized first.`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard");

  const [
    config,
    champion,
    profileRes,
    bracketRes,
    rankedRes,
    gamesRes,
    teamsRes,
    wagersRes,
    achievementsRes,
  ] = await Promise.all([
    getTournamentConfig(),
    getChampion(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("brackets")
      .select(
        "id, name, locked, score, bracket_picks(game_slot, round, picked_team_id, is_correct, points_earned)"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("brackets")
      .select("id, user_id, name, score, profiles!inner(display_name, avatar_url)")
      .eq("is_primary", true)
      .eq("locked", true),
    supabase
      .from("games")
      .select(
        "id, game_slot, round, region, team_a_id, team_b_id, winner_id, score_a, score_b, scheduled_at, status"
      )
      .order("game_slot"),
    supabase.from("teams").select("id, name, abbreviation, seed, logo_url, eliminated"),
    supabase
      .from("wagers")
      .select(
        "id, stakes, status, challenger_id, opponent_id, winner_id, challenger:profiles!challenger_id(display_name), opponent:profiles!opponent_id(display_name)"
      )
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .neq("status", "declined")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("user_achievements").select("achievement_type").eq("user_id", user.id),
  ]);

  // Surface query failures to error.tsx instead of rendering an empty dashboard.
  for (const [label, res] of [
    ["profile", profileRes],
    ["bracket", bracketRes],
    ["leaderboard", rankedRes],
    ["games", gamesRes],
    ["teams", teamsRes],
    ["wagers", wagersRes],
    ["achievements", achievementsRes],
  ] as const) {
    if (res.error) throw new Error(`Dashboard ${label} query failed: ${res.error.message}`);
  }

  const profile = profileRes.data as { display_name: string | null } | null;
  const bracket = bracketRes.data as unknown as BracketRow | null;
  const ranked = (rankedRes.data ?? []) as unknown as RankedBracketRow[];
  const games = (gamesRes.data ?? []) as GameRow[];
  const teams = (teamsRes.data ?? []) as TeamRow[];
  const wagers = (wagersRes.data ?? []) as unknown as WagerRow[];
  const earnedBadges = (achievementsRes.data ?? []).map(
    (a) => a.achievement_type as AchievementType
  );

  const year = config?.year ?? new Date().getFullYear();
  const phase = getEffectivePhase(config, !!champion);
  const preLock = phase === "pre_tournament";
  const completed = phase === "completed";
  const pastDeadline = isPastDeadline(config);
  const pastWagerDeadline = isPastWagerDeadline(config);
  const multipliers = getScoringMultipliers(config);

  const picks = bracket?.bracket_picks ?? [];
  const pickCount = countRequiredPicks(picks);
  const locked = !!bracket?.locked;
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const pickBySlot = new Map(picks.map((p) => [p.game_slot, p]));

  // --- Standing -----------------------------------------------------------
  // Only name/score/rank are rendered here, so the per-bracket pick counts the
  // leaderboard entry type carries aren't fetched for other players.
  const entries = buildLeaderboard(
    ranked.map((b) => ({
      userId: b.user_id,
      displayName: b.profiles?.display_name || "Anonymous",
      avatarUrl: b.profiles?.avatar_url ?? null,
      bracketId: b.id,
      bracketName: b.name,
      score: b.score ?? 0,
      correctPicks: 0,
      totalPicks: 0,
    }))
  );
  const myEntry = bracket ? entries.find((e) => e.bracketId === bracket.id) : undefined;
  const { correct, scored } = summarizePicks(picks);
  const eliminatedIds = new Set(teams.filter((t) => t.eliminated).map((t) => t.id));
  const maxPossible = maxPossiblePoints(
    picks.map((p) => ({
      gameSlot: p.game_slot,
      pickedTeamId: p.picked_team_id,
      pointsEarned: p.points_earned,
      isCorrect: p.is_correct,
    })),
    games.map((g) => ({
      gameSlot: g.game_slot,
      round: g.round,
      status: g.status,
      winnerId: g.winner_id,
    })),
    eliminatedIds,
    multipliers
  );

  const championshipGame = games.find((g) => g.round === "championship");
  const champPickRow = championshipGame ? pickBySlot.get(championshipGame.game_slot) : undefined;
  const champTeam = champPickRow ? teamsById.get(champPickRow.picked_team_id) : undefined;
  const championPick: ChampionPick | null = champTeam
    ? {
        name: champTeam.name,
        seed: champTeam.seed,
        logoUrl: champTeam.logo_url,
        alive: !champTeam.eliminated,
      }
    : null;

  // --- Today's games --------------------------------------------------------
  const todayRows: TodayGameRow[] = todaysGames(games).map((g) => {
    const a = g.team_a_id ? teamsById.get(g.team_a_id) : undefined;
    const b = g.team_b_id ? teamsById.get(g.team_b_id) : undefined;
    const pick = pickBySlot.get(g.game_slot);
    const pickedTeam = pick ? teamsById.get(pick.picked_team_id) : undefined;
    const regionLabel = g.region ? ` · ${REGION_DISPLAY_NAMES[g.region] ?? g.region}` : "";
    return {
      id: g.id,
      roundLabel: `${ROUND_DISPLAY_NAMES[g.round]}${regionLabel}`,
      teamA: a ? { seed: a.seed, name: a.name } : null,
      teamB: b ? { seed: b.seed, name: b.name } : null,
      scoreA: g.score_a,
      scoreB: g.score_b,
      status: g.status,
      tipTime: g.scheduled_at ? formatEasternTime(g.scheduled_at) : "TBD",
      pick: pickedTeam
        ? { name: pickedTeam.name, outcome: pickOutcome(g, pick?.picked_team_id) }
        : null,
    };
  });

  const displayName = profile?.display_name || "Player";
  const lockDeadline = config?.bracket_lock_deadline ?? null;
  const wagerDeadline = config?.wager_creation_deadline ?? null;
  const urgent = !locked && isWithinHours(lockDeadline, 24);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-2">Welcome, {displayName}</h1>
      <p className="font-body text-xs text-navy/60 mb-8 max-w-2xl">
        {introCopy({ phase, year, hasBracket: !!bracket, locked })}
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
            wagers={completed ? wagers : wagers.filter((w) => w.status !== "resolved")}
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
