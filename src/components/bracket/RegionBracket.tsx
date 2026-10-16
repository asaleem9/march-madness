"use client";

import { useEffect, useRef, useState } from "react";
import type { Region, GameWithTeams } from "@/types";
import { GameSlot, type PlayInHint } from "./GameSlot";
import type { ResolvedSlot } from "./bracket-logic";
import { playInFeeders } from "./bracket-logic";
import { REGION_DISPLAY_NAMES, ROUND_DISPLAY_NAMES, cn } from "@/lib/utils";

interface RegionBracketProps {
  region: Region;
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  resolvedTeams: Map<number, ResolvedSlot>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  showOdds?: boolean;
  ownerLabel?: string;
}

const ROUND_ORDER = ["first_round", "second_round", "sweet_16", "elite_eight"] as const;
const ROUND_SHORT: Record<(typeof ROUND_ORDER)[number], string> = {
  first_round: "R1",
  second_round: "R2",
  sweet_16: "S16",
  elite_eight: "E8",
};

export function RegionBracket({
  region,
  games,
  picks,
  pickResults,
  resolvedTeams,
  isEditable,
  onPick,
  showOdds,
  ownerLabel,
}: RegionBracketProps) {
  // Round shown on small screens (all rounds render side by side on md+).
  // The parent keys this component by region, so switching regions resets it.
  const [mobileRound, setMobileRound] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      setAtEnd(end);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [region, mobileRound]);

  // Play-in hints keyed by the First Round slot they feed. Shown as a
  // two-button picker while that side of the tile is still TBD.
  const hints = new Map<number, { hint: PlayInHint; position: string | null }>();
  for (const [slot, feeders] of playInFeeders(games)) {
    for (const ff of feeders) {
      if (!ff.teamA || !ff.teamB) continue;
      hints.set(slot, {
        hint: {
          teamAName: ff.teamA.abbreviation,
          teamBName: ff.teamB.abbreviation,
          teamAId: ff.teamA.id,
          teamBId: ff.teamB.id,
          seed: ff.teamA.seed === ff.teamB.seed ? ff.teamA.seed : undefined,
        },
        position: ff.slotPosition,
      });
    }
  }

  const gamesByRound = ROUND_ORDER.map((round) =>
    games
      .filter((g) => g.round === round && g.region === region)
      .sort((a, b) => a.gameSlot - b.gameSlot)
  );

  return (
    <div className="flex flex-col">
      <div className="scoreboard-heading text-[0.6rem] text-center mb-3 rounded">
        {REGION_DISPLAY_NAMES[region]} Region
      </div>

      {/* Round sub-tabs: phones see one round at a time */}
      <div className="md:hidden mb-3" role="tablist" aria-label="Round">
        <div className="grid grid-cols-4 gap-1">
          {ROUND_ORDER.map((round, i) => {
            const made = gamesByRound[i].filter((g) => picks.has(g.gameSlot)).length;
            const total = gamesByRound[i].length;
            const active = i === mobileRound;
            return (
              <button
                key={round}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${ROUND_DISPLAY_NAMES[round]}, ${made} of ${total} picked`}
                onClick={() => setMobileRound(i)}
                className={cn(
                  "min-h-[44px] border-2 border-navy font-display text-[0.6rem] flex flex-col items-center justify-center gap-0.5",
                  active ? "bg-navy text-gold" : "bg-white text-navy"
                )}
              >
                <span>{ROUND_SHORT[round]}</span>
                <span className={cn("font-body text-[0.65rem]", active ? "text-gold/80" : "text-navy/60")}>
                  {made}/{total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          className={cn("scroll-fade flex gap-3 overflow-x-auto pb-4", atEnd && "at-end")}
        >
          {gamesByRound.map((roundGames, roundIndex) => (
            <div
              key={ROUND_ORDER[roundIndex]}
              className={cn(
                "flex-col gap-2 flex-1",
                roundIndex === mobileRound ? "flex" : "hidden md:flex"
              )}
            >
              <div className="font-display text-[0.6rem] text-navy/70 text-center mb-2">
                {ROUND_DISPLAY_NAMES[ROUND_ORDER[roundIndex]]}
              </div>
              <div
                className="flex flex-col justify-around flex-1 gap-2 md:gap-[var(--round-gap)]"
                style={{ ["--round-gap" as string]: `${Math.pow(2, roundIndex + 1) * 8}px` }}
              >
                {roundGames.map((game) => {
                  const resolved = resolvedTeams.get(game.gameSlot);
                  const teamA = resolved?.teamA ?? game.teamA;
                  const teamB = resolved?.teamB ?? game.teamB;

                  const info = hints.get(game.gameSlot);
                  const hintA = !teamA && info && info.position === "top" ? info.hint : undefined;
                  const hintB = !teamB && info && info.position === "bottom" ? info.hint : undefined;

                  return (
                    <GameSlot
                      key={game.gameSlot}
                      gameSlot={game.gameSlot}
                      teamA={teamA}
                      teamB={teamB}
                      selectedTeamId={picks.get(game.gameSlot) ?? null}
                      winnerId={game.winnerId}
                      isEditable={isEditable}
                      isCorrect={pickResults.get(game.gameSlot) ?? null}
                      onPick={onPick}
                      playInHintA={hintA}
                      playInHintB={hintB}
                      scoreA={game.scoreA}
                      scoreB={game.scoreB}
                      gameStatus={game.status}
                      showOdds={showOdds}
                      ghostPick={resolved?.ghostPick}
                      ownerLabel={ownerLabel}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {!atEnd && (
          <div
            className="md:hidden pointer-events-none absolute right-1 top-1 font-body text-xs text-navy/60 bg-cream/90 px-1.5 py-0.5 rounded"
            aria-hidden="true"
          >
            swipe →
          </div>
        )}
      </div>
    </div>
  );
}
