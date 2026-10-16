/**
 * Pure helpers for the dashboard (and the scoring page's deadline copy).
 * No React, no I/O — unit-tested in `__tests__/helpers.test.ts`.
 */
import type { GameStatus, Round } from "@/types";
import { REQUIRED_PICKS } from "@/lib/tournament-structure";

export const EASTERN_TZ = "America/New_York";

export interface PickLite {
  game_slot: number;
  round: Round;
  picked_team_id: number;
  is_correct: boolean | null;
  points_earned: number | null;
}

/** Picks that count toward a complete bracket — the Opening Round isn't picked. */
export function countRequiredPicks(picks: readonly { round: Round }[]): number {
  return picks.filter((p) => p.round !== "first_four").length;
}

export function isBracketComplete(picks: readonly { round: Round }[]): boolean {
  return countRequiredPicks(picks) >= REQUIRED_PICKS;
}

/** Correct picks vs. picks whose game has been decided (is_correct set). */
export function summarizePicks(picks: readonly { is_correct: boolean | null }[]): {
  correct: number;
  scored: number;
} {
  let correct = 0;
  let scored = 0;
  for (const p of picks) {
    if (p.is_correct === null || p.is_correct === undefined) continue;
    scored++;
    if (p.is_correct) correct++;
  }
  return { correct, scored };
}

/** "Thu, Mar 18, 12:00 PM EDT" — always Eastern so everyone reads the same deadline. */
export function formatEastern(
  value: string | Date,
  opts: { weekday?: boolean } = {}
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleString("en-US", {
    timeZone: EASTERN_TZ,
    ...(opts.weekday === false ? {} : { weekday: "short" }),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "7:15 PM ET"-style tip time. */
/** "Sun, Mar 14, 2027" for a `YYYY-MM-DD` or ISO value, read as an Eastern calendar day. */
export function formatEasternDate(value: string | Date): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00-04:00`)
      : typeof value === "string"
        ? new Date(value)
        : value;
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString("en-US", {
    timeZone: EASTERN_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEasternTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString("en-US", {
    timeZone: EASTERN_TZ,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Calendar day in Eastern time as "YYYY-MM-DD". */
export function easternDateKey(value: string | Date): string | null {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Games tipping off today (Eastern), earliest first. */
export function todaysGames<T extends { scheduled_at: string | null }>(
  games: readonly T[],
  now: Date = new Date()
): T[] {
  const today = easternDateKey(now);
  return games
    .filter((g) => g.scheduled_at && easternDateKey(g.scheduled_at) === today)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at as string).getTime() -
        new Date(b.scheduled_at as string).getTime()
    );
}

/** True when `deadline` is in the future but less than `hours` away. */
export function isWithinHours(
  deadline: string | null | undefined,
  hours: number,
  now: Date = new Date()
): boolean {
  if (!deadline) return false;
  const remaining = new Date(deadline).getTime() - now.getTime();
  return remaining > 0 && remaining < hours * 60 * 60 * 1000;
}

export type PickOutcome = "correct" | "wrong" | "pending";

/** How a pick stands against a game's result. */
export function pickOutcome(
  game: { status: GameStatus; winner_id: number | null },
  pickedTeamId: number | undefined
): PickOutcome {
  if (pickedTeamId === undefined) return "pending";
  if (game.status !== "final" || !game.winner_id) return "pending";
  return game.winner_id === pickedTeamId ? "correct" : "wrong";
}
