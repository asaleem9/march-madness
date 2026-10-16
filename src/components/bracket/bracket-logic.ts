/**
 * Pure helpers shared by the bracket builder and view. No React, no DOM —
 * everything here is unit-tested directly.
 */
import type { GameWithTeams, Team, Region, Round, SlotPosition } from "@/types";

export interface GhostPick {
  team: Team;
  side: SlotPosition;
  /** The pick is a play-in team that lost its Opening Round game. */
  lostPlayIn: boolean;
}

export interface ResolvedSlot {
  teamA: Team | null;
  teamB: Team | null;
  /** Set when the slot's pick is not one of the teams that can be in this slot. */
  ghostPick?: GhostPick;
}

export type Step = Region | "final_four";

/** Every team referenced by any game (including Opening Round play-ins). */
export function buildTeamMap(games: GameWithTeams[]): Map<number, Team> {
  const map = new Map<number, Team>();
  for (const game of games) {
    if (game.teamA) map.set(game.teamA.id, game.teamA);
    if (game.teamB) map.set(game.teamB.id, game.teamB);
    if (game.winner) map.set(game.winner.id, game.winner);
  }
  return map;
}

/** Opening Round games grouped by the First Round slot they feed. */
export function playInFeeders(games: GameWithTeams[]): Map<number, GameWithTeams[]> {
  const feeders = new Map<number, GameWithTeams[]>();
  for (const g of games) {
    if (g.round !== "first_four" || !g.nextGameSlot) continue;
    const list = feeders.get(g.nextGameSlot) ?? [];
    list.push(g);
    feeders.set(g.nextGameSlot, list);
  }
  return feeders;
}

function playInLoserId(game: GameWithTeams): number | null {
  if (game.status !== "final" || !game.winnerId) return null;
  if (game.teamAId && game.teamAId !== game.winnerId) return game.teamAId;
  if (game.teamBId && game.teamBId !== game.winnerId) return game.teamBId;
  return null;
}

/**
 * Resolve which teams appear in each slot, given the DB state plus the user's
 * picks (a picked winner advances speculatively into the next slot while the
 * DB has nothing there). A pick that is not one of the slot's possible teams
 * — the team lost earlier, or lost its play-in — becomes a `ghostPick` and is
 * not advanced any further.
 */
export function resolveSpeculativeTeams(
  games: GameWithTeams[],
  picks: Map<number, number>,
  teamMap: Map<number, Team>
): Map<number, ResolvedSlot> {
  const resolved = new Map<number, ResolvedSlot>();
  const sorted = [...games].sort((a, b) => a.gameSlot - b.gameSlot);
  const feeders = playInFeeders(games);

  for (const game of sorted) {
    resolved.set(game.gameSlot, { teamA: game.teamA, teamB: game.teamB });
  }

  for (const game of sorted) {
    const pickedTeamId = picks.get(game.gameSlot);
    if (!pickedTeamId) continue;
    const entry = resolved.get(game.gameSlot);
    if (!entry) continue;

    // Which team ids may legitimately sit in this slot right now.
    const valid = new Set<number>();
    if (entry.teamA) valid.add(entry.teamA.id);
    if (entry.teamB) valid.add(entry.teamB.id);
    let lostPlayIn = false;
    for (const ff of feeders.get(game.gameSlot) ?? []) {
      const loser = playInLoserId(ff);
      if (loser !== null) {
        if (ff.winnerId) valid.add(ff.winnerId);
        if (loser === pickedTeamId) lostPlayIn = true;
      } else {
        if (ff.teamA) valid.add(ff.teamA.id);
        if (ff.teamB) valid.add(ff.teamB.id);
      }
    }

    const team = teamMap.get(pickedTeamId);
    if (!team) continue;

    if (!valid.has(pickedTeamId)) {
      entry.ghostPick = {
        team,
        side: ghostSide(game, pickedTeamId, picks, sorted, entry),
        lostPlayIn,
      };
      continue;
    }

    if (!game.nextGameSlot) continue;
    const next = resolved.get(game.nextGameSlot);
    if (!next) continue;
    if (game.slotPosition === "top" && !next.teamA) {
      next.teamA = team;
    } else if (game.slotPosition === "bottom" && !next.teamB) {
      next.teamB = team;
    }
  }

  return resolved;
}

function ghostSide(
  game: GameWithTeams,
  pickedTeamId: number,
  picks: Map<number, number>,
  games: GameWithTeams[],
  entry: ResolvedSlot
): SlotPosition {
  for (const feeder of games) {
    if (feeder.nextGameSlot !== game.gameSlot || !feeder.slotPosition) continue;
    if (feeder.round === "first_four") {
      // A play-in's teams belong to the side its game feeds.
      if (feeder.teamAId === pickedTeamId || feeder.teamBId === pickedTeamId) return feeder.slotPosition;
      continue;
    }
    if (picks.get(feeder.gameSlot) === pickedTeamId) return feeder.slotPosition;
  }
  if (entry.teamA && !entry.teamB) return "bottom";
  return "top";
}

/** Games a user picks within a step (Opening Round excluded). */
export function gamesForStep(games: GameWithTeams[], step: Step): GameWithTeams[] {
  return games
    .filter((g) => {
      if (g.round === "first_four") return false;
      if (step === "final_four") return g.round === "final_four" || g.round === "championship";
      return g.region === step;
    })
    .sort((a, b) => a.gameSlot - b.gameSlot);
}

export interface FillResult {
  gameSlot: number;
  round: Round;
  pickedTeamId: number;
}

/**
 * Fill every empty slot in `stepGames` with the better seed (lower number),
 * breaking ties toward the top team. Existing picks are never touched; the
 * teams of later rounds come from earlier fills in the same pass.
 */
export function fillRemainingPicks(
  games: GameWithTeams[],
  picks: Map<number, number>,
  stepGames: GameWithTeams[],
  teamMap: Map<number, Team>
): FillResult[] {
  const working = new Map(picks);
  const added: FillResult[] = [];
  const feeders = playInFeeders(games);

  for (const game of [...stepGames].sort((a, b) => a.gameSlot - b.gameSlot)) {
    if (working.has(game.gameSlot)) continue;
    const resolved = resolveSpeculativeTeams(games, working, teamMap).get(game.gameSlot);
    let teamA = resolved?.teamA ?? null;
    let teamB = resolved?.teamB ?? null;

    // Unplayed play-in feeding a TBD side: take its top-listed team.
    for (const ff of feeders.get(game.gameSlot) ?? []) {
      if (playInLoserId(ff) !== null) continue;
      const candidate = ff.teamA ?? ff.teamB;
      if (!candidate) continue;
      if (ff.slotPosition === "top" && !teamA) teamA = candidate;
      if (ff.slotPosition === "bottom" && !teamB) teamB = candidate;
    }

    let choice: Team | null = null;
    if (teamA && teamB) {
      choice = teamB.seed < teamA.seed ? teamB : teamA;
    } else {
      choice = teamA ?? teamB;
    }
    if (!choice) continue;

    working.set(game.gameSlot, choice.id);
    added.push({ gameSlot: game.gameSlot, round: game.round, pickedTeamId: choice.id });
  }

  return added;
}

export interface RoundBreakdown {
  round: Round;
  correct: number;
  decided: number;
  total: number;
  points: number;
}

/** Correct/decided/total and points per picked round, for the read-only header. */
export function roundBreakdown(
  picks: { gameSlot: number; round: string; pickedTeamId: number; pointsEarned?: number | null; isCorrect?: boolean | null }[],
  games: GameWithTeams[]
): RoundBreakdown[] {
  const order: Round[] = ["first_round", "second_round", "sweet_16", "elite_eight", "final_four", "championship"];
  const bySlot = new Map(games.map((g) => [g.gameSlot, g]));
  const rows = new Map<Round, RoundBreakdown>(
    order.map((r) => [r, { round: r, correct: 0, decided: 0, total: 0, points: 0 }])
  );
  for (const pick of picks) {
    const game = bySlot.get(pick.gameSlot);
    const round = (game?.round ?? pick.round) as Round;
    const row = rows.get(round);
    if (!row) continue;
    row.total++;
    row.points += pick.pointsEarned ?? 0;
    if (game?.winnerId) {
      row.decided++;
      if (game.winnerId === pick.pickedTeamId) row.correct++;
    }
  }
  return order.map((r) => rows.get(r)!);
}
