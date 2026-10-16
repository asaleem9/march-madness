import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/scoring";

interface Props {
  entries: LeaderboardEntry[];
  myBracketId: string | null;
  title?: string;
}

const TOP_N = 5;

/** Top five with shared ranks, plus the viewer's row if they're further down. */
export function MiniLeaderboard({ entries, myBracketId, title = "LEADERBOARD" }: Props) {
  const top = entries.slice(0, TOP_N);
  const mine = myBracketId ? entries.find((e) => e.bracketId === myBracketId) : undefined;
  const showMineBelow = !!mine && !top.some((e) => e.bracketId === mine.bracketId);

  const row = (e: LeaderboardEntry) => {
    const isMe = e.bracketId === myBracketId;
    return (
      <li
        key={e.bracketId}
        className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
          isMe ? "bg-gold/20 border border-gold/60" : ""
        }`}
        aria-current={isMe ? "true" : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-[0.6rem] text-gold w-7 shrink-0">#{e.rank}</span>
          <span className={`truncate ${isMe ? "font-bold" : ""}`}>
            {e.displayName}
            {isMe && <span className="text-navy/50 font-normal"> (you)</span>}
          </span>
        </div>
        <span className="font-bold text-forest shrink-0">{e.score}</span>
      </li>
    );
  };

  return (
    <div className="retro-card p-4">
      <h3 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2 mb-3">{title}</h3>
      {entries.length === 0 ? (
        <p className="font-body text-xs text-navy/50">No finalized brackets yet.</p>
      ) : (
        <ul className="space-y-1">
          {top.map(row)}
          {showMineBelow && mine && (
            <>
              <li aria-hidden="true" className="text-center text-navy/30 text-xs leading-none">
                ···
              </li>
              {row(mine)}
            </>
          )}
        </ul>
      )}
      <Link
        href="/leaderboard"
        className="block text-center font-body text-xs text-burnt-orange mt-3 hover:underline"
      >
        View full leaderboard
      </Link>
    </div>
  );
}
