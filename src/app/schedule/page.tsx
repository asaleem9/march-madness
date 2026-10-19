import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bracketPicks, brackets, games } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getTournamentConfig } from "@/lib/tournament";
import {
  ScheduleClient,
  type ScheduleGame,
  type ScheduleTeam,
} from "@/components/schedule/ScheduleClient";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

function toScheduleTeam(
  t: { id: number; name: string; seed: number; abbreviation: string; logoUrl: string | null; eliminated: boolean | null } | null
): ScheduleTeam | null {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    seed: t.seed,
    abbreviation: t.abbreviation,
    logo_url: t.logoUrl,
    eliminated: t.eliminated,
  };
}

export default async function SchedulePage() {
  // The schedule is public; the session only decides whether picks are highlighted.
  const [user, config, gameRows] = await Promise.all([
    getCurrentUser(),
    getTournamentConfig(),
    db.query.games.findMany({
      with: { teamA: true, teamB: true },
      orderBy: [sql`${games.scheduledAt} asc nulls last`, asc(games.gameSlot)],
    }),
  ]);

  const scheduleGames: ScheduleGame[] = gameRows.map((g) => ({
    id: g.id,
    round: g.round,
    region: g.region,
    game_slot: g.gameSlot,
    team_a_id: g.teamAId,
    team_b_id: g.teamBId,
    winner_id: g.winnerId,
    status: g.status,
    score_a: g.scoreA,
    score_b: g.scoreB,
    scheduled_at: g.scheduledAt?.toISOString() ?? null,
    espn_game_id: g.espnGameId,
    clock: g.clock,
    period: g.period,
    team_a: toScheduleTeam(g.teamA),
    team_b: toScheduleTeam(g.teamB),
  }));

  // The current user's picks, so their team is highlighted on each matchup.
  const userPicks: Record<number, number> = {};
  if (user) {
    const [bracket] = await db
      .select({ id: brackets.id })
      .from(brackets)
      .where(eq(brackets.userId, user.id))
      .limit(1);

    if (bracket) {
      const picks = await db
        .select({ gameSlot: bracketPicks.gameSlot, pickedTeamId: bracketPicks.pickedTeamId })
        .from(bracketPicks)
        .where(eq(bracketPicks.bracketId, bracket.id));
      for (const p of picks) {
        userPicks[p.gameSlot] = p.pickedTeamId;
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-4 text-center">GAME SCHEDULE</h1>
      <p className="text-center text-xs text-navy/50 mb-8">
        {user
          ? "Your bracket picks are highlighted on each matchup."
          : "Log in to see your bracket picks on each matchup."}
      </p>
      <ScheduleClient
        games={scheduleGames}
        userPicks={userPicks}
        isLoggedIn={!!user}
        lastUpdatedAt={config?.last_score_update_at ?? null}
      />
    </div>
  );
}
