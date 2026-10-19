/**
 * Tournament structure for the 76-team (2027+) NCAA bracket.
 *
 * Pure module — no DB, no React. Everything that knows "which slot is which"
 * lives here so the importer, the rollover script, the cron and the UI agree.
 *
 * ## Slot layout (75 fixed game slots)
 *
 * | Round          | Slots | Notes                                                   |
 * |----------------|-------|---------------------------------------------------------|
 * | Opening Round  | 1–12  | not picked by users; DB round value stays `first_four`. |
 * |                |       | Region / next slot / position are filled by the ESPN    |
 * |                |       | importer (they depend on which seed lines play in).     |
 * | First Round    | 13–44 | 8 per region in `REGION_ORDER`: east 13–20, west 21–28, |
 * |                |       | south 29–36, midwest 37–44. Game index within a region  |
 * |                |       | is the `SEED_MATCHUPS` index (1v16, 8v9, 5v12, 4v13,     |
 * |                |       | 6v11, 3v14, 7v10, 2v15).                                |
 * | Second Round   | 45–60 | 4 per region; fed by R1 games 2g (top) and 2g+1 (bottom)|
 * | Sweet 16       | 61–68 | 2 per region                                            |
 * | Elite Eight    | 69–72 | 1 per region; `next_game_slot` depends on the Final Four|
 * |                |       | pairing, which is admin-configurable per year.          |
 * | Final Four     | 73–74 | pairing[0] → 73, pairing[1] → 74 (first region = top)   |
 * | Championship   | 75    | code should look this up by `round='championship'`.     |
 *
 * `r1SlotFor(region, seed)` is the bridge between an ESPN seed line and the
 * bracket tree: an Opening Round game between two 12-seeds in the West feeds
 * `r1SlotFor("west", 12)` on the `positionFor(12)` ("bottom") side.
 */
import type { Region, Round, SlotPosition } from "@/types";

/** Region order used for slot numbering. Index = region block within each round. */
export const REGION_ORDER: readonly Region[] = ["east", "west", "south", "midwest"];

/**
 * First-round seed pairings in bracket order (top to bottom within a region).
 * Index g in this array = game index within the region's R1 block, and pairs
 * (2g, 2g+1) meet in the Second Round.
 */
export const SEED_MATCHUPS: readonly (readonly [number, number])[] = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

/** Inclusive slot ranges per round. */
export const SLOT_RANGES: Readonly<Record<Round, { readonly start: number; readonly end: number }>> = {
  first_four: { start: 1, end: 12 },
  first_round: { start: 13, end: 44 },
  second_round: { start: 45, end: 60 },
  sweet_16: { start: 61, end: 68 },
  elite_eight: { start: 69, end: 72 },
  final_four: { start: 73, end: 74 },
  championship: { start: 75, end: 75 },
};

export const TOTAL_GAME_SLOTS = 75;
/** Maximum Opening Round games (12 in the 76-team format). Fewer may be used. */
export const OPENING_ROUND_GAMES = 12;
/** Picks required for a complete bracket: 32 + 16 + 8 + 4 + 2 + 1. Opening Round is not picked. */
export const REQUIRED_PICKS = 63;

/**
 * Which regions meet in the two national semifinals.
 * `pairing[0]` plays in slot 73, `pairing[1]` in slot 74. Within a pair, the
 * first region's Elite Eight winner is the `top` team.
 */
export type FinalFourPairing = [[Region, Region], [Region, Region]];

/** ISO timestamps used to pre-fill `scheduled_at` on skeleton rows. */
export interface TournamentDates {
  /** [day 1, day 2]; opening slots 1–6 get day 1, 7–12 day 2. */
  openingRound: [string, string];
  /** [day 1, day 2]; R1 games g<4 get day 1, g>=4 day 2 (the importer overwrites with real tip times). */
  firstRound: [string, string];
  /** [day 1, day 2]; R2 games g<2 get day 1, g>=2 day 2. */
  secondRound: [string, string];
  sweet16: Record<Region, string>;
  eliteEight: Record<Region, string>;
  finalFour: string;
  championship: string;
}

/** A `games` row's structural columns, in snake_case (database column names). */
export interface GameSlotRow {
  game_slot: number;
  round: Round;
  region: Region | null;
  next_game_slot: number | null;
  slot_position: SlotPosition | null;
  scheduled_at: string | null;
}

export interface YearDefaults {
  year: number;
  /** `YYYY-MM-DD`; the bracket reveal. Shown as "brackets open Selection Sunday" in the off-season. */
  selectionSunday: string;
  /** ISO; brackets lock when the first R1 game tips. */
  lockDeadline: string;
  /** ISO; last moment a wager can be created/accepted. */
  wagerDeadline: string;
  /** `YYYYMMDD` ESPN scoreboard dates covering the Opening Round + First Round. */
  espnDates: string[];
  dates: TournamentDates;
  /** Placeholder until the official bracket is released; admin-configurable. */
  finalFourPairing: FinalFourPairing;
}

export const YEAR_DEFAULTS: Readonly<Record<number, YearDefaults>> = {
  2027: {
    year: 2027,
    selectionSunday: "2027-03-14",
    lockDeadline: "2027-03-18T16:00:00Z",
    wagerDeadline: "2027-03-18T16:00:00Z",
    espnDates: ["20270316", "20270317", "20270318", "20270319"],
    dates: {
      openingRound: ["2027-03-16T22:00:00Z", "2027-03-17T22:00:00Z"],
      firstRound: ["2027-03-18T16:00:00Z", "2027-03-19T16:00:00Z"],
      secondRound: ["2027-03-20T16:00:00Z", "2027-03-21T16:00:00Z"],
      sweet16: {
        south: "2027-03-25T23:00:00Z",
        west: "2027-03-25T23:00:00Z",
        midwest: "2027-03-26T23:00:00Z",
        east: "2027-03-26T23:00:00Z",
      },
      eliteEight: {
        south: "2027-03-27T22:00:00Z",
        west: "2027-03-27T22:00:00Z",
        midwest: "2027-03-28T18:00:00Z",
        east: "2027-03-28T18:00:00Z",
      },
      finalFour: "2027-04-03T22:00:00Z",
      championship: "2027-04-06T01:00:00Z",
    },
    finalFourPairing: [
      ["east", "west"],
      ["south", "midwest"],
    ],
  },
  // 2026 (68-team format) — kept so the importer can be replayed against the
  // recorded 2026 ESPN scoreboards. Dates are approximate.
  2026: {
    year: 2026,
    selectionSunday: "2026-03-15",
    lockDeadline: "2026-03-19T16:00:00Z",
    wagerDeadline: "2026-03-19T16:00:00Z",
    espnDates: ["20260317", "20260318", "20260319", "20260320"],
    dates: {
      openingRound: ["2026-03-17T22:00:00Z", "2026-03-18T22:00:00Z"],
      firstRound: ["2026-03-19T16:00:00Z", "2026-03-20T16:00:00Z"],
      secondRound: ["2026-03-21T16:00:00Z", "2026-03-22T16:00:00Z"],
      sweet16: {
        east: "2026-03-26T23:00:00Z",
        west: "2026-03-26T23:00:00Z",
        south: "2026-03-27T23:00:00Z",
        midwest: "2026-03-27T23:00:00Z",
      },
      eliteEight: {
        east: "2026-03-28T22:00:00Z",
        west: "2026-03-28T22:00:00Z",
        south: "2026-03-29T18:00:00Z",
        midwest: "2026-03-29T18:00:00Z",
      },
      finalFour: "2026-04-04T22:00:00Z",
      championship: "2026-04-07T01:00:00Z",
    },
    finalFourPairing: [
      ["east", "south"],
      ["west", "midwest"],
    ],
  },
};

/** Round of a slot number. Throws for slots outside 1..75. */
export function roundOfSlot(slot: number): Round {
  for (const [round, range] of Object.entries(SLOT_RANGES) as [Round, { start: number; end: number }][]) {
    if (slot >= range.start && slot <= range.end) return round;
  }
  throw new RangeError(`Game slot ${slot} is outside 1..${TOTAL_GAME_SLOTS}`);
}

/** Index into `SEED_MATCHUPS` for a seed (1..16). Throws otherwise. */
export function matchupIndexForSeed(seed: number): number {
  const idx = SEED_MATCHUPS.findIndex(([a, b]) => a === seed || b === seed);
  if (!Number.isInteger(seed) || idx === -1) {
    throw new RangeError(`Seed ${seed} is not in 1..16`);
  }
  return idx;
}

function regionIndex(region: Region): number {
  const idx = REGION_ORDER.indexOf(region);
  if (idx === -1) throw new RangeError(`Unknown region "${region}"`);
  return idx;
}

/** First-round slot where a seed plays in a region: `13 + regionIdx*8 + matchupIdx`. */
export function r1SlotFor(region: Region, seed: number): number {
  return SLOT_RANGES.first_round.start + regionIndex(region) * 8 + matchupIndexForSeed(seed);
}

/** Bracket side for a seed in its R1 game: the better seed of each pairing is `top`. */
export function positionFor(seed: number): SlotPosition {
  const [top] = SEED_MATCHUPS[matchupIndexForSeed(seed)];
  return seed === top ? "top" : "bottom";
}

/** Where a region's Elite Eight winner goes, given the Final Four pairing. Throws if the region isn't in the pairing. */
export function eliteEightTarget(
  region: Region,
  pairing: FinalFourPairing
): { next_game_slot: number; slot_position: SlotPosition } {
  for (let i = 0; i < 2; i++) {
    const [top, bottom] = pairing[i];
    if (top === region) return { next_game_slot: SLOT_RANGES.final_four.start + i, slot_position: "top" };
    if (bottom === region) return { next_game_slot: SLOT_RANGES.final_four.start + i, slot_position: "bottom" };
  }
  throw new RangeError(`Region "${region}" is not in the Final Four pairing ${JSON.stringify(pairing)}`);
}

/**
 * Build all 75 skeleton rows in slot order.
 *
 * Opening Round rows (1–12) carry `round: "first_four"` and null region /
 * next slot / position — the importer fills those from ESPN seed lines.
 * Every other row is fully wired.
 */
export function buildGameSlots(opts: { dates: TournamentDates; finalFourPairing: FinalFourPairing }): GameSlotRow[] {
  const { dates, finalFourPairing } = opts;
  const rows: GameSlotRow[] = [];

  for (let i = 0; i < OPENING_ROUND_GAMES; i++) {
    rows.push({
      game_slot: SLOT_RANGES.first_four.start + i,
      round: "first_four",
      region: null,
      next_game_slot: null,
      slot_position: null,
      scheduled_at: dates.openingRound[i < 6 ? 0 : 1],
    });
  }

  REGION_ORDER.forEach((region, r) => {
    for (let g = 0; g < 8; g++) {
      rows.push({
        game_slot: SLOT_RANGES.first_round.start + r * 8 + g,
        round: "first_round",
        region,
        next_game_slot: SLOT_RANGES.second_round.start + r * 4 + Math.floor(g / 2),
        slot_position: g % 2 === 0 ? "top" : "bottom",
        scheduled_at: dates.firstRound[g < 4 ? 0 : 1],
      });
    }
  });

  REGION_ORDER.forEach((region, r) => {
    for (let g = 0; g < 4; g++) {
      rows.push({
        game_slot: SLOT_RANGES.second_round.start + r * 4 + g,
        round: "second_round",
        region,
        next_game_slot: SLOT_RANGES.sweet_16.start + r * 2 + Math.floor(g / 2),
        slot_position: g % 2 === 0 ? "top" : "bottom",
        scheduled_at: dates.secondRound[g < 2 ? 0 : 1],
      });
    }
  });

  REGION_ORDER.forEach((region, r) => {
    for (let g = 0; g < 2; g++) {
      rows.push({
        game_slot: SLOT_RANGES.sweet_16.start + r * 2 + g,
        round: "sweet_16",
        region,
        next_game_slot: SLOT_RANGES.elite_eight.start + r,
        slot_position: g === 0 ? "top" : "bottom",
        scheduled_at: dates.sweet16[region],
      });
    }
  });

  REGION_ORDER.forEach((region, r) => {
    const target = eliteEightTarget(region, finalFourPairing);
    rows.push({
      game_slot: SLOT_RANGES.elite_eight.start + r,
      round: "elite_eight",
      region,
      next_game_slot: target.next_game_slot,
      slot_position: target.slot_position,
      scheduled_at: dates.eliteEight[region],
    });
  });

  for (let i = 0; i < 2; i++) {
    rows.push({
      game_slot: SLOT_RANGES.final_four.start + i,
      round: "final_four",
      region: null,
      next_game_slot: SLOT_RANGES.championship.start,
      slot_position: i === 0 ? "top" : "bottom",
      scheduled_at: dates.finalFour,
    });
  }

  rows.push({
    game_slot: SLOT_RANGES.championship.start,
    round: "championship",
    region: null,
    next_game_slot: null,
    slot_position: null,
    scheduled_at: dates.championship,
  });

  return rows;
}
