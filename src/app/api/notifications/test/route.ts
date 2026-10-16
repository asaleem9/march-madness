import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/notifications";

const TEST_MESSAGE = "test";
const RATE_LIMIT_MS = 60_000;

/**
 * Send one push notification to every subscription the signed-in user has, so
 * they can confirm the toggle actually works on this device. Rate limited to
 * one per minute via a `notifications_log` row (channel push, message "test").
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // notifications_log is service-role-only for writes, and we also want to see
  // every device's subscription, so use the admin client from here on.
  const admin = createAdminClient();

  const since = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
  const { count } = await admin
    .from("notifications_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("channel", "push")
    .eq("message", TEST_MESSAGE)
    .gte("sent_at", since);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Please wait a minute between test notifications" },
      { status: 429 }
    );
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", user.id);

  if (!subs || subs.length === 0) {
    return NextResponse.json(
      { error: "No push subscription found — turn on push notifications first" },
      { status: 404 }
    );
  }

  let delivered = 0;
  const stale: number[] = [];
  for (const sub of subs) {
    const ok = await sendPushNotification(
      { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
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
    await admin.from("push_subscriptions").delete().in("id", stale);
  }

  if (delivered === 0) {
    return NextResponse.json(
      { error: "Push delivery failed — try turning push off and on again" },
      { status: 502 }
    );
  }

  await admin.from("notifications_log").insert({
    user_id: user.id,
    message: TEST_MESSAGE,
    channel: "push",
  });

  return NextResponse.json({ success: true, delivered, removed: stale.length });
}
