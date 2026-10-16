import { describe, it, expect } from "vitest";
import {
  REGION_ORDER,
  SEED_MATCHUPS,
  SLOT_RANGES,
  TOTAL_GAME_SLOTS,
  YEAR_DEFAULTS,
  buildGameSlots,
  eliteEightTarget,
  matchupIndexForSeed,
  positionFor,
  r1SlotFor,
  roundOfSlot,
} from "../tournament-structure";

const defaults = YEAR_DEFAULTS[2027];
const rows = buildGameSlots({ dates: defaults.dates, finalFourPairing: defaults.finalFourPairing });

describe("buildGameSlots", () => {
  it("produces 75 unique slots in order", () => {
    expect(rows).toHaveLength(TOTAL_GAME_SLOTS);
    expect(rows.map((r) => r.game_slot)).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
  });

  it("has the right number of games per round", () => {
    const count = (round: string) => rows.filter((r) => r.round === round).length;
    expect(count("first_four")).toBe(12);
    expect(count("first_round")).toBe(32);
    expect(count("second_round")).toBe(16);
    expect(count("sweet_16")).toBe(8);
    expect(count("elite_eight")).toBe(4);
    expect(count("final_four")).toBe(2);
    expect(count("championship")).toBe(1);
  });

  it("respects SLOT_RANGES for every row", () => {
    for (const r of rows) {
      const range = SLOT_RANGES[r.round];
      expect(r.game_slot).toBeGreaterThanOrEqual(range.start);
      expect(r.game_slot).toBeLessThanOrEqual(range.end);
      expect(roundOfSlot(r.game_slot)).toBe(r.round);
    }
  });

  it("feeds every R2+ slot from exactly one top and one bottom game", () => {
    const feeders = new Map<number, string[]>();
    for (const r of rows) {
      if (r.round === "first_four" || !r.next_game_slot) continue;
      const list = feeders.get(r.next_game_slot) ?? [];
      list.push(r.slot_position!);
      feeders.set(r.next_game_slot, list);
    }
    for (const r of rows) {
      if (r.game_slot < SLOT_RANGES.second_round.start) continue;
      expect(feeders.get(r.game_slot)?.sort()).toEqual(["bottom", "top"]);
    }
  });

  it("leaves opening-round rows unwired and ends at the championship", () => {
    for (const r of rows.slice(0, 12)) {
      expect(r.region).toBeNull();
      expect(r.next_game_slot).toBeNull();
      expect(r.slot_position).toBeNull();
    }
    const champ = rows[74];
    expect(champ.round).toBe("championship");
    expect(champ.next_game_slot).toBeNull();
    expect(rows[72].next_game_slot).toBe(75);
    expect(rows[73].next_game_slot).toBe(75);
  });

  it("applies dates per round and region", () => {
    expect(rows[0].scheduled_at).toBe(defaults.dates.openingRound[0]);
    expect(rows[11].scheduled_at).toBe(defaults.dates.openingRound[1]);
    const southS16 = rows.find((r) => r.round === "sweet_16" && r.region === "south")!;
    expect(southS16.scheduled_at).toBe(defaults.dates.sweet16.south);
    const eastE8 = rows.find((r) => r.round === "elite_eight" && r.region === "east")!;
    expect(eastE8.scheduled_at).toBe(defaults.dates.eliteEight.east);
    expect(rows[74].scheduled_at).toBe(defaults.dates.championship);
  });

  it("wires Elite Eight winners by the Final Four pairing", () => {
    const pairing = defaults.finalFourPairing; // [[east, west],[south, midwest]]
    const e8 = (region: string) => rows.find((r) => r.round === "elite_eight" && r.region === region)!;
    expect(e8("east")).toMatchObject({ next_game_slot: 73, slot_position: "top" });
    expect(e8("west")).toMatchObject({ next_game_slot: 73, slot_position: "bottom" });
    expect(e8("south")).toMatchObject({ next_game_slot: 74, slot_position: "top" });
    expect(e8("midwest")).toMatchObject({ next_game_slot: 74, slot_position: "bottom" });
    expect(eliteEightTarget("midwest", pairing)).toEqual({ next_game_slot: 74, slot_position: "bottom" });
    expect(() => eliteEightTarget("east", [["west", "south"], ["midwest", "west"]])).toThrow();
  });
});

describe("seed helpers", () => {
  it("maps seeds to first-round slots", () => {
    expect(r1SlotFor("east", 1)).toBe(13);
    expect(r1SlotFor("east", 16)).toBe(13);
    expect(r1SlotFor("east", 9)).toBe(14);
    expect(r1SlotFor("west", 11)).toBe(25);
    expect(r1SlotFor("south", 5)).toBe(31);
    expect(r1SlotFor("midwest", 15)).toBe(44);
  });

  it("puts the better seed on top", () => {
    for (const [top, bottom] of SEED_MATCHUPS) {
      expect(positionFor(top)).toBe("top");
      expect(positionFor(bottom)).toBe("bottom");
    }
  });

  it("rejects seeds outside 1..16", () => {
    expect(() => matchupIndexForSeed(0)).toThrow();
    expect(() => matchupIndexForSeed(17)).toThrow();
    expect(() => r1SlotFor("east", 99)).toThrow();
    expect(() => roundOfSlot(76)).toThrow();
  });

  it("keeps region order stable", () => {
    expect(REGION_ORDER).toEqual(["east", "west", "south", "midwest"]);
  });
});

describe("YEAR_DEFAULTS", () => {
  it("puts Selection Sunday before the Opening Round and the lock for every year", () => {
    for (const d of Object.values(YEAR_DEFAULTS)) {
      expect(d.selectionSunday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const sunday = new Date(`${d.selectionSunday}T23:59:59Z`);
      expect(sunday.getUTCDay()).toBe(0);
      expect(sunday.getTime()).toBeLessThan(new Date(d.dates.openingRound[0]).getTime());
      expect(sunday.getTime()).toBeLessThan(new Date(d.lockDeadline).getTime());
    }
  });
});
