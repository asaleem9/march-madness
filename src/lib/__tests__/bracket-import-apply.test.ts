// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { asc, eq, isNotNull, count } from "drizzle-orm";
import type { Db } from "@/db";
import { games, teams, tournamentConfig } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { parseESPNScoreboard, type ESPNScoreboard } from "../espn";
import { classifyScoreboards, buildImportPlan } from "../bracket-import";
import { applyImportPlan } from "../bracket-import-apply";
import { YEAR_DEFAULTS, SLOT_RANGES, TOTAL_GAME_SLOTS, buildGameSlots } from "../tournament-structure";

const fixturesDir = path.join(process.cwd(), "src/test/fixtures");
const load = (d: string): ESPNScoreboard => {
  const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, `espn-2026-${d}.json`), "utf8"));
  const parsed = parseESPNScoreboard(raw);
  if (!parsed) throw new Error(`fixture ${d} failed validation`);
  return parsed;
};

const plan = buildImportPlan(classifyScoreboards(["0317", "0318", "0319", "0320"].map(load)), {
  year: 2026,
  dates: YEAR_DEFAULTS[2026].dates,
  finalFourPairing: YEAR_DEFAULTS[2026].finalFourPairing,
  expected: { teams: 68, opening: 4 },
});

let testDb: TestDb;
let db: Db;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb as unknown as Db;
});

describe("applyImportPlan (2026 replay)", () => {
  it("refuses a plan with errors", async () => {
    await expect(
      applyImportPlan(db, { ...plan, writable: false, report: { ...plan.report, errors: ["boom"] } })
    ).rejects.toThrow(/boom/);
    expect(await testDb.select().from(teams)).toHaveLength(0);
  });

  it("writes teams, the skeleton, the opening and first rounds, and the config", async () => {
    const result = await applyImportPlan(db, plan);
    expect(result).toMatchObject({
      teamsUpserted: 68,
      openingGamesWritten: 4,
      configUpdated: true,
      warnings: [],
    });

    expect(await testDb.select().from(teams)).toHaveLength(68);

    // 4 opening slots + 63 bracket slots; the 8 unused opening slots were removed.
    const [{ n: total }] = await testDb.select({ n: count() }).from(games);
    expect(total).toBe(TOTAL_GAME_SLOTS - 12 + 4);
    const opening = await testDb.select().from(games).where(eq(games.round, "first_four")).orderBy(asc(games.gameSlot));
    expect(opening.map((g) => g.gameSlot)).toEqual([1, 2, 3, 4]);
    for (const g of opening) {
      expect(g.teamAId).not.toBeNull();
      expect(g.teamBId).not.toBeNull();
      expect(g.espnGameId).toBeTruthy();
      expect(g.nextGameSlot).toBeGreaterThanOrEqual(SLOT_RANGES.first_round.start);
    }

    const r1 = await testDb.select().from(games).where(eq(games.round, "first_round")).orderBy(asc(games.gameSlot));
    expect(r1).toHaveLength(32);
    // The 2026 fixtures were recorded after the play-ins, so the report says how many sides are still TBD.
    const tbdSides = r1.filter((g) => g.teamAId === null || g.teamBId === null);
    expect(tbdSides).toHaveLength(plan.report.firstRound.withTbdSide);
    expect(r1.every((g) => g.espnGameId && g.status === "scheduled" && g.winnerId === null)).toBe(true);

    const later = await testDb.select().from(games).where(isNotNull(games.nextGameSlot));
    expect(later.length).toBeGreaterThan(0);

    const config = await testDb.query.tournamentConfig.findFirst({ where: eq(tournamentConfig.id, 1) });
    expect(config).toMatchObject({
      year: 2026,
      activePhase: "pre_tournament",
      finalFourPairing: YEAR_DEFAULTS[2026].finalFourPairing,
    });
    expect(config?.bracketLockDeadline.toISOString()).toBe(new Date(YEAR_DEFAULTS[2026].lockDeadline).toISOString());
  });

  it("re-running is idempotent and preserves scores already recorded", async () => {
    // Pretend a first-round game has been played since the first import.
    const [played] = await testDb.select().from(games).where(eq(games.gameSlot, 13));
    await testDb
      .update(games)
      .set({ status: "final", scoreA: 70, scoreB: 60, winnerId: played.teamAId })
      .where(eq(games.gameSlot, 13));
    const teamsBefore = await testDb.select({ id: teams.id, espnId: teams.espnId }).from(teams).orderBy(asc(teams.id));

    const result = await applyImportPlan(db, plan);
    expect(result.warnings).toEqual([]);

    const teamsAfter = await testDb.select({ id: teams.id, espnId: teams.espnId }).from(teams).orderBy(asc(teams.id));
    expect(teamsAfter).toEqual(teamsBefore);
    const [{ n: total }] = await testDb.select({ n: count() }).from(games);
    expect(total).toBe(TOTAL_GAME_SLOTS - 12 + 4);

    const [after] = await testDb.select().from(games).where(eq(games.gameSlot, 13));
    expect(after).toMatchObject({ status: "final", scoreA: 70, scoreB: 60, winnerId: played.teamAId });
  });

  it("warns about teams in the database that the import doesn't mention", async () => {
    await testDb.insert(teams).values({ name: "Leftover U", abbreviation: "LEFT", seed: 9, region: "west", espnId: "stale-1" });
    const result = await applyImportPlan(db, plan);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/1 team\(s\).*Leftover U/);
  });

  it("imports into a rolled-over skeleton without duplicating slots", async () => {
    const fresh = await createTestDb();
    const skeleton = buildGameSlots({ dates: YEAR_DEFAULTS[2026].dates, finalFourPairing: YEAR_DEFAULTS[2026].finalFourPairing });
    await fresh.insert(games).values(
      skeleton.map((g) => ({
        gameSlot: g.game_slot, round: g.round, region: g.region, nextGameSlot: g.next_game_slot,
        slotPosition: g.slot_position, scheduledAt: g.scheduled_at ? new Date(g.scheduled_at) : null,
      }))
    );
    const result = await applyImportPlan(fresh as unknown as Db, plan);
    expect(result.configUpdated).toBe(true);
    const [{ n: total }] = await fresh.select({ n: count() }).from(games);
    expect(total).toBe(TOTAL_GAME_SLOTS - 12 + 4);
  });
});
