// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers: chainable Supabase query-builder mocks
// ---------------------------------------------------------------------------

type QueryResult = { data: unknown; error: unknown };

/**
 * Builds a chainable query-builder stub.  Every chainable method (select, eq,
 * insert, update) returns `this`.  The terminal method (.single()) resolves the
 * configured result.  Callers can override the result via `_result`.
 */
function createQueryBuilder(result: QueryResult = { data: null, error: null }) {
  const builder: Record<string, unknown> & { _result: QueryResult } = {
    _result: result,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn(function (this: typeof builder) {
      return Promise.resolve(this._result);
    }),
  };
  // Ensure chainable methods return the builder itself
  (builder.select as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.eq as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.insert as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.update as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  return builder;
}

/**
 * Creates a fake Supabase client whose `.from(table)` returns a query builder.
 * The `tableResults` map lets each test configure per-table responses.
 */
function createMockSupabaseClient(
  user: { id: string; user_metadata?: Record<string, unknown> } | null,
  tableResults: Record<string, QueryResult> = {},
) {
  const builders: Record<string, ReturnType<typeof createQueryBuilder>> = {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (!builders[table]) {
        builders[table] = createQueryBuilder(
          tableResults[table] ?? { data: null, error: null },
        );
      }
      return builders[table];
    }),
    /** Expose builders so tests can inspect or override per-table results */
    _builders: builders,
    _tableResults: tableResults,
  };
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
let mockAdmin: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

// Import handlers *after* mocks are registered
const { POST, PATCH } = await import("../route");

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// POST /api/wagers
// ---------------------------------------------------------------------------

describe("POST /api/wagers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockSupabase = createMockSupabaseClient(null);
    mockAdmin = createMockSupabaseClient(null);

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when required fields are missing", async () => {
    mockSupabase = createMockSupabaseClient({ id: "user-1" });
    mockAdmin = createMockSupabaseClient(null);

    const res = await POST(makeRequest({ opponent_id: "opp-1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
  });

  it("returns 403 when wager deadline has passed", async () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    mockSupabase = createMockSupabaseClient({ id: "user-1" }, {
      tournament_config: { data: { wager_creation_deadline: pastDate }, error: null },
    });
    mockAdmin = createMockSupabaseClient(null);

    const res = await POST(
      makeRequest({
        opponent_id: "opp-1",
        challenger_bracket_id: "bracket-1",
        stakes: "Loser buys dinner",
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Wager creation deadline has passed" });
  });

  it("returns 400 when bracket is not owned by the user", async () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    mockSupabase = createMockSupabaseClient({ id: "user-1" }, {
      tournament_config: { data: { wager_creation_deadline: futureDate }, error: null },
      brackets: { data: null, error: null },
    });
    mockAdmin = createMockSupabaseClient(null);

    const res = await POST(
      makeRequest({
        opponent_id: "opp-1",
        challenger_bracket_id: "bracket-1",
        stakes: "Loser buys dinner",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid bracket" });
  });

  it("inserts wager and queues notification on success", async () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    mockSupabase = createMockSupabaseClient(
      { id: "user-1", user_metadata: { display_name: "Alice" } },
      {
        tournament_config: { data: { wager_creation_deadline: futureDate }, error: null },
        brackets: { data: { id: "bracket-1" }, error: null },
        wagers: { data: { id: "wager-99" }, error: null },
        notification_queue: { data: null, error: null },
      },
    );
    mockAdmin = createMockSupabaseClient(null);

    const res = await POST(
      makeRequest({
        opponent_id: "opp-1",
        challenger_bracket_id: "bracket-1",
        stakes: "Loser buys dinner",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wagerId: "wager-99" });

    // Verify the wager insert was called
    expect(mockSupabase.from).toHaveBeenCalledWith("wagers");
    const wagersBuilder = mockSupabase._builders["wagers"];
    expect(wagersBuilder.insert).toHaveBeenCalledWith({
      challenger_id: "user-1",
      opponent_id: "opp-1",
      challenger_bracket_id: "bracket-1",
      stakes: "Loser buys dinner",
    });

    // Verify notification was queued
    expect(mockSupabase.from).toHaveBeenCalledWith("notification_queue");
    const notiBuilder = mockSupabase._builders["notification_queue"];
    expect(notiBuilder.insert).toHaveBeenCalledWith({
      user_id: "opp-1",
      type: "wager_request",
      payload: {
        wager_id: "wager-99",
        challenger_name: "Alice",
        stakes: "Loser buys dinner",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/wagers
// ---------------------------------------------------------------------------

describe("PATCH /api/wagers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockSupabase = createMockSupabaseClient(null);
    mockAdmin = createMockSupabaseClient(null);

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when wager is not found", async () => {
    mockSupabase = createMockSupabaseClient({ id: "user-1" });
    mockAdmin = createMockSupabaseClient(null, {
      wagers: { data: null, error: null },
    });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 400 when wager is not pending", async () => {
    mockSupabase = createMockSupabaseClient({ id: "user-1" });
    mockAdmin = createMockSupabaseClient(null, {
      wagers: {
        data: {
          id: "w-1",
          status: "accepted",
          challenger_id: "user-1",
          opponent_id: "opp-1",
        },
        error: null,
      },
    });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Wager already responded to" });
  });

  it("revoke: challenger sets status to declined", async () => {
    mockSupabase = createMockSupabaseClient({ id: "challenger-1" });
    mockAdmin = createMockSupabaseClient(null, {
      wagers: {
        data: {
          id: "w-1",
          status: "pending",
          challenger_id: "challenger-1",
          opponent_id: "opp-1",
        },
        error: null,
      },
    });

    const res = await PATCH(
      makeRequest({ wager_id: "w-1", action: "revoke" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Admin client should update the wager status
    expect(mockAdmin.from).toHaveBeenCalledWith("wagers");
    const wagersBuilder = mockAdmin._builders["wagers"];
    expect(wagersBuilder.update).toHaveBeenCalledWith({ status: "declined" });
  });

  it("accept: opponent sets status and bracket_id", async () => {
    mockSupabase = createMockSupabaseClient({ id: "opp-1" });
    // For the accept path, the admin builder needs to resolve the initial fetch
    // (select/eq/single) AND the subsequent update/eq chain without error.
    // We configure the wagers builder with the fetched wager first, then
    // override the single() call to track the update flow.
    mockAdmin = createMockSupabaseClient(null, {
      wagers: {
        data: {
          id: "w-1",
          status: "pending",
          challenger_id: "challenger-1",
          opponent_id: "opp-1",
        },
        error: null,
      },
    });

    const res = await PATCH(
      makeRequest({ wager_id: "w-1", action: "accept", bracket_id: "b-55" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const wagersBuilder = mockAdmin._builders["wagers"];
    expect(wagersBuilder.update).toHaveBeenCalledWith({
      status: "accepted",
      opponent_bracket_id: "b-55",
    });
  });

  it("decline: opponent sets status to declined", async () => {
    mockSupabase = createMockSupabaseClient({ id: "opp-1" });
    mockAdmin = createMockSupabaseClient(null, {
      wagers: {
        data: {
          id: "w-1",
          status: "pending",
          challenger_id: "challenger-1",
          opponent_id: "opp-1",
        },
        error: null,
      },
    });

    const res = await PATCH(
      makeRequest({ wager_id: "w-1", action: "decline" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const wagersBuilder = mockAdmin._builders["wagers"];
    expect(wagersBuilder.update).toHaveBeenCalledWith({ status: "declined" });
  });

  it("returns 404 when wrong user tries to revoke", async () => {
    mockSupabase = createMockSupabaseClient({ id: "not-the-challenger" });
    mockAdmin = createMockSupabaseClient(null, {
      wagers: {
        data: {
          id: "w-1",
          status: "pending",
          challenger_id: "challenger-1",
          opponent_id: "opp-1",
        },
        error: null,
      },
    });

    const res = await PATCH(
      makeRequest({ wager_id: "w-1", action: "revoke" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
