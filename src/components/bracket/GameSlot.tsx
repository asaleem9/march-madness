"use client";

import type { Team } from "@/types";
import { cn } from "@/lib/utils";

interface GameSlotProps {
  gameSlot: number;
  teamA: Team | null;
  teamB: Team | null;
  selectedTeamId: number | null;
  winnerId: number | null;
  isEditable: boolean;
  isCorrect: boolean | null;
  onPick: (gameSlot: number, teamId: number) => void;
}

function TeamRow({
  team,
  isSelected,
  isWinner,
  isCorrect,
  isEditable,
  onClick,
}: {
  team: Team | null;
  isSelected: boolean;
  isWinner: boolean;
  isCorrect: boolean | null;
  isEditable: boolean;
  onClick: () => void;
}) {
  if (!team) {
    return (
      <div className="game-slot-team opacity-50">
        <span className="seed-badge text-[0.4rem]">?</span>
        <span className="font-body text-xs text-navy/40">TBD</span>
      </div>
    );
  }

  const teamClass = cn(
    "game-slot-team",
    isEditable && "cursor-pointer",
    !isEditable && "cursor-default",
    isSelected && isCorrect === true && "correct",
    isSelected && isCorrect === false && "incorrect",
    isSelected && isCorrect === null && "selected",
    isWinner && !isSelected && "bg-forest/10"
  );

  return (
    <div
      className={teamClass}
      onClick={() => isEditable && team && onClick()}
    >
      <span className="seed-badge text-[0.4rem]">{team.seed}</span>
      <span className="font-body text-xs flex-1 truncate">
        {team.abbreviation}
      </span>
      {team.eliminated && (
        <span className="text-[0.5rem] text-burnt-orange">OUT</span>
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
}: GameSlotProps) {
  return (
    <div className="game-slot rounded">
      <TeamRow
        team={teamA}
        isSelected={selectedTeamId === teamA?.id}
        isWinner={winnerId === teamA?.id}
        isCorrect={selectedTeamId === teamA?.id ? isCorrect : null}
        isEditable={isEditable && !!teamA}
        onClick={() => teamA && onPick(gameSlot, teamA.id)}
      />
      <div className="game-slot-divider" />
      <TeamRow
        team={teamB}
        isSelected={selectedTeamId === teamB?.id}
        isWinner={winnerId === teamB?.id}
        isCorrect={selectedTeamId === teamB?.id ? isCorrect : null}
        isEditable={isEditable && !!teamB}
        onClick={() => teamB && onPick(gameSlot, teamB.id)}
      />
    </div>
  );
}
