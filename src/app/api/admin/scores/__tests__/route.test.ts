// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { games, teams, tournamentConfig } from "@/db/schema";

vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@test.com";
});

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

const { mockGetCurrentUser, mockProcessFinalGame } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockProcessFinalGame: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));
vi.mock("@/lib/process-final-game", () => ({
  processFinalGame: (...args: unknown[]) => mockProcessFinalGame(...args),
}));

import { db } from "@/db";
import { POST } from "../route";

let duke: { id: number };
let siena: { id: number };
let gameId: number;

async function seed(overrides: Partial<typeof games.$inferInsert> = {}) {
  await db.execute(sql`truncate table games, teams, tournament_config restart identity cascade`);
  await db.insert(tournamentConfig).values({
    id: 1,
    year: 2027,
    bracketLockDeadline: new Date("2027-03-18T16:00:00Z"),
    wagerCreationDeadline: new Date("2027-03-18T16:00:00Z"),
  });
  [duke, siena] = await db
    .insert(teams)
    .values([
      { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east" },
      { name: "Siena", abbreviation: "SIE", seed: 16, region: "east" },
    ])
    .returning({ id: teams.id });
  const [game] = await db
    .insert(games)
    .values({
      round: "first_round",
      region: "east",
      gameSlot: 13,
      nextGameSlot: 45,
      slotPosition: "top",
      teamAId: duke.id,
      teamBId: siena.id,
      status: "scheduled",
      clock: "12:00",
      period: 1,
      ...overrides,
    })
    .returning({ id: games.id });
  gameId = game.id;
}

const gameRow = () => db.query.games.findFirst({ where: eq(games.id, gameId) });

function mockAdmin() {
  mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "admin@test.com", name: null, image: null });
}
function req(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/scores", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockProcessFinalGame.mockResolvedValue({
    loserId: 2, picksScored: 2, bracketsRecalculated: 2, notificationsQueued: 2,
  });
  await seed();
});

describe("POST /api/admin/scores", () => {
  it("returns 403 for non-admin users", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u2", email: "nobody@test.com", name: null, image: null });
    const res = await POST(req({ game_id: gameId, score_a: 1, score_b: 0 }));
    expect(res.status).toBe(403);
    expect((await gameRow())?.status).toBe("scheduled");
  });

  it("returns 403 when nobody is signed in", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await POST(req({ game_id: gameId, score_a: 1, score_b: 0 }))).status).toBe(403);
  });

  it("requires a game id and 404s on an unknown game", async () => {
    mockAdmin();
    expect((await POST(req({ score_a: 1 }))).status).toBe(400);
    expect((await POST(req({ game_id: 99, score_a: 1, score_b: 0 }))).status).toBe(404);
  });

  it("saves an in-progress score without running the final pipeline", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: gameId, score_a: 40, score_b: 38, status: "in_progress" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await gameRow()).toMatchObject({
      scoreA: 40, scoreB: 38, status: "in_progress", winnerId: null, clock: null, period: null,
    });
    expect(mockProcessFinalGame).not.toHaveBeenCalled();
  });

  it("derives the winner from the scores and runs the shared pipeline with notifications", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: gameId, score_a: 55, score_b: 85, status: "final" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(await gameRow()).toMatchObject({ winnerId: siena.id, status: "final", scoreA: 55, scoreB: 85 });
    expect(mockProcessFinalGame).toHaveBeenCalledTimes(1);
    const [dbArg, opts] = mockProcessFinalGame.mock.calls[0];
    expect(dbArg).toBe(db);
    expect(opts).toMatchObject({ winnerId: siena.id, scoreA: 55, scoreB: 85, notify: true });
    expect(opts.game).toMatchObject({ id: gameId, gameSlot: 13, teamA: { id: duke.id, seed: 1 }, teamB: { id: siena.id, seed: 16 } });
    expect(opts.batchKey).toMatch(/^manual-\d{4}-\d{2}-\d{2}$/);
    expect(opts.multipliers).toMatchObject({ first_round: 10, championship: 320 });
    expect(body).toMatchObject({ success: true, picksScored: 2 });
  });

  it("rejects a winner that contradicts the scores", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: gameId, score_a: 85, score_b: 55, winner_id: siena.id, status: "final" }));
    expect(res.status).toBe(400);
    expect(await gameRow()).toMatchObject({ status: "scheduled", scoreA: null, winnerId: null });
    expect(mockProcessFinalGame).not.toHaveBeenCalled();
  });

  it("re-scores an already-final game without re-notifying", async () => {
    mockAdmin();
    await db.update(games).set({ status: "final", winnerId: duke.id }).where(eq(games.id, gameId));
    await POST(req({ game_id: gameId, score_a: 85, score_b: 55, winner_id: duke.id, status: "final" }));
    expect(mockProcessFinalGame.mock.calls[0][1]).toMatchObject({ winnerId: duke.id, notify: false });
  });

  it("defaults to final and runs the pipeline when an explicit winner is given with no scores", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: gameId, winner_id: duke.id }));
    expect(res.status).toBe(200);
    expect(await gameRow()).toMatchObject({ status: "final", winnerId: duke.id, scoreA: null, scoreB: null });
    expect(mockProcessFinalGame.mock.calls[0][1]).toMatchObject({ winnerId: duke.id, scoreA: null, scoreB: null });
  });
});
