"use client";

import type { GameWithTeams, Team, Region } from "@/types";
import { RegionBracket } from "./RegionBracket";
import { GameSlot } from "./GameSlot";
import { REGION_DISPLAY_NAMES } from "@/lib/utils";

type Step = Region | "final_four";

interface BracketViewProps {
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  resolvedTeams: Map<number, { teamA: Team | null; teamB: Team | null }>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  bracketName: string;
  score: number;
  currentStep: Step;
}

export function BracketView({
  games,
  picks,
  pickResults,
  resolvedTeams,
  isEditable,
  onPick,
  bracketName,
  score,
  currentStep,
}: BracketViewProps) {
  if (currentStep === "final_four") {
    const finalFourGames = games
      .filter((g) => g.round === "final_four")
      .sort((a, b) => a.gameSlot - b.gameSlot);
    const championshipGame = games.find((g) => g.round === "championship");

    return (
      <div className="space-y-6">
        <BracketHeader
          bracketName={bracketName}
          score={score}
          isEditable={isEditable}
          pickCount={picks.size}
        />

        <div className="flex flex-col items-center gap-8 py-4">
          <div className="scoreboard-heading text-[0.55rem] text-center rounded px-6 py-2">
            FINAL FOUR
          </div>

          <div className="flex gap-8 justify-center flex-wrap">
            {finalFourGames.map((game) => {
              const resolved = resolvedTeams.get(game.gameSlot);
              return (
                <div
                  key={game.gameSlot}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="font-display text-[0.45rem] text-navy/60">
                    SEMIFINAL
                  </div>
                  <GameSlot
                    gameSlot={game.gameSlot}
                    teamA={resolved?.teamA ?? game.teamA}
                    teamB={resolved?.teamB ?? game.teamB}
                    selectedTeamId={picks.get(game.gameSlot) ?? null}
                    winnerId={game.winnerId}
                    isEditable={isEditable}
                    isCorrect={pickResults.get(game.gameSlot) ?? null}
                    onPick={onPick}
                    scoreA={game.scoreA}
                    scoreB={game.scoreB}
                    gameStatus={game.status}
                  />
                </div>
              );
            })}
          </div>

          {championshipGame && (
            <div className="flex flex-col items-center gap-2">
              <div className="font-display text-[0.5rem] text-gold">
                CHAMPIONSHIP
              </div>
              {(() => {
                const resolved = resolvedTeams.get(
                  championshipGame.gameSlot
                );
                return (
                  <GameSlot
                    gameSlot={championshipGame.gameSlot}
                    teamA={resolved?.teamA ?? championshipGame.teamA}
                    teamB={resolved?.teamB ?? championshipGame.teamB}
                    selectedTeamId={
                      picks.get(championshipGame.gameSlot) ?? null
                    }
                    winnerId={championshipGame.winnerId}
                    isEditable={isEditable}
                    isCorrect={
                      pickResults.get(championshipGame.gameSlot) ?? null
                    }
                    onPick={onPick}
                    scoreA={championshipGame.scoreA}
                    scoreB={championshipGame.scoreB}
                    gameStatus={championshipGame.status}
                  />
                );
              })()}
            </div>
          )}

          {/* Show champion pick */}
          {championshipGame && picks.has(championshipGame.gameSlot) && (() => {
            const champResolved = resolvedTeams.get(championshipGame.gameSlot);
            const champTeamId = picks.get(championshipGame.gameSlot);
            const champTeam = champResolved
              ? champTeamId === champResolved.teamA?.id
                ? champResolved.teamA
                : champTeamId === champResolved.teamB?.id
                  ? champResolved.teamB
                  : null
              : null;
            if (!champTeam) return null;
            return (
              <div className="flex flex-col items-center gap-2 mt-4">
                <div className="font-display text-[0.5rem] text-gold">
                  YOUR CHAMPION
                </div>
                <div className="flex items-center gap-3 bg-gold/20 border-2 border-gold px-4 py-3 rounded">
                  {champTeam.logoUrl ? (
                    <img
                      src={champTeam.logoUrl}
                      alt={champTeam.name}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gold/30 flex items-center justify-center">
                      <span className="text-[0.4rem] font-display text-navy">
                        {champTeam.seed}
                      </span>
                    </div>
                  )}
                  <span className="font-display text-xs text-navy">
                    {champTeam.name}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Region step
  const region = currentStep as Region;

  return (
    <div className="space-y-6">
      <BracketHeader
        bracketName={bracketName}
        score={score}
        isEditable={isEditable}
        pickCount={picks.size}
      />

      <RegionBracket
        region={region}
        games={games}
        picks={picks}
        pickResults={pickResults}
        resolvedTeams={resolvedTeams}
        isEditable={isEditable}
        onPick={onPick}
      />
    </div>
  );
}

function BracketHeader({
  bracketName,
  score,
  isEditable,
  pickCount,
}: {
  bracketName: string;
  score: number;
  isEditable: boolean;
  pickCount: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="font-display text-navy text-sm">{bracketName}</h2>
        {!isEditable && (
          <p className="font-body text-xs text-navy/60 mt-1">
            Score: <span className="font-bold text-forest">{score}</span> pts
          </p>
        )}
      </div>
    </div>
  );
}
