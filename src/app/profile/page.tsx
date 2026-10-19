import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, userAchievements } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { ProfileClient } from "@/components/profile/ProfileClient";
import type { NotificationPreferences } from "@/types";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Profile" };

/**
 * Server wrapper: loads the signed-in user's profile and badges, and tells the
 * client which optional channels are actually configured (env vars never reach
 * the browser otherwise).
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/profile");

  const [profile, achievements] = await Promise.all([
    db.query.profiles.findFirst({
      columns: { displayName: true, phone: true, timezone: true, notificationPreferences: true },
      where: eq(profiles.id, user.id),
    }),
    db
      .select({ achievementType: userAchievements.achievementType })
      .from(userAchievements)
      .where(eq(userAchievements.userId, user.id)),
  ]);

  const fallbackName = user.name?.trim() || user.email.split("@")[0] || "";

  return (
    <ProfileClient
      userId={user.id}
      email={user.email}
      profileExists={!!profile}
      initial={{
        displayName: profile?.displayName ?? fallbackName,
        phone: profile?.phone ?? "",
        timezone: profile?.timezone ?? "America/New_York",
        preferences: (profile?.notificationPreferences as NotificationPreferences | null) ?? {
          push: true,
          sms: false,
          email: false,
          digest_only: false,
        },
      }}
      earned={achievements.map((a) => a.achievementType)}
      channels={{
        sms: !!process.env.TWILIO_ACCOUNT_SID,
        email: !!process.env.RESEND_API_KEY,
      }}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
