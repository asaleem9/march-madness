"use client";

import { useState } from "react";
import type { GameWithTeams, Region } from "@/types";
import { RegionBracket } from "./RegionBracket";
import { GameSlot } from "./GameSlot";
import { REGION_DISPLAY_NAMES } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface BracketViewProps {
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  bracketName: string;
  score: number;
}

type Tab = Region | "final_four";

const TABS: { key: Tab; label: string }[] = [
  { key: "east", label: "East" },
  { key: "west", label: "West" },
  { key: "south", label: "South" },
  { key: "midwest", label: "Midwest" },
  { key: "final_four", label: "Final Four" },
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
  const [activeTab, setActiveTab] = useState<Tab>("east");

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

      {/* Region tabs */}
      <div className="flex border-b-2 border-navy/20 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "font-display text-[0.5rem] sm:text-[0.55rem] px-3 sm:px-5 py-2.5 whitespace-nowrap transition-colors",
              "border-b-2 -mb-[2px]",
              activeTab === tab.key
                ? "border-gold text-gold bg-navy/5"
                : "border-transparent text-navy/50 hover:text-navy/80 hover:bg-navy/5"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab !== "final_four" ? (
        <RegionBracket
          region={activeTab}
          games={games}
          picks={picks}
          pickResults={pickResults}
          isEditable={isEditable}
          onPick={onPick}
        />
      ) : (
        <div className="mt-4">
          <div className="flex flex-col items-center gap-8">
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
                  isCorrect={
                    pickResults.get(championshipGame.gameSlot) ?? null
                  }
                  onPick={onPick}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
