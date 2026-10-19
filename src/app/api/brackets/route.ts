import { NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bracketPicks, brackets, games, profiles, tournamentConfig } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sanitizeError } from "@/lib/sanitizeError";
import { REQUIRED_PICKS } from "@/lib/tournament-structure";
import { isPastDeadline as deadlinePassed } from "@/lib/tournament-config";
import { countablePicks, validatePicks, type PickInput, type ValidPick } from "@/lib/validate-picks";

/** The pg error text is on `cause` when Drizzle wraps a failed query. */
function dbErrorMessage(err: unknown): string | undefined {
  const e = err as { message?: string; cause?: { message?: string } };
  return e?.cause?.message ?? e?.message;
}

// The bracket lock deadline is the real cutoff for any pick changes. Nothing
// else enforces it for these writes, so it must run before every insert/upsert.
async function isPastDeadline(): Promise<boolean> {
  const [config] = await db
    .select({ deadline: tournamentConfig.bracketLockDeadline })
    .from(tournamentConfig)
    .where(eq(tournamentConfig.id, 1))
    .limit(1);

  return deadlinePassed(
    config ? { bracket_lock_deadline: config.deadline.toISOString() } : null
  );
}

/**
 * Check the request's picks against the bracket tree (slot range, feeder
 * consistency, play-in handling) and return rows ready for `bracket_picks`.
 * The database can't enforce any of this, so it has to happen here.
 */
async function checkPicks(
  input: PickInput[]
): Promise<{ ok: true; picks: ValidPick[] } | { ok: false; response: NextResponse }> {
  if (input.length === 0) return { ok: true, picks: [] };
  const tree = await db
    .select({
      gameSlot: games.gameSlot,
      round: games.round,
      nextGameSlot: games.nextGameSlot,
      teamAId: games.teamAId,
      teamBId: games.teamBId,
    })
    .from(games);
  const result = validatePicks(input, tree);
  if (!result.ok) {
    return { ok: false, response: NextResponse.json({ error: result.error }, { status: 400 }) };
  }
  return result;
}

function toPickRows(bracketId: string, picks: ValidPick[]) {
  return picks.map((p) => ({ bracketId, gameSlot: p.gameSlot, round: p.round, pickedTeamId: p.pickedTeamId }));
}

function incompleteResponse() {
  return NextResponse.json(
    { error: `All ${REQUIRED_PICKS} picks are required to finalize your bracket` },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, lock } = body;
  const rawPicks = (Array.isArray(body.picks) ? body.picks : []) as PickInput[];

  // Enforce the lock deadline — no new brackets or picks once it passes
  if (await isPastDeadline()) {
    return NextResponse.json(
      { error: "The bracket deadline has passed. Brackets are locked." },
      { status: 403 }
    );
  }

  // Enforce one bracket per user
  const [existing] = await db
    .select({ id: brackets.id })
    .from(brackets)
    .where(eq(brackets.userId, user.id))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "You already have a bracket", bracketId: existing.id },
      { status: 409 }
    );
  }

  // If locking, require all picks
  if (lock && countablePicks(rawPicks.map((p) => ({ gameSlot: Number(p.game_slot) }))) < REQUIRED_PICKS) {
    return incompleteResponse();
  }

  const checked = await checkPicks(rawPicks);
  if (!checked.ok) return checked.response;
  const picks = checked.picks;
  if (lock && picks.length < REQUIRED_PICKS) return incompleteResponse();

  let bracketName: string = typeof name === "string" && name.trim() ? name : "";
  if (!bracketName) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    const who = profile?.displayName || user.name || user.email?.split("@")[0] || "My";
    bracketName = `${who}'s Bracket`;
  }

  // Create the bracket and its picks together: if a pick row is rejected the
  // bracket is rolled back with it.
  let bracketId: string;
  try {
    bracketId = await db.transaction(async (tx) => {
      const [bracket] = await tx
        .insert(brackets)
        .values({
          userId: user.id,
          name: bracketName,
          isPrimary: true,
          locked: !!lock,
        })
        .returning({ id: brackets.id });

      if (picks.length > 0) {
        await tx.insert(bracketPicks).values(toPickRows(bracket.id, picks));
      }
      return bracket.id;
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(dbErrorMessage(err)) },
      { status: 500 }
    );
  }

  return NextResponse.json({ bracketId, locked: !!lock });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bracketId, name, lock } = body;
  const rawPicks = (Array.isArray(body.picks) ? body.picks : []) as PickInput[];

  // Verify ownership and lock status. A malformed id is just "not found".
  let bracket: { id: string; userId: string; locked: boolean | null } | undefined;
  if (typeof bracketId === "string") {
    try {
      [bracket] = await db
        .select({ id: brackets.id, userId: brackets.userId, locked: brackets.locked })
        .from(brackets)
        .where(eq(brackets.id, bracketId))
        .limit(1);
    } catch {
      bracket = undefined;
    }
  }

  if (!bracket || bracket.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (bracket.locked) {
    return NextResponse.json({ error: "Bracket is locked" }, { status: 403 });
  }

  // Once the deadline passes, no more edits — even for an unlocked bracket
  if (await isPastDeadline()) {
    return NextResponse.json(
      { error: "The bracket deadline has passed. Brackets are locked." },
      { status: 403 }
    );
  }

  // If locking, require all picks
  if (lock && countablePicks(rawPicks.map((p) => ({ gameSlot: Number(p.game_slot) }))) < REQUIRED_PICKS) {
    return incompleteResponse();
  }

  const checked = await checkPicks(rawPicks);
  if (!checked.ok) return checked.response;
  const picks = checked.picks;
  if (lock && picks.length < REQUIRED_PICKS) return incompleteResponse();

  // Replace the picks and (only once they're all saved) lock, as one unit: if
  // any pick is rejected nothing changes and the old picks are preserved.
  try {
    await db.transaction(async (tx) => {
      const updateFields: Partial<typeof brackets.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (typeof name === "string" && name) updateFields.name = name;
      await tx.update(brackets).set(updateFields).where(eq(brackets.id, bracketId));

      if (picks.length > 0) {
        const pickRows = toPickRows(bracketId, picks);

        await tx
          .insert(bracketPicks)
          .values(pickRows)
          .onConflictDoUpdate({
            target: [bracketPicks.bracketId, bracketPicks.gameSlot],
            set: {
              round: sql`excluded.round`,
              pickedTeamId: sql`excluded.picked_team_id`,
            },
          });

        // Remove any stale picks not in the new set
        const newGameSlots = pickRows.map((p) => p.gameSlot);
        await tx
          .delete(bracketPicks)
          .where(
            and(
              eq(bracketPicks.bracketId, bracketId),
              notInArray(bracketPicks.gameSlot, newGameSlots)
            )
          );
      }

      // Lock only after picks saved successfully
      if (lock) {
        await tx.update(brackets).set({ locked: true }).where(eq(brackets.id, bracketId));
      }
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(dbErrorMessage(err)) },
      { status: 500 }
    );
  }

  return NextResponse.json({ bracketId, locked: !!lock });
}
