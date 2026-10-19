import { describe, it, expect } from "vitest";
import { validatePicks, countablePicks, type GameTree } from "../validate-picks";
import { buildGameSlots, YEAR_DEFAULTS } from "../tournament-structure";

/** The real 75-slot skeleton with made-up team ids: first-round game N has teams N*10 and N*10+1; play-in slot P has P*1000 / P*1000+1. */
function skeleton(): GameTree[] {
  const rows = buildGameSlots({ dates: YEAR_DEFAULTS[2027].dates, finalFourPairing: YEAR_DEFAULTS[2027].finalFourPairing });
  const out = rows.map((r) => {
    const g: GameTree = {
      gameSlot: r.game_slot,
      round: r.round,
      nextGameSlot: r.next_game_slot,
      teamAId: null,
      teamBId: null,
    };
    if (r.round === "first_four") {
      g.teamAId = r.game_slot * 1000;
      g.teamBId = r.game_slot * 1000 + 1;
    } else if (r.round === "first_round") {
      g.teamAId = r.game_slot * 10;
      g.teamBId = r.game_slot * 10 + 1;
    }
    return g;
  });
  // The importer points each play-in at the first-round game it feeds, whose
  // corresponding side stays TBD until the play-in is final.
  for (const g of out) {
    if (g.round !== "first_four") continue;
    g.nextGameSlot = 12 + g.gameSlot;
    out.find((x) => x.gameSlot === g.nextGameSlot)!.teamAId = null;
  }
  return out;
}

const games = skeleton();
const bySlot = new Map(games.map((g) => [g.gameSlot, g]));
const pick = (game_slot: number, picked_team_id: number) => ({ game_slot, picked_team_id });

/** Chalk-ish full bracket: every game's top side wins. */
function fullBracket() {
  const picks: { game_slot: number; picked_team_id: number }[] = [];
  const winner = new Map<number, number>();
  for (let slot = 13; slot <= 75; slot++) {
    const g = bySlot.get(slot)!;
    let team: number;
    if (g.round === "first_round") team = g.teamAId ?? g.teamBId!;
    else {
      const feeders = games.filter((x) => x.nextGameSlot === slot).sort((a, b) => a.gameSlot - b.gameSlot);
      team = winner.get(feeders[0].gameSlot)!;
    }
    winner.set(slot, team);
    picks.push(pick(slot, team));
  }
  return picks;
}

describe("validatePicks", () => {
  it("accepts a complete, consistent bracket and takes round from the games table", () => {
    const res = validatePicks(fullBracket(), games);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.picks).toHaveLength(63);
    expect(res.picks.find((p) => p.gameSlot === 75)?.round).toBe("championship");
    expect(countablePicks(res.picks)).toBe(63);
  });

  it("accepts a partial draft built from the first round up", () => {
    const r1 = bySlot.get(30)!;
    const res = validatePicks([pick(30, r1.teamBId!)], games);
    expect(res.ok).toBe(true);
  });

  it("rejects play-in slots and out-of-range slots", () => {
    expect(validatePicks([pick(1, 1000)], games)).toEqual({ ok: false, error: "Invalid game slot 1" });
    expect(validatePicks([pick(76, 1)], games)).toEqual({ ok: false, error: "Invalid game slot 76" });
    expect(validatePicks([pick(NaN, 1)], games).ok).toBe(false);
  });

  it("rejects a first-round pick that isn't one of the game's sides", () => {
    const res = validatePicks([pick(30, 999)], games);
    expect(res).toEqual({ ok: false, error: "Team 999 can't be picked in game 30" });
  });

  it("lets either play-in team be picked in the first-round game it feeds", () => {
    const playIn = games.find((g) => g.round === "first_four")!;
    const target = bySlot.get(playIn.nextGameSlot!)!;
    expect(validatePicks([pick(target.gameSlot, playIn.teamAId!)], games).ok).toBe(true);
    expect(validatePicks([pick(target.gameSlot, playIn.teamBId!)], games).ok).toBe(true);
  });

  it("rejects a hedge: a team advanced into a game it didn't win its way into", () => {
    const g13 = bySlot.get(30)!;
    const next = g13.nextGameSlot!;
    // Pick team B in slot 13, then try to advance team A to the next round.
    const res = validatePicks([pick(30, g13.teamBId!), pick(next, g13.teamAId!)], games);
    expect(res.ok).toBe(false);
  });

  it("rejects a later-round pick whose feeder game is unpicked", () => {
    const g13 = bySlot.get(30)!;
    const res = validatePicks([pick(g13.nextGameSlot!, g13.teamAId!)], games);
    expect(res.ok).toBe(false);
  });

  it("rejects duplicate and unknown slots", () => {
    const g13 = bySlot.get(30)!;
    expect(validatePicks([pick(30, g13.teamAId!), pick(30, g13.teamBId!)], games)).toEqual({
      ok: false,
      error: "Duplicate pick for game 30",
    });
    expect(validatePicks([pick(30, g13.teamAId!)], games.filter((g) => g.gameSlot !== 30))).toEqual({
      ok: false,
      error: "Unknown game slot 30",
    });
  });
});
