// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { games, teams, tournamentConfig } from "@/db/schema";
import type { TestDb } from "@/test/db";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  // `cache` memoises per request on the server; in tests we want fresh reads.
  return { ...actual, cache: <T>(fn: T) => fn };
});
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

import { db } from "@/db";
import { getTournamentConfig, getChampion, getSeason } from "../tournament";

const testDb = db as unknown as TestDb;

beforeAll(async () => {
  await testDb.insert(teams).values([
    { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", record: "30-5", espnId: "150" },
    { id: 2, name: "Houston", abbreviation: "HOU", seed: 1, region: "south", eliminated: true },
  ]);
  await testDb.insert(games).values({
    gameSlot: 75, round: "championship", region: null, teamAId: 1, teamBId: 2, status: "scheduled",
  });
});

describe("getTournamentConfig", () => {
  it("returns null without a config row", async () => {
    expect(await getTournamentConfig()).toBeNull();
  });

  it("maps the row to the snake_case shape with ISO timestamps", async () => {
    await testDb.insert(tournamentConfig).values({
      id: 1,
      year: 2027,
      bracketLockDeadline: new Date("2027-03-18T16:00:00Z"),
      wagerCreationDeadline: new Date("2027-03-18T16:00:00Z"),
      finalFourPairing: [["east", "west"], ["south", "midwest"]],
      lastScoreUpdateAt: new Date("2027-04-06T03:00:00Z"),
    });
    expect(await getTournamentConfig()).toEqual({
      id: 1,
      year: 2027,
      bracket_lock_deadline: "2027-03-18T16:00:00.000Z",
      wager_creation_deadline: "2027-03-18T16:00:00.000Z",
      scoring_multipliers: { first_round: 10, second_round: 20, sweet_16: 40, elite_eight: 80, final_four: 160, championship: 320 },
      active_phase: "pre_tournament",
      final_four_pairing: [["east", "west"], ["south", "midwest"]],
      last_score_update_at: "2027-04-06T03:00:00.000Z",
    });
  });
});

describe("getChampion / getSeason", () => {
  it("is null while the title game is unplayed, and the season is in-year", async () => {
    expect(await getChampion()).toBeNull();
    const season = await getSeason();
    expect(season).toMatchObject({ phase: "pre_tournament", tournamentYear: 2027, displayYear: 2027, offSeason: false, champion: null });
  });

  it("returns the winner and runner-up once final, flipping the site into the off-season", async () => {
    await testDb.update(games).set({ status: "final", winnerId: 2, scoreA: 60, scoreB: 72 }).where(eq(games.gameSlot, 75));
    const champ = await getChampion();
    expect(champ).toEqual({
      winner: { id: 2, name: "Houston", abbreviation: "HOU", seed: 1, region: "south", record: null, logoUrl: null, eliminated: true, espnId: null },
      runnerUp: { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", record: "30-5", logoUrl: null, eliminated: false, espnId: "150" },
      winnerScore: 72,
      loserScore: 60,
    });
    const season = await getSeason();
    expect(season).toMatchObject({ phase: "completed", tournamentYear: 2027, displayYear: 2028, offSeason: true });
    expect(season.upcoming).toBeNull();
  });
});
