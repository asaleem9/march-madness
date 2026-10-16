"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRealtimeGames } from "@/hooks/useRealtimeGames";
import { BadgeLegend } from "./BadgeLegend";
import type { LeaderboardRow } from "./buildRows";

interface LeaderboardClientProps {
  rows: LeaderboardRow[];
  currentUserId: string | null;
}

const MEDALS: Record<number, string> = { 1: "gold", 2: "silver", 3: "bronze" };

/**
 * The ranked table. A client component so it can subscribe to realtime game
 * changes (which re-fetch the server page) and track whether the viewer's own
 * row is on screen for the sticky "You" bar.
 */
export function LeaderboardClient({ rows, currentUserId }: LeaderboardClientProps) {
  useRealtimeGames();

  const youRow = currentUserId ? rows.find((r) => r.userId === currentUserId) ?? null : null;
  const youRef = useRef<HTMLLIElement>(null);
  const [youVisible, setYouVisible] = useState(true);

  useEffect(() => {
    const el = youRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setYouVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [youRow?.bracketId]);

  return (
    <>
      {youRow && (
        <div
          data-testid="you-bar"
          aria-hidden={youVisible}
          className={`sticky top-0 z-20 -mx-4 px-4 py-2 mb-3 transition-opacity ${
            youVisible ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={() =>
              youRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" })
            }
            className="w-full max-w-4xl mx-auto flex items-center justify-between gap-3 bg-navy text-gold border-2 border-gold px-4 py-2 shadow-[4px_4px_0_var(--color-gold)]"
          >
            <span className="font-display text-[0.6rem]">
              You: #{youRow.rank} · {youRow.score} pts
            </span>
            <span className="font-body text-xs text-cream/80">Jump to your row ↓</span>
          </button>
        </div>
      )}

      <div className="retro-card overflow-hidden">
        <div className="scoreboard-heading text-[0.6rem] grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3.5rem_1fr_4.5rem_3.5rem_4rem_4rem] items-center gap-2 px-4 sm:px-6">
          <span>Rank</span>
          <span>Player</span>
          <span className="hidden sm:block text-center" title="Correct picks / decided games">
            Picks
          </span>
          <span className="hidden sm:block text-center" title="Champion pick">
            Champ
          </span>
          <span className="hidden sm:block text-right" title="Maximum possible points">
            Max
          </span>
          <span className="text-right">Score</span>
        </div>

        <ol className="divide-y-2 divide-navy/10">
          {rows.map((row) => {
            const isYou = row.userId === currentUserId;
            const medal = MEDALS[row.rank];
            return (
              <li
                key={row.bracketId}
                ref={isYou ? youRef : undefined}
                data-you-row={isYou || undefined}
                aria-current={isYou ? "true" : undefined}
                className={`relative grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3.5rem_1fr_4.5rem_3.5rem_4rem_4rem] items-center gap-2 px-4 sm:px-6 py-3 transition-colors hover:bg-navy/5 focus-within:bg-navy/5 ${
                  isYou
                    ? "bg-gold/20 shadow-[inset_4px_0_0_var(--color-gold)]"
                    : row.rank <= 3
                    ? "bg-gold/5"
                    : ""
                }`}
              >
                {/* Rank */}
                <div className="flex items-center">
                  {medal ? (
                    <Image
                      src={`/images/medals/${medal}.png`}
                      alt={`Rank ${row.rank}`}
                      width={32}
                      height={32}
                    />
                  ) : (
                    <span className="font-display text-xs text-navy/50">#{row.rank}</span>
                  )}
                </div>

                {/* Player */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    aria-hidden="true"
                    className="w-8 h-8 shrink-0 rounded-full border-2 border-navy bg-cream flex items-center justify-center font-body text-xs font-bold"
                    style={
                      row.avatarUrl
                        ? { backgroundImage: `url(${row.avatarUrl})`, backgroundSize: "cover" }
                        : undefined
                    }
                  >
                    {!row.avatarUrl && (row.displayName[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Stretched link: the ::after covers the whole row, so the
                          row is the link while the accessible name stays the
                          player's name. Badges sit above it (z-10). */}
                      <Link
                        href={`/bracket/${row.bracketId}`}
                        className="font-body text-sm font-bold truncate text-navy after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-gold focus-visible:after:-outline-offset-2"
                        aria-label={`${row.displayName}'s bracket, rank ${row.rank}, ${row.score} points`}
                      >
                        {row.displayName}
                      </Link>
                      {isYou && (
                        <span className="font-display text-[0.6rem] bg-gold text-navy px-1.5 py-0.5 rounded shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <BadgeLegend badges={row.badges} ownerName={row.displayName} />
                      {/* Mobile-only summary of the hidden columns. */}
                      <span className="sm:hidden font-body text-xs text-navy/60">
                        {row.correctPicks}/{row.decidedPicks} picks
                        {row.champion && (
                          <>
                            {" · "}
                            <ChampionText champion={row.champion} />
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Correct picks */}
                <div
                  className="hidden sm:block text-center font-body text-xs text-navy/80"
                  aria-label={`${row.correctPicks} of ${row.decidedPicks} decided picks correct`}
                >
                  {row.correctPicks}/{row.decidedPicks}
                </div>

                {/* Champion pick */}
                <div className="hidden sm:flex justify-center">
                  <ChampionLogo champion={row.champion} />
                </div>

                {/* Max possible */}
                <div
                  className="hidden sm:block text-right font-body text-xs text-navy/60"
                  aria-label={`Maximum possible ${row.maxPossible} points`}
                >
                  {row.maxPossible}
                </div>

                {/* Score */}
                <div className="text-right font-display text-sm text-forest">{row.score}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

function ChampionText({ champion }: { champion: NonNullable<LeaderboardRow["champion"]> }) {
  return (
    <span className={champion.eliminated ? "line-through text-burnt-orange" : ""}>
      {champion.abbreviation}
      {champion.isChampion ? " 🏆" : champion.eliminated ? " OUT" : ""}
    </span>
  );
}

function ChampionLogo({ champion }: { champion: LeaderboardRow["champion"] }) {
  if (!champion) {
    return <span className="font-body text-xs text-navy/30">—</span>;
  }
  const state = champion.isChampion ? "won the title" : champion.eliminated ? "out" : "alive";
  return (
    <div
      className="relative flex items-center justify-center"
      title={`${champion.name} (${state})`}
      aria-label={`Champion pick: ${champion.name}, ${state}`}
      role="img"
    >
      {champion.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={champion.logoUrl}
          alt=""
          className={`w-7 h-7 object-contain ${champion.eliminated ? "grayscale opacity-40" : ""}`}
        />
      ) : (
        <span
          className={`font-body text-xs font-bold ${
            champion.eliminated ? "text-navy/40 line-through" : "text-navy"
          }`}
        >
          {champion.abbreviation}
        </span>
      )}
      {champion.eliminated && (
        <span className="absolute -bottom-1 font-body text-[0.6rem] font-bold leading-none px-1 rounded bg-burnt-orange text-cream">
          OUT
        </span>
      )}
      {champion.isChampion && (
        <span className="absolute -top-1 -right-1 text-xs" aria-hidden="true">
          🏆
        </span>
      )}
    </div>
  );
}
