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

  // Semi 1 = slot 65 (East vs West), Semi 2 = slot 66 (South vs Midwest)
  const semi1 = finalFourGames.find((g) => g.gameSlot === 65);
  const semi2 = finalFourGames.find((g) => g.gameSlot === 66);

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

      {/* Traditional bracket layout */}
      <div className="overflow-x-auto">
        <div className="bracket-layout">
          {/* Row 1, Col 1: East (LTR) */}
          <div style={{ gridColumn: 1, gridRow: 1 }} className="p-2">
            <RegionBracket
              region="east"
              games={games}
              picks={picks}
              pickResults={pickResults}
              isEditable={isEditable}
              onPick={onPick}
              direction="ltr"
            />
          </div>

          {/* Row 2, Col 1: South (LTR) */}
          <div style={{ gridColumn: 1, gridRow: 2 }} className="p-2">
            <RegionBracket
              region="south"
              games={games}
              picks={picks}
              pickResults={pickResults}
              isEditable={isEditable}
              onPick={onPick}
              direction="ltr"
            />
          </div>

          {/* Row 1, Col 3: West (RTL) */}
          <div style={{ gridColumn: 3, gridRow: 1 }} className="p-2">
            <RegionBracket
              region="west"
              games={games}
              picks={picks}
              pickResults={pickResults}
              isEditable={isEditable}
              onPick={onPick}
              direction="rtl"
            />
          </div>

          {/* Row 2, Col 3: Midwest (RTL) */}
          <div style={{ gridColumn: 3, gridRow: 2 }} className="p-2">
            <RegionBracket
              region="midwest"
              games={games}
              picks={picks}
              pickResults={pickResults}
              isEditable={isEditable}
              onPick={onPick}
              direction="rtl"
            />
          </div>

          {/* Center column: Final Four + Championship */}
          <div className="bracket-center-col">
            {/* Semifinal 1 */}
            {semi1 && (
              <div className="flex flex-col items-center gap-1">
                <div className="font-display text-[0.45rem] text-navy/60">
                  SEMIFINAL 1
                </div>
                <GameSlot
                  gameSlot={semi1.gameSlot}
                  teamA={semi1.teamA}
                  teamB={semi1.teamB}
                  selectedTeamId={picks.get(semi1.gameSlot) ?? null}
                  winnerId={semi1.winnerId}
                  isEditable={isEditable}
                  isCorrect={pickResults.get(semi1.gameSlot) ?? null}
                  onPick={onPick}
                />
              </div>
            )}

            <div className="bracket-center-connector" />

            {/* Championship */}
            {championshipGame && (
              <div className="flex flex-col items-center gap-1">
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

            <div className="bracket-center-connector" />

            {/* Semifinal 2 */}
            {semi2 && (
              <div className="flex flex-col items-center gap-1">
                <div className="font-display text-[0.45rem] text-navy/60">
                  SEMIFINAL 2
                </div>
                <GameSlot
                  gameSlot={semi2.gameSlot}
                  teamA={semi2.teamA}
                  teamB={semi2.teamB}
                  selectedTeamId={picks.get(semi2.gameSlot) ?? null}
                  winnerId={semi2.winnerId}
                  isEditable={isEditable}
                  isCorrect={pickResults.get(semi2.gameSlot) ?? null}
                  onPick={onPick}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
