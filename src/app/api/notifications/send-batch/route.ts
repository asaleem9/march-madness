import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendPushNotification,
  sendSMS,
  sendEmail,
  isInQuietHours,
  getPreferredChannels,
} from "@/lib/notifications";

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch unsent notifications grouped by user and batch_key
  const { data: queuedItems } = await supabase
    .from("notification_queue")
    .select("*")
    .eq("sent", false)
    .order("created_at");

  if (!queuedItems || queuedItems.length === 0) {
    return NextResponse.json({ message: "No pending notifications" });
  }

  // Group by user_id + batch_key
  const batches = new Map<string, typeof queuedItems>();
  for (const item of queuedItems) {
    const key = `${item.user_id}:${item.batch_key || "default"}`;
    const batch = batches.get(key) || [];
    batch.push(item);
    batches.set(key, batch);
  }

  let sent = 0;
  let skipped = 0;

  for (const [key, items] of batches) {
    const userId = items[0].user_id;

    // Fetch user profile for notification preferences
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!profile) continue;

    // Check quiet hours
    if (profile.timezone && isInQuietHours(profile.timezone)) {
      skipped += items.length;
      continue;
    }

    // Check daily rate limit (max 3 per day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("notifications_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("sent_at", today.toISOString());

    if ((count || 0) >= 3) {
      skipped += items.length;
      continue;
    }

    // Build consolidated message
    const gameResults = items.filter((i) => i.type === "game_result");
    const wagerNotifs = items.filter(
      (i) => i.type === "wager_request" || i.type === "wager_result"
    );

    let message = "";
    if (gameResults.length > 0) {
      message = `${gameResults.length} game(s) decided. Check your bracket for updates!`;
    }
    if (wagerNotifs.length > 0) {
      message += message ? " " : "";
      message += `You have ${wagerNotifs.length} wager update(s).`;
    }

    if (!message) continue;

    // Get preferred channels
    const prefs = (profile.notification_preferences as {
      push: boolean;
      sms: boolean;
      email: boolean;
      digest_only: boolean;
    }) || { push: true, sms: false, email: false, digest_only: false };

    const channels = getPreferredChannels(prefs);

    // Send via each channel
    for (const channel of channels) {
      let success = false;

      if (channel === "push") {
        const { data: sub } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (sub) {
          success = await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            {
              title: "March Madness Update",
              body: message,
              url: "/dashboard",
            }
          );

          // Clean up stale subscription
          if (!success) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
          }
        }
      } else if (channel === "sms" && profile.phone) {
        success = await sendSMS(profile.phone, message);
      } else if (channel === "email") {
        const {
          data: { user },
        } = await supabase.auth.admin.getUserById(userId);
        if (user?.email) {
          success = await sendEmail(
            user.email,
            "March Madness Update",
            message
          );
        }
      }

      if (success) {
        await supabase.from("notifications_log").insert({
          user_id: userId,
          message,
          channel,
        });
      }
    }

    // Mark queue items as sent
    const itemIds = items.map((i) => i.id);
    await supabase
      .from("notification_queue")
      .update({ sent: true })
      .in("id", itemIds);

    sent += items.length;
  }

  return NextResponse.json({
    message: "Batch processed",
    sent,
    skipped,
    timestamp: new Date().toISOString(),
  });
}
