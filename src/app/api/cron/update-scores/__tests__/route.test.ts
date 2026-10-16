// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { createRecordingClient } from "@/test/helpers";

// ── Mocks ────────────────────────────────────────────────────────────────────

let client = createRecordingClient();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => client),
}));
// No signed-in admin in these tests: only the bearer token authorizes.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })),
}));

const mockFetchESPNScoreboard = vi.fn();
vi.mock("@/lib/espn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/espn")>();
  return {
    ...actual,
    fetchESPNScoreboard: (...args: unknown[]) => mockFetchESPNScoreboard(...args),
    formatDateForESPN: vi.fn().mockReturnValue("20270318"),
  };
});

const mockProcessFinalGame = vi.fn().mockResolvedValue({
  loserId: 2, picksScored: 1, bracketsRecalculated: 3, notificationsQueued: 2,
});
vi.mock("@/lib/process-final-game", () => ({
  processFinalGame: (...args: unknown[]) => mockProcessFinalGame(...args),
}));
const mockLock = vi.fn().mockResolvedValue({ skipped: true, locked: 0, incomplete: 0 });
vi.mock("@/lib/lock-brackets", () => ({
  lockBracketsPastDeadline: (...args: unknown[]) => mockLock(...args),
}));
const mockAward = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/achievements", () => ({
  awardAchievements: (...args: unknown[]) => mockAward(...args),
}));

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

function makeDbGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, game_slot: 13, round: "first_round", region: "east", status: "in_progress",
    espn_game_id: "401520001", team_a_id: 1, team_b_id: 2,
    team_a: { id: 1, name: "Duke", seed: 1, espn_id: "espn-100" },
    team_b: { id: 2, name: "Siena", seed: 16, espn_id: "espn-200" },
    score_a: null, score_b: null, winner_id: null, next_game_slot: 45, slot_position: "top",
    ...overrides,
  };
}

/** Standard resolver: a games row by espn id, a config row, an undecided championship. */
function resolverWith(game: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  return (table: string, chain: { method: string; args: unknown[] }[]) => {
    if (table in extra) return extra[table];
    if (table === "tournament_config") return { id: 1, scoring_multipliers: null, bracket_lock_deadline: "2027-03-18T16:00:00Z" };
    if (table === "games") {
      const eqs = chain.filter((c) => c.method === "eq");
      if (eqs.some((e) => e.args[0] === "espn_game_id")) return game;
      if (eqs.some((e) => e.args[0] === "round" && e.args[1] === "championship")) return { status: "scheduled", winner_id: null };
      return null;
    }
    return null;
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/cron/update-scores", () => {
  let GET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    client = createRecordingClient(resolverWith(null));
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 without a valid CRON_SECRET bearer token", async () => {
    expect((await GET(mockRequest({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await GET(mockRequest())).status).toBe(401);
  });

  it("returns 200 gracefully when every ESPN fetch fails", async () => {
    mockFetchESPNScoreboard.mockResolvedValue(null);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain("ESPN fetch failed");
    expect(mockLock).not.toHaveBeenCalled();
  });

  it("writes live scores and the clock for an in-progress game without running the final pipeline", async () => {
    client = createRecordingClient(resolverWith(makeDbGame()));
    feed([makeESPNEvent({ state: "in", clock: "4:32", period: 2 })]);

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const upd = client.updates("games")[0];
    expect(upd.args[0]).toMatchObject({ status: "in_progress", score_a: 75, score_b: 68, clock: "4:32", period: 2 });
    expect(client.filtersAfter(upd)[0].args).toEqual(["id", 7]);
    expect(mockProcessFinalGame).not.toHaveBeenCalled();
  });

  it("runs the final-game pipeline with notifications when the winner first becomes known", async () => {
    client = createRecordingClient(resolverWith(makeDbGame()));
    feed([makeESPNEvent({ state: "post" })]);

    const res = await GET(authed());
    const body = await res.json();
    expect(client.updates("games")[0].args[0]).toMatchObject({ status: "final", winner_id: 1, clock: null });
    expect(mockProcessFinalGame).toHaveBeenCalledTimes(1);
    const [, opts] = mockProcessFinalGame.mock.calls[0];
    expect(opts).toMatchObject({ winnerId: 1, scoreA: 75, scoreB: 68, notify: true });
    expect(opts.batchKey).toMatch(/^20270318-(afternoon|evening)$/);
    expect(body.scoresRecalculated).toBe(3);
    expect(body.notificationsQueued).toBe(2);
  });

  it("re-runs the pipeline idempotently but does not re-notify for an already-decided game", async () => {
    client = createRecordingClient(resolverWith(makeDbGame({ status: "final", winner_id: 1 })));
    feed([makeESPNEvent({ state: "post" })]);
    await GET(authed());
    expect(mockProcessFinalGame).toHaveBeenCalledTimes(1);
    expect(mockProcessFinalGame.mock.calls[0][1]).toMatchObject({ notify: false });
  });

  it("never downgrades a recorded final when ESPN regresses", async () => {
    client = createRecordingClient(resolverWith(makeDbGame({ status: "final", winner_id: 1 })));
    feed([makeESPNEvent({ state: "in" })]);
    await GET(authed());
    expect(client.updates("games")[0].args[0]).not.toHaveProperty("status");
  });

  it("auto-discovers a game by team ESPN ids and backfills espn_game_id", async () => {
    const candidate = makeDbGame({ espn_game_id: null, id: 9 });
    client = createRecordingClient((table, chain) => {
      if (table === "tournament_config") return { id: 1 };
      if (table === "teams") return [{ id: 1 }, { id: 2 }];
      if (table === "games") {
        const eqs = chain.filter((c) => c.method === "eq");
        if (eqs.some((e) => e.args[0] === "espn_game_id")) return null;
        if (chain.some((c) => c.method === "is")) return [candidate];
        if (eqs.some((e) => e.args[0] === "round")) return { status: "scheduled" };
      }
      return null;
    });
    feed([makeESPNEvent({ state: "in" })]);
    const body = await (await GET(authed())).json();
    expect(body.gamesDiscovered).toBe(1);
    expect(client.updates("games")[0].args[0]).toEqual({ espn_game_id: "401520001" });
  });

  it("auto-locks brackets, awards achievements, and stamps last_score_update_at every run", async () => {
    feed([]);
    mockLock.mockResolvedValueOnce({ skipped: false, locked: 4, incomplete: 1 });
    const body = await (await GET(authed())).json();
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockAward).toHaveBeenCalledTimes(1);
    expect(body.bracketsLocked).toBe(4);
    expect(body.incompleteDrafts).toBe(1);
    const stamp = client.updates("tournament_config")[0];
    expect(stamp.args[0]).toHaveProperty("last_score_update_at");
  });

  it("resolves accepted wagers once the championship (looked up by round) is final, ties with no winner", async () => {
    const brackets: Record<string, { score: number }> = { cb: { score: 300 }, ob: { score: 300 } };
    client = createRecordingClient((table, chain) => {
      if (table === "tournament_config") return { id: 1 };
      if (table === "games") {
        const eqs = chain.filter((c) => c.method === "eq");
        if (eqs.some((e) => e.args[0] === "round" && e.args[1] === "championship")) return { status: "final", winner_id: 4 };
        return null;
      }
      if (table === "wagers") return [{ id: "w1", status: "accepted", challenger_id: "u1", opponent_id: "u2", challenger_bracket_id: "cb", opponent_bracket_id: "ob", stakes: "dinner" }];
      if (table === "brackets") {
        const eq = chain.find((c) => c.method === "eq" && c.args[0] === "id");
        return eq ? brackets[eq.args[1] as string] : null;
      }
      return null;
    });
    feed([]);
    const body = await (await GET(authed())).json();
    expect(body.wagersResolved).toBe(1);
    const upd = client.updates("wagers")[0];
    expect(upd.args[0]).toMatchObject({ status: "resolved", winner_id: null });
    const queued = client.inserts("notification_queue")[0].args[0] as Record<string, unknown>[];
    expect(queued).toHaveLength(2);
    expect(queued[0].payload).toMatchObject({ tie: true, won: false, stakes: "dinner", your_score: 300 });
  });
});
