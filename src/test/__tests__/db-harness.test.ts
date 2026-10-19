// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { teams, tournamentConfig, profiles, brackets } from "@/db/schema";
import { createTestDb, seedProfile, seedUserId, type TestDb } from "@/test/db";

describe("PGlite test harness", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("applies the real migrations and round-trips rows", async () => {
    const [team] = await db
      .insert(teams)
      .values({ name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", espnId: "150" })
      .returning();
    expect(team.id).toBeGreaterThan(0);

    await db.insert(tournamentConfig).values({
      id: 1,
      year: 2027,
      bracketLockDeadline: new Date("2027-03-18T16:00:00Z"),
      wagerCreationDeadline: new Date("2027-03-18T16:00:00Z"),
    });
    const cfg = await db.query.tournamentConfig.findFirst();
    expect(cfg?.scoringMultipliers?.championship).toBe(320);

    const user = await seedProfile(db, { id: seedUserId(1), displayName: "Ali" });
    const [bracket] = await db
      .insert(brackets)
      .values({ userId: user.id, name: "My bracket" })
      .returning();
    const found = await db.query.brackets.findFirst({
      where: eq(brackets.id, bracket.id),
      with: { user: true, picks: true },
    });
    expect(found?.user.displayName).toBe("Ali");
    expect(found?.picks).toEqual([]);
    const p = await db.select().from(profiles);
    expect(p).toHaveLength(1);
  });

  it("enforces one bracket per user", async () => {
    await expect(
      db.insert(brackets).values({ userId: seedUserId(1), name: "Second" })
    ).rejects.toThrow();
  });
});
