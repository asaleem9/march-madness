"use client";

import type { Team, GameStatus } from "@/types";
import { cn } from "@/lib/utils";
import { getWinProbability, formatOdds } from "@/lib/odds";
import type { GhostPick } from "./bracket-logic";

/** Two play-in teams that feed a still-TBD side of a First Round tile. */
export interface PlayInHint {
  teamAName: string;
  teamBName: string;
  teamAId: number;
  teamBId: number;
  /** Shared seed line of the play-in (both teams normally have the same seed). */
  seed?: number;
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
  playInHintA?: PlayInHint;
  playInHintB?: PlayInHint;
  scoreA?: number | null;
  scoreB?: number | null;
  gameStatus?: GameStatus;
  /** Show title odds next to each team (only while picking). Defaults to `isEditable`. */
  showOdds?: boolean;
  /** A pick that is no longer one of this slot's teams. */
  ghostPick?: GhostPick;
  /** "Your" or "Ali's" — who owns the picks on this bracket. */
  ownerLabel?: string;
}

function truncateName(name: string, maxLen = 13): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

function PlayInRow({
  hint,
  selectedTeamId,
  isEditable,
  onPick,
}: {
  hint: PlayInHint;
  selectedTeamId: number | null | undefined;
  isEditable: boolean;
  onPick: (teamId: number) => void;
}) {
  const aSelected = selectedTeamId === hint.teamAId;
  const bSelected = selectedTeamId === hint.teamBId;
  const anySelected = aSelected || bSelected;

  const buttonClass = (selected: boolean) =>
    cn(
      "flex-1 text-left font-body text-xs px-2 py-1.5 min-h-[36px] border-2 rounded transition-colors",
      "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-gold",
      selected
        ? "bg-forest text-white border-forest font-bold"
        : "bg-white text-navy border-navy/30",
      isEditable ? "cursor-pointer" : "cursor-default",
      isEditable && !selected && "hover:bg-cream"
    );

  return (
    <div
      className={cn("game-slot-team cursor-default items-start py-1", anySelected && "bg-forest/10")}
      title={`Winner of ${hint.teamAName} vs ${hint.teamBName} (play-in)`}
    >
      <span className="seed-badge shrink-0 mt-1" aria-hidden="true">
        {hint.seed ?? "OR"}
      </span>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <button
          type="button"
          className={buttonClass(aSelected)}
          aria-pressed={aSelected}
          aria-label={`${hint.teamAName} — play-in team${aSelected ? ", your pick" : ""}`}
          disabled={!isEditable}
          onClick={(e) => {
            e.stopPropagation();
            onPick(hint.teamAId);
          }}
        >
          {hint.teamAName}
        </button>
        <button
          type="button"
          className={buttonClass(bSelected)}
          aria-pressed={bSelected}
          aria-label={`${hint.teamBName} — play-in team${bSelected ? ", your pick" : ""}`}
          disabled={!isEditable}
          onClick={(e) => {
            e.stopPropagation();
            onPick(hint.teamBId);
          }}
        >
          {hint.teamBName}
        </button>
      </div>
      <span className="font-body text-[0.6rem] text-navy/50 shrink-0 mt-1">Play-in</span>
    </div>
  );
}

function TeamRow({
  team,
  isSelected,
  isWinner,
  isCorrect,
  isEditable,
  showOdds,
  onClick,
  score,
  gameStatus,
}: {
  team: Team | null;
  isSelected: boolean;
  isWinner: boolean;
  isCorrect: boolean | null;
  isEditable: boolean;
  showOdds: boolean;
  onClick: () => void;
  score?: number | null;
  gameStatus?: GameStatus;
}) {
  if (!team) {
    return (
      <div className="game-slot-team opacity-50 cursor-default">
        <span className="seed-badge opacity-40" aria-hidden="true">
          ?
        </span>
        <span className="font-body text-xs text-navy/40 flex-1">TBD</span>
        <span className="font-body text-[0.6rem] text-navy/30">&mdash;</span>
      </div>
    );
  }

  const probability = getWinProbability(team);
  const oddsStr = formatOdds(probability);

  const isActiveSelection = isSelected && isCorrect === null;
  const isCorrectPick = isSelected && isCorrect === true;
  const isIncorrectPick = isSelected && isCorrect === false;

  const teamClass = cn(
    "game-slot-team",
    isEditable ? "cursor-pointer" : "cursor-default",
    isCorrectPick && "correct",
    isIncorrectPick && "incorrect",
    // Pending pick: forest outline (distinct from the solid "correct" fill).
    isActiveSelection && "selected bg-forest/15 text-navy shadow-[inset_0_0_0_3px_var(--color-forest)]",
    isWinner && !isSelected && "bg-forest/10"
  );

  const onDark = isCorrectPick || isIncorrectPick;

  return (
    <div
      className={teamClass}
      onClick={() => isEditable && onClick()}
      onKeyDown={(e) => {
        if (isEditable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      role={isEditable ? "button" : undefined}
      tabIndex={isEditable ? 0 : undefined}
      aria-pressed={isEditable ? isSelected : undefined}
      aria-label={
        isCorrectPick
          ? `${team.name} — correct pick`
          : isIncorrectPick
            ? `${team.name} — wrong pick`
            : isActiveSelection
              ? `${team.name} — your pick`
              : team.eliminated
                ? `${team.name} — eliminated`
                : team.name
      }
      title={team.name}
    >
      <span
        className={cn("seed-badge shrink-0", onDark && "border-cream")}
        aria-label={`Seed ${team.seed}`}
      >
        {team.seed}
      </span>

      {team.logoUrl && (
        <img
          src={team.logoUrl}
          alt=""
          className="w-5 h-5 rounded-full object-contain shrink-0"
        />
      )}

      <span className={cn("font-body text-xs flex-1 truncate", isActiveSelection && "font-bold")}>
        {truncateName(team.name)}
      </span>

      {/* Non-color cue so correct/wrong/picked don't rely on green vs red alone */}
      {isCorrectPick && (
        <span className="shrink-0 text-white text-[0.7rem] font-bold" aria-hidden="true">
          ✓
        </span>
      )}
      {isIncorrectPick && (
        <span className="shrink-0 text-cream/90 text-[0.7rem] font-bold" aria-hidden="true">
          ✗
        </span>
      )}

      {score != null && gameStatus === "final" ? (
        <span
          className={cn(
            "font-body text-xs font-bold tabular-nums shrink-0 min-w-[1.5rem] text-right",
            onDark ? "text-white" : isWinner ? "text-forest" : "text-navy/50"
          )}
        >
          {score}
        </span>
      ) : showOdds ? (
        <span
          className={cn(
            "font-body text-[0.65rem] tabular-nums shrink-0",
            onDark
              ? "text-white/80"
              : probability >= 10
                ? "text-gold font-bold"
                : probability >= 1
                  ? "text-navy/60"
                  : "text-navy/35"
          )}
          title="Title odds"
        >
          {oddsStr}
        </span>
      ) : null}

      {team.eliminated && (
        <span className={cn("font-body text-[0.65rem] shrink-0 font-bold", onDark ? "text-cream" : "text-burnt-orange")}>
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
  playInHintA,
  playInHintB,
  scoreA,
  scoreB,
  gameStatus,
  showOdds,
  ghostPick,
  ownerLabel = "Your",
}: GameSlotProps) {
  const odds = showOdds ?? isEditable;
  const pickFor = (teamId: number) => onPick(gameSlot, teamId);

  const rowFor = (team: Team | null, hint: PlayInHint | undefined, score: number | null | undefined) => {
    if (!team && hint) {
      return (
        <PlayInRow
          hint={hint}
          selectedTeamId={selectedTeamId}
          isEditable={isEditable}
          onPick={pickFor}
        />
      );
    }
    return (
      <TeamRow
        team={team}
        isSelected={!!team && selectedTeamId === team.id}
        isWinner={!!team && winnerId === team.id}
        isCorrect={team && selectedTeamId === team.id ? isCorrect : null}
        isEditable={isEditable && !!team}
        showOdds={odds}
        onClick={() => {
          if (team) pickFor(team.id);
        }}
        score={score}
        gameStatus={gameStatus}
      />
    );
  };

  const ghost = ghostPick;
  const ghostLabel = ghost
    ? ghost.lostPlayIn && isEditable
      ? `${ownerLabel} pick ${ghost.team.abbreviation} lost the play-in — repick`
      : `${ownerLabel} pick: ${ghost.team.abbreviation} ✗ (${ghost.team.eliminated || ghost.lostPlayIn ? "out" : "not in this game"})`
    : null;

  return (
    <div className="game-slot rounded">
      {rowFor(teamA, playInHintA, scoreA)}
      <div className="game-slot-divider" />
      {rowFor(teamB, playInHintB, scoreB)}
      {ghost && ghostLabel && (
        ghost.lostPlayIn && isEditable ? (
          <div
            className="font-body text-xs text-burnt-orange bg-burnt-orange/10 border-t-2 border-burnt-orange px-2 py-1.5 font-bold"
            role="status"
          >
            {ghostLabel}
          </div>
        ) : (
          <div className="game-slot-ghost" title={ghost.team.name}>
            {ghostLabel}
          </div>
        )
      )}
    </div>
  );
}
