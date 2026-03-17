"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useBracketStore } from "@/hooks/useBracket";
import { BracketView } from "./BracketView";
import type { GameWithTeams } from "@/types";

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

  const gameSlotInfos = games.map((g) => ({
    gameSlot: g.gameSlot,
    nextGameSlot: g.nextGameSlot,
    round: g.round,
  }));

  const handlePick = useCallback(
    (gameSlot: number, teamId: number) => {
      if (!isEditable) return;

      const game = games.find((g) => g.gameSlot === gameSlot);
      if (!game) return;

      // If changing a pick, clear downstream picks that depend on this one
      const currentPick = picks.get(gameSlot);
      if (currentPick && currentPick.pickedTeamId !== teamId) {
        clearDownstreamPicks(gameSlot, gameSlotInfos);
      }

      setPick(gameSlot, game.round, teamId);
      setSuccess("");
    },
    [isEditable, games, picks, setPick, clearDownstreamPicks, gameSlotInfos]
  );

  const buildPicksArray = () =>
    Array.from(picks.entries()).map(([gameSlot, pick]) => ({
      game_slot: gameSlot,
      round: typeof pick === "object" ? pick.round : (games.find((g) => g.gameSlot === gameSlot)?.round || "first_round"),
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
        // Reload page to reflect locked state
        router.refresh();
      } else {
        setSuccess("Draft saved!");
        // Clear dirty flag by reloading picks from what we just saved
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

  // Build picks map for BracketView (gameSlot -> teamId)
  const picksMap = new Map<number, number>();
  picks.forEach((pick, gameSlot) => {
    if (typeof pick === "number") {
      picksMap.set(gameSlot, pick);
    } else {
      picksMap.set(gameSlot, pick.pickedTeamId);
    }
  });

  // Build pick results map from existing picks
  const pickResults = new Map<number, boolean | null>();
  if (existingPicks) {
    existingPicks.forEach((p) => {
      const game = games.find((g) => g.gameSlot === p.gameSlot);
      if (game?.winnerId) {
        pickResults.set(p.gameSlot, game.winnerId === p.pickedTeamId);
      }
    });
  }

  const pickCount = picks.size;
  const allPicksMade = pickCount >= REQUIRED_PICKS;

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
                onChange={(e) => { setBracketName(e.target.value); setSuccess(""); }}
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
                title={!allPicksMade ? `${REQUIRED_PICKS - pickCount} picks remaining` : "Lock in your bracket"}
              >
                {saving ? "Saving..." : "Finalize Bracket"}
              </button>
            </div>
          </div>
          {!allPicksMade && (
            <div className="text-[0.55rem] font-display text-navy/50">
              {pickCount}/{REQUIRED_PICKS} PICKS — {REQUIRED_PICKS - pickCount} remaining to finalize
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

      <BracketView
        games={games}
        picks={picksMap}
        pickResults={pickResults}
        isEditable={isEditable}
        onPick={handlePick}
        bracketName={bracketName}
        score={score}
      />
    </div>
  );
}
