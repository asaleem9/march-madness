"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBracketStore } from "@/hooks/useBracket";
import { BracketView } from "./BracketView";
import type { GameWithTeams, Team, Region } from "@/types";

const REQUIRED_PICKS = 63;

interface BracketBuilderProps {
  games: GameWithTeams[];
  bracketId?: string;
  existingPicks?: { gameSlot: number; round: string; pickedTeamId: number }[];
  existingName?: string;
  defaultName?: string;
  isLocked: boolean;
  isOwner: boolean;
  score?: number;
}

// Build a map of all teams by ID for quick lookup
function buildTeamMap(games: GameWithTeams[]): Map<number, Team> {
  const map = new Map<number, Team>();
  for (const game of games) {
    if (game.teamA) map.set(game.teamA.id, game.teamA);
    if (game.teamB) map.set(game.teamB.id, game.teamB);
  }
  return map;
}

// Resolve speculative teams for each game based on user picks
// When a user picks a winner, that team should appear in the next round's game
function resolveSpeculativeTeams(
  games: GameWithTeams[],
  picks: Map<number, number>,
  teamMap: Map<number, Team>
): Map<number, { teamA: Team | null; teamB: Team | null }> {
  const resolved = new Map<number, { teamA: Team | null; teamB: Team | null }>();

  // Initialize with DB teams
  for (const game of games) {
    resolved.set(game.gameSlot, {
      teamA: game.teamA,
      teamB: game.teamB,
    });
  }

  // For each game with a pick, advance the picked team to the next game slot
  for (const game of games) {
    const pickedTeamId = picks.get(game.gameSlot);
    if (!pickedTeamId || !game.nextGameSlot) continue;

    const team = teamMap.get(pickedTeamId);
    if (!team) continue;

    const nextResolved = resolved.get(game.nextGameSlot);
    if (!nextResolved) continue;

    if (game.slotPosition === "top") {
      // Only fill speculatively if the DB doesn't already have a team there
      if (!nextResolved.teamA) {
        resolved.set(game.nextGameSlot, { ...nextResolved, teamA: team });
      }
    } else if (game.slotPosition === "bottom") {
      if (!nextResolved.teamB) {
        resolved.set(game.nextGameSlot, { ...nextResolved, teamB: team });
      }
    }
  }

  return resolved;
}

const REGION_ORDER: Region[] = ["east", "west", "south", "midwest"];
const REGION_LABELS: Record<Region, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};

type Step = Region | "final_four";
const STEPS: Step[] = [...REGION_ORDER, "final_four"];
const STEP_LABELS: Record<Step, string> = {
  ...REGION_LABELS,
  final_four: "Final Four",
};

export function BracketBuilder({
  games,
  bracketId,
  existingPicks,
  existingName,
  defaultName,
  isLocked,
  isOwner,
  score = 0,
}: BracketBuilderProps) {
  const router = useRouter();
  const {
    picks,
    bracketName,
    isDirty,
    setPick,
    setBracketName,
    loadPicks,
    clearDownstreamPicks,
  } = useBracketStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentStep, setCurrentStep] = useState<Step>("east");

  const isEditable = isOwner && !isLocked;

  // Load existing picks
  useEffect(() => {
    if (existingPicks) {
      loadPicks(
        existingPicks.map((p) => ({
          gameSlot: p.gameSlot,
          round: p.round as never,
          pickedTeamId: p.pickedTeamId,
        }))
      );
    }
    if (existingName) {
      setBracketName(existingName);
    } else if (defaultName) {
      setBracketName(defaultName);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teamMap = useMemo(() => buildTeamMap(games), [games]);

  const gameSlotInfos = useMemo(
    () =>
      games.map((g) => ({
        gameSlot: g.gameSlot,
        nextGameSlot: g.nextGameSlot,
        round: g.round,
      })),
    [games]
  );

  // Build picks map (gameSlot -> teamId)
  const picksMap = useMemo(() => {
    const map = new Map<number, number>();
    picks.forEach((pick, gameSlot) => {
      if (typeof pick === "number") {
        map.set(gameSlot, pick);
      } else {
        map.set(gameSlot, pick.pickedTeamId);
      }
    });
    return map;
  }, [picks]);

  // Resolve speculative teams from picks
  const resolvedTeams = useMemo(
    () => resolveSpeculativeTeams(games, picksMap, teamMap),
    [games, picksMap, teamMap]
  );

  const handlePick = useCallback(
    (gameSlot: number, teamId: number) => {
      if (!isEditable) return;

      const game = games.find((g) => g.gameSlot === gameSlot);
      if (!game) return;

      // If changing a pick, clear downstream picks that depended on the old team
      const currentPick = picks.get(gameSlot);
      if (currentPick && currentPick.pickedTeamId !== teamId) {
        clearDownstreamPicks(
          gameSlot,
          currentPick.pickedTeamId,
          gameSlotInfos
        );
      }

      setPick(gameSlot, game.round, teamId);
      setSuccess("");
    },
    [isEditable, games, picks, setPick, clearDownstreamPicks, gameSlotInfos]
  );

  const buildPicksArray = () =>
    Array.from(picks.entries()).map(([gameSlot, pick]) => ({
      game_slot: gameSlot,
      round:
        typeof pick === "object"
          ? pick.round
          : games.find((g) => g.gameSlot === gameSlot)?.round || "first_round",
      picked_team_id: typeof pick === "object" ? pick.pickedTeamId : pick,
    }));

  const handleSave = async (lock: boolean) => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const picksArray = buildPicksArray();

      const response = await fetch("/api/brackets", {
        method: bracketId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bracketId,
          name: bracketName,
          picks: picksArray,
          lock,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save bracket");
      }

      const data = await response.json();
      if (!bracketId) {
        router.push(`/bracket/${data.bracketId}`);
      } else if (lock) {
        router.refresh();
      } else {
        setSuccess("Draft saved!");
        loadPicks(
          picksArray.map((p) => ({
            gameSlot: p.game_slot,
            round: p.round as never,
            pickedTeamId: p.picked_team_id,
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Build pick results map from existing picks
  const pickResults = useMemo(() => {
    const results = new Map<number, boolean | null>();
    if (existingPicks) {
      existingPicks.forEach((p) => {
        const game = games.find((g) => g.gameSlot === p.gameSlot);
        if (game?.winnerId) {
          results.set(p.gameSlot, game.winnerId === p.pickedTeamId);
        }
      });
    }
    return results;
  }, [existingPicks, games]);

  const pickCount = picks.size;
  const allPicksMade = pickCount >= REQUIRED_PICKS;

  // Count picks per step
  const picksPerStep = useMemo(() => {
    const counts: Record<Step, { made: number; total: number }> = {
      east: { made: 0, total: 0 },
      west: { made: 0, total: 0 },
      south: { made: 0, total: 0 },
      midwest: { made: 0, total: 0 },
      final_four: { made: 0, total: 0 },
    };

    for (const game of games) {
      const round = game.round;
      // Skip First Four — users don't pick these directly
      if (round === "first_four") continue;
      let step: Step;
      if (round === "final_four" || round === "championship") {
        step = "final_four";
      } else if (game.region) {
        step = game.region as Region;
      } else {
        continue;
      }
      counts[step].total++;
      if (picks.has(game.gameSlot)) {
        counts[step].made++;
      }
    }
    return counts;
  }, [games, picks]);

  const currentStepIndex = STEPS.indexOf(currentStep);

  return (
    <div>
      {isEditable && (
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <label className="font-display text-[0.55rem] text-navy block mb-2">
                BRACKET NAME
              </label>
              <input
                type="text"
                value={bracketName}
                onChange={(e) => {
                  setBracketName(e.target.value);
                  setSuccess("");
                }}
                className="border-2 border-navy p-2 font-body text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-gold w-full max-w-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleSave(false)}
                disabled={saving || !isDirty}
                className="retro-btn retro-btn-secondary disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !allPicksMade}
                className="retro-btn retro-btn-primary disabled:opacity-50"
                title={
                  !allPicksMade
                    ? `${REQUIRED_PICKS - pickCount} picks remaining`
                    : "Lock in your bracket"
                }
              >
                {saving ? "Saving..." : "Finalize Bracket"}
              </button>
            </div>
          </div>
          {!allPicksMade && (
            <div className="text-[0.55rem] font-display text-navy/50">
              {pickCount}/{REQUIRED_PICKS} PICKS —{" "}
              {REQUIRED_PICKS - pickCount} remaining to finalize
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-4 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-forest/10 border-2 border-forest text-forest text-xs p-3 mb-4 rounded">
          {success}
        </div>
      )}

      {isLocked && isOwner && (
        <div className="bg-gold/20 border-2 border-gold text-navy text-xs p-3 mb-4 rounded font-display text-[0.55rem]">
          BRACKET FINALIZED — No more changes allowed.
        </div>
      )}

      {/* Step navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const { made, total } = picksPerStep[step];
          const isComplete = made === total && total > 0;
          const isCurrent = step === currentStep;

          return (
            <button
              key={step}
              onClick={() => setCurrentStep(step)}
              className={`
                flex-shrink-0 px-3 py-2 border-2 border-navy font-display text-[0.45rem] transition-colors
                ${isCurrent
                  ? "bg-navy text-gold"
                  : isComplete
                    ? "bg-forest text-white"
                    : "bg-white text-navy hover:bg-cream"
                }
              `}
            >
              <div>{STEP_LABELS[step].toUpperCase()}</div>
              <div className={`text-[0.35rem] mt-0.5 ${isCurrent ? "text-gold/70" : isComplete ? "text-white/70" : "text-navy/50"}`}>
                {made}/{total}
              </div>
            </button>
          );
        })}
      </div>

      <BracketView
        games={games}
        picks={picksMap}
        pickResults={pickResults}
        resolvedTeams={resolvedTeams}
        isEditable={isEditable}
        onPick={handlePick}
        bracketName={bracketName}
        score={score}
        currentStep={currentStep}
      />

      {/* Step navigation arrows */}
      <div className="flex justify-between items-center mt-6">
        <button
          onClick={() => setCurrentStep(STEPS[currentStepIndex - 1])}
          disabled={currentStepIndex === 0}
          className="retro-btn retro-btn-secondary disabled:opacity-30 text-[0.5rem]"
        >
          &larr; {currentStepIndex > 0 ? STEP_LABELS[STEPS[currentStepIndex - 1]].toUpperCase() : ""}
        </button>
        <div className="font-display text-[0.45rem] text-navy/50">
          {currentStepIndex + 1} / {STEPS.length}
        </div>
        <button
          onClick={() => setCurrentStep(STEPS[currentStepIndex + 1])}
          disabled={currentStepIndex === STEPS.length - 1}
          className="retro-btn retro-btn-secondary disabled:opacity-30 text-[0.5rem]"
        >
          {currentStepIndex < STEPS.length - 1 ? STEP_LABELS[STEPS[currentStepIndex + 1]].toUpperCase() : ""} &rarr;
        </button>
      </div>
    </div>
  );
}
