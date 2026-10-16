import Link from "next/link";
import type { GameStatus } from "@/types";
import type { PickOutcome } from "./helpers";

export interface TodayGameRow {
  id: number;
  roundLabel: string;
  teamA: { seed: number; name: string } | null;
  teamB: { seed: number; name: string } | null;
  scoreA: number | null;
  scoreB: number | null;
  status: GameStatus;
  tipTime: string;
  /** The user's pick for this game, if any. */
  pick: { name: string; outcome: PickOutcome } | null;
}

function teamLabel(t: { seed: number; name: string } | null) {
  return t ? `(${t.seed}) ${t.name}` : "TBD";
}

export function TodaysGames({ games }: { games: TodayGameRow[] }) {
  return (
    <div className="retro-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2">
          TODAY&apos;S GAMES
        </h2>
        <Link href="/schedule" className="font-body text-xs text-burnt-orange hover:underline">
          Full schedule
        </Link>
      </div>

      {games.length === 0 ? (
        <p className="font-body text-sm text-navy/60">
          No games today. Check the schedule for the next tip-off.
        </p>
      ) : (
        <ul className="divide-y divide-navy/10">
          {games.map((g) => (
            <li key={g.id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-body text-xs text-navy/50 mb-1">{g.roundLabel}</div>
                <div className="font-body text-sm text-navy truncate">
                  {teamLabel(g.teamA)}{" "}
                  <span className="text-navy/40">vs</span> {teamLabel(g.teamB)}
                </div>
                {g.pick && (
                  <div className="font-body text-xs mt-1">
                    <span className="text-navy/60">Your pick: </span>
                    <span
                      className={
                        g.pick.outcome === "correct"
                          ? "text-forest font-bold"
                          : g.pick.outcome === "wrong"
                          ? "text-burnt-orange font-bold"
                          : "text-navy"
                      }
                    >
                      {g.pick.name}
                      {g.pick.outcome === "correct" && " ✓"}
                      {g.pick.outcome === "wrong" && " ✗"}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {g.status === "scheduled" ? (
                  <span className="font-body text-xs text-navy/70">{g.tipTime}</span>
                ) : (
                  <>
                    <div className="font-display text-navy text-xs">
                      {g.scoreA ?? 0}–{g.scoreB ?? 0}
                    </div>
                    <div
                      className={`font-display text-[0.6rem] mt-1 ${
                        g.status === "in_progress" ? "text-burnt-orange" : "text-navy/50"
                      }`}
                    >
                      {g.status === "in_progress" ? "LIVE" : "FINAL"}
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
