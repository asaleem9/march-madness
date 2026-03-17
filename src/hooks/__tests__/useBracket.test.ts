import { describe, it, expect, beforeEach } from "vitest";
import { useBracketStore } from "../useBracket";
import type { Round } from "@/types";

// Helper to build a simple game slot chain for testing downstream clearing
function buildGameChain() {
  return [
    { gameSlot: 1, nextGameSlot: 5, round: "first_round" as Round },
    { gameSlot: 2, nextGameSlot: 5, round: "first_round" as Round },
    { gameSlot: 3, nextGameSlot: 6, round: "first_round" as Round },
    { gameSlot: 4, nextGameSlot: 6, round: "first_round" as Round },
    { gameSlot: 5, nextGameSlot: 7, round: "second_round" as Round },
    { gameSlot: 6, nextGameSlot: 7, round: "second_round" as Round },
    { gameSlot: 7, nextGameSlot: null, round: "sweet_16" as Round },
  ];
}

describe("useBracketStore", () => {
  beforeEach(() => {
    useBracketStore.getState().reset();
  });

  describe("setPick", () => {
    it("sets a new pick", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      const pick = useBracketStore.getState().picks.get(1);
      expect(pick).toBeDefined();
      expect(pick!.gameSlot).toBe(1);
      expect(pick!.round).toBe("first_round");
      expect(pick!.pickedTeamId).toBe(101);
    });

    it("overwrites existing pick for same slot", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(1, "first_round", 202);
      const pick = useBracketStore.getState().picks.get(1);
      expect(pick!.pickedTeamId).toBe(202);
    });

    it("sets isDirty to true", () => {
      expect(useBracketStore.getState().isDirty).toBe(false);
      useBracketStore.getState().setPick(1, "first_round", 101);
      expect(useBracketStore.getState().isDirty).toBe(true);
    });

    it("preserves other picks when setting a new one", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(2, "first_round", 202);
      expect(useBracketStore.getState().picks.get(1)!.pickedTeamId).toBe(101);
      expect(useBracketStore.getState().picks.get(2)!.pickedTeamId).toBe(202);
    });
  });

  describe("removePick", () => {
    it("removes existing pick", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().removePick(1);
      expect(useBracketStore.getState().picks.has(1)).toBe(false);
    });

    it("no-op if slot doesn't exist (no crash)", () => {
      expect(() => {
        useBracketStore.getState().removePick(999);
      }).not.toThrow();
    });

    it("sets isDirty to true", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.setState({ isDirty: false });
      useBracketStore.getState().removePick(1);
      expect(useBracketStore.getState().isDirty).toBe(true);
    });
  });

  describe("clearDownstreamPicks", () => {
    it("clears next game slot pick when it matches old team", () => {
      const games = buildGameChain();
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(5, "second_round", 101);

      useBracketStore.getState().clearDownstreamPicks(1, 101, games);
      expect(useBracketStore.getState().picks.has(5)).toBe(false);
    });

    it("does not clear downstream pick for a different team", () => {
      const games = buildGameChain();
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(5, "second_round", 202); // picked the other team

      useBracketStore.getState().clearDownstreamPicks(1, 101, games);
      // Slot 5 pick was for team 202, not 101 — should NOT be cleared
      expect(useBracketStore.getState().picks.has(5)).toBe(true);
    });

    it("clears recursively through multiple rounds", () => {
      const games = buildGameChain();
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(5, "second_round", 101);
      useBracketStore.getState().setPick(7, "sweet_16", 101);

      useBracketStore.getState().clearDownstreamPicks(1, 101, games);
      expect(useBracketStore.getState().picks.has(5)).toBe(false);
      expect(useBracketStore.getState().picks.has(7)).toBe(false);
    });

    it("does not clear picks in unrelated branches", () => {
      const games = buildGameChain();
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(3, "first_round", 301);
      useBracketStore.getState().setPick(6, "second_round", 301);

      useBracketStore.getState().clearDownstreamPicks(1, 101, games);
      expect(useBracketStore.getState().picks.has(6)).toBe(true);
      expect(useBracketStore.getState().picks.has(3)).toBe(true);
    });

    it("no-op if game has no nextGameSlot (championship)", () => {
      const games = buildGameChain();
      useBracketStore.getState().setPick(7, "sweet_16", 101);

      useBracketStore.getState().clearDownstreamPicks(7, 101, games);
      expect(useBracketStore.getState().picks.has(7)).toBe(true);
    });

    it("works with empty picks map (no crash)", () => {
      const games = buildGameChain();
      expect(() => {
        useBracketStore.getState().clearDownstreamPicks(1, 101, games);
      }).not.toThrow();
    });
  });

  describe("loadPicks", () => {
    it("loads array of picks into Map", () => {
      useBracketStore.getState().loadPicks([
        { gameSlot: 1, round: "first_round", pickedTeamId: 101 },
        { gameSlot: 2, round: "first_round", pickedTeamId: 202 },
        { gameSlot: 5, round: "second_round", pickedTeamId: 101 },
      ]);
      expect(useBracketStore.getState().picks.size).toBe(3);
    });

    it("sets isDirty to false", () => {
      useBracketStore.getState().setPick(1, "first_round", 101); // makes dirty
      useBracketStore.getState().loadPicks([
        { gameSlot: 1, round: "first_round", pickedTeamId: 101 },
      ]);
      expect(useBracketStore.getState().isDirty).toBe(false);
    });

    it("replaces existing picks entirely", () => {
      useBracketStore.getState().setPick(99, "championship", 999);
      useBracketStore.getState().loadPicks([
        { gameSlot: 1, round: "first_round", pickedTeamId: 101 },
      ]);
      expect(useBracketStore.getState().picks.has(99)).toBe(false);
      expect(useBracketStore.getState().picks.has(1)).toBe(true);
    });

    it("loads empty array", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().loadPicks([]);
      expect(useBracketStore.getState().picks.size).toBe(0);
    });
  });

  describe("setBracketName", () => {
    it("updates bracket name", () => {
      useBracketStore.getState().setBracketName("Championship Picks");
      expect(useBracketStore.getState().bracketName).toBe("Championship Picks");
    });

    it("sets isDirty to true", () => {
      expect(useBracketStore.getState().isDirty).toBe(false);
      useBracketStore.getState().setBracketName("New Name");
      expect(useBracketStore.getState().isDirty).toBe(true);
    });
  });

  describe("reset", () => {
    it("clears all picks", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      useBracketStore.getState().setPick(2, "first_round", 202);
      useBracketStore.getState().reset();
      expect(useBracketStore.getState().picks.size).toBe(0);
    });

    it("resets bracket name to default", () => {
      useBracketStore.getState().setBracketName("Custom");
      useBracketStore.getState().reset();
      expect(useBracketStore.getState().bracketName).toBe("My Bracket");
    });

    it("sets isDirty to false", () => {
      useBracketStore.getState().setPick(1, "first_round", 101);
      expect(useBracketStore.getState().isDirty).toBe(true);
      useBracketStore.getState().reset();
      expect(useBracketStore.getState().isDirty).toBe(false);
    });
  });
});
