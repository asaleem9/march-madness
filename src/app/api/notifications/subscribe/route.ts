import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sanitizeError } from "@/lib/sanitizeError";

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
}

/** The pg error text is on `cause` when Drizzle wraps a failed query. */
function dbErrorMessage(err: unknown): string | undefined {
  const e = err as { message?: string; cause?: { message?: string } };
  return e?.cause?.message ?? e?.message;
}

function parseSubscription(body: SubscriptionBody) {
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Register this browser's push subscription. A user can have several (phone +
 * laptop), so the conflict target is the endpoint — re-subscribing the same
 * device just refreshes its keys (and, after a sign-in as someone else on the
 * same device, moves the endpoint to the user who now holds it).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = parseSubscription(await request.json().catch(() => ({})));
  if (!subscription) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, keys: subscription.keys },
      });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(dbErrorMessage(err)) }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** Remove this browser's subscription (the push toggle turned off). */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  // Only the user's own row for that endpoint.
  try {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(dbErrorMessage(err)) }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
