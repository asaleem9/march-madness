"use client";

import type { GameWithTeams } from "@/types";
import { RegionBracket } from "./RegionBracket";
import { GameSlot } from "./GameSlot";

interface BracketViewProps {
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  bracketName: string;
  score: number;
}

const GRID_REGIONS = [
  { region: "east" as const, position: "top-left" },
  { region: "west" as const, position: "top-right" },
  { region: "south" as const, position: "bottom-left" },
  { region: "midwest" as const, position: "bottom-right" },
];

export function BracketView({
  games,
  picks,
  pickResults,
  isEditable,
  onPick,
  bracketName,
  score,
}: BracketViewProps) {
  const finalFourGames = games
    .filter((g) => g.round === "final_four")
    .sort((a, b) => a.gameSlot - b.gameSlot);
  const championshipGame = games.find((g) => g.round === "championship");

  return (
    <div className="space-y-6">
      {/* Bracket header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-navy text-sm">{bracketName}</h2>
          {!isEditable && (
            <p className="font-body text-xs text-navy/60 mt-1">
              Score: <span className="font-bold text-forest">{score}</span> pts
            </p>
          )}
        </div>
        {isEditable && (
          <div className="text-xs text-navy/60">
            {picks.size}/63 picks made
          </div>
        )}
      </div>

      {/* 2x2 Region Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {GRID_REGIONS.map(({ region }) => (
          <div key={region} className="min-w-0">
            <RegionBracket
              region={region}
              games={games}
              picks={picks}
              pickResults={pickResults}
              isEditable={isEditable}
              onPick={onPick}
            />
          </div>
        ))}
      </div>

      {/* Final Four + Championship */}
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="scoreboard-heading text-[0.55rem] text-center rounded px-6 py-2">
          FINAL FOUR
        </div>
        <div className="flex gap-8 justify-center flex-wrap">
          {finalFourGames.map((game) => (
            <div key={game.gameSlot} className="flex flex-col items-center gap-2">
              <div className="font-display text-[0.45rem] text-navy/60">
                SEMIFINAL
              </div>
              <GameSlot
                gameSlot={game.gameSlot}
                teamA={game.teamA}
                teamB={game.teamB}
                selectedTeamId={picks.get(game.gameSlot) ?? null}
                winnerId={game.winnerId}
                isEditable={isEditable}
                isCorrect={pickResults.get(game.gameSlot) ?? null}
                onPick={onPick}
              />
            </div>
          ))}
        </div>
        {championshipGame && (
          <div className="flex flex-col items-center gap-2">
            <div className="font-display text-[0.5rem] text-gold">
              CHAMPIONSHIP
            </div>
            <GameSlot
              gameSlot={championshipGame.gameSlot}
              teamA={championshipGame.teamA}
              teamB={championshipGame.teamB}
              selectedTeamId={picks.get(championshipGame.gameSlot) ?? null}
              winnerId={championshipGame.winnerId}
              isEditable={isEditable}
              isCorrect={pickResults.get(championshipGame.gameSlot) ?? null}
              onPick={onPick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
