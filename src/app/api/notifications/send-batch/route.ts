import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import type { NotificationPreferences } from "@/types";

/** Hard ceiling on notifications per user per local day. */
const DAILY_CAP = 3;
/** "Daily digest only" users get at most one per local day. */
const DIGEST_CAP = 1;
/** Give up on an item after this many failed delivery attempts. */
const MAX_ATTEMPTS = 5;

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

  const supabase = createAdminClient();

  const { data: queuedItems } = await supabase
    .from("notification_queue")
    .select("*")
    .eq("sent", false)
    .order("created_at");

  if (!queuedItems || queuedItems.length === 0) {
    return NextResponse.json({ message: "No pending notifications" });
  }

  // One message per user: everything pending for them goes into a single
  // notification (the copy builder lists the latest batch and summarises
  // older ones), so items that were rate-limited yesterday don't each burn
  // one of today's sends.
  const byUser = new Map<string, typeof queuedItems>();
  for (const item of queuedItems) {
    const batch = byUser.get(item.user_id) || [];
    batch.push(item);
    byUser.set(item.user_id, batch);
  }

  let sent = 0;
  let skipped = 0;
  let discarded = 0;

  const markSent = async (ids: Array<string | number>) => {
    await supabase.from("notification_queue").update({ sent: true }).in("id", ids);
  };

  for (const [userId, items] of byUser) {
    const itemIds = items.map((i) => i.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!profile) continue;

    const prefs = (profile.notification_preferences as NotificationPreferences | null) ?? null;
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
    const { count } = await supabase
      .from("notifications_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("sent_at", dayStart.toISOString());

    const cap = prefs?.digest_only ? DIGEST_CAP : DAILY_CAP;
    if ((count || 0) >= cap) {
      skipped += items.length;
      continue;
    }

    const message = buildBatchMessage(items);
    if (!message) {
      await markSent(itemIds);
      discarded += items.length;
      continue;
    }

    let anySuccess = false;
    let deliveredChannel: string | null = null;

    for (const channel of channels) {
      let success = false;

      if (channel === "push") {
        // Every device the user registered (phone + laptop).
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", userId);

        const stale: Array<string | number> = [];
        for (const sub of subs ?? []) {
          const ok = await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            { title: message.title, body: message.body, url: message.url }
          );
          if (ok) success = true;
          else stale.push(sub.id);
        }
        // Only the endpoints that bounced are removed.
        if (stale.length > 0) {
          await supabase.from("push_subscriptions").delete().in("id", stale);
        }
      } else if (channel === "sms" && profile.phone) {
        success = await sendSMS(profile.phone, toSmsText(message));
      } else if (channel === "email") {
        const {
          data: { user },
        } = await supabase.auth.admin.getUserById(userId);
        if (user?.email) {
          success = await sendEmail(user.email, message.title, message.body);
        }
      }

      if (success && !anySuccess) {
        anySuccess = true;
        deliveredChannel = channel;
      }
    }

    if (anySuccess) {
      // One log row per delivered notification (not per channel) so the daily
      // cap counts notifications.
      await supabase.from("notifications_log").insert({
        user_id: userId,
        message: toSmsText(message),
        channel: deliveredChannel,
      });

      await markSent(itemIds);
      sent += items.length;
    } else {
      // Nothing delivered — bump attempts and retry next run, giving up after
      // MAX_ATTEMPTS so an undeliverable item doesn't loop forever.
      for (const item of items) {
        const attempts = ((item.attempts as number) ?? 0) + 1;
        await supabase
          .from("notification_queue")
          .update({ attempts, sent: attempts >= MAX_ATTEMPTS })
          .eq("id", item.id);
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
