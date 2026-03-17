import { describe, it, expect } from "vitest";
import {
  getRoundPoints,
  isUpset,
  formatDate,
  formatTime,
  cn,
  DEFAULT_SCORING,
  ROUND_DISPLAY_NAMES,
  REGION_DISPLAY_NAMES,
} from "../utils";
import type { Round, ScoringMultipliers } from "@/types";

describe("getRoundPoints", () => {
  it("returns 5 for first_four (hardcoded)", () => {
    expect(getRoundPoints("first_four")).toBe(5);
  });

  it("returns 10 for first_round with default scoring", () => {
    expect(getRoundPoints("first_round")).toBe(10);
  });

  it("returns 20 for second_round", () => {
    expect(getRoundPoints("second_round")).toBe(20);
  });

  it("returns 40 for sweet_16", () => {
    expect(getRoundPoints("sweet_16")).toBe(40);
  });

  it("returns 80 for elite_eight", () => {
    expect(getRoundPoints("elite_eight")).toBe(80);
  });

  it("returns 160 for final_four", () => {
    expect(getRoundPoints("final_four")).toBe(160);
  });

  it("returns 320 for championship", () => {
    expect(getRoundPoints("championship")).toBe(320);
  });

  it("uses custom multipliers when provided", () => {
    const custom: ScoringMultipliers = {
      first_round: 25,
      second_round: 50,
      sweet_16: 100,
      elite_eight: 200,
      final_four: 400,
      championship: 800,
    };
    expect(getRoundPoints("first_round", custom)).toBe(25);
    expect(getRoundPoints("championship", custom)).toBe(800);
  });

  it("first_four ignores custom multipliers", () => {
    const custom: ScoringMultipliers = {
      first_round: 999,
      second_round: 999,
      sweet_16: 999,
      elite_eight: 999,
      final_four: 999,
      championship: 999,
    };
    expect(getRoundPoints("first_four", custom)).toBe(5);
  });
});

describe("isUpset", () => {
  it("returns true when higher seed beats lower seed", () => {
    expect(isUpset(12, 5)).toBe(true);
  });

  it("returns false when lower seed beats higher seed (chalk)", () => {
    expect(isUpset(1, 16)).toBe(false);
  });

  it("returns false when seeds are equal", () => {
    expect(isUpset(8, 8)).toBe(false);
  });

  it("returns true for one-seed difference upset", () => {
    expect(isUpset(9, 8)).toBe(true);
  });

  it("returns true for large upset (16 beats 1)", () => {
    expect(isUpset(16, 1)).toBe(true);
  });
});

describe("formatDate", () => {
  it("formats a Date object", () => {
    const result = formatDate(new Date("2026-03-19T00:00:00Z"));
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
  });

  it("formats an ISO string", () => {
    const result = formatDate("2026-03-19T12:00:00Z");
    expect(result).toContain("2026");
  });
});

describe("formatTime", () => {
  it("returns formatted time with AM/PM", () => {
    const result = formatTime(new Date("2026-03-19T18:00:00Z"));
    expect(result).toMatch(/\d{1,2}:\d{2}\s[AP]M/);
  });
});

describe("cn", () => {
  it("joins multiple string classes", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, "b", null, undefined)).toBe("a b");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });

  it("handles all falsy values", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("handles single class", () => {
    expect(cn("only")).toBe("only");
  });
});

describe("DEFAULT_SCORING", () => {
  it("has correct default values", () => {
    expect(DEFAULT_SCORING).toEqual({
      first_round: 10,
      second_round: 20,
      sweet_16: 40,
      elite_eight: 80,
      final_four: 160,
      championship: 320,
    });
  });
});

describe("ROUND_DISPLAY_NAMES", () => {
  it("maps all 7 rounds", () => {
    const rounds: Round[] = [
      "first_four",
      "first_round",
      "second_round",
      "sweet_16",
      "elite_eight",
      "final_four",
      "championship",
    ];
    for (const round of rounds) {
      expect(ROUND_DISPLAY_NAMES[round]).toBeDefined();
      expect(typeof ROUND_DISPLAY_NAMES[round]).toBe("string");
    }
  });

  it("has correct display names", () => {
    expect(ROUND_DISPLAY_NAMES.first_four).toBe("First Four");
    expect(ROUND_DISPLAY_NAMES.championship).toBe("Championship");
    expect(ROUND_DISPLAY_NAMES.sweet_16).toBe("Sweet 16");
  });
});

describe("REGION_DISPLAY_NAMES", () => {
  it("maps all 4 regions", () => {
    expect(REGION_DISPLAY_NAMES.east).toBe("East");
    expect(REGION_DISPLAY_NAMES.west).toBe("West");
    expect(REGION_DISPLAY_NAMES.south).toBe("South");
    expect(REGION_DISPLAY_NAMES.midwest).toBe("Midwest");
  });
});
