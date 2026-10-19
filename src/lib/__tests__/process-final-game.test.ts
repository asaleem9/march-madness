// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, asc } from "drizzle-orm";
import type { Db } from "@/db";
import { bracketPicks, brackets, games, notificationQueue, teams } from "@/db/schema";
import { createTestDb, seedProfile, seedUserId, type TestDb } from "@/test/db";
import { processFinalGame, pointsForWin, type FinalGameRow } from "../process-final-game";

let testDb: TestDb;
let db: Db;

const u1 = seedUserId(1);
const u2 = seedUserId(2);
const u3 = seedUserId(3);
const b1 = "10000000-0000-4000-8000-000000000001";
const b2 = "10000000-0000-4000-8000-000000000002";
const b3 = "10000000-0000-4000-8000-000000000003";

const game: FinalGameRow = {
  id: 0, // set after seeding
  gameSlot: 13,
  round: "first_round",
  region: "east",
  teamAId: 1,
  teamBId: 2,
  nextGameSlot: 45,
  slotPosition: "top",
  teamA: { id: 1, name: "Duke", seed: 1 },
  teamB: { id: 2, name: "Siena", seed: 16 },
};

async function reset() {
  await testDb.delete(notificationQueue);
  await testDb.delete(bracketPicks);
  await testDb.delete(brackets);
  await testDb.delete(games);
  await testDb.delete(teams);

  await testDb.insert(teams).values([
    { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1, region: "east" },
    { id: 2, name: "Siena", abbreviation: "SIE", seed: 16, region: "east" },
    { id: 3, name: "Texas", abbreviation: "TEX", seed: 11, region: "east" },
    { id: 4, name: "NC State", abbreviation: "NCST", seed: 11, region: "east" },
  ]);
  const [g13] = await testDb
    .insert(games)
    .values([
      { gameSlot: 13, round: "first_round", region: "east", teamAId: 1, teamBId: 2, nextGameSlot: 45, slotPosition: "top", status: "final" },
      { gameSlot: 14, round: "first_round", region: "east", teamAId: null, teamBId: null, nextGameSlot: 45, slotPosition: "bottom" },
      { gameSlot: 45, round: "second_round", region: "east", nextGameSlot: 61, slotPosition: "top" },
      { gameSlot: 1, round: "first_four", region: "east", teamAId: 3, teamBId: 4, nextGameSlot: 25, slotPosition: "bottom" },
      { gameSlot: 25, round: "first_round", region: "west", nextGameSlot: 51, slotPosition: "top" },
      { gameSlot: 75, round: "championship", region: null, teamAId: 1, teamBId: 2 },
    ])
    .returning({ id: games.id });
  game.id = g13.id;

  await testDb.insert(brackets).values([
    { id: b1, userId: u1, name: "One", locked: true },
    { id: b2, userId: u2, name: "Two", locked: true },
    { id: b3, userId: u3, name: "Three", locked: true },
  ]);
  await testDb.insert(bracketPicks).values([
    // slot 13 picks: u1 right, u2 wrong, u3 already scored
    { bracketId: b1, gameSlot: 13, round: "first_round", pickedTeamId: 1 },
    { bracketId: b2, gameSlot: 13, round: "first_round", pickedTeamId: 2 },
    { bracketId: b3, gameSlot: 13, round: "first_round", pickedTeamId: 1, isCorrect: true, pointsEarned: 10 },
    // a previously scored second-round pick on b1 so totals add up
    { bracketId: b1, gameSlot: 45, round: "second_round", pickedTeamId: 1, isCorrect: true, pointsEarned: 20 },
    // play-in carry: u1 picked Texas (3) to win slot 25 and slot 51
    { bracketId: b1, gameSlot: 25, round: "first_round", pickedTeamId: 3 },
    { bracketId: b1, gameSlot: 51, round: "second_round", pickedTeamId: 3 },
    { bracketId: b2, gameSlot: 25, round: "first_round", pickedTeamId: 4 },
  ]);
}

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb as unknown as Db;
  for (const id of [u1, u2, u3]) await seedProfile(testDb, { id, displayName: `user-${id.slice(-2)}` });
});

beforeEach(reset);

describe("pointsForWin", () => {
  it("applies the 1.5x upset bonus only when the worse seed wins", () => {
    expect(pointsForWin("first_round", 1, 16)).toBe(10);
    expect(pointsForWin("first_round", 16, 1)).toBe(15);
    expect(pointsForWin("championship", 2, 1, { first_round: 10, second_round: 20, sweet_16: 40, elite_eight: 80, final_four: 160, championship: 500 })).toBe(750);
  });
});

describe("processFinalGame", () => {
  it("eliminates, advances, scores changed picks, recalculates and notifies", async () => {
    const r = await processFinalGame(db, {
      game, winnerId: 1, scoreA: 80, scoreB: 60, notify: true, batchKey: "20270318-evening",
    });

    const siena = await testDb.query.teams.findFirst({ where: eq(teams.id, 2) });
    expect(siena?.eliminated).toBe(true);
    const duke = await testDb.query.teams.findFirst({ where: eq(teams.id, 1) });
    expect(duke?.eliminated).toBe(false);

    const next = await testDb.query.games.findFirst({ where: eq(games.gameSlot, 45) });
    expect(next?.teamAId).toBe(1);
    expect(next?.teamBId).toBeNull();

    // Only the two unscored picks are written; the already-correct one is left alone.
    expect(r.picksScored).toBe(2);
    const slotPicks = await testDb
      .select({ bracketId: bracketPicks.bracketId, isCorrect: bracketPicks.isCorrect, pointsEarned: bracketPicks.pointsEarned })
      .from(bracketPicks)
      .where(eq(bracketPicks.gameSlot, 13))
      .orderBy(asc(bracketPicks.id));
    expect(slotPicks).toEqual([
      { bracketId: b1, isCorrect: true, pointsEarned: 10 },
      { bracketId: b2, isCorrect: false, pointsEarned: 0 },
      { bracketId: b3, isCorrect: true, pointsEarned: 10 },
    ]);

    const scores = await testDb.select({ id: brackets.id, score: brackets.score }).from(brackets).orderBy(asc(brackets.id));
    expect(scores).toEqual([
      { id: b1, score: 30 },
      { id: b2, score: 0 },
      { id: b3, score: 10 },
    ]);
    expect(r.bracketsRecalculated).toBe(3);

    const queued = await testDb.select().from(notificationQueue).orderBy(asc(notificationQueue.id));
    expect(queued).toHaveLength(3);
    expect(queued[0]).toMatchObject({
      userId: u1, type: "game_result", batchKey: "20270318-evening", sent: false,
      payload: { game_id: game.id, winner: "Duke", loser: "Siena", score: "80-60", picked: "Duke", correct: true, points: 10, round: "first_round", winner_seed: 1, loser_seed: 16 },
    });
    expect(queued[1].payload).toMatchObject({ picked: "Siena", correct: false, points: 0 });
    expect(r.notificationsQueued).toBe(3);
  });

  it("is idempotent: a second run changes nothing and scores nothing", async () => {
    await processFinalGame(db, { game, winnerId: 1, scoreA: 80, scoreB: 60, notify: true });
    const r = await processFinalGame(db, { game, winnerId: 1, scoreA: 80, scoreB: 60, notify: false });
    expect(r.picksScored).toBe(0);
    const scores = await testDb.select({ score: brackets.score }).from(brackets).orderBy(asc(brackets.id));
    expect(scores.map((s) => s.score)).toEqual([30, 0, 10]);
    expect(await testDb.select().from(notificationQueue)).toHaveLength(3);
  });

  it("re-scores picks when a correction flips the winner", async () => {
    await processFinalGame(db, { game, winnerId: 1, scoreA: 80, scoreB: 60 });
    const r = await processFinalGame(db, { game, winnerId: 2, scoreA: 60, scoreB: 80 });
    expect(r.picksScored).toBe(3);
    const slotPicks = await testDb
      .select({ bracketId: bracketPicks.bracketId, isCorrect: bracketPicks.isCorrect, pointsEarned: bracketPicks.pointsEarned })
      .from(bracketPicks)
      .where(eq(bracketPicks.gameSlot, 13))
      .orderBy(asc(bracketPicks.id));
    // 16 over 1 is an upset: 10 × 1.5
    expect(slotPicks).toEqual([
      { bracketId: b1, isCorrect: false, pointsEarned: 0 },
      { bracketId: b2, isCorrect: true, pointsEarned: 15 },
      { bracketId: b3, isCorrect: false, pointsEarned: 0 },
    ]);
    const next = await testDb.query.games.findFirst({ where: eq(games.gameSlot, 45) });
    expect(next?.teamAId).toBe(2);
  });

  it("does not queue notifications when notify is false", async () => {
    const r = await processFinalGame(db, { game, winnerId: 1, scoreA: 1, scoreB: 0, notify: false });
    expect(await testDb.select().from(notificationQueue)).toHaveLength(0);
    expect(r.notificationsQueued).toBe(0);
  });

  it("rewrites every pick of a play-in loser to the winner", async () => {
    const playIn = await testDb.query.games.findFirst({
      where: eq(games.gameSlot, 1),
      with: { teamA: true, teamB: true },
    });
    const r = await processFinalGame(db, {
      game: playIn!,
      winnerId: 4, scoreA: 60, scoreB: 70,
    });
    expect(r.loserId).toBe(3);

    const carried = await testDb
      .select({ gameSlot: bracketPicks.gameSlot, pickedTeamId: bracketPicks.pickedTeamId })
      .from(bracketPicks)
      .where(eq(bracketPicks.bracketId, b1))
      .orderBy(asc(bracketPicks.gameSlot));
    // Both of u1's Texas picks (slots 25 and 51) now point at NC State; other picks are untouched.
    expect(carried).toEqual([
      { gameSlot: 13, pickedTeamId: 1 },
      { gameSlot: 25, pickedTeamId: 4 },
      { gameSlot: 45, pickedTeamId: 1 },
      { gameSlot: 51, pickedTeamId: 4 },
    ]);
    const adv = await testDb.query.games.findFirst({ where: eq(games.gameSlot, 25) });
    expect(adv?.teamBId).toBe(4);
    expect(adv?.teamAId).toBeNull();
  });

  it("skips advancement for the championship", async () => {
    const before = await testDb.select().from(games).orderBy(asc(games.gameSlot));
    await processFinalGame(db, {
      game: { ...game, round: "championship", gameSlot: 75, nextGameSlot: null, slotPosition: null },
      winnerId: 1, scoreA: 1, scoreB: 0,
    });
    const after = await testDb.select().from(games).orderBy(asc(games.gameSlot));
    expect(after).toEqual(before);
  });
});
