import type { NotificationChannel } from "@/types";

let vapidConfigured = false;

async function getWebPush() {
  const webpush = (await import("web-push")).default;
  if (
    !vapidConfigured &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  ) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  }
  return webpush;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  try {
    const webpush = await getWebPush();
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Subscription expired or invalid — should be cleaned up
      console.log("Push subscription expired:", subscription.endpoint);
      return false;
    }
    console.error("Push notification failed:", error);
    return false;
  }
}

export async function sendSMS(
  phone: string,
  message: string
): Promise<boolean> {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    console.warn("Twilio not configured, skipping SMS");
    return false;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: process.env.TWILIO_PHONE_NUMBER,
        To: phone,
        Body: message,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("SMS send failed:", error);
    return false;
  }
}

/** Verified Resend sender. Set EMAIL_FROM in the environment, e.g. "March Madness <brackets@example.com>". */
export function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.warn("EMAIL_FROM is not set; email sends will be rejected by Resend");
    return "March Madness <brackets@yourdomain.com>";
  }
  return from;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("Resend not configured, skipping email");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailFrom(),
        to,
        subject,
        text: body,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Email send failed:", error);
    return false;
  }
}

/**
 * The UTC instant at which "today" started in the user's timezone — used so
 * the daily caps roll over at the user's midnight, not the server's. Falls
 * back to UTC midnight for an unknown zone.
 */
export function startOfTodayIn(timezone: string | null | undefined, now: Date = new Date()): Date {
  const utcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  if (!timezone) return utcMidnight;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? "", 10);
    const y = get("year");
    const mo = get("month");
    const d = get("day");
    const h = get("hour") % 24;
    const mi = get("minute");
    const sec = get("second");
    if ([y, mo, d, h, mi, sec].some(Number.isNaN)) return utcMidnight;
    // Wall-clock "now" in the zone, read as if it were UTC, minus real now =
    // the zone's current offset.
    const wallNow = Date.UTC(y, mo - 1, d, h, mi, sec);
    const offsetMs = Math.round((wallNow - now.getTime()) / 60_000) * 60_000;
    return new Date(Date.UTC(y, mo - 1, d) - offsetMs);
  } catch {
    return utcMidnight;
  }
}

export function isInQuietHours(timezone: string): boolean {
  try {
    // Read the hour directly in the target timezone. Re-parsing a formatted
    // date string (new Date(toLocaleString(...))) is fragile — some ICU builds
    // emit narrow no-break spaces and yield Invalid Date / NaN.
    const hourStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date());
    // "24" can appear for midnight in the h24 cycle; normalize to 0.
    const hour = parseInt(hourStr, 10) % 24;
    if (Number.isNaN(hour)) return false;
    return hour >= 22 || hour < 8; // 10pm - 8am
  } catch {
    return false;
  }
}

/**
 * Channels the user opted into, in send order. An empty array means the user
 * turned everything off — send-batch treats that as opted out (nothing is
 * delivered and the queue items are discarded).
 */
export function getPreferredChannels(
  preferences: {
    push?: boolean;
    sms?: boolean;
    email?: boolean;
  } | null | undefined
): NotificationChannel[] {
  // No preferences row yet (brand-new profile): push is the default.
  if (!preferences) return ["push"];
  const channels: NotificationChannel[] = [];
  if (preferences.push) channels.push("push");
  if (preferences.sms) channels.push("sms");
  if (preferences.email) channels.push("email");
  return channels;
}
