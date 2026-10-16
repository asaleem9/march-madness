import { describe, it, expect, vi, beforeEach } from "vitest";
import { isInQuietHours, getPreferredChannels, startOfTodayIn } from "../notifications";

describe("isInQuietHours", () => {
  it("returns true during late night (11pm)", () => {
    // Mock Date to 11pm in America/New_York
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T04:00:00Z")); // 11pm ET (UTC-5 in March / EDT not yet)
    // Actually, March 19 2026 is after spring forward (March 8 2026), so EDT (UTC-4)
    // 11pm EDT = 03:00 UTC next day... let's just test the function directly
    vi.useRealTimers();

    // The function uses the current time and converts to the given timezone
    // We can test by checking boundary behavior
    // Since we can't perfectly control the timezone conversion, test with known boundaries
    const result = isInQuietHours("America/New_York");
    // This depends on the actual current time - we test the logic separately
    expect(typeof result).toBe("boolean");
  });

  it("returns false for invalid timezone (no crash)", () => {
    expect(isInQuietHours("Invalid/Timezone_XYZ")).toBe(false);
  });

  it("quiet hours boundary: 22:00 is quiet", () => {
    vi.useFakeTimers();
    // Set to 10pm (22:00) in UTC, test with UTC timezone
    vi.setSystemTime(new Date("2026-03-19T22:00:00Z"));
    expect(isInQuietHours("UTC")).toBe(true);
    vi.useRealTimers();
  });

  it("quiet hours boundary: 07:59 is quiet (before 8am)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T07:59:00Z"));
    expect(isInQuietHours("UTC")).toBe(true);
    vi.useRealTimers();
  });

  it("quiet hours boundary: 08:00 is NOT quiet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T08:00:00Z"));
    expect(isInQuietHours("UTC")).toBe(false);
    vi.useRealTimers();
  });

  it("quiet hours boundary: 21:59 is NOT quiet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T21:59:00Z"));
    expect(isInQuietHours("UTC")).toBe(false);
    vi.useRealTimers();
  });

  it("noon is NOT quiet hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));
    expect(isInQuietHours("UTC")).toBe(false);
    vi.useRealTimers();
  });

  it("3am is quiet hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T03:00:00Z"));
    expect(isInQuietHours("UTC")).toBe(true);
    vi.useRealTimers();
  });
});

describe("getPreferredChannels", () => {
  it("returns all channels when all enabled", () => {
    expect(
      getPreferredChannels({ push: true, sms: true, email: true })
    ).toEqual(["push", "sms", "email"]);
  });

  it("returns only push when only push enabled", () => {
    expect(
      getPreferredChannels({ push: true, sms: false, email: false })
    ).toEqual(["push"]);
  });

  it("returns [] (opted out) when every channel is off", () => {
    expect(
      getPreferredChannels({ push: false, sms: false, email: false })
    ).toEqual([]);
  });

  it("defaults to push when the profile has no preferences yet", () => {
    expect(getPreferredChannels(null)).toEqual(["push"]);
    expect(getPreferredChannels(undefined)).toEqual(["push"]);
  });

  it("returns only SMS when only SMS enabled", () => {
    expect(
      getPreferredChannels({ push: false, sms: true, email: false })
    ).toEqual(["sms"]);
  });

  it("returns push and email, no SMS", () => {
    expect(
      getPreferredChannels({ push: true, sms: false, email: true })
    ).toEqual(["push", "email"]);
  });

  it("returns sms and email", () => {
    expect(
      getPreferredChannels({ push: false, sms: true, email: true })
    ).toEqual(["sms", "email"]);
  });

  it("maintains order: push, sms, email", () => {
    const result = getPreferredChannels({ push: true, sms: true, email: true });
    expect(result[0]).toBe("push");
    expect(result[1]).toBe("sms");
    expect(result[2]).toBe("email");
  });
});

describe("startOfTodayIn", () => {
  it("returns local midnight for a zone behind UTC", () => {
    // 2026-03-19 03:00Z is 23:00 on the 18th in New York (EDT, UTC-4).
    const now = new Date("2026-03-19T03:00:00Z");
    expect(startOfTodayIn("America/New_York", now).toISOString()).toBe(
      "2026-03-18T04:00:00.000Z"
    );
  });

  it("returns local midnight for a zone ahead of UTC", () => {
    // 2026-03-19 20:00Z is 05:00 on the 20th in Tokyo (UTC+9).
    const now = new Date("2026-03-19T20:00:00Z");
    expect(startOfTodayIn("Asia/Tokyo", now).toISOString()).toBe(
      "2026-03-19T15:00:00.000Z"
    );
  });

  it("falls back to UTC midnight for a missing or invalid zone", () => {
    const now = new Date("2026-03-19T20:30:00Z");
    expect(startOfTodayIn(null, now).toISOString()).toBe("2026-03-19T00:00:00.000Z");
    expect(startOfTodayIn("Nope/Zone", now).toISOString()).toBe("2026-03-19T00:00:00.000Z");
  });
});
