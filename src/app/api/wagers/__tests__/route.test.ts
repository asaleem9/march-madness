// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { brackets, notificationQueue, tournamentConfig, wagers } from "@/db/schema";
import { seedProfile, seedUserId } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { POST, PATCH } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeRequest(body: Record<string, unknown>): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

function signIn(id: string | null) {
  mockGetCurrentUser.mockResolvedValue(
    id ? { id, email: `${id}@example.com`, name: null, image: null } : null
  );
}

const ALICE = seedUserId(1); // challenger in POST tests
const BOB = seedUserId(2); // opponent
const CAROL = seedUserId(3); // challenger in PATCH tests
const STRANGER = seedUserId(4);

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

async function setWagerDeadline(deadline: Date) {
  await db
    .insert(tournamentConfig)
    .values({ id: 1, year: 2027, bracketLockDeadline: deadline, wagerCreationDeadline: deadline })
    .onConflictDoUpdate({ target: tournamentConfig.id, set: { wagerCreationDeadline: deadline } });
}

async function createBracket(userId: string) {
  const [row] = await db.insert(brackets).values({ userId, name: "Bracket" }).returning();
  return row;
}

async function createPendingWager(challengerBracketId: string) {
  const [row] = await db
    .insert(wagers)
    .values({ challengerId: CAROL, opponentId: BOB, challengerBracketId, stakes: "Pizza" })
    .returning();
  return row;
}

const queued = () =>
  db
    .select({ userId: notificationQueue.userId, type: notificationQueue.type, payload: notificationQueue.payload })
    .from(notificationQueue)
    .orderBy(notificationQueue.id);

const wagerById = (id: string) => db.query.wagers.findFirst({ where: eq(wagers.id, id) });

beforeEach(async () => {
  await db.execute(
    sql`truncate table notification_queue, wagers, brackets, tournament_config, profiles restart identity cascade`
  );
  await setWagerDeadline(future);
  await seedProfile(db, { id: ALICE, displayName: "Alice" });
  await seedProfile(db, { id: BOB, displayName: "Bob" });
  await seedProfile(db, { id: CAROL, displayName: "Carol" });
  await seedProfile(db, { id: STRANGER, displayName: "Stranger" });
  mockGetCurrentUser.mockReset();
});

// ---------------------------------------------------------------------------
// POST /api/wagers
// ---------------------------------------------------------------------------

describe("POST /api/wagers", () => {
  let aliceBracketId: string;

  const validBody = () => ({
    opponent_id: BOB,
    challenger_bracket_id: aliceBracketId,
    stakes: "Loser buys dinner",
  });

  beforeEach(async () => {
    aliceBracketId = (await createBracket(ALICE)).id;
    signIn(ALICE);
  });

  it("returns 401 when unauthenticated", async () => {
    signIn(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ opponent_id: BOB }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
  });

  it("returns 400 when challenging yourself", async () => {
    const res = await POST(makeRequest({ ...validBody(), opponent_id: ALICE }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "You can't wager against yourself" });
  });

  it("returns 400 when stakes exceed 120 characters", async () => {
    const res = await POST(makeRequest({ ...validBody(), stakes: "x".repeat(121) }));
    expect(res.status).toBe(400);
    expect(await db.select().from(wagers)).toHaveLength(0);
  });

  it("returns 403 when the wager deadline has passed", async () => {
    await setWagerDeadline(past);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Wager creation deadline has passed" });
  });

  it("returns 400 when the bracket is not owned by the user", async () => {
    const bobsBracket = await createBracket(BOB);
    const res = await POST(makeRequest({ ...validBody(), challenger_bracket_id: bobsBracket.id }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid bracket" });
    expect(await db.select().from(wagers)).toHaveLength(0);
  });

  it("returns 400 for a malformed bracket id", async () => {
    const res = await POST(makeRequest({ ...validBody(), challenger_bracket_id: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid bracket" });
  });

  it("returns a sanitized 500 when the opponent does not exist", async () => {
    const res = await POST(makeRequest({ ...validBody(), opponent_id: seedUserId(99) }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Selected opponent not found" });
    expect(await queued()).toHaveLength(0);
  });

  it("inserts the wager and queues a request with the challenger's profile name", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const { wagerId } = await res.json();

    expect(await wagerById(wagerId)).toMatchObject({
      challengerId: ALICE,
      opponentId: BOB,
      challengerBracketId: aliceBracketId,
      opponentBracketId: null,
      stakes: "Loser buys dinner",
      status: "pending",
      winnerId: null,
    });

    expect(await queued()).toEqual([
      {
        userId: BOB,
        type: "wager_request",
        payload: { wager_id: wagerId, challenger_name: "Alice", stakes: "Loser buys dinner" },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/wagers
// ---------------------------------------------------------------------------

describe("PATCH /api/wagers", () => {
  let wagerId: string;

  beforeEach(async () => {
    const carols = await createBracket(CAROL);
    wagerId = (await createPendingWager(carols.id)).id;
  });

  it("returns 401 when unauthenticated", async () => {
    signIn(null);
    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the wager is not found", async () => {
    signIn(BOB);
    const res = await PATCH(makeRequest({ wager_id: seedUserId(77), action: "accept" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a malformed wager id", async () => {
    signIn(BOB);
    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the wager is not pending", async () => {
    await db.update(wagers).set({ status: "accepted" }).where(eq(wagers.id, wagerId));
    signIn(BOB);
    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Wager already responded to" });
  });

  it("revoke: challenger sets declined and the opponent is notified", async () => {
    signIn(CAROL);
    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "revoke" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect((await wagerById(wagerId))?.status).toBe("declined");
    expect(await queued()).toEqual([
      {
        userId: BOB,
        type: "wager_result",
        payload: { wager_id: wagerId, status: "revoked", opponent_name: "Carol", stakes: "Pizza" },
      },
    ]);
  });

  it("accept: opponent attaches their bracket and the challenger is notified", async () => {
    const bobs = await createBracket(BOB);
    signIn(BOB);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept", bracket_id: bobs.id }));
    expect(res.status).toBe(200);

    expect(await wagerById(wagerId)).toMatchObject({ status: "accepted", opponentBracketId: bobs.id });
    expect(await queued()).toEqual([
      {
        userId: CAROL,
        type: "wager_result",
        payload: { wager_id: wagerId, status: "accepted", opponent_name: "Bob", stakes: "Pizza" },
      },
    ]);
  });

  it("accept: falls back to the opponent's own bracket when none is sent", async () => {
    const bobs = await createBracket(BOB);
    signIn(BOB);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept" }));
    expect(res.status).toBe(200);
    expect(await wagerById(wagerId)).toMatchObject({ status: "accepted", opponentBracketId: bobs.id });
  });

  it("accept: rejects a bracket that isn't the opponent's", async () => {
    await createBracket(BOB);
    const strangers = await createBracket(STRANGER);
    signIn(BOB);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept", bracket_id: strangers.id }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid bracket" });
    expect((await wagerById(wagerId))?.status).toBe("pending");
  });

  it("accept: blocks when the opponent has no bracket at all", async () => {
    signIn(BOB);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Create a bracket first" });
    expect((await wagerById(wagerId))?.status).toBe("pending");
    expect(await queued()).toHaveLength(0);
  });

  it("decline: opponent sets declined and the challenger is notified", async () => {
    signIn(BOB);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "decline" }));
    expect(res.status).toBe(200);

    expect((await wagerById(wagerId))?.status).toBe("declined");
    expect((await queued())[0]).toMatchObject({
      userId: CAROL,
      payload: { status: "declined", opponent_name: "Bob" },
    });
  });

  it("returns 404 when the wrong user tries to revoke", async () => {
    signIn(STRANGER);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "revoke" }));
    expect(res.status).toBe(404);
    expect((await wagerById(wagerId))?.status).toBe("pending");
    expect(await queued()).toHaveLength(0);
  });

  it("returns 404 when the challenger tries to accept their own wager", async () => {
    signIn(CAROL);

    const res = await PATCH(makeRequest({ wager_id: wagerId, action: "accept" }));
    expect(res.status).toBe(404);
    expect((await wagerById(wagerId))?.status).toBe("pending");
  });

  it("returns 400 for an unknown action (including self-resolve)", async () => {
    signIn(BOB);

    for (const action of ["explode", "resolve"]) {
      const res = await PATCH(makeRequest({ wager_id: wagerId, action }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid action" });
    }
    expect(await wagerById(wagerId)).toMatchObject({ status: "pending", winnerId: null });
  });
});
