"use client";

import type { Team, GameStatus } from "@/types";
import { cn } from "@/lib/utils";
import { getWinProbability, formatOdds } from "@/lib/odds";

export interface FirstFourHint {
  teamAName: string;
  teamBName: string;
  teamAId: number;
  teamBId: number;
}

interface GameSlotProps {
  gameSlot: number;
  teamA: Team | null;
  teamB: Team | null;
  selectedTeamId: number | null;
  winnerId: number | null;
  isEditable: boolean;
  isCorrect: boolean | null;
  onPick: (gameSlot: number, teamId: number) => void;
  firstFourHintA?: FirstFourHint;
  firstFourHintB?: FirstFourHint;
  scoreA?: number | null;
  scoreB?: number | null;
  gameStatus?: GameStatus;
}

function truncateName(name: string, maxLen = 13): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "\u2026";
}

function TeamRow({
  team,
  isSelected,
  isWinner,
  isCorrect,
  isEditable,
  onClick,
  firstFourHint,
  onPickFF,
  selectedTeamId,
  score,
  gameStatus,
}: {
  team: Team | null;
  isSelected: boolean;
  isWinner: boolean;
  isCorrect: boolean | null;
  isEditable: boolean;
  onClick: () => void;
  firstFourHint?: FirstFourHint;
  onPickFF?: (teamId: number) => void;
  selectedTeamId?: number | null;
  score?: number | null;
  gameStatus?: GameStatus;
}) {
  // TBD slot with First Four hint — show both teams as individually pickable
  if (!team && firstFourHint) {
    const aSelected = selectedTeamId === firstFourHint.teamAId;
    const bSelected = selectedTeamId === firstFourHint.teamBId;
    const anySelected = aSelected || bSelected;

    return (
      <div
        className={cn("game-slot-team", anySelected && "selected")}
        title={`Winner of ${firstFourHint.teamAName} vs ${firstFourHint.teamBName}`}
      >
        <div className="w-6 h-6 rounded-full bg-gold/20 shrink-0 flex items-center justify-center">
          <span className="text-[0.3rem] font-display text-navy">FF</span>
        </div>
        <span className="font-body text-xs flex-1">
          <span
            className={cn(
              isEditable && "cursor-pointer hover:underline",
              aSelected ? "text-white font-bold" : anySelected ? "text-white/50" : "text-navy/70"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditable && onPickFF) onPickFF(firstFourHint.teamAId);
            }}
          >
            {firstFourHint.teamAName}
          </span>
          <span className={anySelected ? "text-white/50" : "text-navy/30"}> / </span>
          <span
            className={cn(
              isEditable && "cursor-pointer hover:underline",
              bSelected ? "text-white font-bold" : anySelected ? "text-white/50" : "text-navy/70"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditable && onPickFF) onPickFF(firstFourHint.teamBId);
            }}
          >
            {firstFourHint.teamBName}
          </span>
        </span>
        <div className="flex flex-col items-end shrink-0">
          <span className={cn("text-[0.45rem]", anySelected ? "text-white/50" : "text-navy/30")}>
            Play-In
          </span>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="game-slot-team opacity-50">
        <div className="w-6 h-6 rounded-full bg-navy/10 shrink-0" />
        <span className="font-body text-xs text-navy/40 flex-1">TBD</span>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[0.45rem] text-navy/30">&mdash;</span>
        </div>
      </div>
    );
  }

  const probability = getWinProbability(team.name);
  const oddsStr = formatOdds(probability);

  const teamClass = cn(
    "game-slot-team",
    isEditable && "cursor-pointer",
    !isEditable && "cursor-default",
    isSelected && isCorrect === true && "correct",
    isSelected && isCorrect === false && "incorrect",
    isSelected && isCorrect === null && "selected",
    isWinner && !isSelected && "bg-forest/10"
  );

  const isActiveSelection = isSelected && isCorrect === null;
  const isCorrectPick = isSelected && isCorrect === true;
  const isIncorrectPick = isSelected && isCorrect === false;

  return (
    <div
      className={teamClass}
      onClick={() => isEditable && team && onClick()}
      title={team.name}
    >
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="w-6 h-6 rounded-full object-contain shrink-0"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-navy/15 shrink-0 flex items-center justify-center">
          <span className="text-[0.3rem] font-display text-navy">
            {team.abbreviation}
          </span>
        </div>
      )}

      <span className="font-body text-xs flex-1 truncate">
        {truncateName(team.name)}
      </span>

      {score != null && gameStatus === "final" ? (
        <span
          className={cn(
            "font-body text-xs font-bold tabular-nums shrink-0 min-w-[1.5rem] text-right",
            isActiveSelection || isCorrectPick
              ? "text-white"
              : isIncorrectPick
                ? "text-white/70"
                : isWinner
                  ? "text-forest"
                  : "text-navy/50"
          )}
        >
          {score}
        </span>
      ) : (
        <div className="flex flex-col items-end shrink-0 leading-tight">
          <span
            className={cn(
              "text-[0.55rem] font-body tabular-nums",
              isActiveSelection || isCorrectPick
                ? "text-white/80"
                : isIncorrectPick
                  ? "text-white/50"
                  : probability >= 10
                    ? "text-gold font-bold"
                    : probability >= 1
                      ? "text-navy/60"
                      : "text-navy/35"
            )}
          >
            {probability >= 1 ? "+" : ""}
            {oddsStr}
          </span>
          <span
            className={cn(
              "text-[0.45rem]",
              isActiveSelection || isCorrectPick
                ? "text-white/50"
                : isIncorrectPick
                  ? "text-white/40"
                  : "text-navy/35"
            )}
          >
            Seed {team.seed}
          </span>
        </div>
      )}

      {team.eliminated && (
        <span className="text-[0.5rem] text-burnt-orange shrink-0 font-bold">
          OUT
        </span>
      )}
    </div>
  );
}

export function GameSlot({
  gameSlot,
  teamA,
  teamB,
  selectedTeamId,
  winnerId,
  isEditable,
  isCorrect,
  onPick,
  firstFourHintA,
  firstFourHintB,
  scoreA,
  scoreB,
  gameStatus,
}: GameSlotProps) {
  // For FF hints: check if the pick matches either team in the hint
  const isHintASelected = !teamA && firstFourHintA && (selectedTeamId === firstFourHintA.teamAId || selectedTeamId === firstFourHintA.teamBId);
  const isHintBSelected = !teamB && firstFourHintB && (selectedTeamId === firstFourHintB.teamAId || selectedTeamId === firstFourHintB.teamBId);

  return (
    <div className="game-slot rounded">
      <TeamRow
        team={teamA}
        isSelected={teamA ? selectedTeamId === teamA.id : !!isHintASelected}
        isWinner={winnerId === teamA?.id}
        isCorrect={selectedTeamId === teamA?.id ? isCorrect : null}
        isEditable={isEditable && (!!teamA || !!firstFourHintA)}
        onClick={() => {
          if (teamA) onPick(gameSlot, teamA.id);
        }}
        firstFourHint={firstFourHintA}
        onPickFF={(teamId) => onPick(gameSlot, teamId)}
        selectedTeamId={selectedTeamId}
        score={scoreA}
        gameStatus={gameStatus}
      />
      <div className="game-slot-divider" />
      <TeamRow
        team={teamB}
        isSelected={teamB ? selectedTeamId === teamB.id : !!isHintBSelected}
        isWinner={winnerId === teamB?.id}
        isCorrect={selectedTeamId === teamB?.id ? isCorrect : null}
        isEditable={isEditable && (!!teamB || !!firstFourHintB)}
        onClick={() => {
          if (teamB) onPick(gameSlot, teamB.id);
        }}
        firstFourHint={firstFourHintB}
        onPickFF={(teamId) => onPick(gameSlot, teamId)}
        selectedTeamId={selectedTeamId}
        score={scoreB}
        gameStatus={gameStatus}
      />
    </div>
  );
}
