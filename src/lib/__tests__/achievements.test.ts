// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { bracketPicks, brackets, games, teams, userAchievements } from "@/db/schema";
import { createTestDb, seedProfile, seedUserId, type TestDb } from "@/test/db";
import {
  evaluateAchievements,
  awardAchievements,
  ACHIEVEMENT_INFO,
  ACHIEVEMENT_ORDER,
} from "../achievements";

const gamesLite = [
  // east region R1 (slots 13-20) & R2 (45-48) & S16 (61-62) & E8 (69): keep it small — use 3 games as "the region"
  { gameSlot: 13, round: "first_round", region: "east", status: "final", winnerId: 1, teamAId: 1, teamBId: 2, teamA: { seed: 1 }, teamB: { seed: 16 } },
  { gameSlot: 15, round: "first_round", region: "east", status: "final", winnerId: 4, teamAId: 3, teamBId: 4, teamA: { seed: 5 }, teamB: { seed: 12 } },
  { gameSlot: 45, round: "second_round", region: "east", status: "final", winnerId: 4, teamAId: 1, teamBId: 4, teamA: { seed: 1 }, teamB: { seed: 12 } },
  { gameSlot: 75, round: "championship", region: null, status: "final", winnerId: 4, teamAId: 4, teamBId: 9, teamA: { seed: 12 }, teamB: { seed: 2 } },
];

const bracketsLite = [
  { id: "A", userId: "ua", score: 100, locked: true },
  { id: "B", userId: "ub", score: 50, locked: true },
  { id: "C", userId: "uc", score: 500, locked: false }, // draft: ineligible
];

const picksLite = [
  // A: perfect east, picked the 12-seed to the S16, picked champion
  { bracketId: "A", gameSlot: 13, round: "first_round", pickedTeamId: 1, isCorrect: true },
  { bracketId: "A", gameSlot: 15, round: "first_round", pickedTeamId: 4, isCorrect: true },
  { bracketId: "A", gameSlot: 45, round: "second_round", pickedTeamId: 4, isCorrect: true },
  { bracketId: "A", gameSlot: 75, round: "championship", pickedTeamId: 4, isCorrect: true },
  // B: all chalk, mostly wrong
  { bracketId: "B", gameSlot: 13, round: "first_round", pickedTeamId: 1, isCorrect: true },
  { bracketId: "B", gameSlot: 15, round: "first_round", pickedTeamId: 3, isCorrect: false },
  { bracketId: "B", gameSlot: 45, round: "second_round", pickedTeamId: 1, isCorrect: false },
  { bracketId: "B", gameSlot: 75, round: "championship", pickedTeamId: 9, isCorrect: false },
];

describe("evaluateAchievements", () => {
  const result = evaluateAchievements(bracketsLite, picksLite, gamesLite);

  it("awards genius, fortune teller, perfect region and cinderella to the top bracket", () => {
    expect(result.get("ua")?.sort()).toEqual(["bracket_genius", "cinderella", "fortune_teller", "perfect_region"]);
  });

  it("awards chalk walk to an all-favourites bracket at or above the median", () => {
    // median of [50, 100] (index floor(2/2)=1) is 100, so B (50) misses it
    expect(result.get("ub") ?? []).not.toContain("chalk_walk");
    const r2 = evaluateAchievements([bracketsLite[1], { id: "D", userId: "ud", score: 10, locked: true }], picksLite, gamesLite);
    expect(r2.get("ub")).toContain("chalk_walk");
  });

  it("ignores unlocked drafts and empty pools", () => {
    expect(result.has("uc")).toBe(false);
    expect(evaluateAchievements([], picksLite, gamesLite).size).toBe(0);
  });

  it("describes every badge", () => {
    for (const t of ACHIEVEMENT_ORDER) expect(ACHIEVEMENT_INFO[t].label).toBeTruthy();
  });
});

describe("awardAchievements", () => {
  let testDb: TestDb;
  let db: Db;
  const ua = seedUserId(1);
  const ub = seedUserId(2);
  const uc = seedUserId(3);
  const A = "30000000-0000-4000-8000-00000000000a";
  const B = "30000000-0000-4000-8000-00000000000b";
  const C = "30000000-0000-4000-8000-00000000000c";

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb as unknown as Db;
    for (const id of [ua, ub, uc]) await seedProfile(testDb, { id, displayName: `user-${id.slice(-2)}` });
    await testDb.insert(teams).values([
      { id: 1, name: "T1", abbreviation: "T1", seed: 1, region: "east" },
      { id: 2, name: "T2", abbreviation: "T2", seed: 16, region: "east" },
      { id: 3, name: "T3", abbreviation: "T3", seed: 5, region: "east" },
      { id: 4, name: "T4", abbreviation: "T4", seed: 12, region: "east" },
      { id: 9, name: "T9", abbreviation: "T9", seed: 2, region: "west" },
    ]);
    // Championship not final yet.
    await testDb.insert(games).values(
      gamesLite.map((g) => ({
        gameSlot: g.gameSlot,
        round: g.round as "first_round",
        region: g.region as "east" | null,
        status: g.round === "championship" ? ("in_progress" as const) : ("final" as const),
        winnerId: g.round === "championship" ? null : g.winnerId,
        teamAId: g.teamAId,
        teamBId: g.teamBId,
      }))
    );
    await testDb.insert(brackets).values([
      { id: A, userId: ua, name: "A", score: 100, locked: true },
      { id: B, userId: ub, name: "B", score: 50, locked: true },
      { id: C, userId: uc, name: "C", score: 500, locked: false },
    ]);
    const idOf = { A, B } as const;
    await testDb.insert(bracketPicks).values(
      picksLite.map((p) => ({
        bracketId: idOf[p.bracketId as "A" | "B"],
        gameSlot: p.gameSlot,
        round: p.round as "first_round",
        pickedTeamId: p.pickedTeamId,
        isCorrect: p.isCorrect,
      }))
    );
  });

  it("does nothing until the championship is final with a winner", async () => {
    expect(await awardAchievements(db)).toBe(0);
    expect(await testDb.select().from(userAchievements)).toHaveLength(0);
  });

  it("awards badges from real rows and is idempotent", async () => {
    await testDb.update(games).set({ status: "final", winnerId: 4 }).where(eq(games.gameSlot, 75));
    expect(await awardAchievements(db)).toBe(4);
    const rows = await testDb
      .select({ userId: userAchievements.userId, type: userAchievements.achievementType })
      .from(userAchievements)
      .orderBy(asc(userAchievements.achievementType));
    expect(rows).toEqual([
      { userId: ua, type: "cinderella" },
      { userId: ua, type: "perfect_region" },
      { userId: ua, type: "bracket_genius" },
      { userId: ua, type: "fortune_teller" },
    ]);
    // Re-running inserts nothing new.
    expect(await awardAchievements(db)).toBe(0);
    expect(await testDb.select().from(userAchievements)).toHaveLength(4);
  });
});
