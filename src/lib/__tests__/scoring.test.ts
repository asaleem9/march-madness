import { describe, it, expect } from "vitest";
import {
  calculatePickPoints,
  calculateBracketScore,
  buildLeaderboard,
} from "../scoring";
import type { ScoringMultipliers } from "@/types";

describe("calculatePickPoints", () => {
  it("returns 0 for incorrect pick", () => {
    expect(
      calculatePickPoints({
        round: "first_round",
        isCorrect: false,
        pickedTeamSeed: 1,
        opponentSeed: 16,
      })
    ).toBe(0);
  });

  it("returns base points for correct non-upset pick", () => {
    expect(
      calculatePickPoints({
        round: "first_round",
        isCorrect: true,
        pickedTeamSeed: 1,
        opponentSeed: 16,
      })
    ).toBe(10);
  });

  it("returns 1.5x for correct upset pick", () => {
    expect(
      calculatePickPoints({
        round: "first_round",
        isCorrect: true,
        pickedTeamSeed: 12,
        opponentSeed: 5,
      })
    ).toBe(15);
  });

  it("returns 320 for correct championship pick", () => {
    expect(
      calculatePickPoints({
        round: "championship",
        isCorrect: true,
        pickedTeamSeed: 1,
        opponentSeed: 2,
      })
    ).toBe(320);
  });

  it("returns 480 for correct championship upset", () => {
    expect(
      calculatePickPoints({
        round: "championship",
        isCorrect: true,
        pickedTeamSeed: 3,
        opponentSeed: 1,
      })
    ).toBe(480);
  });

  it("returns 5 for correct first_four pick", () => {
    expect(
      calculatePickPoints({
        round: "first_four",
        isCorrect: true,
        pickedTeamSeed: 16,
        opponentSeed: 16,
      })
    ).toBe(5);
  });

  it("returns 8 for correct first_four upset (Math.round(5*1.5))", () => {
    expect(
      calculatePickPoints({
        round: "first_four",
        isCorrect: true,
        pickedTeamSeed: 16,
        opponentSeed: 11,
      })
    ).toBe(8);
  });

  it("returns 120 for correct elite_eight upset", () => {
    expect(
      calculatePickPoints({
        round: "elite_eight",
        isCorrect: true,
        pickedTeamSeed: 4,
        opponentSeed: 1,
      })
    ).toBe(120);
  });

  it("uses custom multipliers", () => {
    const custom: ScoringMultipliers = {
      first_round: 100,
      second_round: 200,
      sweet_16: 400,
      elite_eight: 800,
      final_four: 1600,
      championship: 3200,
    };
    expect(
      calculatePickPoints(
        {
          round: "first_round",
          isCorrect: true,
          pickedTeamSeed: 1,
          opponentSeed: 16,
        },
        custom
      )
    ).toBe(100);
  });

  it("returns 0 for incorrect pick regardless of round", () => {
    const rounds = [
      "first_four",
      "first_round",
      "second_round",
      "sweet_16",
      "elite_eight",
      "final_four",
      "championship",
    ] as const;

    for (const round of rounds) {
      expect(
        calculatePickPoints({
          round,
          isCorrect: false,
          pickedTeamSeed: 1,
          opponentSeed: 16,
        })
      ).toBe(0);
    }
  });
});

describe("calculateBracketScore", () => {
  it("returns 0 for empty picks array", () => {
    expect(calculateBracketScore([])).toBe(0);
  });

  it("sums a single correct pick", () => {
    expect(
      calculateBracketScore([
        {
          round: "first_round",
          isCorrect: true,
          pickedTeamSeed: 1,
          opponentSeed: 16,
        },
      ])
    ).toBe(10);
  });

  it("only counts correct picks", () => {
    expect(
      calculateBracketScore([
        {
          round: "first_round",
          isCorrect: true,
          pickedTeamSeed: 1,
          opponentSeed: 16,
        },
        {
          round: "first_round",
          isCorrect: false,
          pickedTeamSeed: 8,
          opponentSeed: 9,
        },
        {
          round: "second_round",
          isCorrect: true,
          pickedTeamSeed: 1,
          opponentSeed: 8,
        },
      ])
    ).toBe(30); // 10 + 0 + 20
  });

  it("returns 0 when all picks are incorrect", () => {
    expect(
      calculateBracketScore([
        {
          round: "first_round",
          isCorrect: false,
          pickedTeamSeed: 16,
          opponentSeed: 1,
        },
        {
          round: "second_round",
          isCorrect: false,
          pickedTeamSeed: 9,
          opponentSeed: 1,
        },
      ])
    ).toBe(0);
  });

  it("correctly sums across all rounds", () => {
    const picks = [
      { round: "first_round" as const, isCorrect: true, pickedTeamSeed: 1, opponentSeed: 16 },
      { round: "second_round" as const, isCorrect: true, pickedTeamSeed: 1, opponentSeed: 8 },
      { round: "sweet_16" as const, isCorrect: true, pickedTeamSeed: 1, opponentSeed: 4 },
      { round: "elite_eight" as const, isCorrect: true, pickedTeamSeed: 1, opponentSeed: 3 },
      { round: "final_four" as const, isCorrect: true, pickedTeamSeed: 1, opponentSeed: 2 },
      { round: "championship" as const, isCorrect: true, pickedTeamSeed: 1, opponentSeed: 1 },
    ];
    expect(calculateBracketScore(picks)).toBe(10 + 20 + 40 + 80 + 160 + 320);
  });

  it("stacks multiple upset bonuses", () => {
    const picks = [
      { round: "first_round" as const, isCorrect: true, pickedTeamSeed: 12, opponentSeed: 5 },
      { round: "first_round" as const, isCorrect: true, pickedTeamSeed: 15, opponentSeed: 2 },
    ];
    expect(calculateBracketScore(picks)).toBe(15 + 15); // Both 10*1.5
  });
});

describe("buildLeaderboard", () => {
  const makeEntry = (userId: string, score: number) => ({
    userId,
    displayName: `User ${userId}`,
    avatarUrl: null,
    bracketId: `bracket-${userId}`,
    bracketName: "My Bracket",
    score,
    correctPicks: Math.floor(score / 10),
    totalPicks: 63,
  });

  it("assigns rank 1 to single entry", () => {
    const result = buildLeaderboard([makeEntry("a", 100)]);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
  });

  it("sorts descending by score", () => {
    const result = buildLeaderboard([
      makeEntry("c", 50),
      makeEntry("a", 100),
      makeEntry("b", 75),
    ]);
    expect(result[0].userId).toBe("a");
    expect(result[1].userId).toBe("b");
    expect(result[2].userId).toBe("c");
  });

  it("ties share the same rank", () => {
    const result = buildLeaderboard([
      makeEntry("a", 100),
      makeEntry("b", 80),
      makeEntry("c", 80),
      makeEntry("d", 50),
    ]);
    expect(result[0].rank).toBe(1); // 100
    expect(result[1].rank).toBe(2); // 80
    expect(result[2].rank).toBe(2); // 80 (tied)
    expect(result[3].rank).toBe(4); // 50 (jumps to 4)
  });

  it("three-way tie assigns same rank", () => {
    const result = buildLeaderboard([
      makeEntry("a", 100),
      makeEntry("b", 100),
      makeEntry("c", 100),
    ]);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(buildLeaderboard([])).toEqual([]);
  });

  it("all same score gives all rank 1", () => {
    const result = buildLeaderboard([
      makeEntry("a", 50),
      makeEntry("b", 50),
      makeEntry("c", 50),
      makeEntry("d", 50),
      makeEntry("e", 50),
    ]);
    for (const entry of result) {
      expect(entry.rank).toBe(1);
    }
  });

  it("preserves all entry fields", () => {
    const result = buildLeaderboard([makeEntry("a", 100)]);
    expect(result[0]).toMatchObject({
      userId: "a",
      displayName: "User a",
      avatarUrl: null,
      bracketId: "bracket-a",
      bracketName: "My Bracket",
      score: 100,
      rank: 1,
    });
  });
});
