"use client";

import Link from "next/link";
import type { GameWithTeams, Team, Region } from "@/types";
import { RegionBracket } from "./RegionBracket";
import { GameSlot } from "./GameSlot";
import type { ResolvedSlot, RoundBreakdown, Step } from "./bracket-logic";
import { useToast } from "@/hooks/useToast";

const ROUND_SHORT: Record<string, string> = {
  first_round: "R1",
  second_round: "R2",
  sweet_16: "S16",
  elite_eight: "E8",
  final_four: "F4",
  championship: "Title",
};

interface BracketViewProps {
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  resolvedTeams: Map<number, ResolvedSlot>;
  teamMap: Map<number, Team>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  bracketName: string;
  score: number;
  currentStep: Step;
  /** Show title odds on tiles (editing only). */
  showOdds: boolean;
  /** Whether the viewer owns this bracket. */
  isOwner: boolean;
  /** Display name of the bracket's owner (null when unknown). */
  ownerName?: string | null;
  /** Whether anyone is logged in (drives the "Make your own bracket" CTA). */
  viewerLoggedIn: boolean;
  /** Points still reachable; null while editing. */
  maxPossible?: number | null;
  breakdown?: RoundBreakdown[];
}

export function BracketView({
  games,
  picks,
  pickResults,
  resolvedTeams,
  teamMap,
  isEditable,
  onPick,
  bracketName,
  score,
  currentStep,
  showOdds,
  isOwner,
  ownerName,
  viewerLoggedIn,
  maxPossible,
  breakdown,
}: BracketViewProps) {
  const ownerLabel = isOwner ? "Your" : ownerName ? `${ownerName}'s` : "Their";

  const header = (
    <BracketHeader
      bracketName={bracketName}
      score={score}
      isEditable={isEditable}
      isOwner={isOwner}
      ownerName={ownerName ?? null}
      viewerLoggedIn={viewerLoggedIn}
      maxPossible={maxPossible ?? null}
      breakdown={breakdown ?? []}
    />
  );

  if (currentStep === "final_four") {
    const finalFourGames = games
      .filter((g) => g.round === "final_four")
      .sort((a, b) => a.gameSlot - b.gameSlot);
    const championshipGame = games.find((g) => g.round === "championship");
    const champTeamId = championshipGame ? picks.get(championshipGame.gameSlot) : undefined;
    const champTeam = champTeamId ? teamMap.get(champTeamId) ?? null : null;

    return (
      <div className="space-y-6">
        {header}

        <div className="flex flex-col items-center gap-8 py-4">
          <div className="scoreboard-heading text-[0.6rem] text-center rounded px-6 py-2">
            FINAL FOUR
          </div>

          <div className="flex gap-8 justify-center flex-wrap">
            {finalFourGames.map((game) => {
              const resolved = resolvedTeams.get(game.gameSlot);
              return (
                <div key={game.gameSlot} className="flex flex-col items-center gap-2">
                  <div className="font-display text-[0.6rem] text-navy/70">SEMIFINAL</div>
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
                    showOdds={showOdds}
                    ghostPick={resolved?.ghostPick}
                    ownerLabel={ownerLabel}
                  />
                </div>
              );
            })}
          </div>

          {championshipGame && (() => {
            const resolved = resolvedTeams.get(championshipGame.gameSlot);
            return (
              <div className="flex flex-col items-center gap-2">
                <div className="font-display text-[0.6rem] text-gold">CHAMPIONSHIP</div>
                <GameSlot
                  gameSlot={championshipGame.gameSlot}
                  teamA={resolved?.teamA ?? championshipGame.teamA}
                  teamB={resolved?.teamB ?? championshipGame.teamB}
                  selectedTeamId={picks.get(championshipGame.gameSlot) ?? null}
                  winnerId={championshipGame.winnerId}
                  isEditable={isEditable}
                  isCorrect={pickResults.get(championshipGame.gameSlot) ?? null}
                  onPick={onPick}
                  scoreA={championshipGame.scoreA}
                  scoreB={championshipGame.scoreB}
                  gameStatus={championshipGame.status}
                  showOdds={showOdds}
                  ghostPick={resolved?.ghostPick}
                  ownerLabel={ownerLabel}
                />
              </div>
            );
          })()}

          {champTeam && (
            <div className="flex flex-col items-center gap-2 mt-4">
              <div className="font-display text-[0.6rem] text-gold">
                {isOwner ? "YOUR CHAMPION" : "CHAMPION PICK"}
              </div>
              <div className="flex items-center gap-3 bg-gold/20 border-2 border-gold px-4 py-3 rounded">
                {champTeam.logoUrl ? (
                  <img src={champTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
                ) : (
                  <span className="seed-badge">{champTeam.seed}</span>
                )}
                <span className="font-display text-xs text-navy">{champTeam.name}</span>
                {champTeam.eliminated && (
                  <span className="font-body text-xs font-bold text-burnt-orange">OUT</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const region = currentStep as Region;

  return (
    <div className="space-y-6">
      {header}

      <RegionBracket
        key={region}
        region={region}
        games={games}
        picks={picks}
        pickResults={pickResults}
        resolvedTeams={resolvedTeams}
        isEditable={isEditable}
        onPick={onPick}
        showOdds={showOdds}
        ownerLabel={ownerLabel}
      />
    </div>
  );
}

function BracketHeader({
  bracketName,
  score,
  isEditable,
  isOwner,
  ownerName,
  viewerLoggedIn,
  maxPossible,
  breakdown,
}: {
  bracketName: string;
  score: number;
  isEditable: boolean;
  isOwner: boolean;
  ownerName: string | null;
  viewerLoggedIn: boolean;
  maxPossible: number | null;
  breakdown: RoundBreakdown[];
}) {
  const toast = useToast();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied", "success");
    } catch {
      toast("Couldn't copy — long-press the address bar instead", "error");
    }
  };

  const whose = isOwner ? "Your bracket" : ownerName ? `${ownerName}'s bracket` : "Shared bracket";
  const decided = breakdown.some((r) => r.decided > 0);

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-navy text-sm break-words">{bracketName}</h1>
          {!isEditable && (
            <p className="font-body text-xs text-navy/60 mt-1">
              {whose} · Score: <span className="font-bold text-forest">{score}</span> pts
              {maxPossible !== null && (
                <>
                  {" "}
                  · Max possible: <span className="font-bold text-navy">{maxPossible}</span>
                </>
              )}
            </p>
          )}
        </div>

        {!isEditable && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/leaderboard" className="retro-btn retro-btn-secondary text-[0.6rem] px-3 py-2">
              ← Leaderboard
            </Link>
            <button
              type="button"
              onClick={copyLink}
              className="retro-btn retro-btn-secondary text-[0.6rem] px-3 py-2"
            >
              Copy link
            </button>
            {!viewerLoggedIn && (
              <Link href="/signup" className="retro-btn retro-btn-primary text-[0.6rem] px-3 py-2">
                Make your own bracket
              </Link>
            )}
          </div>
        )}
      </div>

      {!isEditable && breakdown.length > 0 && (
        <dl
          className="flex flex-wrap gap-2 font-body text-xs"
          aria-label="Points by round"
        >
          {breakdown.map((row) => (
            <div
              key={row.round}
              className="flex items-baseline gap-1.5 border border-navy/20 bg-white rounded px-2 py-1"
            >
              <dt className="font-display text-[0.6rem] text-navy/70">{ROUND_SHORT[row.round]}</dt>
              <dd className="tabular-nums text-navy">
                {decided ? (
                  <>
                    <span className="font-bold text-forest">{row.correct}</span>
                    <span className="text-navy/50">/{row.decided}</span>
                    <span className="text-navy/50"> · </span>
                    <span className="font-bold">{row.points}</span>
                    <span className="text-navy/50"> pts</span>
                  </>
                ) : (
                  <span className="text-navy/60">{row.total} picked</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
