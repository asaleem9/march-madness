import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScoringMultipliers, getSeason } from "@/lib/tournament";
import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";
import {
  buildRows,
  type BracketRowInput,
  type PickRowInput,
} from "@/components/leaderboard/buildRows";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

/** PostgREST caps a response at 1000 rows; 63 picks × 15 brackets stays under it. */
const PICKS_CHUNK = 15;

function formatEastern(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

export default async function LeaderboardPage() {
  // Admin client so logged-out visitors can see the board; the session client
  // only tells us who "you" are.
  const admin = createAdminClient();
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    season,
    bracketsRes,
    gamesRes,
    teamsRes,
    achievementsRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getSeason(),
    admin
      .from("brackets")
      .select("id, user_id, name, score, profiles!inner(id, display_name, avatar_url)")
      .eq("is_primary", true)
      .eq("locked", true)
      .order("score", { ascending: false }),
    admin.from("games").select("game_slot, round, status, winner_id"),
    admin.from("teams").select("id, name, abbreviation, logo_url, eliminated"),
    admin.from("user_achievements").select("user_id, achievement_type"),
  ]);

  if (bracketsRes.error) throw new Error(`Failed to load brackets: ${bracketsRes.error.message}`);
  if (gamesRes.error) throw new Error(`Failed to load games: ${gamesRes.error.message}`);
  if (teamsRes.error) throw new Error(`Failed to load teams: ${teamsRes.error.message}`);
  if (achievementsRes.error) {
    throw new Error(`Failed to load achievements: ${achievementsRes.error.message}`);
  }

  const brackets = (bracketsRes.data ?? []) as unknown as BracketRowInput[];

  const picks: PickRowInput[] = [];
  const bracketIds = brackets.map((b) => b.id);
  const chunks: string[][] = [];
  for (let i = 0; i < bracketIds.length; i += PICKS_CHUNK) {
    chunks.push(bracketIds.slice(i, i + PICKS_CHUNK));
  }
  const pickResults = await Promise.all(
    chunks.map((ids) =>
      admin
        .from("bracket_picks")
        .select("bracket_id, game_slot, picked_team_id, points_earned, is_correct")
        .in("bracket_id", ids)
    )
  );
  for (const res of pickResults) {
    if (res.error) throw new Error(`Failed to load picks: ${res.error.message}`);
    picks.push(...((res.data ?? []) as PickRowInput[]));
  }

  const rows = buildRows({
    brackets,
    picks,
    games: gamesRes.data ?? [],
    teams: teamsRes.data ?? [],
    achievements: achievementsRes.data ?? [],
    multipliers: getScoringMultipliers(season.config),
  });

  const { phase, offSeason, tournamentYear } = season;
  const preTournament = phase === "pre_tournament";
  const lastUpdate = season.config?.last_score_update_at ?? null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-3 text-center">
        {offSeason ? `${tournamentYear} FINAL STANDINGS` : "LEADERBOARD"}
      </h1>
      <p className="text-center text-xs text-navy/50 mb-1">
        Points are awarded as games finish. Later rounds are worth more, upset picks earn a 1.5×
        bonus, and tied scores share a rank.
      </p>
      <p className="text-center font-body text-xs text-navy/60 mb-6">
        {lastUpdate ? (
          <>
            Scores as of <time dateTime={lastUpdate}>{formatEastern(lastUpdate)}</time>
          </>
        ) : (
          "No games have been scored yet."
        )}
      </p>

      {rows.length > 0 ? (
        <LeaderboardClient rows={rows} currentUserId={user?.id ?? null} />
      ) : (
        <div className="retro-card text-center py-12 px-6">
          {preTournament ? (
            <>
              <p className="text-navy/60 text-sm mb-5">
                No brackets are in yet. Finalize yours before the lock to claim a spot here.
              </p>
              <Link href="/bracket/new" className="retro-btn retro-btn-primary inline-block">
                Create your bracket
              </Link>
            </>
          ) : (
            <p className="text-navy/60 text-sm">No brackets were entered this year.</p>
          )}
        </div>
      )}
    </div>
  );
}
