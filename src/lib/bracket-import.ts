/**
 * Build the season's teams and bracket from ESPN scoreboards — pure logic, no
 * DB. `applyImportPlan` (bracket-import-apply.ts) does the writes.
 *
 * ESPN's tournament scoreboard (`?groups=100`) gives, per game, a headline
 * such as "NCAA Men's Basketball Championship - East Region - 1st Round", each
 * competitor's seed (`curatedRank.current`), record, ESPN team id and logo. The
 * Opening Round games plus the First Round games are enough to derive all 76
 * teams and every first-round matchup; later rounds are generated structurally.
 */
import type { Region } from "@/types";
import type { ESPNScoreboard, ESPNCompetition, ESPNCompetitor } from "./espn";
import { isTbdCompetitor } from "./espn";
import {
  REGION_ORDER,
  SLOT_RANGES,
  OPENING_ROUND_GAMES,
  buildGameSlots,
  r1SlotFor,
  positionFor,
  type FinalFourPairing,
  type GameSlotRow,
  type TournamentDates,
} from "./tournament-structure";

export type ImportRound = "first_four" | "first_round";

export interface ParsedTeam {
  espnId: string;
  name: string;
  abbreviation: string;
  seed: number;
  region: Region;
  record: string | null;
  logoUrl: string;
}

export interface ParsedGame {
  espnGameId: string;
  date: string;
  round: ImportRound;
  region: Region;
  headline: string;
  /** Home side first (team_a), then away. `null` = TBD. */
  competitors: [ParsedTeam | null, ParsedTeam | null];
}

export interface ParsedHeadline {
  tournament: boolean;
  region: Region | null;
  round: ImportRound | "other" | null;
}

export interface ClassifiedScoreboards {
  opening: ParsedGame[];
  firstRound: ParsedGame[];
  /** Tournament games from later rounds, or non-tournament games (NIT etc.). */
  ignored: number;
  unmatchedHeadlines: string[];
  warnings: string[];
}

/** Snake_case rows ready to upsert. Teams are referenced by ESPN id until the apply step maps them. */
export interface TeamRow {
  espn_id: string;
  name: string;
  abbreviation: string;
  seed: number;
  region: Region;
  record: string | null;
  logo_url: string;
  eliminated: false;
}

export interface GameRow extends GameSlotRow {
  espn_game_id: string | null;
  team_a_espn_id: string | null;
  team_b_espn_id: string | null;
}

export interface ImportReport {
  year: number;
  datesFetched: string[];
  espnEvents: number;
  tournamentEvents: number;
  ignoredEvents: number;
  teams: {
    count: number;
    expected: number;
    byRegion: Record<Region, number>;
    missingSeeds: Record<Region, number[]>;
    duplicateSeeds: Record<Region, number[]>;
    nameCollisions: string[];
  };
  openingRound: {
    count: number;
    expected: number;
    games: {
      slot: number;
      region: Region;
      seed: number;
      teamA: string;
      teamB: string;
      feedsSlot: number;
      position: "top" | "bottom";
    }[];
  };
  firstRound: {
    count: number;
    expected: number;
    withTbdSide: number;
    expectedTbd: number;
    missingSlots: number[];
    tbdSlotMismatches: string[];
  };
  unmatchedHeadlines: string[];
  warnings: string[];
  errors: string[];
}

export interface ImportPlan {
  year: number;
  teams: TeamRow[];
  openingGames: GameRow[];
  firstRoundGames: GameRow[];
  /** All slots from `buildGameSlots` except the opening ones (13–75). */
  skeleton: GameSlotRow[];
  finalFourPairing: FinalFourPairing;
  report: ImportReport;
  writable: boolean;
}

export interface ImportOptions {
  year: number;
  dates: TournamentDates;
  finalFourPairing: FinalFourPairing;
  datesFetched?: string[];
  expected?: { teams?: number; opening?: number };
}

const TOURNAMENT_RE = /NCAA Men'?s Basketball Championship/i;
const REGION_RE = /\b(East|West|South|Midwest)\b\s+Region/i;
const OPENING_RE = /First Four|Opening Round|Play-?In/i;
const FIRST_ROUND_RE = /\b(1st|First) Round\b/i;

export function parseHeadline(headline?: string | null): ParsedHeadline {
  if (!headline) return { tournament: false, region: null, round: null };
  const tournament = TOURNAMENT_RE.test(headline);
  // Match rounds against the text after the tournament name so "Championship"
  // in "NCAA Men's Basketball Championship" doesn't read as the title game.
  const rest = headline.replace(TOURNAMENT_RE, "");
  const regionMatch = rest.match(REGION_RE);
  const region = regionMatch ? (regionMatch[1].toLowerCase() as Region) : null;
  let round: ParsedHeadline["round"] = null;
  if (OPENING_RE.test(rest)) round = "first_four";
  else if (FIRST_ROUND_RE.test(rest)) round = "first_round";
  else if (tournament && /Round|Sweet|Elite|Final|Championship|Regional/i.test(rest)) round = "other";
  return { tournament, region, round };
}

function logoFor(c: ESPNCompetitor): string {
  return c.team.logo ?? `https://a.espncdn.com/i/teamlogos/ncaa/500/${c.team.id}.png`;
}

function parseCompetitor(c: ESPNCompetitor, region: Region, warnings: string[]): ParsedTeam | null {
  if (isTbdCompetitor(c)) return null;
  const seed = c.curatedRank?.current ?? (c.seed ? parseInt(c.seed, 10) : undefined);
  if (seed == null || !Number.isInteger(seed) || seed < 1 || seed > 16) {
    warnings.push(`No seed for ${c.team.displayName} (espn ${c.team.id}); game skipped`);
    return null;
  }
  const overall = c.records?.find((r) => r.type === "total") ?? c.records?.[0];
  return {
    espnId: c.team.id,
    // `location` is the school ("Michigan State"); shortDisplayName is ESPN's
    // tight-space form ("Michigan St"). Prefer the readable one.
    name: c.team.location || c.team.shortDisplayName || c.team.displayName,
    abbreviation: c.team.abbreviation,
    seed,
    region,
    record: overall?.summary ?? null,
    logoUrl: logoFor(c),
  };
}

function orderedCompetitors(comp: ESPNCompetition): ESPNCompetitor[] {
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (home && away) return [home, away];
  return comp.competitors.slice(0, 2);
}

/** Split the fetched scoreboards into Opening Round and First Round tournament games. */
export function classifyScoreboards(boards: (ESPNScoreboard | null)[]): ClassifiedScoreboards {
  const opening: ParsedGame[] = [];
  const firstRound: ParsedGame[] = [];
  const unmatchedHeadlines: string[] = [];
  const warnings: string[] = [];
  let ignored = 0;
  const seen = new Set<string>();

  for (const board of boards) {
    if (!board) continue;
    for (const event of board.events) {
      for (const comp of event.competitions) {
        if (seen.has(comp.id)) continue;
        seen.add(comp.id);
        const headline = comp.notes?.find((n) => n.headline)?.headline ?? "";
        const parsed = parseHeadline(headline);
        if (!parsed.tournament) {
          ignored++;
          continue;
        }
        if (parsed.round === "other") {
          ignored++;
          continue;
        }
        if (!parsed.region) {
          unmatchedHeadlines.push(headline || `(no headline: ${event.name})`);
          continue;
        }
        const region = parsed.region;
        const ordered = orderedCompetitors(comp);
        if (ordered.length !== 2) {
          warnings.push(`Game ${comp.id} (${event.name}) has ${ordered.length} competitors; skipped`);
          continue;
        }
        const before = warnings.length;
        const a = parseCompetitor(ordered[0], region, warnings);
        const b = parseCompetitor(ordered[1], region, warnings);
        const aTbd = isTbdCompetitor(ordered[0]);
        const bTbd = isTbdCompetitor(ordered[1]);
        if ((!a && !aTbd) || (!b && !bTbd)) {
          // A seedless real team: can't place it. Warning already recorded.
          continue;
        }
        if (warnings.length !== before) continue;

        let round = parsed.round;
        if (!round) {
          // Headline named the region but not the round. Infer: two known teams
          // on the same seed line is a play-in; a TBD side is a first-round game.
          if (a && b && a.seed === b.seed) round = "first_four";
          else if (!a || !b) round = "first_round";
          else round = "first_round";
        }
        const game: ParsedGame = {
          espnGameId: comp.id,
          date: comp.date,
          round,
          region,
          headline,
          competitors: [a, b],
        };
        if (round === "first_four") {
          if (!a || !b) {
            warnings.push(`Opening Round game ${comp.id} has a TBD side; skipped`);
            continue;
          }
          if (a.seed !== b.seed) {
            warnings.push(
              `Opening Round game ${comp.id} pairs seeds ${a.seed} and ${b.seed}; using ${a.seed}`
            );
          }
          opening.push(game);
        } else {
          if (!a && !b) {
            warnings.push(`First Round game ${comp.id} has two TBD sides; skipped`);
            continue;
          }
          firstRound.push(game);
        }
      }
    }
  }

  opening.sort((x, y) => x.date.localeCompare(y.date) || x.espnGameId.localeCompare(y.espnGameId));
  firstRound.sort((x, y) => x.date.localeCompare(y.date) || x.espnGameId.localeCompare(y.espnGameId));
  return { opening, firstRound, ignored, unmatchedHeadlines, warnings };
}

function emptyByRegion<T>(make: () => T): Record<Region, T> {
  return { east: make(), west: make(), south: make(), midwest: make() };
}

/** Turn classified games into upsert-ready rows plus a validation report. */
export function buildImportPlan(
  parsed: ClassifiedScoreboards,
  opts: ImportOptions
): ImportPlan {
  const expectedTeams = opts.expected?.teams ?? 76;
  const expectedOpening = opts.expected?.opening ?? OPENING_ROUND_GAMES;
  const errors: string[] = [];
  const warnings = [...parsed.warnings];

  // ── Teams ────────────────────────────────────────────────────────────────
  const teamsById = new Map<string, ParsedTeam>();
  const allGames = [...parsed.opening, ...parsed.firstRound];
  for (const g of allGames) {
    for (const t of g.competitors) {
      if (!t) continue;
      const existing = teamsById.get(t.espnId);
      if (existing && (existing.seed !== t.seed || existing.region !== t.region)) {
        warnings.push(
          `${t.name} appears as ${existing.region} ${existing.seed} and ${t.region} ${t.seed}; keeping the first`
        );
        continue;
      }
      if (!existing) teamsById.set(t.espnId, t);
    }
  }

  const nameCollisions: string[] = [];
  const byName = new Map<string, ParsedTeam[]>();
  for (const t of teamsById.values()) {
    const list = byName.get(t.name) ?? [];
    list.push(t);
    byName.set(t.name, list);
  }
  const teamRows: TeamRow[] = [];
  for (const t of teamsById.values()) {
    const collides = (byName.get(t.name)?.length ?? 0) > 1;
    const name = collides ? `${t.name} (${t.abbreviation})` : t.name;
    if (collides && !nameCollisions.includes(t.name)) nameCollisions.push(t.name);
    teamRows.push({
      espn_id: t.espnId,
      name,
      abbreviation: t.abbreviation,
      seed: t.seed,
      region: t.region,
      record: t.record,
      logo_url: t.logoUrl,
      eliminated: false,
    });
  }
  teamRows.sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || a.seed - b.seed || a.name.localeCompare(b.name));

  // ── Opening Round games → slots 1..n ─────────────────────────────────────
  const openingGames: GameRow[] = [];
  const openingReport: ImportReport["openingRound"]["games"] = [];
  const feeds = new Map<number, { game: ParsedGame; position: "top" | "bottom" }>();
  parsed.opening.forEach((g, i) => {
    const slot = SLOT_RANGES.first_four.start + i;
    if (slot > SLOT_RANGES.first_four.end) {
      errors.push(`More than ${OPENING_ROUND_GAMES} Opening Round games (${parsed.opening.length})`);
      return;
    }
    const [a, b] = g.competitors as [ParsedTeam, ParsedTeam];
    const seed = a.seed;
    const feedsSlot = r1SlotFor(g.region, seed);
    const position = positionFor(seed);
    if (feeds.has(feedsSlot)) {
      errors.push(`Two Opening Round games feed slot ${feedsSlot} (${g.region} ${seed})`);
    }
    feeds.set(feedsSlot, { game: g, position });
    openingGames.push({
      game_slot: slot,
      round: "first_four",
      region: g.region,
      next_game_slot: feedsSlot,
      slot_position: position,
      scheduled_at: g.date,
      espn_game_id: g.espnGameId,
      team_a_espn_id: a.espnId,
      team_b_espn_id: b.espnId,
    });
    openingReport.push({ slot, region: g.region, seed, teamA: a.name, teamB: b.name, feedsSlot, position });
  });

  // ── First Round games → slots 13..44 ─────────────────────────────────────
  const skeletonAll = buildGameSlots({ dates: opts.dates, finalFourPairing: opts.finalFourPairing });
  const skeleton = skeletonAll.filter((r) => r.round !== "first_four");
  const r1Skeleton = new Map(skeleton.filter((r) => r.round === "first_round").map((r) => [r.game_slot, r]));
  const firstRoundGames: GameRow[] = [];
  const tbdSlotMismatches: string[] = [];
  let withTbdSide = 0;
  const usedSlots = new Set<number>();

  for (const g of parsed.firstRound) {
    const [a, b] = g.competitors;
    const known = a ?? b;
    if (!known) continue;
    let slot: number;
    try {
      slot = r1SlotFor(g.region, known.seed);
    } catch (e) {
      errors.push(`Cannot place ${known.name}: ${(e as Error).message}`);
      continue;
    }
    if (usedSlots.has(slot)) {
      errors.push(`Two First Round games map to slot ${slot} (${g.region}, seed ${known.seed})`);
      continue;
    }
    usedSlots.add(slot);
    const base = r1Skeleton.get(slot)!;

    // Place each side by its seed's bracket position rather than home/away.
    let top: ParsedTeam | null = null;
    let bottom: ParsedTeam | null = null;
    for (const t of [a, b]) {
      if (!t) continue;
      if (positionFor(t.seed) === "top") top = t;
      else bottom = t;
    }
    if (a && b && (!top || !bottom)) {
      errors.push(`First Round game ${g.espnGameId} has two teams on the same side (${a.seed} vs ${b.seed})`);
      continue;
    }
    const tbd = !a || !b;
    if (tbd) withTbdSide++;

    const feed = feeds.get(slot);
    if (feed) {
      const feedSide = feed.position === "top" ? top : bottom;
      const feedTeams = feed.game.competitors.map((t) => t?.espnId);
      if (feedSide && !feedTeams.includes(feedSide.espnId)) {
        tbdSlotMismatches.push(
          `Slot ${slot} ${feed.position} is ${feedSide.name} but an Opening Round game feeds it`
        );
      }
    } else if (tbd) {
      tbdSlotMismatches.push(`Slot ${slot} has a TBD side but no Opening Round game feeds it`);
    }

    firstRoundGames.push({
      ...base,
      scheduled_at: g.date,
      espn_game_id: g.espnGameId,
      team_a_espn_id: top?.espnId ?? null,
      team_b_espn_id: bottom?.espnId ?? null,
    });
  }
  firstRoundGames.sort((x, y) => x.game_slot - y.game_slot);

  const missingSlots: number[] = [];
  for (let s = SLOT_RANGES.first_round.start; s <= SLOT_RANGES.first_round.end; s++) {
    if (!usedSlots.has(s)) missingSlots.push(s);
  }

  // ── Seed coverage per region ─────────────────────────────────────────────
  const byRegion = emptyByRegion(() => 0);
  const seedsSeen = emptyByRegion(() => new Map<number, number>());
  for (const t of teamRows) {
    byRegion[t.region]++;
  }
  // Coverage counts each seed line once: R1 known teams plus opening-round lines.
  for (const g of firstRoundGames) {
    const r = g.region as Region;
    for (const id of [g.team_a_espn_id, g.team_b_espn_id]) {
      const t = id ? teamsById.get(id) : null;
      if (t) seedsSeen[r].set(t.seed, (seedsSeen[r].get(t.seed) ?? 0) + 1);
    }
  }
  for (const [slot, feed] of feeds) {
    const r = feed.game.region;
    const seed = (feed.game.competitors[0] as ParsedTeam).seed;
    const r1 = firstRoundGames.find((g) => g.game_slot === slot);
    const sideFilled = r1 && (feed.position === "top" ? r1.team_a_espn_id : r1.team_b_espn_id);
    if (!sideFilled) seedsSeen[r].set(seed, (seedsSeen[r].get(seed) ?? 0) + 1);
  }
  const missingSeeds = emptyByRegion<number[]>(() => []);
  const duplicateSeeds = emptyByRegion<number[]>(() => []);
  for (const r of REGION_ORDER) {
    for (let seed = 1; seed <= 16; seed++) {
      const n = seedsSeen[r].get(seed) ?? 0;
      if (n === 0) missingSeeds[r].push(seed);
      if (n > 1) duplicateSeeds[r].push(seed);
    }
  }

  // ── Errors ───────────────────────────────────────────────────────────────
  if (teamRows.length === 0) errors.push("No tournament teams found");
  if (parsed.unmatchedHeadlines.length > 0) {
    errors.push(`${parsed.unmatchedHeadlines.length} tournament game(s) had no region in the headline`);
  }
  if (missingSlots.length > 0) errors.push(`Missing First Round slots: ${missingSlots.join(", ")}`);
  for (const r of REGION_ORDER) {
    if (missingSeeds[r].length) errors.push(`${r}: missing seeds ${missingSeeds[r].join(", ")}`);
    if (duplicateSeeds[r].length) errors.push(`${r}: duplicate seeds ${duplicateSeeds[r].join(", ")}`);
  }
  if (tbdSlotMismatches.length) errors.push(...tbdSlotMismatches);
  if (teamRows.length !== expectedTeams) {
    warnings.push(`Expected ${expectedTeams} teams, found ${teamRows.length}`);
  }
  if (openingGames.length !== expectedOpening) {
    warnings.push(`Expected ${expectedOpening} Opening Round games, found ${openingGames.length}`);
  }

  const report: ImportReport = {
    year: opts.year,
    datesFetched: opts.datesFetched ?? [],
    espnEvents: allGames.length + parsed.ignored + parsed.unmatchedHeadlines.length,
    tournamentEvents: allGames.length + parsed.unmatchedHeadlines.length,
    ignoredEvents: parsed.ignored,
    teams: {
      count: teamRows.length,
      expected: expectedTeams,
      byRegion,
      missingSeeds,
      duplicateSeeds,
      nameCollisions,
    },
    openingRound: { count: openingGames.length, expected: expectedOpening, games: openingReport },
    firstRound: {
      count: firstRoundGames.length,
      expected: 32,
      withTbdSide,
      expectedTbd: openingGames.length,
      missingSlots,
      tbdSlotMismatches,
    },
    unmatchedHeadlines: parsed.unmatchedHeadlines,
    warnings,
    errors,
  };

  return {
    year: opts.year,
    teams: teamRows,
    openingGames,
    firstRoundGames,
    skeleton,
    finalFourPairing: opts.finalFourPairing,
    report,
    writable: errors.length === 0,
  };
}
