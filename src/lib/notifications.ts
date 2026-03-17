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
        from: "March Madness <brackets@yourdomain.com>",
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

export function isInQuietHours(timezone: string): boolean {
  try {
    const now = new Date();
    const userTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    );
    const hour = userTime.getHours();
    return hour >= 22 || hour < 8; // 10pm - 8am
  } catch {
    return false;
  }
}

export function getPreferredChannels(preferences: {
  push: boolean;
  sms: boolean;
  email: boolean;
}): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (preferences.push) channels.push("push");
  if (preferences.sms) channels.push("sms");
  if (preferences.email) channels.push("email");
  return channels.length > 0 ? channels : ["push"];
}
