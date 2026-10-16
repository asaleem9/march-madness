import type { SupabaseClient } from "@supabase/supabase-js";
import { REQUIRED_PICKS } from "./tournament-structure";
import { isPastDeadline } from "./tournament-config";

export interface LockResult {
  skipped: boolean;
  locked: number;
  incomplete: number;
}

/**
 * Once the lock deadline has passed, finalize every draft that has a complete
 * set of picks so it counts on the leaderboard even if the owner never pressed
 * "Finalize". Incomplete drafts stay unlocked (and excluded). Idempotent.
 */
export async function lockBracketsPastDeadline(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<LockResult> {
  const { data: config } = await admin
    .from("tournament_config")
    .select("bracket_lock_deadline")
    .eq("id", 1)
    .maybeSingle();

  if (!config || !isPastDeadline(config, now)) {
    return { skipped: true, locked: 0, incomplete: 0 };
  }

  const { data: drafts } = await admin
    .from("brackets")
    .select("id")
    .eq("locked", false);

  if (!drafts || drafts.length === 0) {
    return { skipped: false, locked: 0, incomplete: 0 };
  }

  const draftIds = drafts.map((d) => d.id as string);
  const { data: picks } = await admin
    .from("bracket_picks")
    .select("bracket_id, round")
    .in("bracket_id", draftIds);

  const counts = new Map<string, number>();
  for (const p of picks ?? []) {
    if (p.round === "first_four") continue; // play-ins aren't picked
    counts.set(p.bracket_id, (counts.get(p.bracket_id) ?? 0) + 1);
  }

  const complete = draftIds.filter((id) => (counts.get(id) ?? 0) >= REQUIRED_PICKS);
  if (complete.length > 0) {
    await admin
      .from("brackets")
      .update({ locked: true, updated_at: now.toISOString() })
      .in("id", complete);
  }

  return {
    skipped: false,
    locked: complete.length,
    incomplete: draftIds.length - complete.length,
  };
}
