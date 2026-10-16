import { create } from "zustand";
import type { Round } from "@/types";

export interface BracketPick {
  gameSlot: number;
  round: Round;
  pickedTeamId: number;
}

interface BracketState {
  picks: Map<number, BracketPick>;
  bracketName: string;
  isDirty: boolean;
  /** Snapshot of `picks` before the last user action, for single-level undo. */
  previousPicks: Map<number, BracketPick> | null;

  setPick: (gameSlot: number, round: Round, pickedTeamId: number) => void;
  /** Merge several picks at once (fill helpers). Marks dirty. */
  setPicks: (picks: BracketPick[]) => void;
  removePick: (gameSlot: number) => void;
  /** Clears downstream picks of `oldTeamId`; returns how many were cleared. */
  clearDownstreamPicks: (
    gameSlot: number,
    oldTeamId: number,
    allGames: GameSlotInfo[]
  ) => number;
  setBracketName: (name: string) => void;
  loadPicks: (picks: BracketPick[]) => void;
  /** Load server state (picks + name) without marking the bracket dirty. */
  hydrate: (data: { picks: BracketPick[]; bracketName?: string }) => void;
  /** Remember the current picks so the next `undo()` restores them. */
  pushUndo: () => void;
  /** Restore the snapshot taken by `pushUndo()`. No-op without one. */
  undo: () => void;
  /** Mark the current state as persisted (after a successful save). */
  markClean: () => void;
  /** Mark the current state as unsaved (after restoring a local draft). */
  markDirty: () => void;
  reset: () => void;
}

export interface GameSlotInfo {
  gameSlot: number;
  nextGameSlot: number | null;
  round: Round;
}

// Find all downstream game slots that would be affected by changing a pick
function findDownstreamSlots(
  gameSlot: number,
  allGames: GameSlotInfo[]
): number[] {
  const gameMap = new Map(allGames.map((g) => [g.gameSlot, g]));
  const game = gameMap.get(gameSlot);
  if (!game || !game.nextGameSlot) return [];

  const downstream: number[] = [game.nextGameSlot];
  const nextGame = gameMap.get(game.nextGameSlot);
  if (nextGame) {
    downstream.push(...findDownstreamSlots(game.nextGameSlot, allGames));
  }
  return downstream;
}

function toMap(picks: BracketPick[]): Map<number, BracketPick> {
  const pickMap = new Map<number, BracketPick>();
  for (const pick of picks) {
    pickMap.set(pick.gameSlot, pick);
  }
  return pickMap;
}

export const useBracketStore = create<BracketState>((set, get) => ({
  picks: new Map(),
  bracketName: "My Bracket",
  isDirty: false,
  previousPicks: null,

  setPick: (gameSlot, round, pickedTeamId) => {
    set((state) => {
      const picks = new Map(state.picks);
      picks.set(gameSlot, { gameSlot, round, pickedTeamId });
      return { picks, isDirty: true };
    });
  },

  setPicks: (newPicks) => {
    if (newPicks.length === 0) return;
    set((state) => {
      const picks = new Map(state.picks);
      for (const pick of newPicks) picks.set(pick.gameSlot, pick);
      return { picks, isDirty: true };
    });
  },

  removePick: (gameSlot) => {
    set((state) => {
      const picks = new Map(state.picks);
      picks.delete(gameSlot);
      return { picks, isDirty: true };
    });
  },

  clearDownstreamPicks: (gameSlot, oldTeamId, allGames) => {
    const downstream = findDownstreamSlots(gameSlot, allGames);
    let cleared = 0;
    set((state) => {
      const picks = new Map(state.picks);
      for (const slot of downstream) {
        const downstreamPick = picks.get(slot);
        // Only clear if the downstream pick was for the team being replaced
        if (downstreamPick && downstreamPick.pickedTeamId === oldTeamId) {
          picks.delete(slot);
          cleared++;
        }
      }
      return { picks, isDirty: true };
    });
    return cleared;
  },

  setBracketName: (name) => set({ bracketName: name, isDirty: true }),

  loadPicks: (picks) => {
    set({ picks: toMap(picks), isDirty: false, previousPicks: null });
  },

  hydrate: ({ picks, bracketName }) => {
    set((state) => ({
      picks: toMap(picks),
      bracketName: bracketName ?? state.bracketName,
      isDirty: false,
      previousPicks: null,
    }));
  },

  pushUndo: () => set((state) => ({ previousPicks: new Map(state.picks) })),

  undo: () => {
    const { previousPicks } = get();
    if (!previousPicks) return;
    set({ picks: new Map(previousPicks), previousPicks: null, isDirty: true });
  },

  markClean: () => set({ isDirty: false }),

  markDirty: () => set({ isDirty: true }),

  reset: () =>
    set({
      picks: new Map(),
      bracketName: "My Bracket",
      isDirty: false,
      previousPicks: null,
    }),
}));
