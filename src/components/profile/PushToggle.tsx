"use client";

import { useCallback, useEffect, useState } from "react";

type Status =
  | "loading"
  | "unsupported"
  | "ios-not-installed"
  | "denied"
  | "ready";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function detectPushStatus(): Status {
  if (typeof window === "undefined") return "loading";
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad/.test(ua);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  if (isIOS && !standalone) return "ios-not-installed";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

interface Props {
  /** Saved preference (profiles.notification_preferences.push). */
  enabled: boolean;
  vapidPublicKey: string;
  /** Called after the device subscription changed; persist the preference here. */
  onChange: (enabled: boolean) => Promise<void> | void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
}

/**
 * One toggle that subscribes this device to Web Push *and* flips the saved
 * preference. Shows platform-specific help when push can't work here.
 */
export function PushToggle({ enabled, vapidPublicKey, onChange, onError, onInfo }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    const s = detectPushStatus();
    setStatus(s);
    if (s !== "ready") return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setSubscribedHere(!!sub);
    } catch {
      setSubscribedHere(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = async () => {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(detectPushStatus());
      throw new Error("Notifications were not allowed");
    }
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      }));
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) throw new Error("Could not save the subscription");
    setSubscribedHere(true);
  };

  const unsubscribe = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
    setSubscribedHere(false);
  };

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        if (!vapidPublicKey) throw new Error("Push isn't configured on the server");
        await subscribe();
        await onChange(true);
        onInfo("Push notifications on for this device");
      } else {
        await unsubscribe();
        await onChange(false);
        onInfo("Push notifications off");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update push notifications");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok) onInfo("Test notification sent — check this device");
      else onError(data?.error ?? "Could not send a test notification");
    } catch {
      onError("Could not send a test notification");
    } finally {
      setTesting(false);
    }
  };

  const canToggle = status === "ready" && !busy;
  const checked = enabled && (status !== "ready" || subscribedHere);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 cursor-pointer min-h-11">
        <input
          type="checkbox"
          checked={status === "ready" ? enabled && subscribedHere : enabled}
          onChange={(e) => toggle(e.target.checked)}
          disabled={!canToggle}
          className="w-5 h-5 accent-forest disabled:opacity-50"
          aria-describedby="push-help"
        />
        <span className="font-body text-sm">
          Web Push {busy && <span className="text-navy/50">(working…)</span>}
        </span>
        {status === "ready" && subscribedHere && enabled && (
          <span className="font-display text-[0.6rem] text-forest">✓ THIS DEVICE</span>
        )}
      </label>

      <div id="push-help" className="font-body text-xs text-navy/60 pl-8">
        {status === "loading" && "Checking this device…"}
        {status === "ios-not-installed" && (
          <span>
            On iPhone and iPad, push only works from the Home Screen app. Add it first:
            tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open
            the app and come back here.
          </span>
        )}
        {status === "unsupported" && "This browser doesn't support push notifications."}
        {status === "denied" && (
          <span>
            Notifications are blocked for this site. Re-enable them in your browser&apos;s
            site settings (tap the lock icon in the address bar → Notifications → Allow),
            then reload this page.
          </span>
        )}
        {status === "ready" && !subscribedHere && enabled && (
          <span>Your preference is on, but this device isn&apos;t subscribed yet — tick the box to add it.</span>
        )}
        {status === "ready" && !enabled && "Turn on to get score updates on this device."}
        {status === "ready" && subscribedHere && enabled && (
          <span>Each device you turn this on gets its own subscription.</span>
        )}
      </div>

      {checked && status === "ready" && subscribedHere && (
        <div className="pl-8">
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="retro-btn retro-btn-secondary text-[0.6rem] py-2.5 px-4 min-h-11 disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send test notification"}
          </button>
        </div>
      )}
    </div>
  );
}
