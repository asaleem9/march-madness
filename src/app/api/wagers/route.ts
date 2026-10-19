import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { brackets, notificationQueue, profiles, tournamentConfig, wagers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sanitizeError } from "@/lib/sanitizeError";
import { isPastWagerDeadline } from "@/lib/tournament-config";

const STAKES_MAX_LENGTH = 120;

/** The pg error text is on `cause` when Drizzle wraps a failed query. */
function dbErrorMessage(err: unknown): string | undefined {
  const e = err as { message?: string; cause?: { message?: string } };
  return e?.cause?.message ?? e?.message;
}

/** Display name from `profiles` (the source of truth), never the auth record. */
async function displayNameOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.displayName || "Someone";
}

/** The user's own bracket by id (or their only bracket when no id is given). */
async function ownBracketId(userId: string, bracketId?: unknown): Promise<string | null> {
  const where =
    typeof bracketId === "string"
      ? and(eq(brackets.id, bracketId), eq(brackets.userId, userId))
      : eq(brackets.userId, userId);
  try {
    const [row] = await db.select({ id: brackets.id }).from(brackets).where(where).limit(1);
    return row?.id ?? null;
  } catch {
    // A malformed uuid is just "no such bracket".
    return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { opponent_id, challenger_bracket_id } = body;
  const stakes = typeof body.stakes === "string" ? body.stakes.trim() : "";

  if (!opponent_id || !challenger_bracket_id || !stakes) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (stakes.length > STAKES_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Stakes must be ${STAKES_MAX_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  if (opponent_id === user.id) {
    return NextResponse.json(
      { error: "You can't wager against yourself" },
      { status: 400 }
    );
  }

  // Check wager deadline
  const [config] = await db
    .select({ deadline: tournamentConfig.wagerCreationDeadline })
    .from(tournamentConfig)
    .where(eq(tournamentConfig.id, 1))
    .limit(1);

  if (
    isPastWagerDeadline(
      config ? { wager_creation_deadline: config.deadline.toISOString() } : null
    )
  ) {
    return NextResponse.json(
      { error: "Wager creation deadline has passed" },
      { status: 403 }
    );
  }

  // Verify bracket ownership
  const bracketId = await ownBracketId(user.id, challenger_bracket_id);
  if (!bracketId) {
    return NextResponse.json({ error: "Invalid bracket" }, { status: 400 });
  }

  let wagerId: string;
  try {
    [{ id: wagerId }] = await db
      .insert(wagers)
      .values({
        challengerId: user.id,
        opponentId: opponent_id,
        challengerBracketId: bracketId,
        stakes,
      })
      .returning({ id: wagers.id });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(dbErrorMessage(err)) }, { status: 500 });
  }

  // Queue the challenge for the opponent.
  await db.insert(notificationQueue).values({
    userId: opponent_id,
    type: "wager_request",
    payload: {
      wager_id: wagerId,
      challenger_name: await displayNameOf(user.id),
      stakes,
    },
  });

  return NextResponse.json({ wagerId });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { wager_id, action, bracket_id } = body;

  let wager: typeof wagers.$inferSelect | undefined;
  if (typeof wager_id === "string") {
    try {
      wager = await db.query.wagers.findFirst({ where: eq(wagers.id, wager_id) });
    } catch {
      wager = undefined;
    }
  }

  if (!wager) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (wager.status !== "pending") {
    return NextResponse.json(
      { error: "Wager already responded to" },
      { status: 400 }
    );
  }

  // Who gets told about this change, and what the message calls the actor.
  let notifyUserId: string;
  let status: "accepted" | "declined" | "revoked";
  // Rows moved by the guarded update; 0 means someone else got there first.
  let moved: { id: string }[] = [];

  // Challenger can revoke, opponent can accept/decline. Only the pending wager
  // moves, and only to accepted/declined — nobody can resolve one here.
  try {
    if (action === "revoke") {
      if (wager.challengerId !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      moved = await db
        .update(wagers)
        .set({ status: "declined" })
        .where(and(eq(wagers.id, wager.id), eq(wagers.status, "pending")))
        .returning({ id: wagers.id });
      notifyUserId = wager.opponentId;
      status = "revoked";
    } else if (action === "accept") {
      if (wager.opponentId !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // The accepting user must have a bracket — it's what the wager is scored
      // against. Use the one they sent (must be theirs) or fall back to their own.
      const opponentBracketId = await ownBracketId(user.id, bracket_id);
      if (!opponentBracketId) {
        return NextResponse.json(
          { error: bracket_id ? "Invalid bracket" : "Create a bracket first" },
          { status: 400 }
        );
      }
      moved = await db
        .update(wagers)
        .set({ status: "accepted", opponentBracketId })
        .where(and(eq(wagers.id, wager.id), eq(wagers.status, "pending")))
        .returning({ id: wagers.id });
      notifyUserId = wager.challengerId;
      status = "accepted";
    } else if (action === "decline") {
      if (wager.opponentId !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      moved = await db
        .update(wagers)
        .set({ status: "declined" })
        .where(and(eq(wagers.id, wager.id), eq(wagers.status, "pending")))
        .returning({ id: wagers.id });
      notifyUserId = wager.challengerId;
      status = "declined";
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(dbErrorMessage(err)) }, { status: 500 });
  }

  if (moved.length === 0) {
    // Lost a race with the other party's response (or a revoke): nothing changed,
    // so don't send a message that contradicts theirs.
    return NextResponse.json({ error: "Wager already responded to" }, { status: 409 });
  }

  // Tell the other party. The enum has no wager_update value, so this rides on
  // wager_result with `status` in the payload (notification-copy reads it).
  await db.insert(notificationQueue).values({
    userId: notifyUserId,
    type: "wager_result",
    payload: {
      wager_id: wager.id,
      status,
      opponent_name: await displayNameOf(user.id),
      stakes: wager.stakes,
    },
  });

  return NextResponse.json({ success: true });
}
