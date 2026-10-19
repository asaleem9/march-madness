"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBracketStore } from "@/hooks/useBracket";
import { useToast } from "@/hooks/useToast";
import { BracketView } from "./BracketView";
import {
  buildTeamMap,
  resolveSpeculativeTeams,
  gamesForStep,
  fillRemainingPicks,
  roundBreakdown,
  type Step,
} from "./bracket-logic";
import { REQUIRED_PICKS, REGION_ORDER } from "@/lib/tournament-structure";
import { maxPossiblePoints } from "@/lib/scoring";
import { DEFAULT_SCORING, cn } from "@/lib/utils";
import {
  draftKey,
  loadDraft,
  saveDraft,
  clearDraft,
  isDraftNewer,
} from "@/lib/draft-storage";
import type { GameWithTeams, Region, Round, ScoringMultipliers } from "@/types";

export interface ExistingPick {
  gameSlot: number;
  round: string;
  pickedTeamId: number;
  pointsEarned?: number | null;
  isCorrect?: boolean | null;
}

export interface BracketBuilderProps {
  games: GameWithTeams[];
  bracketId?: string;
  existingPicks?: ExistingPick[];
  existingName?: string;
  defaultName?: string;
  /** Read-only: the owner finalized it or the deadline passed. */
  isLocked: boolean;
  isOwner: boolean;
  score?: number;
  /** The tournament lock deadline has passed. */
  deadlinePassed?: boolean;
  /** `brackets.locked` — the owner finalized this bracket themselves. */
  finalized?: boolean;
  /** Display name of the bracket's owner (for "Ali's bracket"). */
  ownerName?: string | null;
  /** The signed-in viewer's id, or null when logged out. */
  userId?: string | null;
  /** `brackets.updated_at` — a local draft newer than this is restored. */
  serverUpdatedAt?: string | null;
  multipliers?: ScoringMultipliers;
  /** Someone else's draft: its picks stay private until it's finalized or the deadline passes. */
  picksHidden?: boolean;
}

const STEPS: Step[] = [...REGION_ORDER, "final_four"];
const STEP_LABELS: Record<Step, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
  final_four: "Final Four",
};

type SaveError = { message: string; sessionExpired?: boolean } | null;

export function BracketBuilder({
  games,
  bracketId,
  existingPicks,
  existingName,
  defaultName,
  isLocked,
  isOwner,
  score = 0,
  deadlinePassed = false,
  finalized: finalizedByOwner,
  ownerName = null,
  userId = null,
  serverUpdatedAt = null,
  multipliers = DEFAULT_SCORING,
  picksHidden = false,
}: BracketBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const {
    picks,
    bracketName,
    isDirty,
    previousPicks,
    setPick,
    setPicks,
    setBracketName,
    clearDownstreamPicks,
    hydrate,
    pushUndo,
    undo,
    markClean,
    markDirty,
  } = useBracketStore();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<SaveError>(null);
  const [success, setSuccess] = useState("");
  const [currentStep, setCurrentStep] = useState<Step>("east");
  const [finalized, setFinalized] = useState(false);
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);

  const isEditable = isOwner && !isLocked && !finalized;
  const ownerFinalized = finalizedByOwner ?? (isLocked && !deadlinePassed);
  const storageKey = draftKey(userId, bracketId);

  // Load server state — or a newer local draft — without marking the bracket
  // dirty. (Setting the name after loading picks used to make every unchanged
  // draft dirty.) A new bracket starts empty so it never inherits picks left
  // in the shared store from viewing someone else's.
  useEffect(() => {
    const serverPicks = (existingPicks ?? []).map((p) => ({
      gameSlot: p.gameSlot,
      round: p.round as Round,
      pickedTeamId: p.pickedTeamId,
    }));
    const serverName = existingName ?? defaultName ?? "My Bracket";

    if (isEditable) {
      const local = loadDraft(storageKey);
      if (local && isDraftNewer(local, serverUpdatedAt) && (local.picks.length > 0 || local.bracketName)) {
        hydrate({
          picks: local.picks.map((p) => ({ ...p, round: p.round as Round })),
          bracketName: local.bracketName || serverName,
        });
        markDirty();
        toast("Restored unsaved picks", "info");
        return;
      }
      if (local) clearDraft(storageKey);
    }
    hydrate({ picks: serverPicks, bracketName: serverName });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Success copy after the POST redirect
  useEffect(() => {
    if (searchParams.get("finalized") === "1") {
      setSuccess("Bracket finalized!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (searchParams.get("saved") === "1") {
      setSuccess("Bracket saved!");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  // Mirror unsaved work into localStorage so a lost session can't eat it.
  useEffect(() => {
    if (!isEditable || !isDirty) return;
    saveDraft(storageKey, {
      picks: Array.from(picks.values()).map((p) => ({
        gameSlot: p.gameSlot,
        round: p.round,
        pickedTeamId: p.pickedTeamId,
      })),
      bracketName,
    });
  }, [picks, bracketName, isDirty, isEditable, storageKey]);

  // Warn before losing unsaved picks on refresh/close/external navigation.
  useEffect(() => {
    if (!isDirty || !isEditable) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isEditable]);

  const teamMap = useMemo(() => buildTeamMap(games), [games]);

  const gameSlotInfos = useMemo(
    () => games.map((g) => ({ gameSlot: g.gameSlot, nextGameSlot: g.nextGameSlot, round: g.round })),
    [games]
  );

  // gameSlot -> teamId
  const picksMap = useMemo(() => {
    const map = new Map<number, number>();
    picks.forEach((pick, gameSlot) => {
      map.set(gameSlot, typeof pick === "number" ? pick : pick.pickedTeamId);
    });
    return map;
  }, [picks]);

  const resolvedTeams = useMemo(
    () => resolveSpeculativeTeams(games, picksMap, teamMap),
    [games, picksMap, teamMap]
  );

  // Picks on a play-in team that already lost don't count toward 63.
  const deadPlayInSlots = useMemo(() => {
    const dead = new Set<number>();
    resolvedTeams.forEach((slot, gameSlot) => {
      if (slot.ghostPick?.lostPlayIn && picksMap.has(gameSlot)) dead.add(gameSlot);
    });
    return dead;
  }, [resolvedTeams, picksMap]);

  const handlePick = useCallback(
    (gameSlot: number, teamId: number) => {
      if (!isEditable) return;
      const game = games.find((g) => g.gameSlot === gameSlot);
      if (!game) return;

      pushUndo();
      let cleared = 0;
      const currentPick = picks.get(gameSlot);
      if (currentPick && currentPick.pickedTeamId !== teamId) {
        cleared = clearDownstreamPicks(gameSlot, currentPick.pickedTeamId, gameSlotInfos) ?? 0;
      }
      setPick(gameSlot, game.round, teamId);
      setSuccess("");

      if (cleared > 0 && currentPick) {
        const oldTeam = teamMap.get(currentPick.pickedTeamId);
        toast(
          `Cleared ${cleared} later pick${cleared === 1 ? "" : "s"} that had ${oldTeam?.name ?? "that team"}`,
          "info"
        );
      }
    },
    [isEditable, games, picks, setPick, clearDownstreamPicks, gameSlotInfos, pushUndo, teamMap, toast]
  );

  const handleFill = () => {
    if (!isEditable) return;
    const added = fillRemainingPicks(games, picksMap, gamesForStep(games, currentStep), teamMap);
    if (added.length === 0) {
      toast("Nothing left to fill here", "info");
      return;
    }
    pushUndo();
    setPicks(added);
    setSuccess("");
    toast(`Filled ${added.length} pick${added.length === 1 ? "" : "s"} with the better seed`, "success");
  };

  const handleUndo = () => {
    if (!previousPicks) return;
    undo();
    setSuccess("");
    toast("Undid your last pick", "info");
  };

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
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSuccess("");

    try {
      const picksArray = buildPicksArray();

      const response = await fetch("/api/brackets", {
        method: bracketId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bracketId, name: bracketName, picks: picksArray, lock }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409 && data.bracketId) {
          router.push(`/bracket/${data.bracketId}`);
          return;
        }
        if (response.status === 401) {
          setError({ message: "Your session expired — your picks are saved on this device.", sessionExpired: true });
          return;
        }
        throw new Error(data.error || "Failed to save bracket");
      }

      const data = await response.json();
      clearDraft(storageKey);
      if (!bracketId) {
        router.push(`/bracket/${data.bracketId}?${lock ? "finalized" : "saved"}=1`);
      } else if (lock) {
        setFinalized(true);
        markClean();
        setSuccess("Bracket finalized!");
        router.refresh();
      } else {
        setSuccess("Draft saved!");
        markClean();
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const pickResults = useMemo(() => {
    const results = new Map<number, boolean | null>();
    if (existingPicks) {
      const bySlot = new Map(games.map((g) => [g.gameSlot, g]));
      existingPicks.forEach((p) => {
        const game = bySlot.get(p.gameSlot);
        if (game?.winnerId) results.set(p.gameSlot, game.winnerId === p.pickedTeamId);
      });
    }
    return results;
  }, [existingPicks, games]);

  const pickCount = picks.size - deadPlayInSlots.size;
  const allPicksMade = pickCount >= REQUIRED_PICKS;
  const remaining = Math.max(0, REQUIRED_PICKS - pickCount);

  // Per-step progress (editing) or points (read-only)
  const stepStats = useMemo(() => {
    const stats: Record<Step, { made: number; total: number; points: number }> = {
      east: { made: 0, total: 0, points: 0 },
      west: { made: 0, total: 0, points: 0 },
      south: { made: 0, total: 0, points: 0 },
      midwest: { made: 0, total: 0, points: 0 },
      final_four: { made: 0, total: 0, points: 0 },
    };
    const pointsBySlot = new Map((existingPicks ?? []).map((p) => [p.gameSlot, p.pointsEarned ?? 0]));
    for (const game of games) {
      if (game.round === "first_four") continue;
      let step: Step;
      if (game.round === "final_four" || game.round === "championship") step = "final_four";
      else if (game.region) step = game.region as Region;
      else continue;
      stats[step].total++;
      if (picks.has(game.gameSlot) && !deadPlayInSlots.has(game.gameSlot)) stats[step].made++;
      stats[step].points += pointsBySlot.get(game.gameSlot) ?? 0;
    }
    return stats;
  }, [games, picks, existingPicks, deadPlayInSlots]);

  const breakdown = useMemo(
    () => (isEditable ? [] : roundBreakdown(existingPicks ?? [], games)),
    [isEditable, existingPicks, games]
  );

  const maxPossible = useMemo(() => {
    if (isEditable || !existingPicks) return null;
    const eliminated = new Set<number>();
    for (const t of teamMap.values()) if (t.eliminated) eliminated.add(t.id);
    return maxPossiblePoints(
      existingPicks.map((p) => ({
        gameSlot: p.gameSlot,
        pickedTeamId: p.pickedTeamId,
        pointsEarned: p.pointsEarned ?? 0,
        isCorrect: p.isCorrect ?? null,
      })),
      games.map((g) => ({ gameSlot: g.gameSlot, round: g.round, status: g.status, winnerId: g.winnerId })),
      eliminated,
      multipliers
    );
  }, [isEditable, existingPicks, games, teamMap, multipliers]);

  const currentStepIndex = STEPS.indexOf(currentStep);

  return (
    <div className={cn(isEditable && "pb-36 sm:pb-28")}>
      {isEditable && (
        <div className="mb-6 space-y-4">
          <p className="font-body text-xs text-navy/60">
            Tap a team to pick them as the winner. Work through each region, then pick your Final Four and
            Champion. Save a draft anytime and finalize when all {REQUIRED_PICKS} picks are in. Upset picks
            earn 1.5x bonus points.
          </p>
          <div>
            <label htmlFor="bracket-name" className="font-display text-[0.6rem] text-navy block mb-2">
              BRACKET NAME
            </label>
            <input
              id="bracket-name"
              type="text"
              value={bracketName}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => {
                setBracketName(e.target.value);
                setSuccess("");
              }}
              className="border-2 border-navy p-2 font-body text-base bg-cream focus:outline-none focus:ring-2 focus:ring-gold w-full max-w-sm"
            />
          </div>
        </div>
      )}

      {picksHidden && (
        <div
          role="status"
          className="retro-card bg-cream border-navy/30 p-4 mb-6 font-body text-sm text-navy/80"
        >
          {ownerName ? `${ownerName}'s` : "This"} bracket is still a draft. Picks are private until
          it&apos;s finalized or the lock deadline passes.
        </div>
      )}

      {isOwner && (finalized || ownerFinalized) && (
        <div className="bg-gold/20 border-2 border-gold text-navy p-3 mb-4 rounded font-display text-[0.6rem]" role="status">
          BRACKET FINALIZED — No more changes allowed.
        </div>
      )}
      {isOwner && !finalized && !ownerFinalized && deadlinePassed && (
        <div className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange p-3 mb-4 rounded font-display text-[0.6rem]" role="status">
          DEADLINE PASSED — picks are locked
        </div>
      )}

      {!isEditable && success && (
        <div className="bg-forest/10 border-2 border-forest text-forest font-body text-xs p-3 mb-4 rounded" role="status">
          {success}
        </div>
      )}

      {/* Bracket key */}
      <div className="mb-4">
        <div className="font-display text-[0.6rem] text-navy/60 mb-2">BRACKET KEY</div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 font-body text-xs px-2 py-2 border border-navy/10 rounded bg-cream/50 list-none">
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-sm bg-forest/15 border-2 border-forest" aria-hidden="true" />
            <span className="text-navy/70">{isOwner ? "Your pick" : "Pick"}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-forest text-white text-[0.5rem] font-bold" aria-hidden="true">✓</span>
            <span className="text-navy/70">Correct</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-burnt-orange text-cream text-[0.5rem] font-bold" aria-hidden="true">✗</span>
            <span className="text-navy/70">Wrong pick</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block font-bold text-burnt-orange text-[0.65rem]">OUT</span>
            <span className="text-navy/70">Eliminated</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block font-bold text-forest text-xs tabular-nums">72</span>
            <span className="text-navy/70">Final score</span>
          </li>
          {isEditable && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block text-gold font-bold text-[0.65rem]">16%</span>
              <span className="text-navy/70">Title odds</span>
            </li>
          )}
        </ul>
      </div>

      {/* Step navigation */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2" role="tablist" aria-label="Bracket section">
        {STEPS.map((step) => {
          const { made, total, points } = stepStats[step];
          const isComplete = made === total && total > 0;
          const isCurrent = step === currentStep;
          return (
            <button
              key={step}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => setCurrentStep(step)}
              className={cn(
                "flex-shrink-0 min-h-[44px] px-3 py-1.5 border-2 border-navy font-display text-[0.6rem] transition-colors",
                isCurrent
                  ? "bg-navy text-gold"
                  : isComplete && isEditable
                    ? "bg-forest text-white"
                    : "bg-white text-navy hover:bg-cream"
              )}
            >
              <div>{STEP_LABELS[step].toUpperCase()}</div>
              <div
                className={cn(
                  "font-body text-[0.7rem] mt-0.5 tabular-nums",
                  isCurrent ? "text-gold/80" : isComplete && isEditable ? "text-white/80" : "text-navy/60"
                )}
              >
                {isEditable ? `${made}/${total}` : `${points} pts`}
              </div>
            </button>
          );
        })}
      </div>

      {isEditable && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={handleFill}
            className="retro-btn retro-btn-secondary text-[0.6rem] px-3 py-2"
          >
            Fill remaining with better seeds
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!previousPicks}
            className="retro-btn retro-btn-secondary text-[0.6rem] px-3 py-2 disabled:opacity-40"
          >
            Undo
          </button>
        </div>
      )}

      <BracketView
        games={games}
        picks={picksMap}
        pickResults={pickResults}
        resolvedTeams={resolvedTeams}
        teamMap={teamMap}
        isEditable={isEditable}
        onPick={handlePick}
        bracketName={bracketName}
        score={score}
        currentStep={currentStep}
        showOdds={isEditable}
        isOwner={isOwner}
        ownerName={ownerName}
        viewerLoggedIn={!!userId}
        maxPossible={maxPossible}
        breakdown={breakdown}
      />

      {/* Step navigation arrows */}
      <div className="flex justify-between items-center mt-6 gap-2">
        <button
          type="button"
          onClick={() => setCurrentStep(STEPS[currentStepIndex - 1])}
          disabled={currentStepIndex === 0}
          className="retro-btn retro-btn-secondary disabled:opacity-30 text-[0.6rem] px-3 py-2"
        >
          &larr; {currentStepIndex > 0 ? STEP_LABELS[STEPS[currentStepIndex - 1]].toUpperCase() : ""}
        </button>
        <div className="font-display text-[0.6rem] text-navy/60">
          {currentStepIndex + 1} / {STEPS.length}
        </div>
        <button
          type="button"
          onClick={() => setCurrentStep(STEPS[currentStepIndex + 1])}
          disabled={currentStepIndex === STEPS.length - 1}
          className="retro-btn retro-btn-secondary disabled:opacity-30 text-[0.6rem] px-3 py-2"
        >
          {currentStepIndex < STEPS.length - 1 ? STEP_LABELS[STEPS[currentStepIndex + 1]].toUpperCase() : ""} &rarr;
        </button>
      </div>

      {/* Sticky action bar */}
      {isEditable && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 bg-cream border-t-4 border-navy shadow-[0_-4px_0_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-col">
              <span className="font-display text-[0.6rem] text-navy">
                {pickCount}/{REQUIRED_PICKS} PICKS
              </span>
              {!allPicksMade && (
                <span className="font-body text-xs text-navy/60">
                  {remaining} pick{remaining === 1 ? "" : "s"} remaining to finalize
                </span>
              )}
            </div>

            <div className="flex-1 min-w-[8rem] font-body text-xs">
              {error && (
                <div className="text-burnt-orange" role="alert">
                  {error.message}{" "}
                  {error.sessionExpired && (
                    <a
                      href={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
                      className="underline font-bold"
                    >
                      Log in again
                    </a>
                  )}
                </div>
              )}
              {!error && success && (
                <div className="text-forest font-bold" role="status">
                  {success}
                </div>
              )}
              {!error && !success && isDirty && (
                <div className="text-navy/60" role="status">
                  Unsaved changes
                </div>
              )}
            </div>

            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving || !isDirty}
                className="retro-btn retro-btn-secondary disabled:opacity-50 text-[0.6rem] px-3 py-2"
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmFinalize(true)}
                disabled={saving || !allPicksMade}
                className="retro-btn retro-btn-primary disabled:opacity-50 text-[0.6rem] px-3 py-2"
              >
                {saving ? "Saving..." : "Finalize Bracket"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmFinalize && (
        <FinalizeDialog
          saving={saving}
          onCancel={() => setShowConfirmFinalize(false)}
          onConfirm={() => {
            setShowConfirmFinalize(false);
            handleSave(true);
          }}
        />
      )}
    </div>
  );
}

function FinalizeDialog({
  saving,
  onCancel,
  onConfirm,
}: {
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel on open; restore focus to the opener on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Tab") {
      // Two focusable controls: keep Tab cycling between them.
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-navy/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finalize-title"
        aria-describedby="finalize-desc"
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="retro-card bg-cream max-w-md w-full p-6 space-y-4 border-4 border-navy"
      >
        <h2 id="finalize-title" className="font-display text-[0.6rem] text-navy text-center">
          FINALIZE BRACKET?
        </h2>
        <p id="finalize-desc" className="font-body text-sm text-navy/80 text-center">
          This will lock your bracket permanently. You will not be able to change any picks after
          finalizing.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="retro-btn retro-btn-secondary"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="retro-btn retro-btn-primary"
          >
            {saving ? "Finalizing..." : "Lock It In"}
          </button>
        </div>
      </div>
    </div>
  );
}
