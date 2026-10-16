"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/useToast";
import { useChangedSlots } from "@/hooks/useChangedSlots";

/** Realtime changes are coalesced for this long before the page re-fetches. */
export const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Subscribe to `games` changes and re-fetch the server-rendered page when a
 * game updates. The pages that show live data (schedule, leaderboard) are
 * server components, so `router.refresh()` is what re-renders them.
 *
 * - Bursts of changes (the cron writes many rows per cycle) are debounced into
 *   one refresh; the changed `game_slot`s go to `useChangedSlots` so cards can
 *   flash, and a single "Scores updated" toast fires.
 * - Returning to the tab (`visibilitychange` → visible, window `focus`)
 *   refreshes immediately and re-opens the channel, since the socket may have
 *   been dropped while hidden.
 * - The channel follows the auth state: it opens when a session appears and
 *   closes when it goes away. The anon Realtime socket fails auth and retries
 *   forever, so logged-out visitors never open one.
 */
export function useRealtimeGames() {
  const router = useRouter();
  // Memoize the client so the effect below doesn't tear down and re-subscribe
  // on every render (createClient() returns a new object each call).
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingSlots: number[] = [];
    let pendingChanges = 0;
    let lastRefreshAt = 0;
    let authed = false;
    let disposed = false;

    const refreshNow = () => {
      lastRefreshAt = Date.now();
      const slots = pendingSlots;
      const changes = pendingChanges;
      pendingSlots = [];
      pendingChanges = 0;
      router.refresh();
      if (changes > 0) {
        useChangedSlots.getState().mark(slots);
        toast("Scores updated", "info");
      }
    };

    const flush = () => {
      timer = null;
      refreshNow();
    };

    const onGameChange = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      pendingChanges += 1;
      const slot = payload.new?.game_slot ?? payload.old?.game_slot;
      if (typeof slot === "number") pendingSlots.push(slot);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, REFRESH_DEBOUNCE_MS);
    };

    const unsubscribe = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const subscribe = () => {
      unsubscribe();
      if (!authed || disposed) return;
      channel = supabase
        .channel("games-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "games" },
          onGameChange
        )
        .subscribe();
    };

    // Tab came back: the socket may be stale and we may have missed events.
    // Refresh right away (unless a debounced refresh is already queued or one
    // just happened — focus and visibilitychange usually fire together).
    const resync = () => {
      if (disposed || !authed) return;
      subscribe();
      if (timer) return;
      if (Date.now() - lastRefreshAt < REFRESH_DEBOUNCE_MS) return;
      refreshNow();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", resync);

    const setAuthed = (next: boolean) => {
      if (disposed || next === authed) return;
      authed = next;
      if (authed) subscribe();
      else unsubscribe();
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", resync);
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [supabase, router]);
}
