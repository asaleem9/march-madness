import { OPENING_ROUND_GAMES, SLOT_RANGES, TOTAL_GAME_SLOTS } from "./tournament-structure";
import type { Round } from "@/types";

/** The structural columns of a `games` row that pick validation needs. */
export interface GameTree {
  gameSlot: number;
  round: Round;
  nextGameSlot: number | null;
  teamAId: number | null;
  teamBId: number | null;
}

export interface PickInput {
  game_slot: unknown;
  picked_team_id: unknown;
}

export interface ValidPick {
  gameSlot: number;
  round: Round;
  pickedTeamId: number;
}

export type ValidationResult =
  | { ok: true; picks: ValidPick[] }
  | { ok: false; error: string };

const FIRST_PICKABLE_SLOT = SLOT_RANGES.first_round.start; // 13

/**
 * Server-side bracket integrity. Nothing in the database enforces the shape of
 * a bracket, so this is what stops a request from picking a team in a game it
 * can't reach (a hedge that scores whichever way the tree falls), picking the
 * 1–12 play-in games, or padding a draft to the required count with junk rows.
 *
 * Rules:
 * - every pick names a real slot in 13–75; no slot twice; `round` comes from the
 *   games table, never from the request
 * - a first-round pick must be one of that game's two sides; when a side is a
 *   play-in (slots 1–12) either play-in team is allowed, since the loser's picks
 *   are rewritten to the winner once the play-in is final
 * - a later-round pick must be the team this bracket advanced out of one of the
 *   two feeder games (so picks must be built from the first round up)
 */
export function validatePicks(input: PickInput[], games: GameTree[]): ValidationResult {
  const bySlot = new Map(games.map((g) => [g.gameSlot, g]));
  const feeders = new Map<number, GameTree[]>();
  for (const g of games) {
    if (g.nextGameSlot === null) continue;
    const list = feeders.get(g.nextGameSlot) ?? [];
    list.push(g);
    feeders.set(g.nextGameSlot, list);
  }

  const picked = new Map<number, number>();
  for (const raw of input) {
    const slot = Number(raw.game_slot);
    const team = Number(raw.picked_team_id);
    if (!Number.isInteger(slot) || slot < FIRST_PICKABLE_SLOT || slot > TOTAL_GAME_SLOTS) {
      return { ok: false, error: `Invalid game slot ${String(raw.game_slot)}` };
    }
    if (!Number.isInteger(team) || team <= 0) {
      return { ok: false, error: `Invalid team for game ${slot}` };
    }
    if (!bySlot.has(slot)) return { ok: false, error: `Unknown game slot ${slot}` };
    if (picked.has(slot)) return { ok: false, error: `Duplicate pick for game ${slot}` };
    picked.set(slot, team);
  }

  // Validate from the earliest slot up so feeder picks are checked before the games they feed.
  const slots = [...picked.keys()].sort((a, b) => a - b);
  for (const slot of slots) {
    const team = picked.get(slot)!;
    const eligible = eligibleTeams(slot, bySlot, feeders, picked);
    if (!eligible.has(team)) {
      return { ok: false, error: `Team ${team} can't be picked in game ${slot}` };
    }
  }

  return {
    ok: true,
    picks: slots.map((slot) => ({
      gameSlot: slot,
      round: bySlot.get(slot)!.round,
      pickedTeamId: picked.get(slot)!,
    })),
  };
}

function eligibleTeams(
  slot: number,
  bySlot: Map<number, GameTree>,
  feeders: Map<number, GameTree[]>,
  picked: Map<number, number>
): Set<number> {
  const game = bySlot.get(slot)!;
  const out = new Set<number>();
  const feederGames = feeders.get(slot) ?? [];

  if (game.round === "first_round") {
    // The two sides of the game itself, or either team of a play-in feeding it.
    if (game.teamAId !== null) out.add(game.teamAId);
    if (game.teamBId !== null) out.add(game.teamBId);
    for (const f of feederGames) {
      if (f.gameSlot <= OPENING_ROUND_GAMES) {
        if (f.teamAId !== null) out.add(f.teamAId);
        if (f.teamBId !== null) out.add(f.teamBId);
      }
    }
    return out;
  }

  for (const f of feederGames) {
    const advanced = picked.get(f.gameSlot);
    if (advanced !== undefined) out.add(advanced);
  }
  return out;
}

/** Picks that count toward a complete bracket (the play-in games are never picked). */
export function countablePicks(picks: { gameSlot: number }[]): number {
  return picks.filter((p) => p.gameSlot >= FIRST_PICKABLE_SLOT).length;
}
