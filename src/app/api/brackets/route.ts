import { NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bracketPicks, brackets, games, profiles, tournamentConfig } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sanitizeError } from "@/lib/sanitizeError";
import { REQUIRED_PICKS } from "@/lib/tournament-structure";
import { isPastDeadline as deadlinePassed } from "@/lib/tournament-config";
import { countablePicks, validatePicks, type PickInput, type ValidPick } from "@/lib/validate-picks";

/** Same limit as the bracket-name input in the builder. */
const BRACKET_NAME_MAX = 60;

/** The pg error text is on `cause` when Drizzle wraps a failed query. */
function dbErrorMessage(err: unknown): string | undefined {
  const e = err as { message?: string; cause?: { message?: string } };
  return e?.cause?.message ?? e?.message;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  if ((e?.cause?.code ?? e?.code) === "23505") return true;
  return (dbErrorMessage(err) ?? "").toLowerCase().includes("duplicate key");
}

/** Thrown inside the save transaction when the bracket turns out to be locked. */
class BracketLockedError extends Error {}

/** A JSON object whose `picks`, when present, is an array of objects. */
function isValidBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const picks = (body as { picks?: unknown }).picks;
  return !Array.isArray(picks) || picks.every((p) => !!p && typeof p === "object");
}

function invalidBodyResponse() {
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}

/** The name as it will be stored: trimmed and capped; "" when blank or not a string. */
function cleanName(name: unknown): string {
  return typeof name === "string" ? name.trim().slice(0, BRACKET_NAME_MAX) : "";
}

// The bracket lock deadline is the real cutoff for any pick changes. Nothing
// else enforces it for these writes, so it must run before every insert/upsert.
// With no config row there is no season to pick for, so that is closed too.
// Returns the reason brackets can't be written, or null while they're open.
async function closedReason(): Promise<string | null> {
  const [config] = await db
    .select({ deadline: tournamentConfig.bracketLockDeadline })
    .from(tournamentConfig)
    .where(eq(tournamentConfig.id, 1))
    .limit(1);

  if (!config) return "Brackets aren't open yet.";
  return deadlinePassed({ bracket_lock_deadline: config.deadline.toISOString() })
    ? "The bracket deadline has passed. Brackets are locked."
    : null;
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

  const body = await request.json().catch(() => null);
  if (!isValidBody(body)) return invalidBodyResponse();
  const { name, lock } = body;
  const rawPicks = (Array.isArray(body.picks) ? body.picks : []) as PickInput[];

  // Enforce the lock deadline — no new brackets or picks once it passes
  const closed = await closedReason();
  if (closed) {
    return NextResponse.json({ error: closed }, { status: 403 });
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

  let bracketName = cleanName(name);
  if (!bracketName) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    const who = profile?.displayName || user.name || user.email?.split("@")[0] || "My";
    bracketName = cleanName(`${who}'s Bracket`);
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
    // Two creates raced (a double submit) and the one-bracket-per-user index
    // stopped this one: answer like the check above so the client goes to the
    // bracket that was created.
    if (isUniqueViolation(err)) {
      const [winner] = await db
        .select({ id: brackets.id })
        .from(brackets)
        .where(eq(brackets.userId, user.id))
        .limit(1);
      if (winner) {
        return NextResponse.json(
          { error: "You already have a bracket", bracketId: winner.id },
          { status: 409 }
        );
      }
    }
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

  const body = await request.json().catch(() => null);
  if (!isValidBody(body)) return invalidBodyResponse();
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
  const closed = await closedReason();
  if (closed) {
    return NextResponse.json({ error: closed }, { status: 403 });
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
      // Re-check the lock while holding the row: a finalize from another tab
      // (or the deadline cron) may have landed since the check above, and a
      // locked bracket's picks must never change.
      const [current] = await tx
        .select({ locked: brackets.locked })
        .from(brackets)
        .where(eq(brackets.id, bracketId))
        .for("update");
      if (!current || current.locked) throw new BracketLockedError();

      const updateFields: Partial<typeof brackets.$inferInsert> = {
        updatedAt: new Date(),
      };
      const newName = cleanName(name);
      if (newName) updateFields.name = newName;
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
    if (err instanceof BracketLockedError) {
      return NextResponse.json({ error: "Bracket is locked" }, { status: 403 });
    }
    return NextResponse.json(
      { error: sanitizeError(dbErrorMessage(err)) },
      { status: 500 }
    );
  }

  return NextResponse.json({ bracketId, locked: !!lock });
}
