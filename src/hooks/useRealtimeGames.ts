"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Subscribe to game changes and re-fetch the server-rendered page data when a
// game updates. The pages that show live data (schedule, etc.) are server
// components, so router.refresh() is what actually re-renders them — plain
// query-cache invalidation had no subscribers and did nothing.
export function useRealtimeGames() {
  const router = useRouter();
  // Memoize the client so the effect below doesn't tear down and re-subscribe
  // on every render (createClient() returns a new object each call).
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const channel = supabase
      .channel("games-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);
}
