import { create } from "zustand";
import type { Round } from "@/types";

interface BracketPick {
  gameSlot: number;
  round: Round;
  pickedTeamId: number;
}

interface BracketState {
  picks: Map<number, BracketPick>;
  bracketName: string;
  isDirty: boolean;

  setPick: (gameSlot: number, round: Round, pickedTeamId: number) => void;
  removePick: (gameSlot: number) => void;
  clearDownstreamPicks: (gameSlot: number, allGames: GameSlotInfo[]) => void;
  setBracketName: (name: string) => void;
  loadPicks: (picks: BracketPick[]) => void;
  reset: () => void;
}

interface GameSlotInfo {
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

export const useBracketStore = create<BracketState>((set, get) => ({
  picks: new Map(),
  bracketName: "My Bracket",
  isDirty: false,

  setPick: (gameSlot, round, pickedTeamId) => {
    set((state) => {
      const picks = new Map(state.picks);
      picks.set(gameSlot, { gameSlot, round, pickedTeamId });
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

  clearDownstreamPicks: (gameSlot, allGames) => {
    const downstream = findDownstreamSlots(gameSlot, allGames);
    set((state) => {
      const picks = new Map(state.picks);
      // Check if the team that was picked in downstream games
      // is no longer valid (because the upstream pick changed)
      const currentPick = picks.get(gameSlot);
      for (const slot of downstream) {
        const downstreamPick = picks.get(slot);
        if (downstreamPick && currentPick) {
          // If the downstream pick was the team that was just changed,
          // remove it
          picks.delete(slot);
        }
      }
      return { picks, isDirty: true };
    });
  },

  setBracketName: (name) => set({ bracketName: name, isDirty: true }),

  loadPicks: (picks) => {
    const pickMap = new Map<number, BracketPick>();
    for (const pick of picks) {
      pickMap.set(pick.gameSlot, pick);
    }
    set({ picks: pickMap, isDirty: false });
  },

  reset: () =>
    set({
      picks: new Map(),
      bracketName: "My Bracket",
      isDirty: false,
    }),
}));
