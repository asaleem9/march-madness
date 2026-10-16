// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createRecordingClient } from "@/test/helpers";

vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@test.com";
});

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

let client = createRecordingClient();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => client),
}));

const mockProcessFinalGame = vi.fn().mockResolvedValue({
  loserId: 2, picksScored: 2, bracketsRecalculated: 2, notificationsQueued: 2,
});
vi.mock("@/lib/process-final-game", () => ({
  processFinalGame: (...args: unknown[]) => mockProcessFinalGame(...args),
}));

import { POST } from "../route";

const game = {
  id: 7, game_slot: 13, round: "first_round", next_game_slot: 45, slot_position: "top",
  team_a_id: 1, team_b_id: 2, winner_id: null, status: "scheduled",
  team_a: { id: 1, name: "Duke", seed: 1 }, team_b: { id: 2, name: "Siena", seed: 16 },
};

function mockAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "admin@test.com" } } });
}
function req(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/scores", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  client = createRecordingClient((table) => {
    if (table === "games") return game;
    if (table === "tournament_config") return { scoring_multipliers: null };
    return null;
  });
});

describe("POST /api/admin/scores", () => {
  it("returns 403 for non-admin users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2", email: "nobody@test.com" } } });
    const res = await POST(req({ game_id: 7, score_a: 1, score_b: 0 }));
    expect(res.status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("requires a game id and 404s on an unknown game", async () => {
    mockAdmin();
    expect((await POST(req({ score_a: 1 }))).status).toBe(400);
    client = createRecordingClient(() => null);
    expect((await POST(req({ game_id: 99, score_a: 1, score_b: 0 }))).status).toBe(404);
  });

  it("saves an in-progress score without running the final pipeline", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: 7, score_a: 40, score_b: 38, status: "in_progress" }));
    expect(res.status).toBe(200);
    const upd = client.updates("games")[0];
    expect(upd.args[0]).toMatchObject({ score_a: 40, score_b: 38, status: "in_progress", winner_id: null });
    expect(client.filtersAfter(upd)[0].args).toEqual(["id", 7]);
    expect(mockProcessFinalGame).not.toHaveBeenCalled();
  });

  it("derives the winner from the scores and runs the shared pipeline with notifications", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: 7, score_a: 55, score_b: 85, status: "final" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(client.updates("games")[0].args[0]).toMatchObject({ winner_id: 2, status: "final" });
    expect(mockProcessFinalGame).toHaveBeenCalledTimes(1);
    expect(mockProcessFinalGame.mock.calls[0][1]).toMatchObject({ winnerId: 2, scoreA: 55, scoreB: 85, notify: true });
    expect(body).toMatchObject({ success: true, picksScored: 2 });
  });

  it("rejects a winner that contradicts the scores", async () => {
    mockAdmin();
    const res = await POST(req({ game_id: 7, score_a: 85, score_b: 55, winner_id: 2, status: "final" }));
    expect(res.status).toBe(400);
    expect(client.updates("games")).toHaveLength(0);
  });

  it("re-scores an already-final game without re-notifying", async () => {
    mockAdmin();
    client = createRecordingClient((table) => (table === "games" ? { ...game, status: "final", winner_id: 1 } : null));
    await POST(req({ game_id: 7, score_a: 85, score_b: 55, winner_id: 1, status: "final" }));
    expect(mockProcessFinalGame.mock.calls[0][1]).toMatchObject({ winnerId: 1, notify: false });
  });
});
