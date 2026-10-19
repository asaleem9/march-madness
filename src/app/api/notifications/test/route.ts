import { NextResponse } from "next/server";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notificationsLog, pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPushNotification } from "@/lib/notifications";

const TEST_MESSAGE = "test";
const RATE_LIMIT_MS = 60_000;

/**
 * Send one push notification to every subscription the signed-in user has, so
 * they can confirm the toggle actually works on this device. Rate limited to
 * one per minute via a `notifications_log` row (channel push, message "test").
 */
export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - RATE_LIMIT_MS);
  const [{ value: recentTests }] = await db
    .select({ value: count() })
    .from(notificationsLog)
    .where(
      and(
        eq(notificationsLog.userId, user.id),
        eq(notificationsLog.channel, "push"),
        eq(notificationsLog.message, TEST_MESSAGE),
        gte(notificationsLog.sentAt, since)
      )
    );

  if (recentTests > 0) {
    return NextResponse.json(
      { error: "Please wait a minute between test notifications" },
      { status: 429 }
    );
  }

  const subs = await db
    .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, keys: pushSubscriptions.keys })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id));

  if (subs.length === 0) {
    return NextResponse.json(
      { error: "No push subscription found — turn on push notifications first" },
      { status: 404 }
    );
  }

  let delivered = 0;
  const stale: number[] = [];
  for (const sub of subs) {
    const ok = await sendPushNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      {
        title: "Test notification",
        body: "Push notifications are working on this device.",
        url: "/profile",
      }
    );
    if (ok) delivered++;
    else stale.push(sub.id);
  }

  if (stale.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, stale));
  }

  if (delivered === 0) {
    return NextResponse.json(
      { error: "Push delivery failed — try turning push off and on again" },
      { status: 502 }
    );
  }

  await db.insert(notificationsLog).values({
    userId: user.id,
    message: TEST_MESSAGE,
    channel: "push",
  });

  return NextResponse.json({ success: true, delivered, removed: stale.length });
}
