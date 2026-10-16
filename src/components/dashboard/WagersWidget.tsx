import Link from "next/link";
import type { WagerStatus } from "@/types";
import { formatEastern } from "./helpers";

export interface WagerRow {
  id: string;
  stakes: string;
  status: WagerStatus;
  challenger_id: string;
  opponent_id: string;
  winner_id: string | null;
  challenger: { display_name: string | null } | null;
  opponent: { display_name: string | null } | null;
}

interface Props {
  wagers: WagerRow[];
  userId: string;
  wagerDeadline: string | null;
  pastWagerDeadline: boolean;
  /** Completed tournament: show results instead of "active" framing. */
  showResults: boolean;
}

export function otherPartyName(w: WagerRow, userId: string): string {
  const other = w.challenger_id === userId ? w.opponent : w.challenger;
  return other?.display_name || "Unknown";
}

export function wagerResult(w: WagerRow, userId: string): "won" | "lost" | "tie" | null {
  if (w.status !== "resolved") return null;
  if (!w.winner_id) return "tie";
  return w.winner_id === userId ? "won" : "lost";
}

export function WagersWidget({ wagers, userId, wagerDeadline, pastWagerDeadline, showResults }: Props) {
  const hasPendingForMe = wagers.some(
    (w) => w.status === "pending" && w.opponent_id === userId
  );

  return (
    <div className="retro-card p-4">
      <h3 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2 mb-3">
        {showResults ? "WAGER RESULTS" : "WAGERS"}
      </h3>

      {wagers.length === 0 ? (
        <p className="font-body text-xs text-navy/50">
          {showResults ? "No wagers this year." : "No active wagers."}
        </p>
      ) : (
        <ul className="space-y-2">
          {wagers.map((w) => {
            const needsResponse = w.status === "pending" && w.opponent_id === userId;
            const result = wagerResult(w, userId);
            return (
              <li key={w.id} className="text-xs border-b border-navy/10 pb-2 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold truncate">vs {otherPartyName(w, userId)}</span>
                  {needsResponse ? (
                    <Link
                      href="/wagers?tab=pending"
                      className="font-display text-[0.6rem] px-2 py-1 bg-gold text-navy border-2 border-navy/20 shrink-0"
                    >
                      Respond
                    </Link>
                  ) : result ? (
                    <span
                      className={`font-display text-[0.6rem] px-2 py-1 shrink-0 ${
                        result === "won"
                          ? "bg-forest/15 text-forest"
                          : result === "lost"
                          ? "bg-burnt-orange/15 text-burnt-orange"
                          : "bg-navy/10 text-navy/70"
                      }`}
                    >
                      {result.toUpperCase()}
                    </span>
                  ) : (
                    <span
                      className={`font-display text-[0.6rem] px-2 py-1 shrink-0 ${
                        w.status === "pending"
                          ? "bg-gold/20 text-navy/70"
                          : "bg-forest/15 text-forest"
                      }`}
                    >
                      {w.status === "pending" ? "AWAITING" : "ACCEPTED"}
                    </span>
                  )}
                </div>
                <div className="text-navy/60 truncate mt-0.5">{w.stakes}</div>
              </li>
            );
          })}
        </ul>
      )}

      {!showResults && wagerDeadline && (
        <p className="font-body text-xs text-navy/60 mt-3">
          {pastWagerDeadline
            ? "Wagers are closed for this year."
            : `Wagers close ${formatEastern(wagerDeadline)}.`}
        </p>
      )}

      <Link
        href={hasPendingForMe ? "/wagers?tab=pending" : "/wagers"}
        className="block text-center font-body text-xs text-burnt-orange mt-3 hover:underline"
      >
        {hasPendingForMe ? "Respond to wagers" : "Manage wagers"}
      </Link>
    </div>
  );
}
