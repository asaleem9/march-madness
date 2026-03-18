// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------
// Each builder instance tracks calls and returns preconfigured results.
// Terminal methods (.single()) resolve the accumulated chain.

type MockResult = { data: unknown; error: unknown };

function createQueryBuilder(defaultResult: MockResult = { data: null, error: null }) {
  let result: MockResult = { ...defaultResult };

  const builder: Record<string, ReturnType<typeof vi.fn>> & { _setResult: (r: MockResult) => void } = {
    _setResult(r: MockResult) {
      result = r;
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn(() => result),
  };

  // Make chainable methods return the builder itself
  for (const key of ["from", "select", "insert", "upsert", "update", "delete", "eq", "not"]) {
    builder[key] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn(() => result);

  return builder;
}

// ---------------------------------------------------------------------------
// Table-aware Supabase mock
// ---------------------------------------------------------------------------
// Allows routing `.from("brackets")` and `.from("bracket_picks")` to
// independent builders so we can configure different return values per table.

function createTableAwareClient() {
  const tables: Record<string, ReturnType<typeof createQueryBuilder>> = {};

  function getTable(name: string) {
    if (!tables[name]) {
      tables[name] = createQueryBuilder();
    }
    return tables[name];
  }

  const client = {
    from: vi.fn((table: string) => getTable(table)),
    auth: {
      getUser: vi.fn(),
    },
    _table(name: string) {
      return getTable(name);
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockServerClient = createTableAwareClient();
const mockAdminClient = createTableAwareClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockServerClient),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: "POST" | "PUT", body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/brackets", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const fakeUser = {
  id: "user-abc-123",
  email: "player@example.com",
  user_metadata: { display_name: "Player One" },
};

function makePicks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    game_slot: i + 1,
    round: "first_round",
    picked_team_id: 100 + i,
  }));
}

// Import the handlers under test (after mocks are wired)
import { POST, PUT } from "../route";

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Re-initialise table builders so each test starts clean
  for (const client of [mockServerClient, mockAdminClient]) {
    // Clear the internal table cache by replacing it
    const tableKeys = Object.keys((client as unknown as Record<string, unknown>));
    for (const k of tableKeys) {
      if (k.startsWith("_table")) continue;
      if (k === "from" || k === "auth") continue;
    }
  }

  // Default: authenticated user
  mockServerClient.auth.getUser.mockResolvedValue({ data: { user: fakeUser } });
});

// ==========================================================================
// POST /api/brackets
// ==========================================================================

describe("POST /api/brackets", () => {
  it("returns 401 when getUser() returns null", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest("POST", { name: "My Bracket" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 409 when user already has a bracket", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    // .from("brackets").select("id").eq("user_id", ...) returns existing bracket
    bracketsBuilder.single = vi.fn(() => ({ data: null, error: null }));
    // Override the final result of the eq() chain (not single, the chain itself)
    // The route does NOT call .single() for the existence check — it reads .data from .eq()
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      data: [{ id: "existing-bracket-id" }],
      error: null,
    });

    const res = await POST(makeRequest("POST", { name: "My Bracket", picks: [] }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("You already have a bracket");
    expect(json.bracketId).toBe("existing-bracket-id");
  });

  it("returns 400 when lock=true but picks < 63", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({ data: [], error: null });

    const res = await POST(
      makeRequest("POST", { name: "My Bracket", picks: makePicks(10), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("63 picks are required");
  });

  it("creates bracket and inserts picks via admin, returns bracketId", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    // No existing brackets
    bracketsBuilder.eq = vi.fn().mockReturnValue({ data: [], error: null });

    // .insert().select().single() chain for creating the bracket
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockReturnValue({
          data: { id: "new-bracket-id", user_id: fakeUser.id, locked: false },
          error: null,
        }),
      }),
    };
    bracketsBuilder.insert = vi.fn().mockReturnValue(insertChain);

    // Admin picks insert succeeds
    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.insert = vi.fn().mockReturnValue({ error: null });

    const picks = makePicks(5);
    const res = await POST(makeRequest("POST", { name: "Test Bracket", picks }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.bracketId).toBe("new-bracket-id");
    expect(json.locked).toBe(false);
    expect(adminPicksBuilder.insert).toHaveBeenCalledWith(
      picks.map((p) => ({
        bracket_id: "new-bracket-id",
        game_slot: p.game_slot,
        round: p.round,
        picked_team_id: p.picked_team_id,
      }))
    );
  });

  it("creates bracket with locked=true when lock=true and 63 picks", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({ data: [], error: null });

    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockReturnValue({
          data: { id: "locked-bracket-id", user_id: fakeUser.id, locked: true },
          error: null,
        }),
      }),
    };
    bracketsBuilder.insert = vi.fn().mockReturnValue(insertChain);

    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.insert = vi.fn().mockReturnValue({ error: null });

    const res = await POST(
      makeRequest("POST", { name: "Final", picks: makePicks(63), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(true);
    // Verify the bracket was inserted with locked: true
    expect(bracketsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ locked: true })
    );
  });

  it("rolls back bracket if admin pick insert fails", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({ data: [], error: null });

    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockReturnValue({
          data: { id: "doomed-bracket", user_id: fakeUser.id, locked: false },
          error: null,
        }),
      }),
    };
    bracketsBuilder.insert = vi.fn().mockReturnValue(insertChain);

    // Admin picks insert FAILS
    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.insert = vi.fn().mockReturnValue({
      error: { message: "constraint violation" },
    });

    // Admin brackets delete for rollback
    const adminBracketsBuilder = mockAdminClient._table("brackets");
    const deleteChain = { eq: vi.fn().mockReturnValue({ error: null }) };
    adminBracketsBuilder.delete = vi.fn().mockReturnValue(deleteChain);

    const res = await POST(makeRequest("POST", { name: "Bad", picks: makePicks(3) }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Something went wrong. Please try again.");
    // Verify rollback: bracket deleted
    expect(adminBracketsBuilder.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith("id", "doomed-bracket");
  });

  it("works with 0 picks (draft save, no lock)", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({ data: [], error: null });

    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockReturnValue({
          data: { id: "draft-bracket", user_id: fakeUser.id, locked: false },
          error: null,
        }),
      }),
    };
    bracketsBuilder.insert = vi.fn().mockReturnValue(insertChain);

    const res = await POST(makeRequest("POST", { name: "Draft", picks: [] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.bracketId).toBe("draft-bracket");
    expect(json.locked).toBe(false);
    // Admin should NOT have been called for picks
    expect(mockAdminClient.from).not.toHaveBeenCalledWith("bracket_picks");
  });

  it("maps pick shape correctly: game_slot, round, picked_team_id", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({ data: [], error: null });

    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockReturnValue({
          data: { id: "shape-bracket", user_id: fakeUser.id, locked: false },
          error: null,
        }),
      }),
    };
    bracketsBuilder.insert = vi.fn().mockReturnValue(insertChain);

    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.insert = vi.fn().mockReturnValue({ error: null });

    const picks = [
      { game_slot: 42, round: "sweet_16", picked_team_id: 7 },
      { game_slot: 67, round: "championship", picked_team_id: 1 },
    ];

    await POST(makeRequest("POST", { name: "Shape Test", picks }));

    expect(adminPicksBuilder.insert).toHaveBeenCalledWith([
      { bracket_id: "shape-bracket", game_slot: 42, round: "sweet_16", picked_team_id: 7 },
      { bracket_id: "shape-bracket", game_slot: 67, round: "championship", picked_team_id: 1 },
    ]);
  });
});

// ==========================================================================
// PUT /api/brackets
// ==========================================================================

describe("PUT /api/brackets", () => {
  it("returns 401 when no user", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await PUT(makeRequest("PUT", { bracketId: "b1" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when bracket not found or not owned", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    // .eq().single() returns null data (no bracket found)
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({ data: null, error: null }),
    });

    const res = await PUT(makeRequest("PUT", { bracketId: "nonexistent" }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("returns 403 when bracket is locked", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: true },
        error: null,
      }),
    });

    const res = await PUT(makeRequest("PUT", { bracketId: "b1" }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Bracket is locked");
  });

  it("returns 400 when lock=true but picks < 63", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: false },
        error: null,
      }),
    });

    const res = await PUT(
      makeRequest("PUT", { bracketId: "b1", picks: makePicks(10), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("63 picks are required");
  });

  it("draft save: upserts new picks, cleans up stale, does NOT lock", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: false },
        error: null,
      }),
    });

    // Admin bracket update
    const adminBracketsBuilder = mockAdminClient._table("brackets");
    adminBracketsBuilder.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ error: null }),
    });

    // Admin picks: upsert then delete stale
    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.upsert = vi.fn().mockReturnValue({ error: null });
    const notChain = { eq: vi.fn().mockReturnValue({ error: null }) };
    const deleteEqChain = { not: vi.fn().mockReturnValue(notChain) };
    adminPicksBuilder.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(deleteEqChain),
    });

    const picks = makePicks(5);
    const res = await PUT(makeRequest("PUT", { bracketId: "b1", picks }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.bracketId).toBe("b1");
    expect(json.locked).toBe(false);
    // New picks upserted
    expect(adminPicksBuilder.upsert).toHaveBeenCalled();
    // Stale picks cleaned up
    expect(adminPicksBuilder.delete).toHaveBeenCalled();
    // Bracket NOT locked — admin update should not have set locked: true
    // (The update call sets updated_at and optionally name, but not locked)
  });

  it("finalize: upserts picks, cleans stale, THEN sets locked=true", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: false },
        error: null,
      }),
    });

    // Track call order to verify lock happens AFTER picks
    const callOrder: string[] = [];

    const adminBracketsBuilder = mockAdminClient._table("brackets");
    adminBracketsBuilder.update = vi.fn().mockImplementation((fields: Record<string, unknown>) => {
      if (fields.locked) {
        callOrder.push("lock");
      } else {
        callOrder.push("update-meta");
      }
      return { eq: vi.fn().mockReturnValue({ error: null }) };
    });

    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.upsert = vi.fn().mockImplementation(() => {
      callOrder.push("upsert-picks");
      return { error: null };
    });
    const notChain = { eq: vi.fn().mockReturnValue({ error: null }) };
    const deleteEqChain = { not: vi.fn().mockReturnValue(notChain) };
    adminPicksBuilder.delete = vi.fn().mockImplementation(() => {
      callOrder.push("cleanup-stale");
      return { eq: vi.fn().mockReturnValue(deleteEqChain) };
    });

    const res = await PUT(
      makeRequest("PUT", { bracketId: "b1", picks: makePicks(63), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(true);

    // Lock must happen after upsert-picks
    const lockIndex = callOrder.indexOf("lock");
    const upsertIndex = callOrder.indexOf("upsert-picks");
    expect(upsertIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(upsertIndex);
  });

  it("if upsert fails, old picks are preserved (no data loss)", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: false },
        error: null,
      }),
    });

    const adminBracketsBuilder = mockAdminClient._table("brackets");
    adminBracketsBuilder.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ error: null }),
    });

    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    // Upsert fails — but no picks were deleted beforehand
    adminPicksBuilder.upsert = vi.fn().mockReturnValue({
      error: { message: "upsert constraint violation" },
    });

    const res = await PUT(
      makeRequest("PUT", { bracketId: "b1", picks: makePicks(5) })
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Something went wrong. Please try again.");
    // The key assertion: delete was never called, so old picks are intact
    expect(adminPicksBuilder.delete).not.toHaveBeenCalled();
  });

  it("name-only update (no picks in body)", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: false },
        error: null,
      }),
    });

    const adminBracketsBuilder = mockAdminClient._table("brackets");
    adminBracketsBuilder.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ error: null }),
    });

    const res = await PUT(
      makeRequest("PUT", { bracketId: "b1", name: "Renamed Bracket" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.bracketId).toBe("b1");
    expect(json.locked).toBe(false);
    // Name update was called
    expect(adminBracketsBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Renamed Bracket" })
    );
    // Picks were NOT touched
    expect(mockAdminClient.from).not.toHaveBeenCalledWith("bracket_picks");
  });

  it("lock is only set AFTER picks upsert succeeds", async () => {
    const bracketsBuilder = mockServerClient._table("brackets");
    bracketsBuilder.eq = vi.fn().mockReturnValue({
      single: vi.fn().mockReturnValue({
        data: { id: "b1", user_id: fakeUser.id, locked: false },
        error: null,
      }),
    });

    const lockCalls: Array<{ locked: boolean; timestamp: number }> = [];
    let upsertTimestamp = 0;

    const adminBracketsBuilder = mockAdminClient._table("brackets");
    adminBracketsBuilder.update = vi.fn().mockImplementation((fields: Record<string, unknown>) => {
      if (fields.locked) {
        lockCalls.push({ locked: true, timestamp: Date.now() });
      }
      return { eq: vi.fn().mockReturnValue({ error: null }) };
    });

    const adminPicksBuilder = mockAdminClient._table("bracket_picks");
    adminPicksBuilder.upsert = vi.fn().mockImplementation(() => {
      upsertTimestamp = Date.now();
      return { error: null };
    });
    const notChain = { eq: vi.fn().mockReturnValue({ error: null }) };
    const deleteEqChain = { not: vi.fn().mockReturnValue(notChain) };
    adminPicksBuilder.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(deleteEqChain),
    });

    const res = await PUT(
      makeRequest("PUT", { bracketId: "b1", picks: makePicks(63), lock: true })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.locked).toBe(true);

    // Lock was called exactly once
    expect(lockCalls).toHaveLength(1);
    // Upsert happened before lock
    expect(upsertTimestamp).toBeLessThanOrEqual(lockCalls[0].timestamp);
    // Picks upsert was called
    expect(adminPicksBuilder.upsert).toHaveBeenCalled();
  });
});
