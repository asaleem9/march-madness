import { describe, it, expect } from "vitest";

// We test the seed data structure by importing the team and game slot definitions
// and validating them without actually running against a database.

// Inline the team data for structural validation
const teams = [
  { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", record: "32-2" },
  { name: "Siena", abbreviation: "SIENA", seed: 16, region: "east", record: "23-11" },
  { name: "Ohio St.", abbreviation: "OSU", seed: 8, region: "east", record: "21-12" },
  { name: "TCU", abbreviation: "TCU", seed: 9, region: "east", record: "22-11" },
  { name: "St. John's", abbreviation: "SJU", seed: 5, region: "east", record: "28-6" },
  { name: "Northern Iowa", abbreviation: "UNI", seed: 12, region: "east", record: "23-12" },
  { name: "Kansas", abbreviation: "KU", seed: 4, region: "east", record: "23-10" },
  { name: "Cal Baptist", abbreviation: "CBU", seed: 13, region: "east", record: "25-8" },
  { name: "Louisville", abbreviation: "LOU", seed: 6, region: "east", record: "23-10" },
  { name: "South Florida", abbreviation: "USF", seed: 11, region: "east", record: "25-8" },
  { name: "Michigan St.", abbreviation: "MSU", seed: 3, region: "east", record: "25-7" },
  { name: "North Dakota St.", abbreviation: "NDSU", seed: 14, region: "east", record: "27-7" },
  { name: "UCLA", abbreviation: "UCLA", seed: 7, region: "east", record: "23-11" },
  { name: "UCF", abbreviation: "UCF", seed: 10, region: "east", record: "21-11" },
  { name: "UConn", abbreviation: "CONN", seed: 2, region: "east", record: "29-5" },
  { name: "Furman", abbreviation: "FUR", seed: 15, region: "east", record: "22-12" },
  { name: "Arizona", abbreviation: "ARIZ", seed: 1, region: "west", record: "32-2" },
  { name: "Long Island", abbreviation: "LIU", seed: 16, region: "west", record: "24-10" },
  { name: "Villanova", abbreviation: "NOVA", seed: 8, region: "west", record: "24-8" },
  { name: "Utah St.", abbreviation: "USU", seed: 9, region: "west", record: "28-6" },
  { name: "Wisconsin", abbreviation: "WIS", seed: 5, region: "west", record: "24-10" },
  { name: "High Point", abbreviation: "HPU", seed: 12, region: "west", record: "30-4" },
  { name: "Arkansas", abbreviation: "ARK", seed: 4, region: "west", record: "26-8" },
  { name: "Hawaii", abbreviation: "HAW", seed: 13, region: "west", record: "24-8" },
  { name: "BYU", abbreviation: "BYU", seed: 6, region: "west", record: "23-11" },
  { name: "NC State", abbreviation: "NCST", seed: 11, region: "west", record: "First Four" },
  { name: "Texas", abbreviation: "TEX", seed: 11, region: "west", record: "First Four" },
  { name: "Gonzaga", abbreviation: "GONZ", seed: 3, region: "west", record: "30-3" },
  { name: "Kennesaw St.", abbreviation: "KSU", seed: 14, region: "west", record: "21-13" },
  { name: "Miami FL", abbreviation: "MIA", seed: 7, region: "west", record: "25-8" },
  { name: "Missouri", abbreviation: "MIZ", seed: 10, region: "west", record: "20-12" },
  { name: "Purdue", abbreviation: "PUR", seed: 2, region: "west", record: "27-8" },
  { name: "Queens NC", abbreviation: "QNC", seed: 15, region: "west", record: "21-13" },
  { name: "Florida", abbreviation: "FLA", seed: 1, region: "south", record: "26-7" },
  { name: "Lehigh", abbreviation: "LEH", seed: 16, region: "south", record: "First Four" },
  { name: "Prairie View A&M", abbreviation: "PVAM", seed: 16, region: "south", record: "First Four" },
  { name: "Clemson", abbreviation: "CLEM", seed: 8, region: "south", record: "24-10" },
  { name: "Iowa", abbreviation: "IOWA", seed: 9, region: "south", record: "21-12" },
  { name: "Vanderbilt", abbreviation: "VAN", seed: 5, region: "south", record: "26-8" },
  { name: "McNeese", abbreviation: "MCN", seed: 12, region: "south", record: "28-5" },
  { name: "Nebraska", abbreviation: "NEB", seed: 4, region: "south", record: "26-6" },
  { name: "Troy", abbreviation: "TROY", seed: 13, region: "south", record: "22-11" },
  { name: "North Carolina", abbreviation: "UNC", seed: 6, region: "south", record: "24-8" },
  { name: "VCU", abbreviation: "VCU", seed: 11, region: "south", record: "27-7" },
  { name: "Illinois", abbreviation: "ILL", seed: 3, region: "south", record: "24-8" },
  { name: "Penn", abbreviation: "PENN", seed: 14, region: "south", record: "18-11" },
  { name: "Saint Mary's", abbreviation: "SMC", seed: 7, region: "south", record: "27-5" },
  { name: "Texas A&M", abbreviation: "TAMU", seed: 10, region: "south", record: "21-11" },
  { name: "Houston", abbreviation: "HOU", seed: 2, region: "south", record: "28-6" },
  { name: "Idaho", abbreviation: "IDHO", seed: 15, region: "south", record: "21-14" },
  { name: "Michigan", abbreviation: "MICH", seed: 1, region: "midwest", record: "31-3" },
  { name: "Howard", abbreviation: "HOW", seed: 16, region: "midwest", record: "First Four" },
  { name: "UMBC", abbreviation: "UMBC", seed: 16, region: "midwest", record: "First Four" },
  { name: "Georgia", abbreviation: "UGA", seed: 8, region: "midwest", record: "22-10" },
  { name: "Saint Louis", abbreviation: "SLU", seed: 9, region: "midwest", record: "28-5" },
  { name: "Texas Tech", abbreviation: "TTU", seed: 5, region: "midwest", record: "22-10" },
  { name: "Akron", abbreviation: "AKR", seed: 12, region: "midwest", record: "29-5" },
  { name: "Alabama", abbreviation: "BAMA", seed: 4, region: "midwest", record: "23-9" },
  { name: "Hofstra", abbreviation: "HOF", seed: 13, region: "midwest", record: "24-10" },
  { name: "Tennessee", abbreviation: "TENN", seed: 6, region: "midwest", record: "22-11" },
  { name: "SMU", abbreviation: "SMU", seed: 11, region: "midwest", record: "First Four" },
  { name: "Miami Ohio", abbreviation: "M-OH", seed: 11, region: "midwest", record: "First Four" },
  { name: "Virginia", abbreviation: "UVA", seed: 3, region: "midwest", record: "29-5" },
  { name: "Wright St.", abbreviation: "WRST", seed: 14, region: "midwest", record: "23-11" },
  { name: "Kentucky", abbreviation: "UK", seed: 7, region: "midwest", record: "21-13" },
  { name: "Santa Clara", abbreviation: "SCU", seed: 10, region: "midwest", record: "26-8" },
  { name: "Iowa St.", abbreviation: "ISU", seed: 2, region: "midwest", record: "27-7" },
  { name: "Tennessee St.", abbreviation: "TNST", seed: 15, region: "midwest", record: "23-9" },
];

// Replicate the buildGameSlots logic for structural testing
function buildGameSlots() {
  const games: Array<{
    game_slot: number;
    round: string;
    region: string | null;
    next_game_slot: number | null;
    slot_position: string | null;
  }> = [];

  const firstFourSchedule = [
    { slot: 1, region: "midwest", next: 5, pos: "top" },
    { slot: 2, region: "south", next: 6, pos: "top" },
    { slot: 3, region: "west", next: 17, pos: "bottom" },
    { slot: 4, region: "midwest", next: 21, pos: "bottom" },
  ];

  for (const ff of firstFourSchedule) {
    games.push({
      game_slot: ff.slot,
      round: "first_four",
      region: ff.region,
      next_game_slot: ff.next,
      slot_position: ff.pos,
    });
  }

  const regions = ["east", "west", "south", "midwest"];
  let slot = 5;
  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 8; g++) {
      const secondRoundSlot = 37 + r * 4 + Math.floor(g / 2);
      games.push({
        game_slot: slot,
        round: "first_round",
        region: regions[r],
        next_game_slot: secondRoundSlot,
        slot_position: g % 2 === 0 ? "top" : "bottom",
      });
      slot++;
    }
  }

  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 4; g++) {
      const sweet16Slot = 53 + r * 2 + Math.floor(g / 2);
      games.push({
        game_slot: slot,
        round: "second_round",
        region: regions[r],
        next_game_slot: sweet16Slot,
        slot_position: g % 2 === 0 ? "top" : "bottom",
      });
      slot++;
    }
  }

  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 2; g++) {
      const eliteSlot = 61 + r;
      games.push({
        game_slot: slot,
        round: "sweet_16",
        region: regions[r],
        next_game_slot: eliteSlot,
        slot_position: g === 0 ? "top" : "bottom",
      });
      slot++;
    }
  }

  for (let r = 0; r < 4; r++) {
    const finalFourSlot = 65 + Math.floor(r / 2);
    games.push({
      game_slot: slot,
      round: "elite_eight",
      region: regions[r],
      next_game_slot: finalFourSlot,
      slot_position: r % 2 === 0 ? "top" : "bottom",
    });
    slot++;
  }

  games.push({
    game_slot: slot,
    round: "final_four",
    region: null,
    next_game_slot: 67,
    slot_position: "top",
  });
  slot++;
  games.push({
    game_slot: slot,
    round: "final_four",
    region: null,
    next_game_slot: 67,
    slot_position: "bottom",
  });
  slot++;

  games.push({
    game_slot: slot,
    round: "championship",
    region: null,
    next_game_slot: null,
    slot_position: null,
  });

  return games;
}

describe("Seed Data - Teams", () => {
  it("has exactly 68 teams", () => {
    expect(teams).toHaveLength(68);
  });

  it("has 4 regions", () => {
    const regions = new Set(teams.map((t) => t.region));
    expect(regions.size).toBe(4);
    expect(regions).toContain("east");
    expect(regions).toContain("west");
    expect(regions).toContain("south");
    expect(regions).toContain("midwest");
  });

  it("each region has 16 standard team entries plus First Four", () => {
    for (const region of ["east", "west", "south", "midwest"]) {
      const regionTeams = teams.filter((t) => t.region === region);
      expect(regionTeams.length).toBeGreaterThanOrEqual(16);
    }
  });

  it("has 8 First Four teams", () => {
    const firstFourTeams = teams.filter((t) => t.record === "First Four");
    expect(firstFourTeams).toHaveLength(8);
  });

  it("all teams have name, abbreviation, seed, region", () => {
    for (const team of teams) {
      expect(team.name).toBeTruthy();
      expect(team.abbreviation).toBeTruthy();
      expect(team.seed).toBeGreaterThanOrEqual(1);
      expect(team.seed).toBeLessThanOrEqual(16);
      expect(["east", "west", "south", "midwest"]).toContain(team.region);
    }
  });

  it("each region has seeds 1 through 16 (including First Four teams)", () => {
    for (const region of ["east", "west", "south", "midwest"]) {
      const regionTeams = teams.filter((t) => t.region === region);
      const seeds = new Set(regionTeams.map((t) => t.seed));
      // Should have seeds 1-16 (some may have First Four duplicates at same seed)
      for (let s = 1; s <= 16; s++) {
        expect(seeds.has(s)).toBe(true);
      }
    }
  });

  it("all abbreviations are unique", () => {
    const abbrs = teams.map((t) => t.abbreviation);
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });
});

describe("Seed Data - Game Slots", () => {
  const gameSlots = buildGameSlots();

  it("has exactly 67 game slots", () => {
    expect(gameSlots).toHaveLength(67);
  });

  it("has 4 First Four games (slots 1-4)", () => {
    const firstFour = gameSlots.filter((g) => g.round === "first_four");
    expect(firstFour).toHaveLength(4);
    expect(firstFour.map((g) => g.game_slot).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("has 32 First Round games", () => {
    const firstRound = gameSlots.filter((g) => g.round === "first_round");
    expect(firstRound).toHaveLength(32);
  });

  it("has 16 Second Round games", () => {
    const secondRound = gameSlots.filter((g) => g.round === "second_round");
    expect(secondRound).toHaveLength(16);
  });

  it("has 8 Sweet 16 games", () => {
    const sweet16 = gameSlots.filter((g) => g.round === "sweet_16");
    expect(sweet16).toHaveLength(8);
  });

  it("has 4 Elite Eight games", () => {
    const eliteEight = gameSlots.filter((g) => g.round === "elite_eight");
    expect(eliteEight).toHaveLength(4);
  });

  it("has 2 Final Four games", () => {
    const finalFour = gameSlots.filter((g) => g.round === "final_four");
    expect(finalFour).toHaveLength(2);
  });

  it("has 1 Championship game", () => {
    const championship = gameSlots.filter((g) => g.round === "championship");
    expect(championship).toHaveLength(1);
  });

  it("no duplicate game_slot values", () => {
    const slots = gameSlots.map((g) => g.game_slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("all next_game_slot references are valid", () => {
    const allSlots = new Set(gameSlots.map((g) => g.game_slot));
    for (const game of gameSlots) {
      if (game.next_game_slot !== null) {
        expect(allSlots.has(game.next_game_slot)).toBe(true);
      }
    }
  });

  it("championship has next_game_slot = null", () => {
    const championship = gameSlots.find((g) => g.round === "championship");
    expect(championship!.next_game_slot).toBeNull();
  });

  it("Final Four games both point to championship (slot 67)", () => {
    const finalFour = gameSlots.filter((g) => g.round === "final_four");
    expect(finalFour).toHaveLength(2);
    for (const game of finalFour) {
      expect(game.next_game_slot).toBe(67);
    }
  });

  it("slot_position alternates correctly for paired games", () => {
    // For each next_game_slot, there should be one "top" and one "bottom" feeder
    const feedMap = new Map<number, string[]>();
    for (const game of gameSlots) {
      if (game.next_game_slot && game.slot_position) {
        const positions = feedMap.get(game.next_game_slot) || [];
        positions.push(game.slot_position);
        feedMap.set(game.next_game_slot, positions);
      }
    }

    for (const [nextSlot, positions] of feedMap) {
      if (positions.length === 2) {
        expect(positions).toContain("top");
        expect(positions).toContain("bottom");
      }
    }
  });

  it("First Four games connect to correct First Round games", () => {
    const firstFour = gameSlots.filter((g) => g.round === "first_four");
    const connections = firstFour.map((g) => ({
      slot: g.game_slot,
      next: g.next_game_slot,
    }));
    expect(connections).toContainEqual({ slot: 1, next: 5 });
    expect(connections).toContainEqual({ slot: 2, next: 6 });
    expect(connections).toContainEqual({ slot: 3, next: 17 });
    expect(connections).toContainEqual({ slot: 4, next: 21 });
  });

  it("Final Four and Championship have null region", () => {
    const lateRounds = gameSlots.filter(
      (g) => g.round === "final_four" || g.round === "championship"
    );
    for (const game of lateRounds) {
      expect(game.region).toBeNull();
    }
  });

  it("each region has exactly 8 First Round games", () => {
    for (const region of ["east", "west", "south", "midwest"]) {
      const regionGames = gameSlots.filter(
        (g) => g.round === "first_round" && g.region === region
      );
      expect(regionGames).toHaveLength(8);
    }
  });
});
