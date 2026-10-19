// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { bracketPicks, brackets, games, teams, tournamentConfig } from "@/db/schema";
import { seedProfile, seedUserId } from "@/test/db";
import { buildGameSlots, YEAR_DEFAULTS } from "@/lib/tournament-structure";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { POST, PUT } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeRequest(method: "POST" | "PUT", body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/brackets", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const USER = seedUserId(1);
const OTHER = seedUserId(2);

const fakeUser = { id: USER, email: "player@example.com", name: "Player One", image: null };

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

/**
 * The real 75-slot skeleton. First-round game 13+i gets teams 100+2i / 101+2i,
 * so the 64 seeded teams fill the field; play-in games have no teams.
 */
const SKELETON = buildGameSlots({
  dates: YEAR_DEFAULTS[2027].dates,
  finalFourPairing: YEAR_DEFAULTS[2027].finalFourPairing,
});

function gameRows() {
  return SKELETON.map((g) => {
    const r1 = g.round === "first_round" ? g.game_slot - 13 : null;
    return {
      gameSlot: g.game_slot,
      round: g.round,
      region: g.region,
      nextGameSlot: g.next_game_slot,
      slotPosition: g.slot_position,
      teamAId: r1 === null ? null : 100 + 2 * r1,
      teamBId: r1 === null ? null : 101 + 2 * r1,
    };
  });
}

/** A full chalk bracket (top side wins everywhere), in slot order 13..75. */
const FULL_BRACKET = (() => {
  const bySlot = new Map(SKELETON.map((g) => [g.game_slot, g]));
  const rows = gameRows();
  const winner = new Map<number, number>();
  const out: { game_slot: number; round: string; picked_team_id: number }[] = [];
  for (let slot = 13; slot <= 75; slot++) {
    const g = bySlot.get(slot)!;
    let team: number;
    if (g.round === "first_round") team = rows.find((r) => r.gameSlot === slot)!.teamAId!;
    else {
      const feeders = SKELETON.filter((x) => x.next_game_slot === slot).sort((a, b) => a.game_slot - b.game_slot);
      team = winner.get(feeders[0].game_slot)!;
    }
    winner.set(slot, team);
    out.push({ game_slot: slot, round: g.round, picked_team_id: team });
  }
  return out;
})();

/** The first `count` picks of a consistent bracket (earlier slots feed later ones). */
function makePicks(count: number) {
  return FULL_BRACKET.slice(0, count).map((p) => ({ ...p }));
}

async function setDeadline(deadline: Date) {
  await db
    .insert(tournamentConfig)
    .values({ id: 1, year: 2027, bracketLockDeadline: deadline, wagerCreationDeadline: deadline })
    .onConflictDoUpdate({ target: tournamentConfig.id, set: { bracketLockDeadline: deadline } });
}

async function createBracket(userId: string, overrides: Partial<typeof brackets.$inferInsert> = {}) {
  const [row] = await db
    .insert(brackets)
    .values({ userId, name: "Existing", ...overrides })
    .returning();
  return row;
}

const picksOf = (bracketId: string) =>
  db
    .select({ gameSlot: bracketPicks.gameSlot, round: bracketPicks.round, pickedTeamId: bracketPicks.pickedTeamId })
    .from(bracketPicks)
    .where(eq(bracketPicks.bracketId, bracketId))
    .orderBy(bracketPicks.gameSlot);

const bracketById = (id: string) => db.query.brackets.findFirst({ where: eq(brackets.id, id) });

// ---------------------------------------------------------------------------
// Fixture: a clean db with a future deadline, two profiles and 64 teams
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await db.execute(
    sql`truncate table bracket_picks, brackets, tournament_config, games, teams, profiles restart identity cascade`
  );
  await setDeadline(future);
  await seedProfile(db, { id: USER, displayName: "Player One" });
  await seedProfile(db, { id: OTHER, displayName: "Other" });
  await db.insert(teams).values(
    Array.from({ length: 64 }, (_, i) => ({
      id: 100 + i,
      name: `Team ${i}`,
      abbreviation: `T${i}`,
      seed: (i % 16) + 1,
      region: (["east", "west", "south", "midwest"] as const)[i % 4],
    }))
  );
  await db.insert(games).values(gameRows());
  mockGetCurrentUser.mockReset().mockResolvedValue(fakeUser);
});

// ==========================================================================
// POST /api/brackets
// ==========================================================================

describe("POST /api/brackets", () => {
  it("returns 401 when there is no session", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest("POST", { name: "My Bracket" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
    expect(await db.select().from(brackets)).toHaveLength(0);
  });

  it("returns 403 once the lock deadline has passed", async () => {
    await setDeadline(past);

    const res = await POST(makeRequest("POST", { name: "Late", picks: makePicks(3) }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("The bracket deadline has passed. Brackets are locked.");
    expect(await db.select().from(brackets)).toHaveLength(0);
  });

  it("returns 409 when the user already has a bracket", async () => {
    const existing = await createBracket(USER);

    const res = await POST(makeRequest("POST", { name: "My Bracket", picks: [] }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("You already have a bracket");
    expect(json.bracketId).toBe(existing.id);
  });

  it("returns 400 when lock=true but picks < 63", async () => {
    const res = await POST(
      makeRequest("POST", { name: "My Bracket", picks: makePicks(10), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("63 picks are required");
    expect(await db.select().from(brackets)).toHaveLength(0);
  });

  it("creates the bracket with its picks and returns bracketId", async () => {
    const picks = makePicks(5);
    const res = await POST(makeRequest("POST", { name: "Test Bracket", picks }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(false);

    const bracket = await bracketById(json.bracketId);
    expect(bracket).toMatchObject({ userId: USER, name: "Test Bracket", locked: false, isPrimary: true });
    expect(await picksOf(json.bracketId)).toEqual(
      picks.map((p) => ({ gameSlot: p.game_slot, round: p.round, pickedTeamId: p.picked_team_id }))
    );
  });

  it("creates bracket with locked=true when lock=true and 63 picks", async () => {
    const res = await POST(
      makeRequest("POST", { name: "Final", picks: makePicks(63), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(true);
    expect((await bracketById(json.bracketId))?.locked).toBe(true);
    expect(await picksOf(json.bracketId)).toHaveLength(63);
  });

  it("rejects an impossible pick before anything is written", async () => {
    const picks = [...makePicks(4), { game_slot: 75, round: "championship", picked_team_id: 9999 }];
    const res = await POST(makeRequest("POST", { name: "Bad", picks }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Team 9999 can't be picked in game 75");
    expect(await db.select().from(brackets)).toHaveLength(0);
    expect(await db.select().from(bracketPicks)).toHaveLength(0);
  });

  it("works with 0 picks (draft save, no lock)", async () => {
    const res = await POST(makeRequest("POST", { name: "Draft", picks: [] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(false);
    expect((await bracketById(json.bracketId))?.name).toBe("Draft");
    expect(await picksOf(json.bracketId)).toEqual([]);
  });

  it("names the bracket after the profile when no name is sent", async () => {
    const res = await POST(makeRequest("POST", { picks: [] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect((await bracketById(json.bracketId))?.name).toBe("Player One's Bracket");
  });

  it("takes `round` from the games table, not the request body", async () => {
    const picks = [{ game_slot: 13, round: "championship", picked_team_id: 101 }];

    const res = await POST(makeRequest("POST", { name: "Shape Test", picks }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(await picksOf(json.bracketId)).toEqual([
      { gameSlot: 13, round: "first_round", pickedTeamId: 101 },
    ]);
  });

  it("rejects a hedge: a team advanced to a game it didn't win its way into", async () => {
    const next = SKELETON.find((g) => g.game_slot === 13)!.next_game_slot!;
    const picks = [
      { game_slot: 13, round: "first_round", picked_team_id: 101 }, // team 101 wins game 13
      { game_slot: next, round: "second_round", picked_team_id: 100 }, // ...but team 100 advances?
    ];

    const res = await POST(makeRequest("POST", { name: "Hedge", picks }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe(`Team 100 can't be picked in game ${next}`);
    expect(await db.select().from(brackets)).toHaveLength(0);
  });

  it("rejects picks for the play-in games and for teams not in the game", async () => {
    let res = await POST(makeRequest("POST", { picks: [{ game_slot: 3, round: "first_four", picked_team_id: 100 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid game slot 3");

    res = await POST(makeRequest("POST", { picks: [{ game_slot: 13, round: "first_round", picked_team_id: 150 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Team 150 can't be picked in game 13");
  });

  it("won't finalize when the 63 rows aren't 63 real picks", async () => {
    // 63 rows, but padded with play-in slots that users never pick.
    const padded = [
      ...makePicks(60),
      ...[1, 2, 3].map((slot) => ({ game_slot: slot, round: "first_four", picked_team_id: 100 })),
    ];
    const res = await POST(makeRequest("POST", { picks: padded, lock: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("All 63 picks are required to finalize your bracket");
  });
});

// ==========================================================================
// PUT /api/brackets
// ==========================================================================

describe("PUT /api/brackets", () => {
  it("returns 401 when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(makeRequest("PUT", { bracketId: "b1" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when bracket not found", async () => {
    const res = await PUT(makeRequest("PUT", { bracketId: seedUserId(9) }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("returns 404 for a malformed bracket id", async () => {
    const res = await PUT(makeRequest("PUT", { bracketId: "not-a-uuid" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the bracket belongs to someone else", async () => {
    const theirs = await createBracket(OTHER);
    await db.insert(bracketPicks).values({ bracketId: theirs.id, gameSlot: 13, round: "first_round", pickedTeamId: 100 });

    const res = await PUT(
      makeRequest("PUT", { bracketId: theirs.id, name: "Hijacked", picks: makePicks(2) })
    );

    expect(res.status).toBe(404);
    expect((await bracketById(theirs.id))?.name).toBe("Existing");
    expect(await picksOf(theirs.id)).toHaveLength(1);
  });

  it("returns 403 when bracket is locked", async () => {
    const mine = await createBracket(USER, { locked: true });

    const res = await PUT(makeRequest("PUT", { bracketId: mine.id, picks: makePicks(2) }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Bracket is locked");
    expect(await picksOf(mine.id)).toEqual([]);
  });

  it("returns 403 once the deadline has passed, even for an unlocked bracket", async () => {
    const mine = await createBracket(USER);
    await setDeadline(past);

    const res = await PUT(makeRequest("PUT", { bracketId: mine.id, picks: makePicks(2) }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("The bracket deadline has passed. Brackets are locked.");
    expect(await picksOf(mine.id)).toEqual([]);
  });

  it("returns 400 when lock=true but picks < 63", async () => {
    const mine = await createBracket(USER);

    const res = await PUT(
      makeRequest("PUT", { bracketId: mine.id, picks: makePicks(10), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("63 picks are required");
    expect((await bracketById(mine.id))?.locked).toBe(false);
  });

  it("draft save: upserts new picks, removes stale ones, does NOT lock", async () => {
    const mine = await createBracket(USER);
    await db.insert(bracketPicks).values([
      { bracketId: mine.id, gameSlot: 13, round: "first_round", pickedTeamId: 150 }, // will change
      { bracketId: mine.id, gameSlot: 40, round: "first_round", pickedTeamId: 151 }, // stale
    ]);

    const picks = makePicks(5);
    const res = await PUT(makeRequest("PUT", { bracketId: mine.id, picks }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ bracketId: mine.id, locked: false });
    expect(await picksOf(mine.id)).toEqual(
      picks.map((p) => ({ gameSlot: p.game_slot, round: p.round, pickedTeamId: p.picked_team_id }))
    );
    expect((await bracketById(mine.id))?.locked).toBe(false);
  });

  it("finalize: saves all 63 picks and sets locked=true", async () => {
    const mine = await createBracket(USER);

    const res = await PUT(
      makeRequest("PUT", { bracketId: mine.id, picks: makePicks(63), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(true);
    expect(await picksOf(mine.id)).toHaveLength(63);
    expect((await bracketById(mine.id))?.locked).toBe(true);
  });

  it("if a pick is rejected, old picks are preserved and the bracket stays unlocked", async () => {
    const mine = await createBracket(USER);
    await db.insert(bracketPicks).values({ bracketId: mine.id, gameSlot: 13, round: "first_round", pickedTeamId: 150 });

    const picks = [...makePicks(62), { game_slot: 75, round: "championship", picked_team_id: 9999 }];
    const res = await PUT(
      makeRequest("PUT", { bracketId: mine.id, name: "Renamed", picks, lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Team 9999 can't be picked in game 75");
    // The whole save rolled back: old pick intact, name unchanged, not locked.
    expect(await picksOf(mine.id)).toEqual([{ gameSlot: 13, round: "first_round", pickedTeamId: 150 }]);
    expect(await bracketById(mine.id)).toMatchObject({ name: "Existing", locked: false });
  });

  it("name-only update (no picks in body)", async () => {
    const mine = await createBracket(USER);
    await db.insert(bracketPicks).values({ bracketId: mine.id, gameSlot: 13, round: "first_round", pickedTeamId: 150 });

    const res = await PUT(makeRequest("PUT", { bracketId: mine.id, name: "Renamed Bracket" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ bracketId: mine.id, locked: false });
    expect((await bracketById(mine.id))?.name).toBe("Renamed Bracket");
    // Picks were NOT touched
    expect(await picksOf(mine.id)).toEqual([{ gameSlot: 13, round: "first_round", pickedTeamId: 150 }]);
  });
});
