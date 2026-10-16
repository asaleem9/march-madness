import { describe, it, expect } from "vitest";
import {
  countRequiredPicks,
  isBracketComplete,
  summarizePicks,
  formatEastern,
  formatEasternTime,
  easternDateKey,
  todaysGames,
  isWithinHours,
  pickOutcome,
} from "../helpers";
import type { Round } from "@/types";

const pick = (round: Round) => ({ round });

describe("countRequiredPicks / isBracketComplete", () => {
  it("ignores Opening Round (first_four) picks", () => {
    const picks = [
      pick("first_four"),
      pick("first_four"),
      pick("first_round"),
      pick("second_round"),
      pick("championship"),
    ];
    expect(countRequiredPicks(picks)).toBe(3);
  });

  it("needs 63 non-play-in picks for a complete bracket", () => {
    const sixtyTwo = Array.from({ length: 62 }, () => pick("first_round"));
    expect(isBracketComplete([...sixtyTwo, pick("first_four")])).toBe(false);
    expect(isBracketComplete([...sixtyTwo, pick("championship")])).toBe(true);
  });
});

describe("summarizePicks", () => {
  it("counts correct vs decided picks, skipping undecided ones", () => {
    expect(
      summarizePicks([
        { is_correct: true },
        { is_correct: false },
        { is_correct: null },
        { is_correct: true },
      ])
    ).toEqual({ correct: 2, scored: 3 });
  });
});

describe("Eastern-time formatting", () => {
  it("formats the lock deadline in ET with the zone", () => {
    // 2027-03-18T16:00Z is noon EDT (DST starts Mar 14, 2027).
    const text = formatEastern("2027-03-18T16:00:00Z");
    expect(text).toContain("Mar 18");
    expect(text).toContain("12:00 PM");
    expect(text).toContain("EDT");
  });

  it("formats a tip time", () => {
    expect(formatEasternTime("2027-03-18T23:15:00Z")).toBe("7:15 PM EDT");
  });

  it("returns TBD for garbage input", () => {
    expect(formatEastern("not-a-date")).toBe("TBD");
    expect(formatEasternTime("")).toBe("TBD");
  });

  it("maps a UTC instant to the Eastern calendar day", () => {
    // 3:30 UTC on the 19th is still 11:30 PM on the 18th in New York.
    expect(easternDateKey("2027-03-19T03:30:00Z")).toBe("2027-03-18");
    expect(easternDateKey("2027-03-19T04:30:00Z")).toBe("2027-03-19");
    expect(easternDateKey("nope")).toBeNull();
  });
});

describe("todaysGames", () => {
  const games = [
    { id: 1, scheduled_at: "2027-03-19T03:30:00Z" }, // Mar 18 ET, late tip
    { id: 2, scheduled_at: "2027-03-18T16:15:00Z" }, // Mar 18 ET, noon
    { id: 3, scheduled_at: "2027-03-19T16:00:00Z" }, // Mar 19 ET
    { id: 4, scheduled_at: null },
  ];

  it("keeps only games on today's Eastern date, earliest first", () => {
    const now = new Date("2027-03-18T20:00:00Z");
    expect(todaysGames(games, now).map((g) => g.id)).toEqual([2, 1]);
  });

  it("uses the Eastern day even when UTC has rolled over", () => {
    const now = new Date("2027-03-19T02:00:00Z"); // 10 PM ET on the 18th
    expect(todaysGames(games, now).map((g) => g.id)).toEqual([2, 1]);
  });

  it("returns an empty list on an off day", () => {
    expect(todaysGames(games, new Date("2027-03-22T18:00:00Z"))).toEqual([]);
  });
});

describe("isWithinHours", () => {
  const now = new Date("2027-03-18T00:00:00Z");
  it("is true only for a future deadline closer than the window", () => {
    expect(isWithinHours("2027-03-18T12:00:00Z", 24, now)).toBe(true);
    expect(isWithinHours("2027-03-19T12:00:00Z", 24, now)).toBe(false);
    expect(isWithinHours("2027-03-17T12:00:00Z", 24, now)).toBe(false);
    expect(isWithinHours(null, 24, now)).toBe(false);
  });
});

describe("pickOutcome", () => {
  it("is pending until the game is final with a winner", () => {
    expect(pickOutcome({ status: "scheduled", winner_id: null }, 5)).toBe("pending");
    expect(pickOutcome({ status: "in_progress", winner_id: null }, 5)).toBe("pending");
    expect(pickOutcome({ status: "final", winner_id: null }, 5)).toBe("pending");
    expect(pickOutcome({ status: "final", winner_id: 5 }, undefined)).toBe("pending");
  });
  it("marks correct and wrong picks", () => {
    expect(pickOutcome({ status: "final", winner_id: 5 }, 5)).toBe("correct");
    expect(pickOutcome({ status: "final", winner_id: 6 }, 5)).toBe("wrong");
  });
});
