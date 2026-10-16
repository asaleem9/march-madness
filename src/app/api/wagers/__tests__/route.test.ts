// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { createRecordingClient, type RecordedCall } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let userClient: ReturnType<typeof createRecordingClient>;
let adminClient: ReturnType<typeof createRecordingClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(userClient)),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClient),
}));

const { POST, PATCH } = await import("../route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

const eqArg = (chain: RecordedCall[], column: string) =>
  chain.find((c) => c.method === "eq" && c.args[0] === column)?.args[1];

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const names: Record<string, string> = {
  "user-1": "Alice",
  "opp-1": "Bob",
  "challenger-1": "Carol",
};

/** Admin client: profiles by id, plus whatever the test supplies per table. */
function makeAdmin(tables: Record<string, unknown> = {}) {
  const client = createRecordingClient((table, chain) => {
    if (table === "profiles") {
      const id = eqArg(chain, "id") as string;
      return names[id] ? { display_name: names[id] } : null;
    }
    const v = tables[table];
    return typeof v === "function" ? (v as (c: RecordedCall[]) => unknown)(chain) : v ?? null;
  });
  return client;
}

function makeUser(
  user: { id: string } | null,
  tables: Record<string, unknown> = {}
) {
  const client = createRecordingClient((table, chain) => {
    const v = tables[table];
    return typeof v === "function" ? (v as (c: RecordedCall[]) => unknown)(chain) : v ?? null;
  });
  client.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  return client;
}

const queued = (client: ReturnType<typeof createRecordingClient>) =>
  client.inserts("notification_queue").map((c) => c.args[0]);

// ---------------------------------------------------------------------------
// POST /api/wagers
// ---------------------------------------------------------------------------

describe("POST /api/wagers", () => {
  const validBody = {
    opponent_id: "opp-1",
    challenger_bracket_id: "bracket-1",
    stakes: "Loser buys dinner",
  };

  beforeEach(() => {
    adminClient = makeAdmin();
  });

  it("returns 401 when unauthenticated", async () => {
    userClient = makeUser(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when required fields are missing", async () => {
    userClient = makeUser({ id: "user-1" });
    const res = await POST(makeRequest({ opponent_id: "opp-1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
  });

  it("returns 400 when challenging yourself", async () => {
    userClient = makeUser({ id: "user-1" });
    const res = await POST(makeRequest({ ...validBody, opponent_id: "user-1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "You can't wager against yourself" });
  });

  it("returns 400 when stakes exceed 120 characters", async () => {
    userClient = makeUser({ id: "user-1" });
    const res = await POST(makeRequest({ ...validBody, stakes: "x".repeat(121) }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the wager deadline has passed", async () => {
    userClient = makeUser({ id: "user-1" }, {
      tournament_config: { wager_creation_deadline: past },
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Wager creation deadline has passed" });
  });

  it("returns 400 when the bracket is not owned by the user", async () => {
    userClient = makeUser({ id: "user-1" }, {
      tournament_config: { wager_creation_deadline: future },
      brackets: null,
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid bracket" });
  });

  it("inserts the wager and queues a request with the challenger's profile name", async () => {
    userClient = makeUser({ id: "user-1" }, {
      tournament_config: { wager_creation_deadline: future },
      brackets: { id: "bracket-1" },
      wagers: { id: "wager-99" },
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wagerId: "wager-99" });

    const [insert] = userClient.inserts("wagers");
    expect(insert.args[0]).toEqual({
      challenger_id: "user-1",
      opponent_id: "opp-1",
      challenger_bracket_id: "bracket-1",
      stakes: "Loser buys dinner",
    });

    // Queued through the service role (users can only read the queue).
    expect(userClient.inserts("notification_queue")).toHaveLength(0);
    expect(queued(adminClient)).toEqual([
      {
        user_id: "opp-1",
        type: "wager_request",
        payload: { wager_id: "wager-99", challenger_name: "Alice", stakes: "Loser buys dinner" },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/wagers
// ---------------------------------------------------------------------------

describe("PATCH /api/wagers", () => {
  const pendingWager = {
    id: "w-1",
    status: "pending",
    challenger_id: "challenger-1",
    opponent_id: "opp-1",
    stakes: "Pizza",
  };

  it("returns 401 when unauthenticated", async () => {
    userClient = makeUser(null);
    adminClient = makeAdmin();
    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the wager is not found", async () => {
    userClient = makeUser({ id: "user-1" });
    adminClient = makeAdmin({ wagers: null });
    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the wager is not pending", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: { ...pendingWager, status: "accepted" } });
    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Wager already responded to" });
  });

  it("revoke: challenger sets declined and the opponent is notified", async () => {
    userClient = makeUser({ id: "challenger-1" });
    adminClient = makeAdmin({ wagers: pendingWager });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "revoke" }));
    expect(res.status).toBe(200);

    expect(adminClient.updates("wagers")[0].args[0]).toEqual({ status: "declined" });
    expect(queued(adminClient)).toEqual([
      {
        user_id: "opp-1",
        type: "wager_result",
        payload: { wager_id: "w-1", status: "revoked", opponent_name: "Carol", stakes: "Pizza" },
      },
    ]);
  });

  it("accept: opponent attaches their bracket and the challenger is notified", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: pendingWager, brackets: { id: "b-55" } });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept", bracket_id: "b-55" }));
    expect(res.status).toBe(200);

    expect(adminClient.updates("wagers")[0].args[0]).toEqual({
      status: "accepted",
      opponent_bracket_id: "b-55",
    });
    expect(queued(adminClient)).toEqual([
      {
        user_id: "challenger-1",
        type: "wager_result",
        payload: { wager_id: "w-1", status: "accepted", opponent_name: "Bob", stakes: "Pizza" },
      },
    ]);
  });

  it("accept: falls back to the opponent's own bracket when none is sent", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: pendingWager, brackets: { id: "b-own" } });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(200);
    expect(adminClient.updates("wagers")[0].args[0]).toEqual({
      status: "accepted",
      opponent_bracket_id: "b-own",
    });
  });

  it("accept: rejects a bracket that isn't the opponent's", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: pendingWager, brackets: null });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept", bracket_id: "b-x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid bracket" });
  });

  it("accept: blocks when the opponent has no bracket at all", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: pendingWager, brackets: null });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "accept" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Create a bracket first" });
    expect(adminClient.updates("wagers")).toHaveLength(0);
    expect(queued(adminClient)).toHaveLength(0);
  });

  it("decline: opponent sets declined and the challenger is notified", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: pendingWager });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "decline" }));
    expect(res.status).toBe(200);

    expect(adminClient.updates("wagers")[0].args[0]).toEqual({ status: "declined" });
    expect(queued(adminClient)[0]).toMatchObject({
      user_id: "challenger-1",
      payload: { status: "declined", opponent_name: "Bob" },
    });
  });

  it("returns 404 when the wrong user tries to revoke", async () => {
    userClient = makeUser({ id: "not-the-challenger" });
    adminClient = makeAdmin({ wagers: pendingWager });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "revoke" }));
    expect(res.status).toBe(404);
    expect(queued(adminClient)).toHaveLength(0);
  });

  it("returns 400 for an unknown action", async () => {
    userClient = makeUser({ id: "opp-1" });
    adminClient = makeAdmin({ wagers: pendingWager });

    const res = await PATCH(makeRequest({ wager_id: "w-1", action: "explode" }));
    expect(res.status).toBe(400);
  });
});
