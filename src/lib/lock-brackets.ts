import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { bracketPicks, brackets, tournamentConfig } from "@/db/schema";
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
  db: Db,
  now: Date = new Date()
): Promise<LockResult> {
  const config = await db.query.tournamentConfig.findFirst({
    where: eq(tournamentConfig.id, 1),
    columns: { bracketLockDeadline: true },
  });

  if (
    !config ||
    !isPastDeadline({ bracket_lock_deadline: config.bracketLockDeadline.toISOString() }, now)
  ) {
    return { skipped: true, locked: 0, incomplete: 0 };
  }

  const drafts = await db
    .select({ id: brackets.id })
    .from(brackets)
    .where(eq(brackets.locked, false));

  if (drafts.length === 0) {
    return { skipped: false, locked: 0, incomplete: 0 };
  }

  const draftIds = drafts.map((d) => d.id);
  // Play-ins aren't picked, so they don't count toward a complete bracket.
  const pickCounts = await db
    .select({ bracketId: bracketPicks.bracketId, n: count() })
    .from(bracketPicks)
    .where(and(inArray(bracketPicks.bracketId, draftIds), ne(bracketPicks.round, "first_four")))
    .groupBy(bracketPicks.bracketId);

  const counts = new Map(pickCounts.map((p) => [p.bracketId, p.n]));
  const complete = draftIds.filter((id) => (counts.get(id) ?? 0) >= REQUIRED_PICKS);
  if (complete.length > 0) {
    await db
      .update(brackets)
      .set({ locked: true, updatedAt: now })
      .where(inArray(brackets.id, complete));
  }

  return {
    skipped: false,
    locked: complete.length,
    incomplete: draftIds.length - complete.length,
  };
}
