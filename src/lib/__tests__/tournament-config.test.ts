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

  it("falls back to the current year when there is no config row", () => {
    const now = new Date("2027-03-01T12:00:00Z");
    expect(getSeasonInfo(null, "pre_tournament", now).displayYear).toBe(2027);
    expect(getSeasonInfo(undefined, "pre_tournament", now).tournamentYear).toBe(2027);
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
