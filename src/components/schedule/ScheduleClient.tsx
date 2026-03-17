"use client";

import { useRealtimeGames } from "@/hooks/useRealtimeGames";
import { ROUND_DISPLAY_NAMES, REGION_DISPLAY_NAMES } from "@/lib/utils";

interface ScheduleGame {
  id: number;
  round: string;
  region: string | null;
  game_slot: number;
  team_a_id: number | null;
  team_b_id: number | null;
  winner_id: number | null;
  status: string;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
  team_a: { id: number; name: string; seed: number; abbreviation: string; logo_url: string | null } | null;
  team_b: { id: number; name: string; seed: number; abbreviation: string; logo_url: string | null } | null;
}

interface ScheduleClientProps {
  games: ScheduleGame[];
  userPicks?: Record<number, number>;
}

export function ScheduleClient({ games, userPicks = {} }: ScheduleClientProps) {
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
                  {[
                    { team: game.team_a, score: game.score_a },
                    { team: game.team_b, score: game.score_b },
                  ].map(({ team, score }, i) => {
                    const isPicked = team && userPicks[game.game_slot] === team.id;
                    const isPickCorrect = isPicked && game.status === "final" && game.winner_id === team.id;
                    const isPickWrong = isPicked && game.status === "final" && game.winner_id !== team.id;
                    const isWinner = team && game.status === "final" && game.winner_id === team.id;
                    const showScore = score !== null && game.status !== "scheduled";

                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded px-1.5 py-0.5 -mx-1.5 ${
                          isPicked
                            ? isPickCorrect
                              ? "bg-forest/10 border-l-2 border-forest"
                              : isPickWrong
                              ? "bg-burnt-orange/10 border-l-2 border-burnt-orange"
                              : "bg-gold/10 border-l-2 border-gold"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {team ? (
                            <>
                              {team.logo_url ? (
                                <img
                                  src={team.logo_url}
                                  alt={team.abbreviation}
                                  className="w-5 h-5 object-contain"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-navy/15 shrink-0 flex items-center justify-center">
                                  <span className="text-[0.3rem] font-display text-navy">
                                    {team.abbreviation}
                                  </span>
                                </div>
                              )}
                              <span className={`font-body text-xs ${isWinner ? "font-bold" : ""}`}>
                                {team.name}
                              </span>
                              {isPicked && (
                                <span
                                  className={`font-display text-[0.4rem] px-1 py-0.5 rounded ${
                                    isPickCorrect
                                      ? "bg-forest/20 text-forest"
                                      : isPickWrong
                                      ? "bg-burnt-orange/20 text-burnt-orange line-through"
                                      : "bg-gold/30 text-navy"
                                  }`}
                                >
                                  {isPickCorrect ? "CORRECT" : isPickWrong ? "WRONG" : "YOUR PICK"}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="font-body text-xs text-navy/40">
                              TBD
                            </span>
                          )}
                        </div>
                        {showScore ? (
                          <span className={`font-display text-xs ${isWinner ? "text-forest" : ""}`}>
                            {score}
                          </span>
                        ) : team ? (
                          <span className="font-display text-xs text-navy/20">
                            &mdash;
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
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
