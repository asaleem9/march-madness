// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Must use vi.hoisted so the env var is set BEFORE the route module evaluates
// its top-level `const adminEmails = process.env.ADMIN_EMAILS...`
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@test.com";
});

// --- Mocks ---

const mockGetUser = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock("@/lib/utils", () => ({
  getRoundPoints: vi.fn((round: string) => {
    const points: Record<string, number> = {
      first_four: 5,
      first_round: 10,
      second_round: 20,
      sweet_16: 40,
      elite_eight: 80,
      final_four: 160,
      championship: 320,
    };
    return points[round] ?? 0;
  }),
  isUpset: vi.fn((winnerSeed: number, loserSeed: number) => winnerSeed > loserSeed),
}));

// --- Import after mocks and env setup ---

import { POST } from "../route";

// --- Helpers ---

function mockAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "admin@test.com" } },
  });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-2", email: "nobody@test.com" } },
  });
}

function createScoreRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/scores", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/scores", () => {
  it("returns 403 for non-admin users", async () => {
    mockNonAdmin();

    const request = createScoreRequest({
      game_id: "game-1",
      score_a: 70,
      score_b: 65,
      winner_id: "team-a",
      status: "final",
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("updates game score and returns success", async () => {
    mockAdmin();

    // Mock the games.update call (non-final status skips advancement)
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "games") {
        return { update: mockUpdate };
      }
      return {};
    });

    const request = createScoreRequest({
      game_id: "game-1",
      score_a: 70,
      score_b: 65,
      winner_id: null,
      status: "in_progress",
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockAdminFrom).toHaveBeenCalledWith("games");
    expect(mockUpdate).toHaveBeenCalledWith({
      score_a: 70,
      score_b: 65,
      winner_id: null,
      status: "in_progress",
    });
    expect(mockUpdateEq).toHaveBeenCalledWith("id", "game-1");
  });

  it("advances winner and eliminates loser on final", async () => {
    mockAdmin();

    const gameData = {
      id: "game-1",
      game_slot: 5,
      next_game_slot: 37,
      slot_position: "top",
      round: "first_round",
      team_a_id: "team-a",
      team_b_id: "team-b",
      team_a: { id: "team-a", name: "Duke", seed: 1 },
      team_b: { id: "team-b", name: "Norfolk St", seed: 16 },
    };

    const bracketPicks = [
      { id: "pick-1", bracket_id: "bracket-1", game_slot: 5, picked_team_id: "team-a" },
      { id: "pick-2", bracket_id: "bracket-2", game_slot: 5, picked_team_id: "team-b" },
    ];

    const allEvaluatedPicks = [
      { bracket_id: "bracket-1", points_earned: 10 },
      { bracket_id: "bracket-2", points_earned: 0 },
      { bracket_id: "bracket-1", points_earned: 20 },
    ];

    // Track all calls per table+method to verify the full flow
    const updateCalls: Array<{ table: string; data: unknown; eqArgs: unknown[] }> = [];

    mockAdminFrom.mockImplementation((table: string) => {
      const makeUpdate = (tbl: string) => {
        return vi.fn((data: unknown) => ({
          eq: vi.fn((...args: unknown[]) => {
            updateCalls.push({ table: tbl, data, eqArgs: args });
            return Promise.resolve({ error: null });
          }),
        }));
      };

      const makeSelect = () => {
        return vi.fn((_cols?: string) => ({
          eq: vi.fn((_col: string, _val: unknown) => {
            if (table === "games") {
              return {
                single: vi.fn().mockResolvedValue({ data: gameData }),
              };
            }
            if (table === "bracket_picks") {
              return Promise.resolve({ data: bracketPicks });
            }
            return Promise.resolve({ data: null });
          }),
          not: vi.fn(() => Promise.resolve({ data: allEvaluatedPicks })),
        }));
      };

      return {
        update: makeUpdate(table),
        select: makeSelect(),
      };
    });

    const request = createScoreRequest({
      game_id: "game-1",
      score_a: 85,
      score_b: 55,
      winner_id: "team-a",
      status: "final",
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    // Verify the initial game update happened
    const gameUpdate = updateCalls.find(
      (c) => c.table === "games" && c.eqArgs[0] === "id" && c.eqArgs[1] === "game-1"
    );
    expect(gameUpdate).toBeDefined();
    expect(gameUpdate!.data).toEqual({
      score_a: 85,
      score_b: 55,
      winner_id: "team-a",
      status: "final",
    });

    // Verify loser elimination
    const eliminateCall = updateCalls.find(
      (c) => c.table === "teams" && c.eqArgs[0] === "id" && c.eqArgs[1] === "team-b"
    );
    expect(eliminateCall).toBeDefined();
    expect(eliminateCall!.data).toEqual({ eliminated: true });

    // Verify winner advancement to next game slot (top position = team_a_id)
    const advanceCall = updateCalls.find(
      (c) => c.table === "games" && c.eqArgs[0] === "game_slot" && c.eqArgs[1] === 37
    );
    expect(advanceCall).toBeDefined();
    expect(advanceCall!.data).toEqual({ team_a_id: "team-a" });

    // Verify bracket pick evaluation happened (correct pick for team-a, incorrect for team-b)
    const pickUpdates = updateCalls.filter(
      (c) => c.table === "bracket_picks" && c.eqArgs[0] === "id"
    );
    expect(pickUpdates.length).toBe(2);

    const correctPick = pickUpdates.find((c) => c.eqArgs[1] === "pick-1");
    expect(correctPick).toBeDefined();
    expect(correctPick!.data).toEqual({ is_correct: true, points_earned: 10 });

    const incorrectPick = pickUpdates.find((c) => c.eqArgs[1] === "pick-2");
    expect(incorrectPick).toBeDefined();
    expect(incorrectPick!.data).toEqual({ is_correct: false, points_earned: 0 });

    // Verify bracket score recalculation happened
    const bracketUpdates = updateCalls.filter(
      (c) => c.table === "brackets" && c.eqArgs[0] === "id"
    );
    expect(bracketUpdates.length).toBe(2);

    const bracket1Update = bracketUpdates.find((c) => c.eqArgs[1] === "bracket-1");
    expect(bracket1Update).toBeDefined();
    // bracket-1 has 10 + 20 = 30 total points from allEvaluatedPicks
    expect(bracket1Update!.data).toEqual({ score: 30 });

    const bracket2Update = bracketUpdates.find((c) => c.eqArgs[1] === "bracket-2");
    expect(bracket2Update).toBeDefined();
    expect(bracket2Update!.data).toEqual({ score: 0 });
  });
});
