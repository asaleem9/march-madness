// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { bracketPicks, brackets, teams, tournamentConfig } from "@/db/schema";
import { createTestDb, seedProfile, seedUserId, type TestDb } from "@/test/db";
import { lockBracketsPastDeadline } from "../lock-brackets";

let testDb: TestDb;
let db: Db;

const DEADLINE = new Date("2027-03-18T16:00:00Z");

const bracketId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Seed a bracket for user n with `n` real picks and `extraFirstFour` play-in picks. */
async function seedBracket(n: number, realPicks: number, extraFirstFour = 0, locked = false) {
  const id = bracketId(n);
  await testDb.insert(brackets).values({ id, userId: seedUserId(n), name: `B${n}`, locked });
  const rows: (typeof bracketPicks.$inferInsert)[] = [];
  for (let i = 0; i < realPicks; i++) {
    rows.push({ bracketId: id, gameSlot: 13 + i, round: i === 0 ? "championship" : "first_round", pickedTeamId: 1 });
  }
  for (let i = 0; i < extraFirstFour; i++) {
    rows.push({ bracketId: id, gameSlot: 1 + i, round: "first_four", pickedTeamId: 1 });
  }
  if (rows.length > 0) await testDb.insert(bracketPicks).values(rows);
  return id;
}

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb as unknown as Db;
  for (let n = 1; n <= 4; n++) await seedProfile(testDb, { id: seedUserId(n), displayName: `user-${n}` });
  await testDb.insert(teams).values({ id: 1, name: "Duke", abbreviation: "DUKE", seed: 1, region: "east" });
  await testDb.insert(tournamentConfig).values({
    id: 1, year: 2027, bracketLockDeadline: DEADLINE, wagerCreationDeadline: DEADLINE,
  });
});

beforeEach(async () => {
  await testDb.delete(bracketPicks);
  await testDb.delete(brackets);
});

describe("lockBracketsPastDeadline", () => {
  it("does nothing before the deadline", async () => {
    const id = await seedBracket(1, 63);
    const r = await lockBracketsPastDeadline(db, new Date("2027-03-18T15:59:00Z"));
    expect(r).toEqual({ skipped: true, locked: 0, incomplete: 0 });
    const row = await testDb.query.brackets.findFirst({ where: eq(brackets.id, id) });
    expect(row?.locked).toBe(false);
  });

  it("locks complete drafts only, ignoring play-in picks", async () => {
    const full = await seedBracket(1, 63);
    const short = await seedBracket(2, 40);
    const padded = await seedBracket(3, 60, 12); // 60 real + 12 play-ins = still incomplete
    const already = await seedBracket(4, 63, 0, true);

    const before = (await testDb.query.brackets.findFirst({ where: eq(brackets.id, already) }))!.updatedAt;
    const now = new Date("2027-03-18T16:00:01Z");
    const r = await lockBracketsPastDeadline(db, now);
    expect(r).toEqual({ skipped: false, locked: 1, incomplete: 2 });

    const rows = await testDb
      .select({ id: brackets.id, locked: brackets.locked, updatedAt: brackets.updatedAt })
      .from(brackets)
      .orderBy(asc(brackets.id));
    expect(rows.map((b) => [b.id, b.locked])).toEqual([
      [full, true],
      [short, false],
      [padded, false],
      [already, true],
    ]);
    expect(rows[0].updatedAt?.toISOString()).toBe(now.toISOString());
    // Already-locked brackets are not rewritten.
    expect(rows[3].updatedAt?.toISOString()).toBe(before?.toISOString());
  });

  it("handles no drafts", async () => {
    const r = await lockBracketsPastDeadline(db, new Date("2027-03-19T00:00:00Z"));
    expect(r).toEqual({ skipped: false, locked: 0, incomplete: 0 });
  });

  it("skips when there is no config row", async () => {
    await testDb.delete(tournamentConfig);
    try {
      await seedBracket(1, 63);
      const r = await lockBracketsPastDeadline(db, new Date("2027-03-19T00:00:00Z"));
      expect(r).toEqual({ skipped: true, locked: 0, incomplete: 0 });
    } finally {
      await testDb.insert(tournamentConfig).values({
        id: 1, year: 2027, bracketLockDeadline: DEADLINE, wagerCreationDeadline: DEADLINE,
      });
    }
  });
});
