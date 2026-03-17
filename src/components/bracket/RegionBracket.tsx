"use client";

import type { Region, GameWithTeams } from "@/types";
import { GameSlot, type FirstFourHint } from "./GameSlot";
import { REGION_DISPLAY_NAMES, ROUND_DISPLAY_NAMES } from "@/lib/utils";

interface RegionBracketProps {
  region: Region;
  games: GameWithTeams[];
  picks: Map<number, number>; // gameSlot -> pickedTeamId
  pickResults: Map<number, boolean | null>; // gameSlot -> isCorrect
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
}

export function RegionBracket({
  region,
  games,
  picks,
  pickResults,
  isEditable,
  onPick,
}: RegionBracketProps) {
  // Build First Four hints: map from next_game_slot to the two competing team names
  const firstFourHints = new Map<number, FirstFourHint>();
  const firstFourGames = games.filter((g) => g.round === "first_four");
  for (const ffGame of firstFourGames) {
    if (ffGame.nextGameSlot && ffGame.teamA && ffGame.teamB) {
      firstFourHints.set(ffGame.nextGameSlot, {
        teamA: ffGame.teamA.abbreviation,
        teamB: ffGame.teamB.abbreviation,
      });
    }
  }

  // Group games by round
  const roundOrder = [
    "first_round",
    "second_round",
    "sweet_16",
    "elite_eight",
  ] as const;

  const gamesByRound = roundOrder.map((round) =>
    games
      .filter((g) => g.round === round && g.region === region)
      .sort((a, b) => a.gameSlot - b.gameSlot)
  );

  return (
    <div className="flex flex-col">
      <div className="scoreboard-heading text-[0.55rem] text-center mb-4 rounded">
        {REGION_DISPLAY_NAMES[region]} Region
      </div>
      <div className="flex gap-6 overflow-x-auto pb-4">
        {gamesByRound.map((roundGames, roundIndex) => (
          <div key={roundOrder[roundIndex]} className="flex flex-col gap-2">
            <div className="font-display text-[0.45rem] text-navy/60 text-center mb-2">
              {ROUND_DISPLAY_NAMES[roundOrder[roundIndex]]}
            </div>
            <div
              className="flex flex-col justify-around flex-1"
              style={{ gap: `${Math.pow(2, roundIndex + 1) * 8}px` }}
            >
              {roundGames.map((game) => {
                const teamA = game.teamA;
                const teamB = game.teamB;

                // Check if either team slot is fed by a First Four game
                const hint = firstFourHints.get(game.gameSlot);
                const hintA = !teamA && hint && game.teamAId === null ? hint : undefined;
                const hintB = !teamB && hint && game.teamBId === null ? hint : undefined;

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
                    firstFourHintA={hintA}
                    firstFourHintB={hintB}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
