import { describe, it, expect } from "vitest";
import { buildRows, type GameRowInput } from "../buildRows";
import { DEFAULT_SCORING } from "@/lib/utils";

const profiles = {
  ali: { id: "u-ali", display_name: "Ali", avatar_url: null },
  bo: { id: "u-bo", display_name: "Bo", avatar_url: "https://a/bo.png" },
  cy: { id: "u-cy", display_name: "  ", avatar_url: null },
};

const brackets = [
  { id: "b-ali", user_id: "u-ali", name: "Ali's", score: 20, profiles: profiles.ali },
  { id: "b-bo", user_id: "u-bo", name: "Bo's", score: 30, profiles: profiles.bo },
  { id: "b-cy", user_id: "u-cy", name: null, score: 30, profiles: profiles.cy },
];

const games: GameRowInput[] = [
  { game_slot: 13, round: "first_round", status: "final", winner_id: 1 },
  { game_slot: 14, round: "first_round", status: "final", winner_id: 3 },
  { game_slot: 45, round: "second_round", status: "scheduled", winner_id: null },
  { game_slot: 75, round: "championship", status: "scheduled", winner_id: null },
];

const teams = [
  { id: 1, name: "Duke", abbreviation: "DUKE", logo_url: "d.png", eliminated: false },
  { id: 2, name: "Lehigh", abbreviation: "LEH", logo_url: null, eliminated: true },
  { id: 3, name: "Kansas", abbreviation: "KU", logo_url: "k.png", eliminated: false },
  { id: 4, name: "Yale", abbreviation: "YALE", logo_url: null, eliminated: true },
];

const picks = [
  // Ali: Duke right, Yale wrong, Duke to win R2 and the title.
  { bracket_id: "b-ali", game_slot: 13, picked_team_id: 1, points_earned: 10, is_correct: true },
  { bracket_id: "b-ali", game_slot: 14, picked_team_id: 4, points_earned: 0, is_correct: false },
  { bracket_id: "b-ali", game_slot: 45, picked_team_id: 1, points_earned: null, is_correct: null },
  { bracket_id: "b-ali", game_slot: 75, picked_team_id: 1, points_earned: null, is_correct: null },
  // Bo: both right, Lehigh (eliminated) as champion.
  { bracket_id: "b-bo", game_slot: 13, picked_team_id: 1, points_earned: 10, is_correct: true },
  { bracket_id: "b-bo", game_slot: 14, picked_team_id: 3, points_earned: 20, is_correct: true },
  { bracket_id: "b-bo", game_slot: 45, picked_team_id: 2, points_earned: null, is_correct: null },
  { bracket_id: "b-bo", game_slot: 75, picked_team_id: 2, points_earned: null, is_correct: null },
];

describe("buildRows", () => {
  it("ranks with shared ranks for ties and keeps score order", () => {
    const rows = buildRows({ brackets, picks, games, teams, achievements: [], multipliers: DEFAULT_SCORING });
    expect(rows.map((r) => [r.displayName, r.rank, r.score])).toEqual([
      ["Bo", 1, 30],
      ["Anonymous", 1, 30],
      ["Ali", 3, 20],
    ]);
  });

  it("counts correct and decided picks", () => {
    const rows = buildRows({ brackets, picks, games, teams, achievements: [], multipliers: DEFAULT_SCORING });
    const ali = rows.find((r) => r.userId === "u-ali")!;
    expect(ali.correctPicks).toBe(1);
    expect(ali.decidedPicks).toBe(2);
    expect(ali.totalPicks).toBe(4);
    const bo = rows.find((r) => r.userId === "u-bo")!;
    expect(bo.correctPicks).toBe(2);
    expect(bo.decidedPicks).toBe(2);
  });

  it("computes max possible from earned points plus live undecided picks", () => {
    const rows = buildRows({ brackets, picks, games, teams, achievements: [], multipliers: DEFAULT_SCORING });
    const ali = rows.find((r) => r.userId === "u-ali")!;
    // 10 earned + R2 (Duke alive) + championship (Duke alive)
    expect(ali.maxPossible).toBe(
      10 + DEFAULT_SCORING.second_round + DEFAULT_SCORING.championship
    );
    const bo = rows.find((r) => r.userId === "u-bo")!;
    // 30 earned; Lehigh is out so neither future pick counts.
    expect(bo.maxPossible).toBe(30);
  });

  it("resolves the champion pick with alive / out state", () => {
    const rows = buildRows({ brackets, picks, games, teams, achievements: [], multipliers: DEFAULT_SCORING });
    const ali = rows.find((r) => r.userId === "u-ali")!;
    expect(ali.champion).toMatchObject({ abbreviation: "DUKE", eliminated: false, isChampion: false, logoUrl: "d.png" });
    const bo = rows.find((r) => r.userId === "u-bo")!;
    expect(bo.champion).toMatchObject({ abbreviation: "LEH", eliminated: true, isChampion: false });
    const cy = rows.find((r) => r.userId === "u-cy")!;
    expect(cy.champion).toBeNull();
  });

  it("flags the actual champion once the title game is final", () => {
    const decided = games.map((g) =>
      g.round === "championship" ? { ...g, status: "final", winner_id: 1 } : g
    );
    const rows = buildRows({ brackets, picks, games: decided, teams, achievements: [], multipliers: DEFAULT_SCORING });
    const ali = rows.find((r) => r.userId === "u-ali")!;
    expect(ali.champion?.isChampion).toBe(true);
    expect(ali.champion?.eliminated).toBe(false);
  });

  it("attaches badges in display order, de-duplicated", () => {
    const rows = buildRows({
      brackets,
      picks,
      games,
      teams,
      achievements: [
        { user_id: "u-ali", achievement_type: "cinderella" },
        { user_id: "u-ali", achievement_type: "fortune_teller" },
        { user_id: "u-ali", achievement_type: "cinderella" },
      ],
      multipliers: DEFAULT_SCORING,
    });
    const ali = rows.find((r) => r.userId === "u-ali")!;
    expect(ali.badges).toEqual(["fortune_teller", "cinderella"]);
    expect(rows.find((r) => r.userId === "u-bo")!.badges).toEqual([]);
  });

  it("handles no games at all (pre-import)", () => {
    const rows = buildRows({ brackets, picks: [], games: [], teams: [], achievements: [], multipliers: DEFAULT_SCORING });
    expect(rows).toHaveLength(3);
    expect(rows[0].champion).toBeNull();
    expect(rows[0].maxPossible).toBe(0);
    expect(rows[0].correctPicks).toBe(0);
  });
});
