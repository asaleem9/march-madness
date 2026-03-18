// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Track all supabase calls per table so each .from() returns an isolated builder
type MockBuilder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
};

let fromCalls: Array<{ table: string; builder: MockBuilder }> = [];
let fromImpl: ((table: string) => MockBuilder) | null = null;

function createBuilder(defaultData: unknown = null, defaultError: unknown = null): MockBuilder {
  const result = { data: defaultData, error: defaultError, count: 0 };
  const builder: MockBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    order: vi.fn().mockResolvedValue(result),
    gte: vi.fn().mockReturnThis(),
  };
  // When eq/in/is/not are the terminal call, resolve to result
  builder.eq.mockImplementation(() => {
    const proxy = { ...builder, then: (res: (v: unknown) => void) => res(result) };
    return proxy;
  });
  builder.in.mockImplementation(() => {
    const proxy = { ...builder, then: (res: (v: unknown) => void) => res(result) };
    return proxy;
  });
  return builder;
}

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (fromImpl) return fromImpl(table);
    const builder = createBuilder();
    fromCalls.push({ table, builder });
    return builder;
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

const mockFetchESPNScoreboard = vi.fn();
const mockParseGameStatus = vi.fn();
const mockFormatDateForESPN = vi.fn().mockReturnValue("20260318");

vi.mock("@/lib/espn", () => ({
  fetchESPNScoreboard: (...args: unknown[]) => mockFetchESPNScoreboard(...args),
  parseGameStatus: (...args: unknown[]) => mockParseGameStatus(...args),
  formatDateForESPN: (...args: unknown[]) => mockFormatDateForESPN(...args),
}));

const mockGetRoundPoints = vi.fn().mockReturnValue(10);
const mockIsUpset = vi.fn().mockReturnValue(false);

vi.mock("@/lib/utils", () => ({
  getRoundPoints: (...args: unknown[]) => mockGetRoundPoints(...args),
  isUpset: (...args: unknown[]) => mockIsUpset(...args),
  DEFAULT_SCORING: {
    first_round: 10,
    second_round: 20,
    sweet_16: 40,
    elite_eight: 80,
    final_four: 160,
    championship: 320,
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? headers?.[name] ?? null,
    },
  }) as unknown as NextRequest;

function makeESPNEvent(overrides: {
  espnGameId?: string;
  state?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore?: string;
  awayScore?: string;
  homeWinner?: boolean;
  awayWinner?: boolean;
} = {}) {
  const {
    espnGameId = "401520001",
    state = "post",
    homeTeamId = "espn-100",
    awayTeamId = "espn-200",
    homeScore = "75",
    awayScore = "68",
    homeWinner = true,
    awayWinner = false,
  } = overrides;

  return {
    id: espnGameId,
    date: "2026-03-18T00:00Z",
    name: "Team A vs Team B",
    shortName: "A vs B",
    competitions: [
      {
        id: espnGameId,
        date: "2026-03-18T00:00Z",
        competitors: [
          {
            id: "1",
            team: { id: homeTeamId, abbreviation: "TA", displayName: "Team A", shortDisplayName: "A" },
            score: homeScore,
            winner: homeWinner,
          },
          {
            id: "2",
            team: { id: awayTeamId, abbreviation: "TB", displayName: "Team B", shortDisplayName: "B" },
            score: awayScore,
            winner: awayWinner,
          },
        ],
        status: { type: { id: "3", name: "Final", state, completed: state === "post", description: "Final" } },
      },
    ],
  };
}

function makeDbGame(overrides: Record<string, unknown> = {}) {
  return {
    id: "game-uuid-1",
    game_slot: 10,
    round: "first_round",
    region: "east",
    status: "in_progress",
    espn_game_id: "401520001",
    team_a_id: 1,
    team_b_id: 2,
    team_a: { id: 1, name: "Duke", seed: 1, espn_id: "espn-100", eliminated: false },
    team_b: { id: 2, name: "Lehigh", seed: 16, espn_id: "espn-200", eliminated: false },
    score_a: null,
    score_b: null,
    winner_id: null,
    next_game_slot: 37,
    slot_position: "top",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/cron/update-scores", () => {
  let GET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    fromCalls = [];
    fromImpl = null;
    mockFetchESPNScoreboard.mockReset();
    mockParseGameStatus.mockReset();
    mockFormatDateForESPN.mockReset().mockReturnValue("20260318");
    mockGetRoundPoints.mockReset().mockReturnValue(10);
    mockIsUpset.mockReset().mockReturnValue(false);
    mockSupabase.from.mockClear();

    process.env.CRON_SECRET = "test-cron-secret";

    const mod = await import("../route");
    GET = mod.GET;
  });

  // 1. Auth check
  it("returns 401 without a valid CRON_SECRET bearer token", async () => {
    const res = await GET(mockRequest({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with no authorization header at all", async () => {
    const res = await GET(mockRequest());
    expect(res.status).toBe(401);
  });

  // 2. ESPN fetch failure
  it("returns 200 gracefully when ESPN fetch returns null", async () => {
    mockFetchESPNScoreboard.mockResolvedValue(null);

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("ESPN fetch failed");
  });

  // 3. Updates game status/scores
  it("updates game status and scores from ESPN data", async () => {
    const dbGame = makeDbGame();
    mockParseGameStatus.mockReturnValue("in_progress");
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "in" })],
    });

    const gamesBuilder = createBuilder(dbGame);
    gamesBuilder.single.mockResolvedValue({ data: dbGame });

    const updateBuilder = createBuilder(null, null);

    fromImpl = (table: string) => {
      if (table === "games") {
        // Track whether this is the select or update call
        const builder = createBuilder();
        builder.select.mockReturnValue({
          ...builder,
          eq: vi.fn().mockReturnValue({
            ...builder,
            single: vi.fn().mockResolvedValue({ data: dbGame }),
          }),
        });
        builder.update.mockImplementation((data: Record<string, unknown>) => {
          // Capture the update payload for assertions
          (builder as unknown as Record<string, unknown>)._updatePayload = data;
          return {
            ...builder,
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        });
        return builder;
      }
      return createBuilder();
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // Verify the ESPN scoreboard was fetched
    expect(mockFetchESPNScoreboard).toHaveBeenCalledWith("20260318");
    expect(mockParseGameStatus).toHaveBeenCalledWith("in");
  });

  // 4. On final: eliminates loser, advances winner
  it("eliminates loser and advances winner to next slot on final", async () => {
    const dbGame = makeDbGame({ status: "in_progress" });
    mockParseGameStatus.mockReturnValue("final");
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "post", homeWinner: true, awayWinner: false })],
    });

    const updateCalls: Array<{ table: string; data: unknown; filters: Record<string, unknown> }> = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation(() => {
        const chain = {
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
            // for bracket_picks select with inner join
            then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
          })),
          not: vi.fn().mockImplementation(() => ({
            then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
          })),
        };
        return chain;
      });

      builder.update.mockImplementation((data: unknown) => ({
        eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
          updateCalls.push({ table, data, filters: { col: _col, val } });
          return Promise.resolve({ data: null, error: null });
        }),
        in: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));

      builder.insert.mockResolvedValue({ data: null, error: null });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // Should have eliminated the loser (team_b_id = 2, since team_a won)
    const teamUpdate = updateCalls.find(
      (c) => c.table === "teams" && (c.data as Record<string, unknown>)?.eliminated === true
    );
    expect(teamUpdate).toBeDefined();
    expect(teamUpdate!.filters.val).toBe(2); // loser team_b_id

    // Should have advanced winner to next game slot
    const advanceUpdate = updateCalls.find(
      (c) =>
        c.table === "games" &&
        (c.data as Record<string, unknown>)?.team_a_id !== undefined &&
        c.filters.val === 37 // next_game_slot
    );
    expect(advanceUpdate).toBeDefined();
    expect((advanceUpdate!.data as Record<string, unknown>).team_a_id).toBe(1); // winner (slot_position = "top" -> team_a_id)
  });

  // 5. First Four: swaps bracket picks when loser exists
  it("swaps bracket picks for First Four games pointing to next round", async () => {
    const dbGame = makeDbGame({
      round: "first_four",
      game_slot: 3,
      next_game_slot: 17,
      slot_position: "bottom",
      status: "in_progress",
      team_a_id: 10,
      team_b_id: 11,
      team_a: { id: 10, name: "NC State", seed: 11, espn_id: "espn-100", eliminated: false },
      team_b: { id: 11, name: "Texas", seed: 11, espn_id: "espn-200", eliminated: false },
    });

    mockParseGameStatus.mockReturnValue("final");
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "post", homeWinner: true, awayWinner: false })],
    });

    const updateCalls: Array<{ table: string; data: unknown; eqCalls: Array<[string, unknown]> }> = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.eq = vi.fn().mockImplementation(() => ({
          single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
          eq: vi.fn().mockImplementation(() => ({
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          })),
          then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
        }));
        chain.not = vi.fn().mockImplementation(() => ({
          then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
        }));
        return chain;
      });

      builder.update.mockImplementation((data: unknown) => {
        const eqCalls: Array<[string, unknown]> = [];
        const trackingChain = {
          eq: vi.fn().mockImplementation((col: string, val: unknown) => {
            eqCalls.push([col, val]);
            updateCalls.push({ table, data, eqCalls: [...eqCalls] });
            return trackingChain;
          }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return trackingChain;
      });

      builder.insert.mockResolvedValue({ data: null, error: null });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // For a First Four game, bracket_picks for the next game_slot that picked
    // the loser should be swapped to the winner
    const pickSwap = updateCalls.find(
      (c) =>
        c.table === "bracket_picks" &&
        (c.data as Record<string, unknown>)?.picked_team_id === 10 && // winner
        c.eqCalls.some(([col, val]) => col === "game_slot" && val === 17) &&
        c.eqCalls.some(([col, val]) => col === "picked_team_id" && val === 11) // loser
    );
    expect(pickSwap).toBeDefined();
  });

  // 6. Pick evaluation: correct picks get points, upset bonus
  it("awards points for correct picks and applies 1.5x upset bonus", async () => {
    const dbGame = makeDbGame({ status: "in_progress", round: "first_round" });
    const mockPicks = [
      {
        id: "pick-1",
        bracket_id: "bracket-1",
        game_slot: 10,
        picked_team_id: 1, // correct (winner)
        brackets: { user_id: "user-1" },
      },
      {
        id: "pick-2",
        bracket_id: "bracket-2",
        game_slot: 10,
        picked_team_id: 2, // incorrect (loser)
        brackets: { user_id: "user-2" },
      },
    ];

    mockParseGameStatus.mockReturnValue("final");
    mockGetRoundPoints.mockReturnValue(10);
    mockIsUpset.mockReturnValue(false);
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "post", homeWinner: true, awayWinner: false })],
    });

    const pickUpdates: Array<{ id: string; is_correct: boolean; points_earned: number }> = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation((selectStr?: string) => {
        // bracket_picks with inner join
        if (selectStr && selectStr.includes("brackets!inner")) {
          const chain = {
            eq: vi.fn().mockResolvedValue({ data: mockPicks }),
          };
          return chain;
        }
        // bracket_picks for score recalc (not is_correct is null)
        if (selectStr === "bracket_id, points_earned") {
          return {
            not: vi.fn().mockResolvedValue({
              data: [
                { bracket_id: "bracket-1", points_earned: 10 },
              ],
            }),
          };
        }
        // games select
        const chain = {
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
          })),
          not: vi.fn().mockResolvedValue({ data: [] }),
        };
        return chain;
      });

      builder.update.mockImplementation((data: unknown) => {
        const d = data as Record<string, unknown>;
        if (d.is_correct !== undefined) {
          return {
            eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
              pickUpdates.push({
                id: val as string,
                is_correct: d.is_correct as boolean,
                points_earned: d.points_earned as number,
              });
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return {
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      builder.insert.mockResolvedValue({ data: null, error: null });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // Correct pick gets points
    const correctUpdate = pickUpdates.find((p) => p.id === "pick-1");
    expect(correctUpdate).toBeDefined();
    expect(correctUpdate!.is_correct).toBe(true);
    expect(correctUpdate!.points_earned).toBe(10);

    // Incorrect pick gets 0
    const incorrectUpdate = pickUpdates.find((p) => p.id === "pick-2");
    expect(incorrectUpdate).toBeDefined();
    expect(incorrectUpdate!.is_correct).toBe(false);
    expect(incorrectUpdate!.points_earned).toBe(0);
  });

  it("applies 1.5x upset bonus when lower seed wins", async () => {
    // team_b (seed 16) beats team_a (seed 1) => upset
    const dbGame = makeDbGame({
      status: "in_progress",
      round: "first_round",
      team_a: { id: 1, name: "Duke", seed: 1, espn_id: "espn-100", eliminated: false },
      team_b: { id: 2, name: "Lehigh", seed: 16, espn_id: "espn-200", eliminated: false },
    });
    const mockPicks = [
      {
        id: "pick-upset",
        bracket_id: "bracket-1",
        game_slot: 10,
        picked_team_id: 2, // picked the underdog winner
        brackets: { user_id: "user-1" },
      },
    ];

    mockParseGameStatus.mockReturnValue("final");
    mockGetRoundPoints.mockReturnValue(10);
    mockIsUpset.mockReturnValue(true); // winner seed 16 > loser seed 1

    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({
        state: "post",
        homeWinner: false,
        awayWinner: true,
        homeScore: "60",
        awayScore: "72",
      })],
    });

    const pickUpdates: Array<{ id: string; points_earned: number }> = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation((selectStr?: string) => {
        if (selectStr && selectStr.includes("brackets!inner")) {
          return { eq: vi.fn().mockResolvedValue({ data: mockPicks }) };
        }
        if (selectStr === "bracket_id, points_earned") {
          return {
            not: vi.fn().mockResolvedValue({
              data: [{ bracket_id: "bracket-1", points_earned: 15 }],
            }),
          };
        }
        return {
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
          })),
          not: vi.fn().mockResolvedValue({ data: [] }),
        };
      });

      builder.update.mockImplementation((data: unknown) => {
        const d = data as Record<string, unknown>;
        if (d.is_correct !== undefined) {
          return {
            eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
              pickUpdates.push({ id: val as string, points_earned: d.points_earned as number });
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return {
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      builder.insert.mockResolvedValue({ data: null, error: null });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    const upsetPick = pickUpdates.find((p) => p.id === "pick-upset");
    expect(upsetPick).toBeDefined();
    expect(upsetPick!.points_earned).toBe(15); // 10 * 1.5
  });

  // 7. Bracket score recalculation
  it("recalculates aggregate bracket scores after game finishes", async () => {
    const dbGame = makeDbGame({ status: "in_progress" });
    const mockPicks = [
      { id: "pick-1", bracket_id: "bracket-A", game_slot: 10, picked_team_id: 1, brackets: { user_id: "user-1" } },
    ];
    const allPicksForScoring = [
      { bracket_id: "bracket-A", points_earned: 10 },
      { bracket_id: "bracket-A", points_earned: 20 },
      { bracket_id: "bracket-B", points_earned: 5 },
    ];

    mockParseGameStatus.mockReturnValue("final");
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "post" })],
    });

    const bracketScoreUpdates: Array<{ bracketId: string; score: number }> = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation((selectStr?: string) => {
        if (selectStr && selectStr.includes("brackets!inner")) {
          return { eq: vi.fn().mockResolvedValue({ data: mockPicks }) };
        }
        if (selectStr === "bracket_id, points_earned") {
          return { not: vi.fn().mockResolvedValue({ data: allPicksForScoring }) };
        }
        return {
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
          })),
          not: vi.fn().mockResolvedValue({ data: [] }),
        };
      });

      builder.update.mockImplementation((data: unknown) => {
        const d = data as Record<string, unknown>;
        if (typeof d.score === "number") {
          return {
            eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
              bracketScoreUpdates.push({ bracketId: val as string, score: d.score as number });
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return {
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      builder.insert.mockResolvedValue({ data: null, error: null });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // bracket-A should have 30 (10+20), bracket-B should have 5
    const bracketA = bracketScoreUpdates.find((b) => b.bracketId === "bracket-A");
    const bracketB = bracketScoreUpdates.find((b) => b.bracketId === "bracket-B");
    expect(bracketA).toBeDefined();
    expect(bracketA!.score).toBe(30);
    expect(bracketB).toBeDefined();
    expect(bracketB!.score).toBe(5);
  });

  // 8. Notification queue populated
  it("queues notifications for users with picks on completed games", async () => {
    const dbGame = makeDbGame({ status: "in_progress" });
    const mockPicks = [
      { id: "pick-1", bracket_id: "bracket-1", game_slot: 10, picked_team_id: 1, brackets: { user_id: "user-1" } },
      { id: "pick-2", bracket_id: "bracket-2", game_slot: 10, picked_team_id: 2, brackets: { user_id: "user-2" } },
    ];

    mockParseGameStatus.mockReturnValue("final");
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "post" })],
    });

    let notificationInsert: unknown = null;

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation((selectStr?: string) => {
        if (selectStr && selectStr.includes("brackets!inner")) {
          return { eq: vi.fn().mockResolvedValue({ data: mockPicks }) };
        }
        if (selectStr === "bracket_id, points_earned") {
          return { not: vi.fn().mockResolvedValue({ data: [] }) };
        }
        return {
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
          })),
          not: vi.fn().mockResolvedValue({ data: [] }),
        };
      });

      builder.update.mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));

      builder.insert.mockImplementation((data: unknown) => {
        if (table === "notification_queue") {
          notificationInsert = data;
        }
        return Promise.resolve({ data: null, error: null });
      });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // Notifications should have been queued for both users
    expect(notificationInsert).toBeDefined();
    const notifications = notificationInsert as Array<Record<string, unknown>>;
    expect(notifications).toHaveLength(2);

    const userIds = notifications.map((n) => n.user_id);
    expect(userIds).toContain("user-1");
    expect(userIds).toContain("user-2");

    // Each notification should have type and payload
    for (const n of notifications) {
      expect(n.type).toBe("game_result");
      expect(n.batch_key).toBeDefined();
      expect((n.payload as Record<string, unknown>).game_id).toBe("game-uuid-1");
      expect((n.payload as Record<string, unknown>).winner).toBe("Duke");
    }
  });

  // 9. Idempotent: game already final -> no re-processing
  it("does not re-process a game that is already final (idempotent)", async () => {
    // game.status is already "final" in the DB
    const dbGame = makeDbGame({
      status: "final",
      winner_id: 1,
      score_a: 75,
      score_b: 68,
    });

    mockParseGameStatus.mockReturnValue("final");
    mockFetchESPNScoreboard.mockResolvedValue({
      events: [makeESPNEvent({ state: "post" })],
    });

    const updateCalls: Array<{ table: string; data: unknown }> = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      builder.select.mockImplementation(() => ({
        eq: vi.fn().mockImplementation(() => ({
          single: vi.fn().mockResolvedValue({ data: table === "games" ? dbGame : null }),
        })),
      }));

      builder.update.mockImplementation((data: unknown) => {
        updateCalls.push({ table, data });
        return {
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      builder.insert.mockResolvedValue({ data: null, error: null });

      return builder;
    };

    const res = await GET(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // The game update itself is idempotent (always runs), but the "just went final"
    // block should NOT run because game.status === "final" already.
    // There should be the initial game update, but no teams, bracket_picks, brackets,
    // or notification_queue updates.
    const teamUpdates = updateCalls.filter((c) => c.table === "teams");
    const pickUpdates = updateCalls.filter((c) => c.table === "bracket_picks");
    const bracketUpdates = updateCalls.filter((c) => c.table === "brackets");
    const notifInserts = updateCalls.filter((c) => c.table === "notification_queue");

    expect(teamUpdates).toHaveLength(0);
    expect(pickUpdates).toHaveLength(0);
    expect(bracketUpdates).toHaveLength(0);
    expect(notifInserts).toHaveLength(0);
  });
});
