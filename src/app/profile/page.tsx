import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient } from "@/components/profile/ProfileClient";
import type { AchievementType, NotificationPreferences } from "@/types";

export const metadata: Metadata = { title: "Profile" };

/**
 * Server wrapper: loads the signed-in user's profile and badges, and tells the
 * client which optional channels are actually configured (env vars never reach
 * the browser otherwise).
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/profile");

  const [{ data: profile, error: profileError }, { data: achievements, error: achievementsError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, phone, timezone, notification_preferences")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("user_achievements").select("achievement_type").eq("user_id", user.id),
    ]);

  if (profileError) throw new Error(`Failed to load profile: ${profileError.message}`);
  if (achievementsError) {
    throw new Error(`Failed to load achievements: ${achievementsError.message}`);
  }

  const fallbackName =
    (user.user_metadata?.display_name as string | undefined) || user.email?.split("@")[0] || "";

  return (
    <ProfileClient
      userId={user.id}
      email={user.email ?? ""}
      profileExists={!!profile}
      initial={{
        displayName: profile?.display_name ?? fallbackName,
        phone: profile?.phone ?? "",
        timezone: profile?.timezone ?? "America/New_York",
        preferences: (profile?.notification_preferences as NotificationPreferences | null) ?? {
          push: true,
          sms: false,
          email: false,
          digest_only: false,
        },
      }}
      earned={(achievements ?? []).map((a) => a.achievement_type as AchievementType)}
      channels={{
        sms: !!process.env.TWILIO_ACCOUNT_SID,
        email: !!process.env.RESEND_API_KEY,
      }}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
