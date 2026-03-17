import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDateForESPN, parseGameStatus, fetchESPNScoreboard } from "../espn";

describe("formatDateForESPN", () => {
  it("formats standard date", () => {
    expect(formatDateForESPN(new Date(2026, 2, 19))).toBe("20260319");
  });

  it("pads single-digit month", () => {
    expect(formatDateForESPN(new Date(2026, 0, 5))).toBe("20260105");
  });

  it("pads single-digit day", () => {
    expect(formatDateForESPN(new Date(2026, 11, 1))).toBe("20261201");
  });

  it("handles end of year", () => {
    expect(formatDateForESPN(new Date(2026, 11, 31))).toBe("20261231");
  });
});

describe("parseGameStatus", () => {
  it('maps "post" to "final"', () => {
    expect(parseGameStatus("post")).toBe("final");
  });

  it('maps "in" to "in_progress"', () => {
    expect(parseGameStatus("in")).toBe("in_progress");
  });

  it('maps "pre" to "scheduled"', () => {
    expect(parseGameStatus("pre")).toBe("scheduled");
  });

  it('maps unknown state to "scheduled"', () => {
    expect(parseGameStatus("unknown")).toBe("scheduled");
  });

  it('maps empty string to "scheduled"', () => {
    expect(parseGameStatus("")).toBe("scheduled");
  });
});

describe("fetchESPNScoreboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validResponse = {
    events: [
      {
        id: "401234567",
        date: "2026-03-19T18:00Z",
        name: "Duke vs Siena",
        shortName: "DUKE vs SIENA",
        competitions: [
          {
            id: "401234567",
            date: "2026-03-19T18:00Z",
            competitors: [
              {
                id: "150",
                team: {
                  id: "150",
                  abbreviation: "DUKE",
                  displayName: "Duke Blue Devils",
                  shortDisplayName: "Duke",
                },
                score: "78",
                winner: true,
              },
              {
                id: "399",
                team: {
                  id: "399",
                  abbreviation: "SIENA",
                  displayName: "Siena Saints",
                  shortDisplayName: "Siena",
                },
                score: "55",
                winner: false,
              },
            ],
            status: {
              type: {
                id: "3",
                name: "STATUS_FINAL",
                state: "post",
                completed: true,
                description: "Final",
              },
            },
          },
        ],
      },
    ],
  };

  it("returns parsed data for valid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validResponse),
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).not.toBeNull();
    expect(result!.events).toHaveLength(1);
    expect(result!.events[0].id).toBe("401234567");
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).toBeNull();
  });

  it("returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).toBeNull();
  });

  it("returns null on malformed JSON (missing events)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ noEvents: true }),
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).toBeNull();
  });

  it("returns valid result for empty events array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).not.toBeNull();
    expect(result!.events).toHaveLength(0);
  });

  it("returns null on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).toBeNull();
  });

  it("handles competitor without score (optional field)", async () => {
    const noScoreResponse = structuredClone(validResponse);
    delete noScoreResponse.events[0].competitions[0].competitors[0].score;
    delete noScoreResponse.events[0].competitions[0].competitors[1].score;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(noScoreResponse),
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).not.toBeNull();
  });

  it("handles competitor without winner field (optional)", async () => {
    const noWinnerResponse = structuredClone(validResponse);
    delete noWinnerResponse.events[0].competitions[0].competitors[0].winner;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(noWinnerResponse),
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).not.toBeNull();
  });

  it("returns null when status.type is missing", async () => {
    const badStatus = structuredClone(validResponse);
    (badStatus.events[0].competitions[0] as Record<string, unknown>).status = {};

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(badStatus),
      })
    );

    const result = await fetchESPNScoreboard("20260319");
    expect(result).toBeNull();
  });

  it("uses correct URL format", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNScoreboard("20260319");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260319&groups=100",
      expect.any(Object)
    );
  });
});
