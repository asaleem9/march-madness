/**
 * Drop this browser's push subscription: delete the server row, then
 * unsubscribe the browser. Does nothing when push isn't supported or this
 * device was never subscribed, and never throws — callers (the push toggle,
 * sign-out) must not fail because the cleanup did.
 */
export async function removeDevicePushSubscription(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    await fetch("/api/notifications/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  } catch {
    // Best effort only.
  }
}
