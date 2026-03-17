"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBracketStore } from "@/hooks/useBracket";
import { BracketView } from "./BracketView";
import type { GameWithTeams } from "@/types";

interface BracketBuilderProps {
  games: GameWithTeams[];
  bracketId?: string;
  existingPicks?: { gameSlot: number; round: string; pickedTeamId: number }[];
  existingName?: string;
  isLocked: boolean;
  isOwner: boolean;
  score?: number;
}

export function BracketBuilder({
  games,
  bracketId,
  existingPicks,
  existingName,
  isLocked,
  isOwner,
  score = 0,
}: BracketBuilderProps) {
  const router = useRouter();
  const supabase = createClient();
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
    },
    [isEditable, games, picks, setPick, clearDownstreamPicks, gameSlotInfos]
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      const picksArray = Array.from(picks.entries()).map(
        ([gameSlot, teamId]) => {
          const game = games.find((g) => g.gameSlot === gameSlot);
          return {
            game_slot: gameSlot,
            round: game?.round || "first_round",
            picked_team_id: teamId,
          };
        }
      );

      const response = await fetch("/api/brackets", {
        method: bracketId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bracketId,
          name: bracketName,
          picks: picksArray,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save bracket");
      }

      const data = await response.json();
      if (!bracketId) {
        router.push(`/bracket/${data.bracketId}`);
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

  return (
    <div>
      {isEditable && (
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              BRACKET NAME
            </label>
            <input
              type="text"
              value={bracketName}
              onChange={(e) => setBracketName(e.target.value)}
              className="border-2 border-navy p-2 font-body text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-gold w-full max-w-sm"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="retro-btn retro-btn-primary disabled:opacity-50"
          >
            {saving ? "Saving..." : bracketId ? "Save Changes" : "Create Bracket"}
          </button>
        </div>
      )}

      {error && (
        <div className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-4 rounded">
          {error}
        </div>
      )}

      {isLocked && isOwner && (
        <div className="bg-gold/20 border-2 border-gold text-navy text-xs p-3 mb-4 rounded">
          Brackets are locked. No more changes allowed.
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
