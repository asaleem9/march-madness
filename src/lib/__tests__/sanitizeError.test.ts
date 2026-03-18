import { describe, it, expect } from "vitest";
import { sanitizeError } from "@/lib/sanitizeError";

describe("sanitizeError", () => {
  it("returns fallback for null/undefined/empty", () => {
    expect(sanitizeError(null)).toBe("Something went wrong. Please try again.");
    expect(sanitizeError(undefined)).toBe("Something went wrong. Please try again.");
    expect(sanitizeError("")).toBe("Something went wrong. Please try again.");
  });

  it("maps duplicate key on brackets to friendly message", () => {
    expect(
      sanitizeError('duplicate key value violates unique constraint "brackets_user_id_key"')
    ).toBe("You already have a bracket");
  });

  it("maps duplicate key on bracket_picks", () => {
    expect(
      sanitizeError('duplicate key value violates unique constraint "bracket_picks_pkey"')
    ).toBe("A pick for this game already exists");
  });

  it("maps foreign key violations", () => {
    expect(
      sanitizeError('insert or update on table "bracket_picks" violates foreign key constraint "bracket_picks_picked_team_id_fkey"')
    ).toBe("Invalid team selection");
    expect(
      sanitizeError('violates foreign key constraint on bracket_id')
    ).toBe("Bracket not found");
    expect(
      sanitizeError('violates foreign key constraint on opponent_id')
    ).toBe("Selected opponent not found");
  });

  it("maps RLS errors", () => {
    expect(sanitizeError("new row violates row-level security policy")).toBe(
      "You don't have permission to do that"
    );
  });

  it("maps JWT expired", () => {
    expect(sanitizeError("JWT expired")).toBe(
      "Your session has expired — please log in again"
    );
  });

  it("maps connection errors", () => {
    expect(sanitizeError("connection refused")).toBe(
      "Service temporarily unavailable — please try again"
    );
    expect(sanitizeError("timeout waiting for connection")).toBe(
      "Service temporarily unavailable — please try again"
    );
  });

  it("maps check constraint violations", () => {
    expect(sanitizeError('violates check constraint "valid_status"')).toBe(
      "Invalid data provided"
    );
  });

  it("maps not-null violations", () => {
    expect(sanitizeError('violates not-null constraint on column "name"')).toBe(
      "Missing required field"
    );
  });

  it("maps deadlock/serialization errors", () => {
    expect(sanitizeError("deadlock detected")).toBe("Please try again");
    expect(sanitizeError("could not serialize access")).toBe("Please try again");
  });

  it("returns fallback for unknown errors", () => {
    expect(sanitizeError("some random internal error")).toBe(
      "Something went wrong. Please try again."
    );
  });

  it("is case-insensitive", () => {
    expect(sanitizeError("DEADLOCK DETECTED")).toBe("Please try again");
    expect(sanitizeError("JWT Expired")).toBe(
      "Your session has expired — please log in again"
    );
  });
});
