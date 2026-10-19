// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import {
  brackets,
  games,
  notificationQueue,
  teams,
  tournamentConfig,
  wagers,
} from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

const { mockGetCurrentUser, mockFetchESPNScoreboard, mockProcessFinalGame, mockLock, mockAward } =
  vi.hoisted(() => ({
    mockGetCurrentUser: vi.fn(),
    mockFetchESPNScoreboard: vi.fn(),
    mockProcessFinalGame: vi.fn(),
    mockLock: vi.fn(),
    mockAward: vi.fn(),
  }));

// No signed-in admin in these tests: only the bearer token authorizes.
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

vi.mock("@/lib/espn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/espn")>();
  return {
    ...actual,
    fetchESPNScoreboard: (...args: unknown[]) => mockFetchESPNScoreboard(...args),
    formatDateForESPN: vi.fn().mockReturnValue("20270318"),
  };
});

vi.mock("@/lib/process-final-game", () => ({
  processFinalGame: (...args: unknown[]) => mockProcessFinalGame(...args),
}));
vi.mock("@/lib/lock-brackets", () => ({
  lockBracketsPastDeadline: (...args: unknown[]) => mockLock(...args),
}));
vi.mock("@/lib/achievements", () => ({
  awardAchievements: (...args: unknown[]) => mockAward(...args),
}));

import { db } from "@/db";
// The mock above swaps in a PGlite database at runtime; seedProfile is typed against it.
const testDb = db as unknown as TestDb;
import { GET } from "../route";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? headers?.[name] ?? null,
    },
  }) as unknown as NextRequest;
const authed = () => mockRequest({ authorization: "Bearer test-cron-secret" });

/** Serve `events` for the first date fetched and an empty board for the other two days. */
const feed = (events: unknown[]) => {
  mockFetchESPNScoreboard.mockReset();
  mockFetchESPNScoreboard.mockResolvedValueOnce({ events }).mockResolvedValue({ events: [] });
};

function makeESPNEvent(o: {
  espnGameId?: string; state?: string; homeTeamId?: string; awayTeamId?: string;
  homeScore?: string; awayScore?: string; homeWinner?: boolean; awayWinner?: boolean;
  clock?: string; period?: number;
} = {}) {
  const {
    espnGameId = "401520001", state = "post", homeTeamId = "espn-100", awayTeamId = "espn-200",
    homeScore = "75", awayScore = "68", homeWinner = true, awayWinner = false, clock, period,
  } = o;
  return {
    id: espnGameId, date: "2027-03-18T17:00Z", name: "A vs B", shortName: "A vs B",
    competitions: [{
      id: espnGameId, date: "2027-03-18T17:00Z",
      competitors: [
        { id: "1", team: { id: homeTeamId, abbreviation: "TA", displayName: "Team A", shortDisplayName: "A" }, score: homeScore, winner: homeWinner },
        { id: "2", team: { id: awayTeamId, abbreviation: "TB", displayName: "Team B", shortDisplayName: "B" }, score: awayScore, winner: awayWinner },
      ],
      status: { displayClock: clock, period, type: { id: "3", name: "x", state, completed: state === "post", description: "x" } },
    }],
  };
}

async function resetDb() {
  await db.execute(sql`
    truncate table notification_queue, notifications_log, user_achievements, wagers,
      bracket_picks, brackets, push_subscriptions, games, teams, profiles,
      tournament_config, email_waitlist restart identity cascade
  `);
}

let duke: { id: number };
let siena: { id: number };

/** A first-round game between Duke and Siena plus the config row. */
async function seedGame(overrides: Partial<typeof games.$inferInsert> = {}) {
  await db.insert(tournamentConfig).values({
    id: 1,
    year: 2027,
    bracketLockDeadline: new Date("2027-03-18T16:00:00Z"),
    wagerCreationDeadline: new Date("2027-03-18T16:00:00Z"),
  });
  [duke, siena] = await db
    .insert(teams)
    .values([
      { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", espnId: "espn-100" },
      { name: "Siena", abbreviation: "SIE", seed: 16, region: "east", espnId: "espn-200" },
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
      status: "in_progress",
      espnGameId: "401520001",
      ...overrides,
    })
    .returning();
  return game;
}

const gameRow = (id: number) => db.query.games.findFirst({ where: eq(games.id, id) });

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/cron/update-scores", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mockGetCurrentUser.mockResolvedValue(null);
    mockProcessFinalGame.mockResolvedValue({
      loserId: 2, picksScored: 1, bracketsRecalculated: 3, notificationsQueued: 2,
    });
    mockLock.mockResolvedValue({ skipped: true, locked: 0, incomplete: 0 });
    mockAward.mockResolvedValue(0);
    feed([]);
    await resetDb();
  });

  it("returns 401 without a valid CRON_SECRET bearer token", async () => {
    expect((await GET(mockRequest({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await GET(mockRequest())).status).toBe(401);
  });

  it("returns 200 gracefully when every ESPN fetch fails", async () => {
    mockFetchESPNScoreboard.mockReset();
    mockFetchESPNScoreboard.mockResolvedValue(null);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain("ESPN fetch failed");
    expect(mockLock).not.toHaveBeenCalled();
  });

  it("writes live scores and the clock for an in-progress game without running the final pipeline", async () => {
    const game = await seedGame();
    feed([makeESPNEvent({ state: "in", clock: "4:32", period: 2 })]);

    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect((await res.json()).gamesUpdated).toBe(1);
    const row = await gameRow(game.id);
    expect(row).toMatchObject({ status: "in_progress", scoreA: 75, scoreB: 68, clock: "4:32", period: 2, winnerId: null });
    expect(row?.scheduledAt?.toISOString()).toBe("2027-03-18T17:00:00.000Z");
    expect(mockProcessFinalGame).not.toHaveBeenCalled();
  });

  it("runs the final-game pipeline with notifications when the winner first becomes known", async () => {
    const game = await seedGame();
    feed([makeESPNEvent({ state: "post" })]);

    const res = await GET(authed());
    const body = await res.json();
    const row = await gameRow(game.id);
    expect(row).toMatchObject({ status: "final", winnerId: duke.id, scoreA: 75, scoreB: 68, clock: null, period: null });
    expect(mockProcessFinalGame).toHaveBeenCalledTimes(1);
    const [dbArg, opts] = mockProcessFinalGame.mock.calls[0];
    expect(dbArg).toBe(db);
    expect(opts).toMatchObject({ winnerId: duke.id, scoreA: 75, scoreB: 68, notify: true });
    expect(opts.game).toMatchObject({ id: game.id, gameSlot: 13, teamA: { id: duke.id }, teamB: { id: siena.id } });
    expect(opts.batchKey).toMatch(/^20270318-(afternoon|evening)$/);
    expect(body.scoresRecalculated).toBe(3);
    expect(body.notificationsQueued).toBe(2);
  });

  it("re-runs the pipeline idempotently but does not re-notify for an already-decided game", async () => {
    await seedGame({ status: "final", winnerId: undefined });
    // winnerId references a team inserted inside seedGame, so set it afterwards.
    await db.update(games).set({ winnerId: duke.id }).where(eq(games.gameSlot, 13));
    feed([makeESPNEvent({ state: "post" })]);
    await GET(authed());
    expect(mockProcessFinalGame).toHaveBeenCalledTimes(1);
    expect(mockProcessFinalGame.mock.calls[0][1]).toMatchObject({ notify: false });
  });

  it("never downgrades a recorded final when ESPN regresses", async () => {
    const game = await seedGame({ status: "final", scoreA: 75, scoreB: 68 });
    await db.update(games).set({ winnerId: duke.id }).where(eq(games.id, game.id));
    feed([makeESPNEvent({ state: "in", homeScore: "", awayScore: "" })]);
    await GET(authed());
    const row = await gameRow(game.id);
    expect(row).toMatchObject({ status: "final", winnerId: duke.id, scoreA: 75, scoreB: 68 });
  });

  it("auto-discovers a game by team ESPN ids and backfills espn_game_id", async () => {
    const game = await seedGame({ espnGameId: null });
    feed([makeESPNEvent({ state: "in" })]);
    const body = await (await GET(authed())).json();
    expect(body.gamesDiscovered).toBe(1);
    const row = await gameRow(game.id);
    expect(row?.espnGameId).toBe("401520001");
    expect(row).toMatchObject({ scoreA: 75, scoreB: 68, status: "in_progress" });
  });

  it("ignores ESPN games that match nothing in the bracket", async () => {
    const game = await seedGame();
    feed([makeESPNEvent({ espnGameId: "999", homeTeamId: "espn-900", awayTeamId: "espn-901" })]);
    const body = await (await GET(authed())).json();
    expect(body.gamesUpdated).toBe(0);
    expect(body.gamesDiscovered).toBe(0);
    expect((await gameRow(game.id))?.scoreA).toBeNull();
  });

  it("auto-locks brackets, awards achievements, and stamps last_score_update_at every run", async () => {
    await seedGame();
    mockLock.mockResolvedValueOnce({ skipped: false, locked: 4, incomplete: 1 });
    const body = await (await GET(authed())).json();
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockLock.mock.calls[0][0]).toBe(db);
    expect(mockAward).toHaveBeenCalledTimes(1);
    expect(mockAward.mock.calls[0][0]).toBe(db);
    expect(body.bracketsLocked).toBe(4);
    expect(body.incompleteDrafts).toBe(1);
    const cfg = await db.query.tournamentConfig.findFirst();
    expect(cfg?.lastScoreUpdateAt).toBeInstanceOf(Date);
    expect(cfg?.lastScoreUpdateAt?.toISOString()).toBe(body.timestamp);
  });

  it("resolves accepted wagers once the championship (looked up by round) is final, ties with no winner", async () => {
    await seedGame();
    await db.insert(games).values({
      round: "championship", gameSlot: 75, teamAId: duke.id, teamBId: siena.id,
      status: "final", winnerId: duke.id, scoreA: 80, scoreB: 70,
    });
    const u1 = seedUserId(1);
    const u2 = seedUserId(2);
    await seedProfile(testDb, { id: u1, displayName: "Ali" });
    await seedProfile(testDb, { id: u2, displayName: "Sam" });
    const [cb, ob] = await db
      .insert(brackets)
      .values([
        { userId: u1, name: "Ali's", score: 300, locked: true },
        { userId: u2, name: "Sam's", score: 300, locked: true },
      ])
      .returning({ id: brackets.id });
    const [wager] = await db
      .insert(wagers)
      .values({
        challengerId: u1, opponentId: u2, challengerBracketId: cb.id, opponentBracketId: ob.id,
        stakes: "dinner", status: "accepted",
      })
      .returning();

    const body = await (await GET(authed())).json();
    expect(body.wagersResolved).toBe(1);

    const resolved = await db.query.wagers.findFirst({ where: eq(wagers.id, wager.id) });
    expect(resolved).toMatchObject({ status: "resolved", winnerId: null });
    expect(resolved?.resolvedAt).toBeInstanceOf(Date);

    const queued = await db.select().from(notificationQueue).orderBy(notificationQueue.id);
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ userId: u1, type: "wager_result" });
    expect(queued[0].payload).toMatchObject({
      wager_id: wager.id, tie: true, won: false, stakes: "dinner", your_score: 300, their_score: 300, opponent_name: "Sam",
    });
    expect(queued[1]).toMatchObject({ userId: u2 });
    expect(queued[1].payload).toMatchObject({ opponent_name: "Ali", tie: true });

    // Idempotent: a second run finds no accepted wagers.
    const again = await (await GET(authed())).json();
    expect(again.wagersResolved).toBe(0);
    expect(await db.select().from(notificationQueue)).toHaveLength(2);
  });

  it("picks the higher-scoring bracket as the wager winner, falling back to the opponent's primary bracket", async () => {
    await seedGame();
    await db.insert(games).values({
      round: "championship", gameSlot: 75, teamAId: duke.id, teamBId: siena.id,
      status: "final", winnerId: duke.id,
    });
    const u1 = seedUserId(1);
    const u2 = seedUserId(2);
    await seedProfile(testDb, { id: u1, displayName: "Ali" });
    await seedProfile(testDb, { id: u2, displayName: "Sam" });
    const [cb] = await db
      .insert(brackets)
      .values([
        { userId: u1, name: "A", score: 100, locked: true },
        { userId: u2, name: "B", score: 250, locked: true, isPrimary: true },
      ])
      .returning({ id: brackets.id });
    const [wager] = await db
      .insert(wagers)
      .values({ challengerId: u1, opponentId: u2, challengerBracketId: cb.id, stakes: "lunch", status: "accepted" })
      .returning();

    await GET(authed());
    const resolved = await db.query.wagers.findFirst({ where: eq(wagers.id, wager.id) });
    expect(resolved).toMatchObject({ status: "resolved", winnerId: u2 });
    const queued = await db.select().from(notificationQueue).orderBy(notificationQueue.id);
    expect(queued[0].payload).toMatchObject({ won: false, tie: false, your_score: 100, their_score: 250 });
    expect(queued[1].payload).toMatchObject({ won: true, your_score: 250, their_score: 100 });
  });

  it("leaves wagers alone while the championship is undecided", async () => {
    await seedGame();
    await db.insert(games).values({ round: "championship", gameSlot: 75, status: "scheduled" });
    const u1 = seedUserId(1);
    const u2 = seedUserId(2);
    await seedProfile(testDb, { id: u1, displayName: "Ali" });
    await seedProfile(testDb, { id: u2, displayName: "Sam" });
    const [cb] = await db.insert(brackets).values({ userId: u1, name: "A" }).returning({ id: brackets.id });
    await db.insert(wagers).values({ challengerId: u1, opponentId: u2, challengerBracketId: cb.id, stakes: "x", status: "accepted" });

    const body = await (await GET(authed())).json();
    expect(body.wagersResolved).toBe(0);
    expect((await db.query.wagers.findFirst())?.status).toBe("accepted");
  });
});
