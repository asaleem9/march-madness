import { describe, it, expect } from "vitest";
import { normalizePhoneE164, isValidE164 } from "../phone";

describe("normalizePhoneE164", () => {
  it("defaults bare 10-digit numbers to +1", () => {
    expect(normalizePhoneE164("5551234567")).toBe("+15551234567");
    expect(normalizePhoneE164("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhoneE164("555.123.4567")).toBe("+15551234567");
  });

  it("accepts an 11-digit number with a leading 1", () => {
    expect(normalizePhoneE164("1 555 123 4567")).toBe("+15551234567");
  });

  it("keeps international numbers with a plus", () => {
    expect(normalizePhoneE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhoneE164("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("rejects garbage, short numbers, and +0", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("   ")).toBeNull();
    expect(normalizePhoneE164("abc")).toBeNull();
    expect(normalizePhoneE164("12345")).toBeNull();
    expect(normalizePhoneE164("+0123456789")).toBeNull();
    expect(normalizePhoneE164("555-1234")).toBeNull();
    expect(normalizePhoneE164("+1 555 123 4567 x12")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("validates the canonical form only", () => {
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("15551234567")).toBe(false);
    expect(isValidE164("+1 555")).toBe(false);
  });
});
