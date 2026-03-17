"use client";

import type { GameWithTeams, Region } from "@/types";
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

export function BracketView({
  games,
  picks,
  pickResults,
  isEditable,
  onPick,
  bracketName,
  score,
}: BracketViewProps) {
  const regions: Region[] = ["east", "west", "south", "midwest"];

  const finalFourGames = games
    .filter((g) => g.round === "final_four")
    .sort((a, b) => a.gameSlot - b.gameSlot);
  const championshipGame = games.find((g) => g.round === "championship");

  return (
    <div className="space-y-8">
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

      {/* Region brackets */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {regions.map((region) => (
          <RegionBracket
            key={region}
            region={region}
            games={games}
            picks={picks}
            pickResults={pickResults}
            isEditable={isEditable}
            onPick={onPick}
          />
        ))}
      </div>

      {/* Final Four & Championship */}
      <div className="mt-8">
        <div className="scoreboard-heading text-[0.55rem] text-center mb-4 rounded">
          Final Four & Championship
        </div>
        <div className="flex flex-col items-center gap-6">
          <div className="flex gap-8 justify-center flex-wrap">
            {finalFourGames.map((game) => (
              <GameSlot
                key={game.gameSlot}
                gameSlot={game.gameSlot}
                teamA={game.teamA}
                teamB={game.teamB}
                selectedTeamId={picks.get(game.gameSlot) ?? null}
                winnerId={game.winnerId}
                isEditable={isEditable}
                isCorrect={pickResults.get(game.gameSlot) ?? null}
                onPick={onPick}
              />
            ))}
          </div>
          {championshipGame && (
            <div>
              <div className="font-display text-[0.45rem] text-gold text-center mb-2">
                CHAMPIONSHIP
              </div>
              <GameSlot
                gameSlot={championshipGame.gameSlot}
                teamA={championshipGame.teamA}
                teamB={championshipGame.teamB}
                selectedTeamId={picks.get(championshipGame.gameSlot) ?? null}
                winnerId={championshipGame.winnerId}
                isEditable={isEditable}
                isCorrect={
                  pickResults.get(championshipGame.gameSlot) ?? null
                }
                onPick={onPick}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
