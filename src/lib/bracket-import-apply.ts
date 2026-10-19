import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { games, teams, tournamentConfig } from "@/db/schema";
import type { GameRow, ImportPlan } from "./bracket-import";
import { SLOT_RANGES, YEAR_DEFAULTS, type GameSlotRow } from "./tournament-structure";
import { DEFAULT_SCORING } from "./utils";

export interface ApplyResult {
  teamsUpserted: number;
  gamesUpserted: number;
  openingGamesWritten: number;
  configUpdated: boolean;
  warnings: string[];
}

type GameInsert = typeof games.$inferInsert;

/** Structural columns of a skeleton slot (never status/scores/winner). */
function skeletonRow(g: GameSlotRow): GameInsert {
  return {
    gameSlot: g.game_slot,
    round: g.round,
    region: g.region,
    nextGameSlot: g.next_game_slot,
    slotPosition: g.slot_position,
    scheduledAt: g.scheduled_at ? new Date(g.scheduled_at) : null,
  };
}

/**
 * Write an ImportPlan to the database. Every write is an upsert keyed on
 * `teams.espn_id` / `games.game_slot`, so the import can be re-run (e.g. if
 * ESPN posts the last first-round games late) without duplicating rows.
 * Structural upserts never touch status/scores/winner. Runs in one
 * transaction so a failed import leaves the previous state intact.
 */
export async function applyImportPlan(db: Db, plan: ImportPlan): Promise<ApplyResult> {
  if (!plan.writable) {
    throw new Error(`Import plan has errors: ${plan.report.errors.join("; ")}`);
  }
  const warnings: string[] = [];

  return db.transaction(async (tx) => {
    // 1. Teams.
    if (plan.teams.length > 0) {
      await tx
        .insert(teams)
        .values(
          plan.teams.map((t) => ({
            espnId: t.espn_id,
            name: t.name,
            abbreviation: t.abbreviation,
            seed: t.seed,
            region: t.region,
            record: t.record,
            logoUrl: t.logo_url,
            eliminated: t.eliminated,
          }))
        )
        .onConflictDoUpdate({
          target: teams.espnId,
          set: {
            name: sql`excluded.name`,
            abbreviation: sql`excluded.abbreviation`,
            seed: sql`excluded.seed`,
            region: sql`excluded.region`,
            record: sql`excluded.record`,
            logoUrl: sql`excluded.logo_url`,
            eliminated: sql`excluded.eliminated`,
          },
        });
    }

    const dbTeams = await tx
      .select({ id: teams.id, espnId: teams.espnId, name: teams.name })
      .from(teams);
    const idByEspn = new Map<string, number>();
    for (const t of dbTeams) if (t.espnId) idByEspn.set(t.espnId, t.id);

    const planned = new Set(plan.teams.map((t) => t.espn_id));
    const stale = dbTeams.filter((t) => !t.espnId || !planned.has(t.espnId));
    if (stale.length > 0) {
      warnings.push(
        `${stale.length} team(s) in the database aren't in this import: ${stale
          .slice(0, 8)
          .map((t) => t.name)
          .join(", ")}${stale.length > 8 ? "…" : ""}`
      );
    }

    const teamId = (espnId: string | null) => (espnId ? idByEspn.get(espnId) ?? null : null);
    const gameRow = (g: GameRow): GameInsert => ({
      ...skeletonRow(g),
      espnGameId: g.espn_game_id,
      teamAId: teamId(g.team_a_espn_id),
      teamBId: teamId(g.team_b_espn_id),
    });

    // 2. Skeleton (slots 13–75): structure only.
    if (plan.skeleton.length > 0) {
      await tx
        .insert(games)
        .values(plan.skeleton.map(skeletonRow))
        .onConflictDoUpdate({
          target: games.gameSlot,
          set: {
            round: sql`excluded.round`,
            region: sql`excluded.region`,
            nextGameSlot: sql`excluded.next_game_slot`,
            slotPosition: sql`excluded.slot_position`,
            scheduledAt: sql`excluded.scheduled_at`,
          },
        });
    }

    const upsertGames = async (rows: GameInsert[]) => {
      if (rows.length === 0) return;
      await tx
        .insert(games)
        .values(rows)
        .onConflictDoUpdate({
          target: games.gameSlot,
          set: {
            round: sql`excluded.round`,
            region: sql`excluded.region`,
            nextGameSlot: sql`excluded.next_game_slot`,
            slotPosition: sql`excluded.slot_position`,
            scheduledAt: sql`excluded.scheduled_at`,
            espnGameId: sql`excluded.espn_game_id`,
            teamAId: sql`excluded.team_a_id`,
            teamBId: sql`excluded.team_b_id`,
          },
        });
    };

    // 3. Opening Round rows, then drop any unused opening slots.
    const openingRows = plan.openingGames.map(gameRow);
    await upsertGames(openingRows);
    await tx
      .delete(games)
      .where(
        and(
          eq(games.round, "first_four"),
          gt(games.gameSlot, SLOT_RANGES.first_four.start + openingRows.length - 1)
        )
      );

    // 4. First Round rows.
    const r1Rows = plan.firstRoundGames.map(gameRow);
    await upsertGames(r1Rows);

    // 5. Config.
    const config = await tx.query.tournamentConfig.findFirst({
      where: eq(tournamentConfig.id, 1),
      columns: { id: true },
    });
    let configUpdated = false;
    if (config) {
      await tx
        .update(tournamentConfig)
        .set({ year: plan.year, finalFourPairing: plan.finalFourPairing })
        .where(eq(tournamentConfig.id, 1));
      configUpdated = true;
    } else {
      const defaults = YEAR_DEFAULTS[plan.year];
      const firstTip = plan.firstRoundGames[0]?.scheduled_at ?? null;
      const lock = defaults?.lockDeadline ?? firstTip;
      const wager = defaults?.wagerDeadline ?? firstTip;
      if (!lock || !wager) {
        warnings.push("config insert failed: no lock deadline known for this year");
      } else {
        await tx.insert(tournamentConfig).values({
          id: 1,
          year: plan.year,
          bracketLockDeadline: new Date(lock),
          wagerCreationDeadline: new Date(wager),
          scoringMultipliers: DEFAULT_SCORING,
          activePhase: "pre_tournament",
          finalFourPairing: plan.finalFourPairing,
        });
        configUpdated = true;
      }
    }

    return {
      teamsUpserted: plan.teams.length,
      gamesUpserted: plan.skeleton.length + openingRows.length + r1Rows.length,
      openingGamesWritten: openingRows.length,
      configUpdated,
      warnings,
    };
  });
}
