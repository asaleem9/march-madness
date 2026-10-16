import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseESPNScoreboard, type ESPNScoreboard } from "../espn";
import { classifyScoreboards, buildImportPlan, parseHeadline } from "../bracket-import";
import { YEAR_DEFAULTS, r1SlotFor } from "../tournament-structure";

const fixturesDir = path.join(process.cwd(), "src/test/fixtures");
const load = (d: string): ESPNScoreboard => {
  const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, `espn-2026-${d}.json`), "utf8"));
  const parsed = parseESPNScoreboard(raw);
  if (!parsed) throw new Error(`fixture ${d} failed validation`);
  return parsed;
};
const boards2026 = ["0317", "0318", "0319", "0320"].map(load);
const opts2026 = {
  year: 2026,
  dates: YEAR_DEFAULTS[2026].dates,
  finalFourPairing: YEAR_DEFAULTS[2026].finalFourPairing,
  expected: { teams: 68, opening: 4 },
};

describe("parseHeadline", () => {
  it("recognises the 2026 wording", () => {
    expect(parseHeadline("NCAA Men's Basketball Championship - West Region - First Four")).toEqual({
      tournament: true, region: "west", round: "first_four",
    });
    expect(parseHeadline("NCAA Men's Basketball Championship - East Region - 1st Round")).toEqual({
      tournament: true, region: "east", round: "first_round",
    });
  });
  it("recognises the 2027 'Opening Round' wording and later rounds", () => {
    expect(parseHeadline("NCAA Men's Basketball Championship - South Region - Opening Round").round).toBe("first_four");
    expect(parseHeadline("NCAA Men's Basketball Championship - Final Four")).toMatchObject({ tournament: true, round: "other", region: null });
    expect(parseHeadline("NCAA Men's Basketball Championship - Midwest Region - Sweet 16").round).toBe("other");
  });
  it("ignores non-tournament games", () => {
    expect(parseHeadline("NIT - Quarterfinal").tournament).toBe(false);
    expect(parseHeadline(undefined).tournament).toBe(false);
  });
});

describe("2026 replay", () => {
  const classified = classifyScoreboards(boards2026);
  const plan = buildImportPlan(classified, opts2026);

  it("classifies 4 play-ins and 32 first-round games", () => {
    expect(classified.opening).toHaveLength(4);
    expect(classified.firstRound).toHaveLength(32);
    expect(classified.unmatchedHeadlines).toEqual([]);
  });

  it("builds a writable plan with 68 teams and full seed coverage", () => {
    expect(plan.report.errors).toEqual([]);
    expect(plan.writable).toBe(true);
    expect(plan.teams).toHaveLength(68);
    for (const region of ["east", "west", "south", "midwest"] as const) {
      expect(plan.report.teams.missingSeeds[region]).toEqual([]);
      expect(plan.report.teams.duplicateSeeds[region]).toEqual([]);
    }
    expect(plan.report.firstRound.missingSlots).toEqual([]);
    expect(plan.report.firstRound.count).toBe(32);
    expect(plan.skeleton).toHaveLength(63);
  });

  it("feeds each play-in into the right first-round slot", () => {
    const west11 = plan.report.openingRound.games.find((g) => g.region === "west" && g.seed === 11)!;
    expect(west11.feedsSlot).toBe(r1SlotFor("west", 11));
    expect(west11.position).toBe("bottom");
    const midwest16 = plan.openingGames.find((g) => g.region === "midwest" && g.next_game_slot === r1SlotFor("midwest", 16))!;
    expect(midwest16.slot_position).toBe("bottom");
    expect(plan.openingGames.map((g) => g.game_slot)).toEqual([1, 2, 3, 4]);
  });

  it("places the better seed on team_a and carries ESPN ids and tip times", () => {
    const duke = plan.teams.find((t) => t.name === "Duke")!;
    expect(duke).toMatchObject({ seed: 1, region: "east", espn_id: "150" });
    expect(duke.record).toMatch(/^\d+-\d+$/);
    expect(duke.logo_url).toContain("150");
    const slot13 = plan.firstRoundGames.find((g) => g.game_slot === 13)!;
    expect(slot13.team_a_espn_id).toBe("150");
    expect(slot13.espn_game_id).toBeTruthy();
    expect(slot13.scheduled_at).toMatch(/^2026-03-19T/);
    expect(slot13.next_game_slot).toBe(45);
  });

  it("warns when counts differ from the expected field size", () => {
    const plan76 = buildImportPlan(classified, { ...opts2026, expected: { teams: 76, opening: 12 } });
    expect(plan76.report.warnings.join(" ")).toMatch(/Expected 76 teams/);
    expect(plan76.report.warnings.join(" ")).toMatch(/Expected 12 Opening Round/);
    expect(plan76.writable).toBe(true);
  });
});

function competitor(id: string, name: string, seed: number | undefined, homeAway: "home" | "away") {
  return {
    id: `c-${id}`,
    homeAway,
    team: { id, abbreviation: name.slice(0, 4).toUpperCase(), displayName: `${name} Mascots`, shortDisplayName: name, location: name },
    curatedRank: seed == null ? undefined : { current: seed },
    records: [{ type: "total", summary: "20-10" }],
  };
}
function event(id: string, headline: string, a: ReturnType<typeof competitor>, b: ReturnType<typeof competitor>, date = "2027-03-18T16:00Z") {
  return {
    id, date, name: `${b.team.shortDisplayName} at ${a.team.shortDisplayName}`, shortName: "x",
    competitions: [{
      id, date, competitors: [a, b],
      status: { type: { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled" } },
      notes: [{ type: "event", headline }],
    }],
  };
}

describe("2027-style synthetic bracket", () => {
  const board: ESPNScoreboard = {
    events: [
      event("1", "NCAA Men's Basketball Championship - South Region - Opening Round",
        competitor("901", "Alpha", 12, "home"), competitor("902", "Beta", 12, "away"), "2027-03-16T22:00Z"),
      event("2", "NCAA Men's Basketball Championship - South Region - 1st Round",
        competitor("903", "Gamma", 5, "home"), { ...competitor("-1", "TBD", undefined, "away"), curatedRank: undefined }),
      event("3", "NIT - First Round",
        competitor("904", "Delta", 1, "home"), competitor("905", "Epsilon", 8, "away")),
    ],
  };
  const classified = classifyScoreboards([board]);
  const plan = buildImportPlan(classified, { year: 2027, dates: YEAR_DEFAULTS[2027].dates, finalFourPairing: YEAR_DEFAULTS[2027].finalFourPairing });

  it("links the play-in to the TBD side of the 5-seed's game and ignores the NIT", () => {
    expect(classified.ignored).toBe(1);
    expect(classified.opening).toHaveLength(1);
    expect(classified.firstRound).toHaveLength(1);
    const r1 = plan.firstRoundGames[0];
    expect(r1.game_slot).toBe(r1SlotFor("south", 5));
    expect(r1.team_a_espn_id).toBe("903");
    expect(r1.team_b_espn_id).toBeNull();
    expect(plan.openingGames[0]).toMatchObject({ game_slot: 1, next_game_slot: r1.game_slot, slot_position: "bottom" });
    expect(plan.report.firstRound.withTbdSide).toBe(1);
    expect(plan.report.firstRound.tbdSlotMismatches).toEqual([]);
  });

  it("is not writable because most of the bracket is missing", () => {
    expect(plan.writable).toBe(false);
    expect(plan.report.errors.join(" ")).toMatch(/Missing First Round slots/);
    expect(plan.report.teams.missingSeeds.east).toHaveLength(16);
  });

  it("infers the round from seeds when the headline omits it and reports missing seeds", () => {
    const noRound: ESPNScoreboard = {
      events: [
        event("10", "NCAA Men's Basketball Championship - West Region",
          competitor("911", "One", 16, "home"), competitor("912", "Two", 16, "away")),
        event("11", "NCAA Men's Basketball Championship - West Region",
          competitor("913", "Three", undefined, "home"), competitor("914", "Four", 9, "away")),
      ],
    };
    const c = classifyScoreboards([noRound]);
    expect(c.opening).toHaveLength(1);
    expect(c.firstRound).toHaveLength(0);
    expect(c.warnings.join(" ")).toMatch(/No seed for Three/);
  });

  it("renames colliding team names", () => {
    const twoMiamis: ESPNScoreboard = {
      events: [
        event("20", "NCAA Men's Basketball Championship - East Region - 1st Round",
          competitor("921", "Miami", 7, "home"), competitor("922", "Rival", 10, "away")),
        event("21", "NCAA Men's Basketball Championship - West Region - 1st Round",
          { ...competitor("923", "Miami", 11, "home"), team: { ...competitor("923", "Miami", 11, "home").team, abbreviation: "M-OH" } },
          competitor("924", "Other", 6, "away")),
      ],
    };
    const p = buildImportPlan(classifyScoreboards([twoMiamis]), { year: 2027, dates: YEAR_DEFAULTS[2027].dates, finalFourPairing: YEAR_DEFAULTS[2027].finalFourPairing });
    expect(p.report.teams.nameCollisions).toEqual(["Miami"]);
    expect(p.teams.map((t) => t.name).sort()).toContain("Miami (M-OH)");
  });
});
