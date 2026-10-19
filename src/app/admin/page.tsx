import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { games, notificationQueue, teams, tournamentConfig } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/admin-auth";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import type { AdminConfig, GameForAdmin } from "@/components/admin/types";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * Server wrapper for the admin dashboard: gates on the admin allow-list, then
 * loads the config row (plus the unsent-notification count), every game with
 * its teams, and the team count. Mutations go through /api/admin/*.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/admin");

  if (!isAdminEmail(user.email)) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="retro-card p-8 max-w-md mx-auto">
          <h1 className="font-display text-navy text-sm mb-4">ACCESS DENIED</h1>
          <p className="font-body text-sm text-navy/70">You don&apos;t have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const [configRow, [queue], gameRows, [teamTotal]] = await Promise.all([
    db.query.tournamentConfig.findFirst({ where: eq(tournamentConfig.id, 1) }),
    db.select({ depth: count() }).from(notificationQueue).where(eq(notificationQueue.sent, false)),
    db.query.games.findMany({
      orderBy: [asc(games.gameSlot)],
      with: {
        teamA: { columns: { id: true, name: true, seed: true } },
        teamB: { columns: { id: true, name: true, seed: true } },
      },
    }),
    db.select({ total: count() }).from(teams),
  ]);

  const config: AdminConfig | null = configRow
    ? {
        id: configRow.id,
        year: configRow.year,
        bracket_lock_deadline: configRow.bracketLockDeadline.toISOString(),
        wager_creation_deadline: configRow.wagerCreationDeadline.toISOString(),
        active_phase: configRow.activePhase ?? "pre_tournament",
        scoring_multipliers: configRow.scoringMultipliers,
        final_four_pairing: (configRow.finalFourPairing as AdminConfig["final_four_pairing"]) ?? null,
        last_score_update_at: configRow.lastScoreUpdateAt?.toISOString() ?? null,
        queue_depth: queue?.depth ?? 0,
      }
    : null;

  const gameList: GameForAdmin[] = gameRows.map((g) => ({
    id: g.id,
    round: g.round,
    region: g.region,
    game_slot: g.gameSlot,
    status: g.status,
    score_a: g.scoreA,
    score_b: g.scoreB,
    winner_id: g.winnerId,
    espn_game_id: g.espnGameId,
    clock: g.clock,
    period: g.period,
    team_a: g.teamA ?? null,
    team_b: g.teamB ?? null,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-navy text-sm">ADMIN DASHBOARD</h1>
      <AdminDashboard config={config} games={gameList} teamCount={teamTotal?.total ?? null} />
    </div>
  );
}
