"use client";

import type { Region, GameWithTeams, Team } from "@/types";
import { GameSlot, type FirstFourHint } from "./GameSlot";
import { REGION_DISPLAY_NAMES, ROUND_DISPLAY_NAMES } from "@/lib/utils";

interface RegionBracketProps {
  region: Region;
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  resolvedTeams: Map<number, { teamA: Team | null; teamB: Team | null }>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
}

export function RegionBracket({
  region,
  games,
  picks,
  pickResults,
  resolvedTeams,
  isEditable,
  onPick,
}: RegionBracketProps) {
  // Build First Four hints: map from next_game_slot -> hint info
  // The hint shows "TEX / NCST" as a single clickable option
  const firstFourHints = new Map<
    number,
    { hint: FirstFourHint; position: string | null }
  >();
  const firstFourGames = games.filter(
    (g) => g.round === "first_four" && g.region === region
  );
  for (const ffGame of firstFourGames) {
    if (ffGame.nextGameSlot && ffGame.teamA && ffGame.teamB) {
      firstFourHints.set(ffGame.nextGameSlot, {
        hint: {
          teamAName: ffGame.teamA.abbreviation,
          teamBName: ffGame.teamB.abbreviation,
          pickTeamId: ffGame.teamA.id, // convention: store team_a as the pick
        },
        position: ffGame.slotPosition,
      });
    }
  }

  // Group games by round (First Four excluded — handled via hints)
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

      <div className="flex gap-3 overflow-x-auto pb-4">
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
                const resolved = resolvedTeams.get(game.gameSlot);
                const teamA = resolved?.teamA ?? game.teamA;
                const teamB = resolved?.teamB ?? game.teamB;

                // Show FF hint on the TBD slot (only when team hasn't resolved yet)
                const ffInfo = firstFourHints.get(game.gameSlot);
                const hintA =
                  !teamA && ffInfo && ffInfo.position === "top"
                    ? ffInfo.hint
                    : undefined;
                const hintB =
                  !teamB && ffInfo && ffInfo.position === "bottom"
                    ? ffInfo.hint
                    : undefined;

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
