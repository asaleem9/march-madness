import { describe, it, expect } from "vitest";
import { toLocalInput, fromLocalInput, formatUtc, sameInstant, relativeTime } from "../datetime";

describe("toLocalInput", () => {
  it("renders the instant in the browser's local zone (not UTC)", () => {
    // Build a local instant so the expectation holds in any TZ the test runs in.
    const local = new Date(2027, 2, 18, 12, 0); // Mar 18 2027 12:00 local
    expect(toLocalInput(local.toISOString())).toBe("2027-03-18T12:00");
  });

  it("zero-pads month, day, hour and minute", () => {
    const local = new Date(2027, 0, 5, 7, 3);
    expect(toLocalInput(local.toISOString())).toBe("2027-01-05T07:03");
  });

  it("returns empty string for null/empty/invalid", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput(undefined)).toBe("");
    expect(toLocalInput("")).toBe("");
    expect(toLocalInput("not a date")).toBe("");
  });
});

describe("fromLocalInput", () => {
  it("treats the input as local time and returns a UTC ISO string", () => {
    const expected = new Date(2027, 2, 18, 12, 0).toISOString();
    expect(fromLocalInput("2027-03-18T12:00")).toBe(expected);
  });

  it("round-trips with toLocalInput", () => {
    const iso = "2027-03-18T16:00:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it("guards NaN and empty values", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("garbage")).toBeNull();
    expect(fromLocalInput("2027-13-45T99:99")).toBeNull();
  });
});

describe("formatUtc / sameInstant", () => {
  it("formats as YYYY-MM-DD HH:mm UTC", () => {
    expect(formatUtc("2027-03-18T16:00:00Z")).toBe("2027-03-18 16:00 UTC");
    expect(formatUtc("2027-03-18T16:00:00+02:00")).toBe("2027-03-18 14:00 UTC");
    expect(formatUtc("nope")).toBe("");
  });

  it("treats Z and +00:00 as the same instant", () => {
    expect(sameInstant("2027-03-18T16:00:00Z", "2027-03-18T16:00:00+00:00")).toBe(true);
    expect(sameInstant("2027-03-18T16:00:00Z", "2027-03-18T16:01:00Z")).toBe(false);
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, "2027-03-18T16:00:00Z")).toBe(false);
  });
});

describe("relativeTime", () => {
  const now = new Date("2027-03-18T16:00:00Z");
  it("formats past and future deltas", () => {
    expect(relativeTime("2027-03-18T15:59:50Z", now)).toBe("just now");
    expect(relativeTime("2027-03-18T15:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2027-03-18T13:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2027-03-16T16:00:00Z", now)).toBe("2 d ago");
    expect(relativeTime("2027-03-18T16:10:00Z", now)).toBe("in 10 min");
  });
  it("handles missing values", () => {
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime("bad", now)).toBe("unknown");
  });
});
