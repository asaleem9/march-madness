// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { games, notificationQueue, tournamentConfig } from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@test.com,other@admin.com";
});

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

const { mockGetCurrentUser } = vi.hoisted(() => ({ mockGetCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

import { db } from "@/db";
// The mock above swaps in a PGlite database at runtime; seedProfile is typed against it.
const testDb = db as unknown as TestDb;
import { GET, PUT } from "../route";

// --- Helpers ---

function mockAdmin() {
  mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "admin@test.com", name: null, image: null });
}

function mockNonAdmin() {
  mockGetCurrentUser.mockResolvedValue({ id: "user-2", email: "normie@test.com", name: null, image: null });
}

function put(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/config", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function seedConfig() {
  await db.insert(tournamentConfig).values({
    id: 1,
    year: 2027,
    bracketLockDeadline: new Date("2027-03-18T16:00:00Z"),
    wagerCreationDeadline: new Date("2027-03-18T16:00:00Z"),
    activePhase: "pre_tournament",
    finalFourPairing: [["east", "west"], ["south", "midwest"]],
  });
}

/** The four Elite Eight games (slots 69–72), one per region, wired east/west → 73 and south/midwest → 74. */
async function seedEliteEight() {
  await db.insert(games).values([
    { round: "elite_eight", region: "east", gameSlot: 69, nextGameSlot: 73, slotPosition: "top" },
    { round: "elite_eight", region: "west", gameSlot: 70, nextGameSlot: 73, slotPosition: "bottom" },
    { round: "elite_eight", region: "south", gameSlot: 71, nextGameSlot: 74, slotPosition: "top" },
    { round: "elite_eight", region: "midwest", gameSlot: 72, nextGameSlot: 74, slotPosition: "bottom" },
  ]);
}

const config = () => db.query.tournamentConfig.findFirst({ where: eq(tournamentConfig.id, 1) });

// --- Tests ---

beforeEach(async () => {
  vi.clearAllMocks();
  await db.execute(sql`
    truncate table notification_queue, games, profiles, tournament_config restart identity cascade
  `);
});

describe("GET /api/admin/config", () => {
  it("returns 403 for non-admin users", async () => {
    mockNonAdmin();
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Forbidden");
  });

  it("returns the config row with column names plus the unsent queue depth", async () => {
    mockAdmin();
    await seedConfig();
    await db.update(tournamentConfig).set({ lastScoreUpdateAt: new Date("2027-03-20T01:02:03Z") });
    const uid = seedUserId(1);
    await seedProfile(testDb, { id: uid });
    await db.insert(notificationQueue).values([
      { userId: uid, type: "game_result", payload: {}, sent: false },
      { userId: uid, type: "game_result", payload: {}, sent: false },
      { userId: uid, type: "game_result", payload: {}, sent: true },
    ]);

    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({
      id: 1,
      year: 2027,
      bracket_lock_deadline: "2027-03-18T16:00:00.000Z",
      wager_creation_deadline: "2027-03-18T16:00:00.000Z",
      scoring_multipliers: {
        first_round: 10, second_round: 20, sweet_16: 40, elite_eight: 80, final_four: 160, championship: 320,
      },
      active_phase: "pre_tournament",
      final_four_pairing: [["east", "west"], ["south", "midwest"]],
      last_score_update_at: "2027-03-20T01:02:03.000Z",
      queue_depth: 2,
    });
  });

  it("returns just the queue depth when no config row exists", async () => {
    mockAdmin();
    const json = await (await GET()).json();
    expect(json).toEqual({ queue_depth: 0 });
  });
});

describe("PUT /api/admin/config", () => {
  it("returns 403 for non-admin users", async () => {
    mockNonAdmin();
    const response = await PUT(put({ bracket_lock_deadline: "2026-03-20T00:00:00Z" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Forbidden");
  });

  it("updates config and returns success for admin users", async () => {
    mockAdmin();
    await seedConfig();
    const response = await PUT(put({
      bracket_lock_deadline: "2026-03-20T00:00:00Z",
      active_phase: "sweet_16",
      scoring_multipliers: { first_round: 1, second_round: 2, sweet_16: 4, elite_eight: 8, final_four: 16, championship: 32 },
      year: 2028,
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);

    const row = await config();
    expect(row?.bracketLockDeadline.toISOString()).toBe("2026-03-20T00:00:00.000Z");
    expect(row?.wagerCreationDeadline.toISOString()).toBe("2027-03-18T16:00:00.000Z");
    expect(row?.activePhase).toBe("sweet_16");
    expect(row?.scoringMultipliers).toEqual({ first_round: 1, second_round: 2, sweet_16: 4, elite_eight: 8, final_four: 16, championship: 32 });
    expect(row?.year).toBe(2028);
  });

  it("rejects invalid or empty bodies", async () => {
    mockAdmin();
    await seedConfig();
    expect((await PUT(put({}))).status).toBe(400);
    expect((await PUT(put({ active_phase: "halftime" }))).status).toBe(400);
    const dup = await PUT(put({ final_four_pairing: [["east", "east"], ["south", "midwest"]] }));
    expect(dup.status).toBe(400);
    expect((await dup.json()).error).toMatch(/each region exactly once/);
    expect((await config())?.activePhase).toBe("pre_tournament");
  });

  it("rewires the Elite Eight slots when the Final Four pairing changes", async () => {
    mockAdmin();
    await seedConfig();
    await seedEliteEight();
    const response = await PUT(put({ final_four_pairing: [["east", "south"], ["west", "midwest"]] }));
    expect(response.status).toBe(200);

    const e8 = await db.select().from(games).orderBy(asc(games.gameSlot));
    const byRegion = Object.fromEntries(e8.map((g) => [g.region, [g.nextGameSlot, g.slotPosition]]));
    expect(byRegion).toEqual({
      east: [73, "top"],
      south: [73, "bottom"],
      west: [74, "top"],
      midwest: [74, "bottom"],
    });
    expect((await config())?.finalFourPairing).toEqual([["east", "south"], ["west", "midwest"]]);
  });

  it("refuses to change the pairing once an Elite Eight game is final", async () => {
    mockAdmin();
    await seedConfig();
    await seedEliteEight();
    await db.update(games).set({ status: "final" }).where(eq(games.gameSlot, 70));
    const response = await PUT(put({ final_four_pairing: [["east", "south"], ["west", "midwest"]] }));
    expect(response.status).toBe(409);
    expect((await db.query.games.findFirst({ where: eq(games.gameSlot, 71) }))?.nextGameSlot).toBe(74);
    expect((await config())?.finalFourPairing).toEqual([["east", "west"], ["south", "midwest"]]);
  });
});
