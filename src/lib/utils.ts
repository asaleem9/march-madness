import type { Round, ScoringMultipliers } from "@/types";

export const DEFAULT_SCORING: ScoringMultipliers = {
  first_round: 10,
  second_round: 20,
  sweet_16: 40,
  elite_eight: 80,
  final_four: 160,
  championship: 320,
};

export function getRoundPoints(
  round: Round,
  multipliers: ScoringMultipliers = DEFAULT_SCORING
): number {
  switch (round) {
    case "first_four":
      return 5;
    case "first_round":
      return multipliers.first_round;
    case "second_round":
      return multipliers.second_round;
    case "sweet_16":
      return multipliers.sweet_16;
    case "elite_eight":
      return multipliers.elite_eight;
    case "final_four":
      return multipliers.final_four;
    case "championship":
      return multipliers.championship;
    default:
      // Defensive: an unexpected round value shouldn't yield NaN points.
      return 0;
  }
}

export function isUpset(winnerSeed: number, loserSeed: number): boolean {
  return winnerSeed > loserSeed;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Only allow same-origin relative redirects. Rejects absolute URLs, protocol-
// relative "//evil.com", backslash tricks, and the "@evil.com" userinfo trick
// (which resolves to a different host once prefixed with the origin).
export function safeRedirectPath(
  redirect: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!redirect) return fallback;
  // Must be a path rooted at "/", but not "//" or "/\" (both can change host).
  if (!redirect.startsWith("/")) return fallback;
  if (redirect.startsWith("//") || redirect.startsWith("/\\")) return fallback;
  // No embedded userinfo/host or scheme.
  if (redirect.includes("@") || redirect.includes("://")) return fallback;
  return redirect;
}

export const ROUND_DISPLAY_NAMES: Record<Round, string> = {
  first_four: "First Four",
  first_round: "First Round",
  second_round: "Second Round",
  sweet_16: "Sweet 16",
  elite_eight: "Elite Eight",
  final_four: "Final Four",
  championship: "Championship",
};

export const REGION_DISPLAY_NAMES: Record<string, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};
