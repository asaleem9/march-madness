"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import type { AchievementType, NotificationPreferences } from "@/types";
import { Badges } from "./Badges";
import { PushToggle } from "./PushToggle";
import { normalizePhoneE164 } from "./phone";

/** The value the profiles trigger assigns before the user ever visits this page. */
const DEFAULT_TIMEZONE = "America/New_York";

export interface ProfileInitial {
  displayName: string;
  phone: string;
  timezone: string;
  preferences: NotificationPreferences;
}

interface Props {
  userId: string;
  email: string;
  profileExists: boolean;
  initial: ProfileInitial;
  earned: AchievementType[];
  channels: { sms: boolean; email: boolean };
  vapidPublicKey: string;
}

const inputClass =
  "w-full border-2 border-navy p-3 font-body text-base bg-cream focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-50";
const labelClass = "font-display text-[0.6rem] text-navy block mb-2";

type Status = { kind: "success" | "error"; text: string } | null;

export function ProfileClient({
  userId,
  email,
  profileExists,
  initial,
  earned,
  channels,
  vapidPublicKey,
}: Props) {
  const [supabase] = useState(() => createClient());
  const toast = useToast();

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [phone, setPhone] = useState(initial.phone);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [prefs, setPrefs] = useState<NotificationPreferences>(initial.preferences);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const existsRef = useRef(profileExists);

  const normalizedPhone = normalizePhoneE164(phone);
  const phoneValid = normalizedPhone !== null;
  const phoneInvalid = phone.trim() !== "" && !phoneValid;

  const report = (kind: "success" | "error", text: string) => {
    setStatus({ kind, text });
    toast(text, kind);
  };

  /** Write a partial profile row (insert if the trigger never created one). */
  const persist = async (patch: Record<string, unknown>) => {
    const row = { ...patch, updated_at: new Date().toISOString() };
    if (existsRef.current) {
      return supabase.from("profiles").update(row).eq("id", userId);
    }
    const res = await supabase.from("profiles").insert({ id: userId, display_name: displayName, ...row });
    if (!res.error) existsRef.current = true;
    return res;
  };

  // First visit: the trigger stamped America/New_York. If the browser lives
  // somewhere else, adopt it silently so quiet hours line up with the user.
  const autoTzDone = useRef(false);
  useEffect(() => {
    if (autoTzDone.current) return;
    autoTzDone.current = true;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTz || initial.timezone !== DEFAULT_TIMEZONE || browserTz === DEFAULT_TIMEZONE) return;
    if (!Intl.supportedValuesOf("timeZone").includes(browserTz)) return;
    persist({ timezone: browserTz }).then(({ error }) => {
      if (error) return;
      setTimezone(browserTz);
      toast(`Timezone set to ${browserTz.replace(/_/g, " ")}`, "info");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      report("error", "Display name can't be empty");
      return;
    }
    if (phoneInvalid) {
      report("error", "Enter a valid phone number like +1 555 123 4567");
      return;
    }
    setSaving(true);
    setStatus(null);

    const { error } = await persist({
      display_name: name,
      phone: normalizedPhone,
      timezone,
      notification_preferences: {
        ...prefs,
        sms: prefs.sms && phoneValid && channels.sms,
        email: prefs.email && channels.email,
      },
    });

    setSaving(false);
    if (error) {
      report(
        "error",
        error.code === "23505" ? "That name is taken" : `Failed to save: ${error.message}`
      );
      return;
    }
    if (normalizedPhone && normalizedPhone !== phone) setPhone(normalizedPhone);
    report("success", "Profile saved");
  };

  const handlePushChange = async (enabled: boolean) => {
    const next = { ...prefs, push: enabled };
    setPrefs(next);
    const { error } = await persist({ notification_preferences: next });
    if (error) throw new Error(`Could not save the preference: ${error.message}`);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const optedOut = !prefs.push && !(prefs.sms && channels.sms) && !(prefs.email && channels.email);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="font-display text-navy text-sm">PROFILE</h1>
        {confirmSignOut ? (
          <div className="flex items-center gap-2" role="group" aria-label="Confirm sign out">
            <span className="font-body text-xs text-navy/70">Sign out?</span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="retro-btn retro-btn-primary text-[0.6rem] py-2.5 px-3 min-h-11 disabled:opacity-50"
            >
              {signingOut ? "…" : "Yes"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmSignOut(false)}
              className="retro-btn bg-cream text-[0.6rem] py-2.5 px-3 min-h-11"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="retro-btn bg-cream text-[0.6rem] py-2.5 px-3 min-h-11"
          >
            Sign out
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="retro-card p-6 space-y-6">
        <div>
          <label htmlFor="profile-display-name" className={labelClass}>
            DISPLAY NAME
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
            autoComplete="nickname"
            className={inputClass}
          />
          <p className="font-body text-xs text-navy/50 mt-1">Shown on the leaderboard and in wagers.</p>
        </div>

        <div>
          <label htmlFor="profile-timezone" className={labelClass}>
            TIMEZONE
          </label>
          <select
            id="profile-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputClass}
          >
            {Intl.supportedValuesOf("timeZone").map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <p className="font-body text-xs text-navy/50 mt-1">
            Used for quiet hours — nothing is sent between 10pm and 8am your time.
          </p>
        </div>

        <fieldset>
          <legend className={labelClass}>NOTIFICATIONS</legend>
          <div className="space-y-4">
            <PushToggle
              enabled={prefs.push}
              vapidPublicKey={vapidPublicKey}
              onChange={handlePushChange}
              onError={(m) => report("error", m)}
              onInfo={(m) => report("success", m)}
            />

            {channels.sms && (
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer min-h-11">
                  <input
                    type="checkbox"
                    checked={prefs.sms && phoneValid}
                    disabled={!phoneValid}
                    onChange={(e) => setPrefs({ ...prefs, sms: e.target.checked })}
                    className="w-5 h-5 accent-forest disabled:opacity-50"
                    aria-describedby="sms-help"
                  />
                  <span className="font-body text-sm">SMS</span>
                </label>
                <div className="pl-8">
                  <label htmlFor="profile-phone" className="sr-only">
                    Phone number for SMS
                  </label>
                  <input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    autoComplete="tel"
                    inputMode="tel"
                    aria-invalid={phoneInvalid}
                    className={`${inputClass} ${phoneInvalid ? "border-burnt-orange" : ""}`}
                  />
                  <p id="sms-help" className="font-body text-xs text-navy/50 mt-1">
                    {phoneInvalid
                      ? "Enter a valid number — US numbers can skip the +1."
                      : phoneValid
                        ? `Texts go to ${normalizedPhone}.`
                        : "Add a mobile number to turn on SMS."}
                  </p>
                </div>
              </div>
            )}

            {channels.email && (
              <label className="flex items-center gap-3 cursor-pointer min-h-11">
                <input
                  type="checkbox"
                  checked={prefs.email}
                  onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
                  className="w-5 h-5 accent-forest"
                />
                <span className="font-body text-sm">
                  Email <span className="text-navy/50">({email})</span>
                </span>
              </label>
            )}

            <label className="flex items-start gap-3 cursor-pointer min-h-11">
              <input
                type="checkbox"
                checked={prefs.digest_only}
                onChange={(e) => setPrefs({ ...prefs, digest_only: e.target.checked })}
                className="w-5 h-5 accent-forest mt-0.5"
              />
              <span className="font-body text-sm">
                Daily digest only
                <span className="block text-xs text-navy/50">
                  One roundup a day instead of up to three updates.
                </span>
              </span>
            </label>

            <p className="font-body text-xs text-navy/60 border-l-2 border-navy/20 pl-3">
              Updates arrive after each round of games finishes. Max 3 a day (1 with the daily
              digest), and never between 10pm and 8am your time.
            </p>

            {optedOut && (
              <p className="font-body text-xs text-burnt-orange" role="status">
                All channels are off — you won&apos;t get any notifications. Follow along on the{" "}
                <Link href="/dashboard" className="font-bold underline">
                  dashboard
                </Link>
                .
              </p>
            )}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="retro-btn retro-btn-primary disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
          {status && (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className={`font-body text-xs ${status.kind === "error" ? "text-burnt-orange" : "text-forest"}`}
            >
              {status.text}
            </p>
          )}
        </div>
      </form>

      <Badges earned={earned} />
    </div>
  );
}
