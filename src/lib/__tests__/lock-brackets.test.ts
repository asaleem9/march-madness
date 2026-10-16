import { describe, it, expect } from "vitest";
import { createRecordingClient } from "@/test/helpers";
import { lockBracketsPastDeadline } from "../lock-brackets";
import type { SupabaseClient } from "@supabase/supabase-js";

const picksFor = (bracketId: string, n: number, extraFirstFour = 0) => [
  ...Array.from({ length: n }, (_, i) => ({ bracket_id: bracketId, round: i === 0 ? "championship" : "first_round" })),
  ...Array.from({ length: extraFirstFour }, () => ({ bracket_id: bracketId, round: "first_four" })),
];

function client(deadline: string, drafts: string[], picks: { bracket_id: string; round: string }[]) {
  return createRecordingClient((table) => {
    if (table === "tournament_config") return { bracket_lock_deadline: deadline };
    if (table === "brackets") return drafts.map((id) => ({ id }));
    if (table === "bracket_picks") return picks;
    return null;
  });
}

describe("lockBracketsPastDeadline", () => {
  it("does nothing before the deadline", async () => {
    const c = client("2027-03-18T16:00:00Z", ["a"], picksFor("a", 63));
    const r = await lockBracketsPastDeadline(c as unknown as SupabaseClient, new Date("2027-03-18T15:59:00Z"));
    expect(r).toEqual({ skipped: true, locked: 0, incomplete: 0 });
    expect(c.updates("brackets")).toHaveLength(0);
  });

  it("locks complete drafts only, ignoring play-in picks", async () => {
    const c = client("2027-03-18T16:00:00Z", ["full", "short", "padded"], [
      ...picksFor("full", 63),
      ...picksFor("short", 40),
      ...picksFor("padded", 60, 12), // 60 real + 12 play-ins = still incomplete
    ]);
    const r = await lockBracketsPastDeadline(c as unknown as SupabaseClient, new Date("2027-03-18T16:00:01Z"));
    expect(r).toEqual({ skipped: false, locked: 1, incomplete: 2 });
    const upd = c.updates("brackets")[0];
    expect(upd.args[0]).toMatchObject({ locked: true });
    const inCall = c.filtersAfter(upd).find((f) => f.method === "in");
    expect(inCall?.args).toEqual(["id", ["full"]]);
  });

  it("handles no drafts", async () => {
    const c = client("2027-03-18T16:00:00Z", [], []);
    const r = await lockBracketsPastDeadline(c as unknown as SupabaseClient, new Date("2027-03-19T00:00:00Z"));
    expect(r).toEqual({ skipped: false, locked: 0, incomplete: 0 });
  });
});
