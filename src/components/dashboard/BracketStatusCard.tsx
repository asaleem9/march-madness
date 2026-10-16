import Link from "next/link";
import { LockCountdown } from "@/components/LockCountdown";
import { REQUIRED_PICKS } from "@/lib/tournament-structure";

interface Props {
  bracket: { id: string; name: string; locked: boolean } | null;
  pickCount: number;
  deadline: string;
  /** Deadline is less than 24h away. */
  urgent: boolean;
}

/** Pre-lock "Your Bracket" card: draft progress, finalized state, or create CTA. */
export function BracketStatusCard({ bracket, pickCount, deadline, urgent }: Props) {
  const complete = pickCount >= REQUIRED_PICKS;
  const pct = Math.min(100, Math.round((pickCount / REQUIRED_PICKS) * 100));

  return (
    <div className="retro-card p-6">
      <h2 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2 mb-4">
        YOUR BRACKET
      </h2>

      {!bracket ? (
        <div className="text-center py-6">
          <p className="font-body text-sm text-navy/70 mb-5">
            You haven&apos;t started a bracket yet. Pick a winner for all{" "}
            {REQUIRED_PICKS} games before the deadline.
          </p>
          <Link href="/bracket/new" className="retro-btn retro-btn-primary inline-block">
            Create Bracket
          </Link>
        </div>
      ) : bracket.locked ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-body text-sm font-bold text-navy">{bracket.name}</p>
            <p className="font-display text-forest text-[0.6rem] mt-2">
              FINALIZED <span aria-hidden="true">✓</span>
            </p>
            <p className="font-body text-xs text-navy/60 mt-2">
              All {REQUIRED_PICKS} picks are in. Your bracket is on the leaderboard once
              games start.
            </p>
          </div>
          <Link href={`/bracket/${bracket.id}`} className="retro-btn retro-btn-secondary text-center">
            View
          </Link>
        </div>
      ) : (
        <div>
          {urgent && (
            <div
              role="alert"
              className="mb-4 border-2 border-burnt-orange bg-burnt-orange/10 px-4 py-3"
            >
              <p className="font-display text-burnt-orange text-[0.6rem] mb-1">
                NOT FINALIZED — LESS THAN 24 HOURS LEFT
              </p>
              <p className="font-body text-xs text-navy/80">
                Finalize now. A draft is auto-locked at the deadline only if all{" "}
                {REQUIRED_PICKS} picks are in — otherwise it won&apos;t count.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-bold text-navy truncate">{bracket.name}</p>
              <p className="font-display text-burnt-orange text-[0.6rem] mt-2">
                DRAFT · {pickCount}/{REQUIRED_PICKS} PICKS
              </p>
              <div
                className="mt-2 h-3 w-full border-2 border-navy/30 bg-cream overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={REQUIRED_PICKS}
                aria-valuenow={pickCount}
                aria-label="Bracket progress"
              >
                <div
                  className={`h-full ${complete ? "bg-forest" : "bg-gold"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="font-body text-xs text-navy/60 mt-2">
                {complete
                  ? "Every pick is in — finalize to lock it in."
                  : `${REQUIRED_PICKS - pickCount} picks to go.`}
              </p>
            </div>
            <Link href={`/bracket/${bracket.id}`} className="retro-btn retro-btn-primary text-center">
              {complete ? "Finalize" : "Continue"}
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <LockCountdown deadline={deadline} />
      </div>
    </div>
  );
}
