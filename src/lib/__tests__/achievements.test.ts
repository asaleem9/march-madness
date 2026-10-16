import { describe, it, expect } from "vitest";
import { evaluateAchievements, ACHIEVEMENT_INFO, ACHIEVEMENT_ORDER } from "../achievements";

const games = [
  // east region R1 (slots 13-20) & R2 (45-48) & S16 (61-62) & E8 (69): keep it small — use 3 games as "the region"
  { game_slot: 13, round: "first_round", region: "east", status: "final", winner_id: 1, team_a_id: 1, team_b_id: 2, team_a: { seed: 1 }, team_b: { seed: 16 } },
  { game_slot: 15, round: "first_round", region: "east", status: "final", winner_id: 4, team_a_id: 3, team_b_id: 4, team_a: { seed: 5 }, team_b: { seed: 12 } },
  { game_slot: 45, round: "second_round", region: "east", status: "final", winner_id: 4, team_a_id: 1, team_b_id: 4, team_a: { seed: 1 }, team_b: { seed: 12 } },
  { game_slot: 75, round: "championship", region: null, status: "final", winner_id: 4, team_a_id: 4, team_b_id: 9, team_a: { seed: 12 }, team_b: { seed: 2 } },
];

const brackets = [
  { id: "A", user_id: "ua", score: 100, locked: true },
  { id: "B", user_id: "ub", score: 50, locked: true },
  { id: "C", user_id: "uc", score: 500, locked: false }, // draft: ineligible
];

const picks = [
  // A: perfect east, picked the 12-seed to the S16, picked champion
  { bracket_id: "A", game_slot: 13, round: "first_round", picked_team_id: 1, is_correct: true },
  { bracket_id: "A", game_slot: 15, round: "first_round", picked_team_id: 4, is_correct: true },
  { bracket_id: "A", game_slot: 45, round: "second_round", picked_team_id: 4, is_correct: true },
  { bracket_id: "A", game_slot: 75, round: "championship", picked_team_id: 4, is_correct: true },
  // B: all chalk, mostly wrong
  { bracket_id: "B", game_slot: 13, round: "first_round", picked_team_id: 1, is_correct: true },
  { bracket_id: "B", game_slot: 15, round: "first_round", picked_team_id: 3, is_correct: false },
  { bracket_id: "B", game_slot: 45, round: "second_round", picked_team_id: 1, is_correct: false },
  { bracket_id: "B", game_slot: 75, round: "championship", picked_team_id: 9, is_correct: false },
];

describe("evaluateAchievements", () => {
  const result = evaluateAchievements(brackets, picks, games);

  it("awards genius, fortune teller, perfect region and cinderella to the top bracket", () => {
    expect(result.get("ua")?.sort()).toEqual(["bracket_genius", "cinderella", "fortune_teller", "perfect_region"]);
  });

  it("awards chalk walk to an all-favourites bracket at or above the median", () => {
    // median of [50, 100] (index floor(2/2)=1) is 100, so B (50) misses it
    expect(result.get("ub") ?? []).not.toContain("chalk_walk");
    const r2 = evaluateAchievements([brackets[1], { id: "D", user_id: "ud", score: 10, locked: true }], picks, games);
    expect(r2.get("ub")).toContain("chalk_walk");
  });

  it("ignores unlocked drafts and empty pools", () => {
    expect(result.has("uc")).toBe(false);
    expect(evaluateAchievements([], picks, games).size).toBe(0);
  });

  it("describes every badge", () => {
    for (const t of ACHIEVEMENT_ORDER) expect(ACHIEVEMENT_INFO[t].label).toBeTruthy();
  });
});
