import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { pgSchema, text, uuid } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  notificationQueue,
  notificationsLog,
  profiles,
  pushSubscriptions,
} from "@/db/schema";
import { authorizeCronOrAdmin } from "@/lib/admin-auth";
import {
  sendPushNotification,
  sendSMS,
  sendEmail,
  isInQuietHours,
  getPreferredChannels,
  startOfTodayIn,
} from "@/lib/notifications";
import { buildBatchMessage, toSmsText } from "@/lib/notification-copy";
import type { NotificationChannel, NotificationPreferences } from "@/types";

/** Hard ceiling on notifications per user per local day. */
const DAILY_CAP = 3;
/** "Daily digest only" users get at most one per local day. */
const DIGEST_CAP = 1;
/** Give up on an item after this many failed delivery attempts. */
const MAX_ATTEMPTS = 5;

/**
 * Email addresses live with the auth provider, in the `neon_auth."user"`
 * table, not in `profiles`. Declared here (not in the Drizzle schema, which
 * drizzle-kit diffs) because this route only reads it.
 */
const authUsers = pgSchema("neon_auth").table("user", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  name: text("name"),
});

async function emailOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return row?.email ?? null;
}

// Vercel Cron invokes endpoints with GET; the admin page's button uses POST.
// Both accept the CRON_SECRET bearer or an admin session.
export async function GET(request: NextRequest) {
  return handleSendBatch(request);
}

export async function POST(request: NextRequest) {
  return handleSendBatch(request);
}

async function handleSendBatch(request: NextRequest) {
  if (!(await authorizeCronOrAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queuedItems = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.sent, false))
    .orderBy(asc(notificationQueue.createdAt), asc(notificationQueue.id));

  if (queuedItems.length === 0) {
    return NextResponse.json({ message: "No pending notifications" });
  }

  // One message per user: everything pending for them goes into a single
  // notification (the copy builder lists the latest batch and summarises
  // older ones), so items that were rate-limited yesterday don't each burn
  // one of today's sends.
  const byUser = new Map<string, typeof queuedItems>();
  for (const item of queuedItems) {
    const batch = byUser.get(item.userId) || [];
    batch.push(item);
    byUser.set(item.userId, batch);
  }

  let sent = 0;
  let skipped = 0;
  let discarded = 0;

  const markSent = async (ids: number[]) => {
    await db.update(notificationQueue).set({ sent: true }).where(inArray(notificationQueue.id, ids));
  };

  for (const [userId, items] of byUser) {
    const itemIds = items.map((i) => i.id);

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });

    if (!profile) continue;

    const prefs = (profile.notificationPreferences as NotificationPreferences | null) ?? null;
    const channels = getPreferredChannels(prefs);

    // Every channel off = opted out. Nothing to deliver; drop the items so the
    // queue doesn't grow forever.
    if (channels.length === 0) {
      await markSent(itemIds);
      discarded += items.length;
      continue;
    }

    if (profile.timezone && isInQuietHours(profile.timezone)) {
      skipped += items.length;
      continue;
    }

    // Daily cap, measured from the user's local midnight.
    const dayStart = startOfTodayIn(profile.timezone);
    const [{ value: sentToday }] = await db
      .select({ value: count() })
      .from(notificationsLog)
      .where(and(eq(notificationsLog.userId, userId), gte(notificationsLog.sentAt, dayStart)));

    const cap = prefs?.digest_only ? DIGEST_CAP : DAILY_CAP;
    if (sentToday >= cap) {
      skipped += items.length;
      continue;
    }

    const message = buildBatchMessage(
      items.map((i) => ({
        type: i.type,
        payload: i.payload as Record<string, unknown> | null,
        batch_key: i.batchKey,
        created_at: i.createdAt?.toISOString() ?? null,
      }))
    );
    if (!message) {
      await markSent(itemIds);
      discarded += items.length;
      continue;
    }

    let anySuccess = false;
    let deliveredChannel: NotificationChannel | null = null;

    for (const channel of channels) {
      let success = false;

      if (channel === "push") {
        // Every device the user registered (phone + laptop).
        const subs = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId));

        const stale: number[] = [];
        for (const sub of subs) {
          const ok = await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            { title: message.title, body: message.body, url: message.url }
          );
          if (ok) success = true;
          else stale.push(sub.id);
        }
        // Only the endpoints that bounced are removed.
        if (stale.length > 0) {
          await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, stale));
        }
      } else if (channel === "sms" && profile.phone) {
        success = await sendSMS(profile.phone, toSmsText(message));
      } else if (channel === "email") {
        const email = await emailOf(userId);
        if (email) {
          success = await sendEmail(email, message.title, message.body);
        }
      }

      if (success && !anySuccess) {
        anySuccess = true;
        deliveredChannel = channel;
      }
    }

    if (anySuccess && deliveredChannel) {
      // One log row per delivered notification (not per channel) so the daily
      // cap counts notifications.
      await db.insert(notificationsLog).values({
        userId,
        message: toSmsText(message),
        channel: deliveredChannel,
      });

      await markSent(itemIds);
      sent += items.length;
    } else {
      // Nothing delivered — bump attempts and retry next run, giving up after
      // MAX_ATTEMPTS so an undeliverable item doesn't loop forever.
      for (const item of items) {
        const attempts = (item.attempts ?? 0) + 1;
        await db
          .update(notificationQueue)
          .set({ attempts, sent: attempts >= MAX_ATTEMPTS })
          .where(eq(notificationQueue.id, item.id));
      }
      skipped += items.length;
    }
  }

  return NextResponse.json({
    message: "Batch processed",
    sent,
    skipped,
    discarded,
    timestamp: new Date().toISOString(),
  });
}
