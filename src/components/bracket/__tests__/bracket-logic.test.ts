import { describe, it, expect } from "vitest";
import { mockGame, mockTeam } from "@/test/helpers";
import {
  buildTeamMap,
  resolveSpeculativeTeams,
  fillRemainingPicks,
  gamesForStep,
  roundBreakdown,
} from "../bracket-logic";
import type { GameWithTeams } from "@/types";

// A single East half-region: R1 slots 13/14 → R2 slot 45, plus a play-in
// (slot 1) feeding the bottom of slot 14.
const duke = mockTeam({ id: 101, name: "Duke", abbreviation: "DUKE", seed: 1 });
const lehigh = mockTeam({ id: 102, name: "Lehigh", abbreviation: "LEH", seed: 16 });
const nova = mockTeam({ id: 103, name: "Villanova", abbreviation: "NOVA", seed: 8 });
const tex = mockTeam({ id: 201, name: "Texas", abbreviation: "TEX", seed: 9 });
const ncst = mockTeam({ id: 202, name: "NC State", abbreviation: "NCST", seed: 9 });

function games(overrides: Partial<Record<number, Partial<GameWithTeams>>> = {}): GameWithTeams[] {
  const base: GameWithTeams[] = [
    mockGame({ id: 1, gameSlot: 1, round: "first_four", region: "east", nextGameSlot: 14, slotPosition: "bottom", teamA: tex, teamB: ncst }),
    mockGame({ id: 13, gameSlot: 13, round: "first_round", region: "east", nextGameSlot: 45, slotPosition: "top", teamA: duke, teamB: lehigh }),
    mockGame({ id: 14, gameSlot: 14, round: "first_round", region: "east", nextGameSlot: 45, slotPosition: "bottom", teamA: nova, teamB: null }),
    mockGame({ id: 45, gameSlot: 45, round: "second_round", region: "east", nextGameSlot: 61, slotPosition: "top", teamA: null, teamB: null }),
    mockGame({ id: 61, gameSlot: 61, round: "sweet_16", region: "east", nextGameSlot: 69, slotPosition: "top", teamA: null, teamB: null }),
  ];
  return base.map((g) => ({ ...g, ...(overrides[g.gameSlot] ?? {}) }));
}

describe("resolveSpeculativeTeams", () => {
  it("advances picked winners into empty downstream slots", () => {
    const gs = games();
    const picks = new Map([
      [13, 101],
      [14, 103],
      [45, 101],
    ]);
    const resolved = resolveSpeculativeTeams(gs, picks, buildTeamMap(gs));
    expect(resolved.get(45)!.teamA?.id).toBe(101);
    expect(resolved.get(45)!.teamB?.id).toBe(103);
    expect(resolved.get(61)!.teamA?.id).toBe(101);
    expect(resolved.get(45)!.ghostPick).toBeUndefined();
  });

  it("accepts a play-in team as a valid pick and advances it", () => {
    const gs = games();
    const picks = new Map([[14, 201]]); // Texas, still playing its play-in
    const resolved = resolveSpeculativeTeams(gs, picks, buildTeamMap(gs));
    expect(resolved.get(14)!.ghostPick).toBeUndefined();
    expect(resolved.get(45)!.teamB?.id).toBe(201);
  });

  it("flags a pick on a play-in loser as lostPlayIn and does not advance it", () => {
    const gs = games({
      1: { status: "final", winnerId: 202, scoreA: 60, scoreB: 70 },
      14: { teamB: ncst, teamBId: 202 },
    });
    const picks = new Map([
      [14, 201],
      [45, 201],
    ]);
    const resolved = resolveSpeculativeTeams(gs, picks, buildTeamMap(gs));
    const ghost = resolved.get(14)!.ghostPick;
    expect(ghost?.team.id).toBe(201);
    expect(ghost?.lostPlayIn).toBe(true);
    expect(ghost?.side).toBe("bottom");
    expect(resolved.get(45)!.teamB).toBeNull();
    // The downstream pick on the same dead team is a plain ghost too.
    expect(resolved.get(45)!.ghostPick?.team.id).toBe(201);
    expect(resolved.get(45)!.ghostPick?.lostPlayIn).toBe(false);
  });

  it("marks an eliminated pick as a ghost once the DB has advanced the real winner", () => {
    const dukeOut = { ...duke, eliminated: true };
    const gs = games({
      13: { teamA: dukeOut, status: "final", winnerId: 102, scoreA: 50, scoreB: 60 },
      45: { teamA: lehigh, teamAId: 102 },
    });
    const picks = new Map([
      [13, 101],
      [45, 101],
      [61, 101],
    ]);
    const resolved = resolveSpeculativeTeams(gs, picks, buildTeamMap(gs));
    // R1 tile: Duke is still one of the slot's teams — not a ghost, just wrong.
    expect(resolved.get(13)!.ghostPick).toBeUndefined();
    // R2: Lehigh sits on top where Duke was picked.
    expect(resolved.get(45)!.teamA?.id).toBe(102);
    expect(resolved.get(45)!.ghostPick?.team.id).toBe(101);
    expect(resolved.get(45)!.ghostPick?.side).toBe("top");
    // Duke must not be propagated to the Sweet 16 as a live team.
    expect(resolved.get(61)!.teamA).toBeNull();
    expect(resolved.get(61)!.ghostPick?.team.id).toBe(101);
  });
});

describe("fillRemainingPicks", () => {
  it("fills only empty slots with the better seed, top on ties", () => {
    const gs = games();
    const picks = new Map([[13, 102]]); // user already took Lehigh over Duke
    const added = fillRemainingPicks(gs, picks, gamesForStep(gs, "east"), buildTeamMap(gs));
    const bySlot = new Map(added.map((p) => [p.gameSlot, p.pickedTeamId]));
    expect(bySlot.has(13)).toBe(false); // existing pick untouched
    expect(bySlot.get(14)).toBe(103); // Nova (8) over the play-in 9s
    expect(bySlot.get(45)).toBe(103); // Nova (8) over Lehigh (16)
    expect(bySlot.get(61)).toBe(103); // only one known team → take it
    expect(added.map((p) => p.round)).toEqual(["first_round", "second_round", "sweet_16"]);
  });

  it("breaks seed ties toward the top team", () => {
    const nineA = mockTeam({ id: 301, seed: 9 });
    const nineB = mockTeam({ id: 302, seed: 9 });
    const gs = [mockGame({ gameSlot: 20, round: "first_round", region: "east", teamA: nineA, teamB: nineB, nextGameSlot: null })];
    const added = fillRemainingPicks(gs, new Map(), gs, buildTeamMap(gs));
    expect(added).toEqual([{ gameSlot: 20, round: "first_round", pickedTeamId: 301 }]);
  });

  it("returns nothing when every slot is picked", () => {
    const gs = games();
    const picks = new Map([
      [13, 101],
      [14, 103],
      [45, 101],
      [61, 101],
    ]);
    expect(fillRemainingPicks(gs, picks, gamesForStep(gs, "east"), buildTeamMap(gs))).toEqual([]);
  });
});

describe("gamesForStep", () => {
  it("excludes the Opening Round and groups the Final Four with the title game", () => {
    const gs = [
      ...games(),
      mockGame({ gameSlot: 73, round: "final_four", region: null, teamA: null, teamB: null }),
      mockGame({ gameSlot: 75, round: "championship", region: null, teamA: null, teamB: null, nextGameSlot: null }),
    ];
    expect(gamesForStep(gs, "east").map((g) => g.gameSlot)).toEqual([13, 14, 45, 61]);
    expect(gamesForStep(gs, "final_four").map((g) => g.gameSlot)).toEqual([73, 75]);
  });
});

describe("roundBreakdown", () => {
  it("counts correct/decided/total and sums points per round", () => {
    const gs = games({
      13: { status: "final", winnerId: 101 },
      14: { status: "final", winnerId: 103 },
    });
    const rows = roundBreakdown(
      [
        { gameSlot: 13, round: "first_round", pickedTeamId: 101, pointsEarned: 10 },
        { gameSlot: 14, round: "first_round", pickedTeamId: 201, pointsEarned: 0 },
        { gameSlot: 45, round: "second_round", pickedTeamId: 101, pointsEarned: 0 },
      ],
      gs
    );
    const r1 = rows.find((r) => r.round === "first_round")!;
    expect(r1).toEqual({ round: "first_round", correct: 1, decided: 2, total: 2, points: 10 });
    const r2 = rows.find((r) => r.round === "second_round")!;
    expect(r2).toEqual({ round: "second_round", correct: 0, decided: 0, total: 1, points: 0 });
    expect(rows).toHaveLength(6);
  });
});
