"use client";

import type { Region, GameWithTeams, Team } from "@/types";
import { GameSlot } from "./GameSlot";
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
  // Get First Four games for this region
  const firstFourGames = games
    .filter((g) => g.round === "first_four" && g.region === region)
    .sort((a, b) => a.gameSlot - b.gameSlot);

  // Build map: next_game_slot -> { teams, position }
  // So First Round games know which First Four teams feed into them
  const firstFourFeeds = new Map<
    number,
    { teams: [Team, Team]; position: string | null }
  >();
  for (const ffGame of firstFourGames) {
    if (ffGame.nextGameSlot && ffGame.teamA && ffGame.teamB) {
      firstFourFeeds.set(ffGame.nextGameSlot, {
        teams: [ffGame.teamA, ffGame.teamB],
        position: ffGame.slotPosition,
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

      {/* Main bracket rounds */}
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

                // For First Round games fed by First Four: pass both FF teams
                // so the user can pick directly without a separate FF step
                const ffInfo = firstFourFeeds.get(game.gameSlot);
                const ffTeamsA =
                  !teamA && ffInfo && ffInfo.position === "top"
                    ? ffInfo.teams
                    : undefined;
                const ffTeamsB =
                  !teamB && ffInfo && ffInfo.position === "bottom"
                    ? ffInfo.teams
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
                    firstFourTeamsA={ffTeamsA}
                    firstFourTeamsB={ffTeamsB}
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
