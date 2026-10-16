import { describe, it, expect } from "vitest";
import { createRecordingClient } from "@/test/helpers";
import { processFinalGame, pointsForWin, type FinalGameRow } from "../process-final-game";
import type { SupabaseClient } from "@supabase/supabase-js";

const game: FinalGameRow = {
  id: 7,
  game_slot: 13,
  round: "first_round",
  region: "east",
  team_a_id: 1,
  team_b_id: 2,
  next_game_slot: 45,
  slot_position: "top",
  team_a: { id: 1, name: "Duke", seed: 1 },
  team_b: { id: 2, name: "Siena", seed: 16 },
};

const picks = [
  { id: 101, bracket_id: "b1", picked_team_id: 1, is_correct: null, points_earned: 0, brackets: { user_id: "u1" } },
  { id: 102, bracket_id: "b2", picked_team_id: 2, is_correct: null, points_earned: 0, brackets: { user_id: "u2" } },
  { id: 103, bracket_id: "b3", picked_team_id: 1, is_correct: true, points_earned: 10, brackets: { user_id: "u3" } }, // already scored
];
const allPicks = [
  { bracket_id: "b1", points_earned: 10 },
  { bracket_id: "b1", points_earned: 20 },
  { bracket_id: "b2", points_earned: 0 },
];

function client() {
  return createRecordingClient((table, chain) => {
    if (table === "bracket_picks") {
      const sel = chain.find((c) => c.method === "select");
      const cols = String(sel?.args[0] ?? "");
      if (cols.includes("brackets!inner")) return picks;
      if (cols.includes("points_earned")) return allPicks;
    }
    return null;
  });
}

describe("pointsForWin", () => {
  it("applies the 1.5x upset bonus only when the worse seed wins", () => {
    expect(pointsForWin("first_round", 1, 16)).toBe(10);
    expect(pointsForWin("first_round", 16, 1)).toBe(15);
    expect(pointsForWin("championship", 2, 1, { first_round: 10, second_round: 20, sweet_16: 40, elite_eight: 80, final_four: 160, championship: 500 })).toBe(750);
  });
});

describe("processFinalGame", () => {
  it("eliminates, advances, scores changed picks, recalculates and notifies", async () => {
    const c = client();
    const r = await processFinalGame(c as unknown as SupabaseClient, {
      game, winnerId: 1, scoreA: 80, scoreB: 60, notify: true, batchKey: "20270318-evening",
    });

    const elim = c.updates("teams")[0];
    expect(elim.args[0]).toEqual({ eliminated: true });
    expect(c.filtersAfter(elim)[0].args).toEqual(["id", 2]);

    const adv = c.updates("games")[0];
    expect(adv.args[0]).toEqual({ team_a_id: 1 });
    expect(c.filtersAfter(adv)[0].args).toEqual(["game_slot", 45]);

    // Only the two unscored picks are written; the already-correct one is left alone.
    const pickUpdates = c.updates("bracket_picks");
    expect(pickUpdates.map((u) => u.args[0])).toEqual([
      { is_correct: true, points_earned: 10 },
      { is_correct: false, points_earned: 0 },
    ]);
    expect(r.picksScored).toBe(2);

    const scoreUpdates = c.updates("brackets").map((u) => u.args[0]);
    expect(scoreUpdates).toEqual([{ score: 30 }, { score: 0 }]);
    expect(r.bracketsRecalculated).toBe(2);

    const queued = c.inserts("notification_queue")[0].args[0] as Record<string, unknown>[];
    expect(queued).toHaveLength(3);
    expect(queued[0]).toMatchObject({
      user_id: "u1", type: "game_result", batch_key: "20270318-evening",
      payload: { winner: "Duke", loser: "Siena", score: "80-60", picked: "Duke", correct: true, points: 10, round: "first_round" },
    });
    expect(queued[1].payload).toMatchObject({ picked: "Siena", correct: false, points: 0 });
    expect(r.notificationsQueued).toBe(3);
  });

  it("does not queue notifications when notify is false", async () => {
    const c = client();
    const r = await processFinalGame(c as unknown as SupabaseClient, { game, winnerId: 1, scoreA: 1, scoreB: 0, notify: false });
    expect(c.inserts("notification_queue")).toHaveLength(0);
    expect(r.notificationsQueued).toBe(0);
  });

  it("rewrites every pick of a play-in loser to the winner", async () => {
    const c = client();
    await processFinalGame(c as unknown as SupabaseClient, {
      game: { ...game, round: "first_four", game_slot: 1, next_game_slot: 25, slot_position: "bottom", team_a: { id: 1, name: "Texas", seed: 11 }, team_b: { id: 2, name: "NC State", seed: 11 } },
      winnerId: 2, scoreA: 60, scoreB: 70,
    });
    const swap = c.updates("bracket_picks").find((u) => (u.args[0] as Record<string, unknown>).picked_team_id === 2)!;
    expect(swap).toBeDefined();
    const filters = c.filtersAfter(swap);
    expect(filters).toHaveLength(1);
    expect(filters[0].args).toEqual(["picked_team_id", 1]);
    const adv = c.updates("games")[0];
    expect(adv.args[0]).toEqual({ team_b_id: 2 });
  });

  it("skips advancement for the championship", async () => {
    const c = client();
    await processFinalGame(c as unknown as SupabaseClient, {
      game: { ...game, round: "championship", game_slot: 75, next_game_slot: null, slot_position: null },
      winnerId: 1, scoreA: 1, scoreB: 0,
    });
    expect(c.updates("games")).toHaveLength(0);
  });
});
