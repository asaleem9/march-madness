"use client";

import { useRealtimeGames } from "@/hooks/useRealtimeGames";
import { ROUND_DISPLAY_NAMES, REGION_DISPLAY_NAMES } from "@/lib/utils";

interface ScheduleGame {
  id: number;
  round: string;
  region: string | null;
  game_slot: number;
  status: string;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
  team_a: { name: string; seed: number; abbreviation: string } | null;
  team_b: { name: string; seed: number; abbreviation: string } | null;
}

export function ScheduleClient({ games }: { games: ScheduleGame[] }) {
  useRealtimeGames();

  // Group by round
  const roundOrder = [
    "first_four",
    "first_round",
    "second_round",
    "sweet_16",
    "elite_eight",
    "final_four",
    "championship",
  ];

  const gamesByRound = roundOrder
    .map((round) => ({
      round,
      games: games.filter((g) => g.round === round),
    }))
    .filter((group) => group.games.length > 0);

  return (
    <div className="space-y-8">
      {gamesByRound.map((group) => (
        <div key={group.round}>
          <div className="scoreboard-heading text-[0.55rem] rounded mb-4">
            {ROUND_DISPLAY_NAMES[group.round as keyof typeof ROUND_DISPLAY_NAMES] || group.round}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.games.map((game) => (
              <div
                key={game.id}
                className={`retro-card p-4 ${
                  game.status === "in_progress"
                    ? "border-burnt-orange"
                    : game.status === "final"
                    ? "opacity-80"
                    : ""
                }`}
              >
                {game.status === "in_progress" && (
                  <div className="font-display text-[0.45rem] text-burnt-orange mb-2 animate-pulse">
                    LIVE
                  </div>
                )}
                {game.region && (
                  <div className="text-[0.5rem] text-navy/50 mb-1">
                    {REGION_DISPLAY_NAMES[game.region] || game.region}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {game.team_a && (
                        <>
                          <span className="seed-badge text-[0.35rem]">
                            {game.team_a.seed}
                          </span>
                          <span className="font-body text-xs">
                            {game.team_a.name}
                          </span>
                        </>
                      )}
                      {!game.team_a && (
                        <span className="font-body text-xs text-navy/40">
                          TBD
                        </span>
                      )}
                    </div>
                    {game.score_a !== null && (
                      <span className="font-display text-xs">
                        {game.score_a}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {game.team_b && (
                        <>
                          <span className="seed-badge text-[0.35rem]">
                            {game.team_b.seed}
                          </span>
                          <span className="font-body text-xs">
                            {game.team_b.name}
                          </span>
                        </>
                      )}
                      {!game.team_b && (
                        <span className="font-body text-xs text-navy/40">
                          TBD
                        </span>
                      )}
                    </div>
                    {game.score_b !== null && (
                      <span className="font-display text-xs">
                        {game.score_b}
                      </span>
                    )}
                  </div>
                </div>
                {game.scheduled_at && game.status === "scheduled" && (
                  <div className="text-[0.55rem] text-navy/50 mt-2">
                    {new Date(game.scheduled_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                )}
                {game.status === "final" && (
                  <div className="font-display text-[0.45rem] text-forest mt-2">
                    FINAL
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {gamesByRound.length === 0 && (
        <div className="text-center py-12 text-navy/50 text-sm">
          No games scheduled yet. Check back once the tournament bracket is set.
        </div>
      )}
    </div>
  );
}
