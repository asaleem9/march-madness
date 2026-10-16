import Image from "next/image";
import Link from "next/link";
import { REQUIRED_PICKS } from "@/lib/tournament-structure";

export interface ChampionPick {
  name: string;
  seed: number;
  logoUrl: string | null;
  alive: boolean;
}

interface Props {
  bracketId: string;
  /** Null when the bracket isn't ranked (not locked). */
  rank: number | null;
  total: number;
  score: number;
  correct: number;
  scored: number;
  maxPossible: number;
  championPick: ChampionPick | null;
  /** Tournament is over — label as final. */
  final: boolean;
}

/** In-tournament / completed "Your Standing" card. */
export function StandingCard({
  bracketId,
  rank,
  total,
  score,
  correct,
  scored,
  maxPossible,
  championPick,
  final,
}: Props) {
  return (
    <div className="retro-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2">
          {final ? "FINAL STANDING" : "YOUR STANDING"}
        </h2>
        <Link
          href={`/bracket/${bracketId}`}
          className="font-body text-xs text-burnt-orange hover:underline"
        >
          View bracket
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div>
          <div className="font-display text-navy text-base sm:text-lg">
            {rank ? `#${rank}` : "—"}
          </div>
          <div className="font-body text-xs text-navy/60 mt-1">
            {rank ? `of ${total}` : "unranked"}
          </div>
        </div>
        <div>
          <div className="font-display text-forest text-base sm:text-lg">{score}</div>
          <div className="font-body text-xs text-navy/60 mt-1">points</div>
        </div>
        <div>
          <div className="font-display text-navy text-base sm:text-lg">
            {correct}
            <span className="text-navy/40 text-xs">/{scored}</span>
          </div>
          <div className="font-body text-xs text-navy/60 mt-1">correct picks</div>
        </div>
        <div>
          <div className="font-display text-gold text-base sm:text-lg">{maxPossible}</div>
          <div className="font-body text-xs text-navy/60 mt-1">
            {final ? "of max" : "max possible"}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t-2 border-navy/10 pt-4 flex items-center gap-3">
        <span className="font-display text-navy/60 text-[0.6rem] shrink-0">CHAMP PICK</span>
        {championPick ? (
          <>
            {championPick.logoUrl ? (
              <Image
                src={championPick.logoUrl}
                alt=""
                width={28}
                height={28}
                className={`object-contain ${championPick.alive ? "" : "grayscale opacity-50"}`}
                unoptimized
              />
            ) : (
              <span className="seed-badge">{championPick.seed}</span>
            )}
            <span
              className={`font-body text-sm font-bold truncate ${
                championPick.alive ? "text-navy" : "text-navy/50 line-through"
              }`}
            >
              ({championPick.seed}) {championPick.name}
            </span>
            <span
              className={`ml-auto shrink-0 font-display text-[0.6rem] px-2 py-1 ${
                championPick.alive
                  ? "bg-forest/15 text-forest"
                  : "bg-burnt-orange/15 text-burnt-orange"
              }`}
            >
              {championPick.alive ? (final ? "CHAMPION" : "ALIVE") : "OUT"}
            </span>
          </>
        ) : (
          <span className="font-body text-xs text-navy/50">
            No champion picked ({REQUIRED_PICKS} picks required)
          </span>
        )}
      </div>
    </div>
  );
}
