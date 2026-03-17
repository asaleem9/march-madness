"use client";

import type { Team } from "@/types";
import { cn } from "@/lib/utils";
import { getWinProbability, formatOdds } from "@/lib/odds";

interface GameSlotProps {
  gameSlot: number;
  teamA: Team | null;
  teamB: Team | null;
  selectedTeamId: number | null;
  winnerId: number | null;
  isEditable: boolean;
  isCorrect: boolean | null;
  onPick: (gameSlot: number, teamId: number) => void;
  // When a slot is TBD because it's fed by a First Four game,
  // pass the two First Four teams so the user can pick directly
  firstFourTeamsA?: [Team, Team];
  firstFourTeamsB?: [Team, Team];
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
      {/* Team logo */}
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="w-6 h-6 rounded-full object-contain shrink-0"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gold/30 shrink-0 flex items-center justify-center">
          <span className="text-[0.35rem] font-display text-navy">
            {team.seed}
          </span>
        </div>
      )}

      {/* Team name */}
      <span className="font-body text-xs flex-1 truncate">
        {truncateName(team.name)}
      </span>

      {/* Odds + Seed column */}
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

      {team.eliminated && (
        <span className="text-[0.5rem] text-burnt-orange shrink-0 font-bold">
          OUT
        </span>
      )}
    </div>
  );
}

// Renders two First Four teams as clickable options in a single slot position
function FirstFourPicker({
  teams,
  selectedTeamId,
  isEditable,
  onPick,
  gameSlot,
}: {
  teams: [Team, Team];
  selectedTeamId: number | null;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  gameSlot: number;
}) {
  return (
    <div className="flex flex-col">
      {teams.map((team) => (
        <TeamRow
          key={team.id}
          team={team}
          isSelected={selectedTeamId === team.id}
          isWinner={false}
          isCorrect={null}
          isEditable={isEditable}
          onClick={() => onPick(gameSlot, team.id)}
        />
      ))}
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
  firstFourTeamsA,
  firstFourTeamsB,
}: GameSlotProps) {
  const showPickerA = !teamA && firstFourTeamsA;
  const showPickerB = !teamB && firstFourTeamsB;

  return (
    <div className="game-slot rounded">
      {showPickerA ? (
        <FirstFourPicker
          teams={firstFourTeamsA}
          selectedTeamId={selectedTeamId}
          isEditable={isEditable}
          onPick={onPick}
          gameSlot={gameSlot}
        />
      ) : (
        <TeamRow
          team={teamA}
          isSelected={selectedTeamId === teamA?.id}
          isWinner={winnerId === teamA?.id}
          isCorrect={selectedTeamId === teamA?.id ? isCorrect : null}
          isEditable={isEditable && !!teamA}
          onClick={() => teamA && onPick(gameSlot, teamA.id)}
        />
      )}
      <div className="game-slot-divider" />
      {showPickerB ? (
        <FirstFourPicker
          teams={firstFourTeamsB}
          selectedTeamId={selectedTeamId}
          isEditable={isEditable}
          onPick={onPick}
          gameSlot={gameSlot}
        />
      ) : (
        <TeamRow
          team={teamB}
          isSelected={selectedTeamId === teamB?.id}
          isWinner={winnerId === teamB?.id}
          isCorrect={selectedTeamId === teamB?.id ? isCorrect : null}
          isEditable={isEditable && !!teamB}
          onClick={() => teamB && onPick(gameSlot, teamB.id)}
        />
      )}
    </div>
  );
}
