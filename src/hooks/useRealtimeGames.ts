"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/** How often a visible, signed-in tab re-fetches the server-rendered page. */
export const POLL_INTERVAL_MS = 30_000;

/**
 * Keep the live pages (schedule, leaderboard) current. They are server
 * components, so `router.refresh()` is what re-renders them with fresh scores.
 *
 * - Polls every `POLL_INTERVAL_MS` while the tab is visible.
 * - Pauses while the tab is hidden; coming back refreshes immediately and
 *   restarts the interval.
 * - Only runs for signed-in users (logged-out visitors get the page as served).
 */
export function useRealtimeGames() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const enabled = !isPending && !!session?.user;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") start();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [enabled, router]);
}
