import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bracketPicks, brackets, games, teams, userAchievements } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getScoringMultipliers, getSeason } from "@/lib/tournament";
import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";
import { buildRows } from "@/components/leaderboard/buildRows";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

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
  // The board is public; the session only tells us who "you" are.
  const [user, season, bracketRows, gameRows, teamRows, achievementRows] = await Promise.all([
    getCurrentUser(),
    getSeason(),
    db.query.brackets.findMany({
      columns: { id: true, userId: true, name: true, score: true },
      where: and(eq(brackets.isPrimary, true), eq(brackets.locked, true)),
      with: { user: { columns: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: desc(brackets.score),
    }),
    db
      .select({
        gameSlot: games.gameSlot,
        round: games.round,
        status: games.status,
        winnerId: games.winnerId,
      })
      .from(games),
    db
      .select({
        id: teams.id,
        name: teams.name,
        abbreviation: teams.abbreviation,
        logoUrl: teams.logoUrl,
        eliminated: teams.eliminated,
      })
      .from(teams),
    db
      .select({
        userId: userAchievements.userId,
        achievementType: userAchievements.achievementType,
      })
      .from(userAchievements),
  ]);

  const bracketIds = bracketRows.map((b) => b.id);
  const pickRows =
    bracketIds.length === 0
      ? []
      : await db
          .select({
            bracketId: bracketPicks.bracketId,
            gameSlot: bracketPicks.gameSlot,
            pickedTeamId: bracketPicks.pickedTeamId,
            pointsEarned: bracketPicks.pointsEarned,
            isCorrect: bracketPicks.isCorrect,
          })
          .from(bracketPicks)
          .where(inArray(bracketPicks.bracketId, bracketIds));

  const rows = buildRows({
    brackets: bracketRows.map((b) => ({
      id: b.id,
      user_id: b.userId,
      name: b.name,
      score: b.score,
      profiles: b.user
        ? { id: b.user.id, display_name: b.user.displayName, avatar_url: b.user.avatarUrl }
        : null,
    })),
    picks: pickRows.map((p) => ({
      bracket_id: p.bracketId,
      game_slot: p.gameSlot,
      picked_team_id: p.pickedTeamId,
      points_earned: p.pointsEarned,
      is_correct: p.isCorrect,
    })),
    games: gameRows.map((g) => ({
      game_slot: g.gameSlot,
      round: g.round,
      status: g.status,
      winner_id: g.winnerId,
    })),
    teams: teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      logo_url: t.logoUrl,
      eliminated: t.eliminated,
    })),
    achievements: achievementRows.map((a) => ({
      user_id: a.userId,
      achievement_type: a.achievementType,
    })),
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
