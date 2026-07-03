"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader } from "@/components/Loader";

export default function ProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [pushEnabled, setPushEnabled] = useState(true);
  // Whether this browser actually has a live push subscription (separate from
  // the on/off *preference* above).
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [digestOnly, setDigestOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [achievements, setAchievements] = useState<string[]>([]);

  const achievementInfo: Record<string, { label: string; description: string; icon: string }> =
    {
      cinderella: {
        label: "Cinderella Story",
        description: "Correctly picked a 12+ seed upset",
        icon: "/images/badges/cinderella.png",
      },
      perfect_region: {
        label: "Perfect Region",
        description: "Got every pick right in a region",
        icon: "/images/badges/perfect-region.png",
      },
      chalk_walk: {
        label: "Chalk Walk",
        description: "Picked all higher seeds",
        icon: "/images/badges/chalk-walk.png",
      },
      bracket_genius: {
        label: "Bracket Genius",
        description: "Top 3 overall finish",
        icon: "/images/badges/bracket-genius.png",
      },
      fortune_teller: {
        label: "Fortune Teller",
        description: "Correctly predicted the champion",
        icon: "/images/badges/fortune-teller.png",
      },
    };

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name || "");
        setPhone(profile.phone || "");
        setTimezone(
          profile.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone
        );
        const prefs = profile.notification_preferences as {
          push: boolean;
          sms: boolean;
          email: boolean;
          digest_only: boolean;
        } | null;
        if (prefs) {
          setPushEnabled(prefs.push);
          setSmsEnabled(prefs.sms);
          setEmailEnabled(prefs.email);
          setDigestOnly(prefs.digest_only);
        }
      } else {
        // Create profile if doesn't exist
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        await supabase.from("profiles").insert({
          id: user.id,
          display_name:
            user.user_metadata?.display_name || user.email?.split("@")[0],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setDisplayName(
          user.user_metadata?.display_name || user.email?.split("@")[0] || ""
        );
      }

      // Fetch achievements
      const { data: achievementsData } = await supabase
        .from("user_achievements")
        .select("achievement_type")
        .eq("user_id", user.id);

      setAchievements(
        achievementsData?.map((a) => a.achievement_type) || []
      );

      setLoading(false);
    }
    load();
  }, [supabase, router]);

  // Reflect the real push-subscription state of this browser.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setPushSubscribed(!!sub);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        phone: phone || null,
        timezone,
        notification_preferences: {
          push: pushEnabled,
          sms: smsEnabled,
          email: emailEnabled,
          digest_only: digestOnly,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      setMessage("Failed to save: " + error.message);
    } else {
      setMessage("Profile updated!");
    }
    setSaving(false);
  };

  const handleSubscribePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("Push notifications not supported in this browser");
      return;
    }

    setSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      setPushEnabled(true);
      setPushSubscribed(true);
      setMessage("Push notifications enabled!");
    } catch {
      setMessage("Failed to enable push notifications");
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Loader />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-8">PROFILE</h1>

      <div className="retro-card p-6 space-y-6">
        {message && (
          <div
            className={`text-xs p-3 rounded border-2 ${
              message.includes("Failed") || message.includes("not supported")
                ? "bg-burnt-orange/10 border-burnt-orange text-burnt-orange"
                : "bg-forest/10 border-forest text-forest"
            }`}
          >
            {message}
          </div>
        )}

        <div>
          <label className="font-display text-[0.55rem] text-navy block mb-2">
            DISPLAY NAME
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            className="w-full border-2 border-navy p-3 font-body text-base bg-cream focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        <div>
          <label className="font-display text-[0.55rem] text-navy block mb-2">
            PHONE (SMS NOTIFICATIONS)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1234567890"
            autoComplete="tel"
            className="w-full border-2 border-navy p-3 font-body text-base bg-cream focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        <div>
          <label className="font-display text-[0.55rem] text-navy block mb-2">
            TIMEZONE
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full border-2 border-navy p-3 font-body text-sm bg-cream"
          >
            {/* All zones (not just America/*) so non-US users can pick their own,
                which drives quiet-hours in the notification pipeline. */}
            {Intl.supportedValuesOf("timeZone").map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Notification preferences */}
        <div>
          <label className="font-display text-[0.55rem] text-navy block mb-3">
            NOTIFICATIONS
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                  className="w-4 h-4 accent-forest"
                />
                <span className="text-sm">Web Push</span>
              </label>
              {pushSubscribed ? (
                <span className="text-[0.6rem] font-display text-forest">
                  ✓ ON THIS DEVICE
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSubscribePush}
                  disabled={subscribing}
                  className="retro-btn retro-btn-secondary text-[0.5rem] py-1.5 px-3 disabled:opacity-50"
                >
                  {subscribing ? "Enabling…" : "Enable on this device"}
                </button>
              )}
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="w-4 h-4 accent-forest"
              />
              <span className="text-sm">SMS</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="w-4 h-4 accent-forest"
              />
              <span className="text-sm">Email</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={digestOnly}
                onChange={(e) => setDigestOnly(e.target.checked)}
                className="w-4 h-4 accent-forest"
              />
              <span className="text-sm">
                Daily digest only (one notification per day)
              </span>
            </label>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="retro-btn retro-btn-primary disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="retro-card p-6 mt-6">
          <h2 className="scoreboard-heading text-[0.55rem] rounded mb-4">
            ACHIEVEMENTS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {achievements.map((type) => (
              <div
                key={type}
                className="border-2 border-gold bg-gold/10 p-3 rounded flex items-center gap-3"
              >
                {achievementInfo[type]?.icon && (
                  <Image
                    src={achievementInfo[type].icon}
                    alt={achievementInfo[type].label}
                    width={48}
                    height={48}
                    className="rounded shrink-0"
                  />
                )}
                <div>
                  <div className="font-display text-[0.55rem] text-gold">
                    {achievementInfo[type]?.label || type}
                  </div>
                  <div className="text-[0.55rem] text-navy/60 mt-1">
                    {achievementInfo[type]?.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
