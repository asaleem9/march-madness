"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useRealtimeGames() {
  const queryClient = useQueryClient();
  const supabase = createClient();

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
          // Invalidate all game-related queries when any game changes
          queryClient.invalidateQueries({ queryKey: ["games"] });
          queryClient.invalidateQueries({ queryKey: ["schedule"] });
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);
}
