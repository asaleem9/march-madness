import { describe, it, expect } from "vitest";
import { getEffectivePhase, getSeasonInfo } from "../tournament-config";
import { YEAR_DEFAULTS } from "../tournament-structure";

const config = {
  year: 2026,
  active_phase: "pre_tournament" as const,
  bracket_lock_deadline: "2026-03-19T16:00:00Z",
};

describe("getSeasonInfo", () => {
  it("brands the site as next year once the championship is decided", () => {
    const season = getSeasonInfo(config, "completed");
    expect(season).toMatchObject({
      tournamentYear: 2026,
      displayYear: 2027,
      offSeason: true,
    });
    expect(season.upcoming).toBe(YEAR_DEFAULTS[2027]);
    expect(season.upcoming?.selectionSunday).toBe("2027-03-14");
  });

  it("keeps the tournament year before and during the tournament", () => {
    for (const phase of ["pre_tournament", "first_round", "sweet_16", "championship"] as const) {
      const season = getSeasonInfo(config, phase);
      expect(season).toEqual({
        tournamentYear: 2026,
        displayYear: 2026,
        offSeason: false,
        upcoming: null,
      });
    }
  });

  it("treats a missing config row as the off-season after the last tournament", () => {
    const phase = getEffectivePhase(null, false);
    expect(phase).toBe("completed");

    const autumn = getSeasonInfo(null, phase, new Date("2026-10-19T12:00:00Z"));
    expect(autumn).toMatchObject({ tournamentYear: 2026, displayYear: 2027, offSeason: true });
    expect(autumn.upcoming).toBe(YEAR_DEFAULTS[2027]);

    // Before mid-April the previous year's tournament is still the last one decided.
    const march = getSeasonInfo(undefined, phase, new Date("2027-03-01T12:00:00Z"));
    expect(march).toMatchObject({ tournamentYear: 2026, displayYear: 2027 });
    const lateApril = getSeasonInfo(undefined, phase, new Date("2027-04-20T12:00:00Z"));
    expect(lateApril).toMatchObject({ tournamentYear: 2027, displayYear: 2028 });
  });

  it("has no upcoming dates for a year without defaults", () => {
    const season = getSeasonInfo({ year: 2030 }, "completed");
    expect(season.displayYear).toBe(2031);
    expect(season.upcoming).toBeNull();
  });

  it("composes with getEffectivePhase: a champion means off-season", () => {
    const phase = getEffectivePhase(config, true);
    expect(getSeasonInfo(config, phase).offSeason).toBe(true);
    expect(getSeasonInfo(config, getEffectivePhase(config, false)).offSeason).toBe(false);
  });
});
