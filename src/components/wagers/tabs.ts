/**
 * Wager page tabs. Lives outside the client component so the server page can
 * resolve `?tab=` without crossing the client boundary.
 */
export type WagerTab = "pending" | "accepted" | "history";

export const WAGER_TABS: { key: WagerTab; label: string }[] = [
  { key: "pending", label: "PENDING" },
  { key: "accepted", label: "ACTIVE" },
  { key: "history", label: "HISTORY" },
];

/** `?tab=pending|active|history` (the dashboard deep-links here); `accepted` is accepted as an alias. */
export function tabFromParam(value: string | null | undefined): WagerTab {
  switch (value) {
    case "pending":
    case "history":
      return value;
    case "active":
    case "accepted":
      return "accepted";
    default:
      return "pending";
  }
}
