"use client";

import type { Region, GameWithTeams } from "@/types";
import { GameSlot, type FirstFourHint } from "./GameSlot";
import { REGION_DISPLAY_NAMES, ROUND_DISPLAY_NAMES } from "@/lib/utils";

interface RegionBracketProps {
  region: Region;
  games: GameWithTeams[];
  picks: Map<number, number>;
  pickResults: Map<number, boolean | null>;
  isEditable: boolean;
  onPick: (gameSlot: number, teamId: number) => void;
  direction?: "ltr" | "rtl";
  showHeader?: boolean;
}

function ConnectorColumn({
  count,
  direction,
}: {
  count: number;
  direction: "ltr" | "rtl";
}) {
  return (
    <div className="flex flex-col flex-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`bracket-connector-cell ${direction}`}>
          <div className="connector-top" />
          <div className="connector-bottom" />
        </div>
      ))}
    </div>
  );
}

export function RegionBracket({
  region,
  games,
  picks,
  pickResults,
  isEditable,
  onPick,
  direction = "ltr",
  showHeader = true,
}: RegionBracketProps) {
  // Build First Four hints
  const firstFourHints = new Map<number, FirstFourHint>();
  const firstFourGames = games.filter((g) => g.round === "first_four");
  for (const ffGame of firstFourGames) {
    if (ffGame.nextGameSlot && ffGame.teamA && ffGame.teamB) {
      firstFourHints.set(ffGame.nextGameSlot, {
        teamA: ffGame.teamA.abbreviation,
        teamB: ffGame.teamB.abbreviation,
      });
    }
  }

  const roundOrder = [
    "first_round",
    "second_round",
    "sweet_16",
    "elite_eight",
  ] as const;

  const gamesByRound = roundOrder.map((round) =>
    games
      .filter((g) => g.round === round && g.region === region)
      .sort((a, b) => a.gameSlot - b.gameSlot)
  );

  // Connector counts: 4 between R1→R2, 2 between R2→S16, 1 between S16→E8
  const connectorCounts = [4, 2, 1];

  // Build interleaved columns: round, connector, round, connector, ...
  const columns: React.ReactNode[] = [];
  const orderedRounds = direction === "rtl" ? [...gamesByRound].reverse() : gamesByRound;
  const orderedRoundKeys = direction === "rtl" ? [...roundOrder].reverse() : [...roundOrder];
  const orderedConnectors = direction === "rtl" ? [...connectorCounts].reverse() : connectorCounts;

  orderedRounds.forEach((roundGames, i) => {
    // Round column
    columns.push(
      <div key={`round-${i}`} className="flex flex-col">
        <div className="font-display text-[0.45rem] text-navy/60 text-center mb-2">
          {ROUND_DISPLAY_NAMES[orderedRoundKeys[i]]}
        </div>
        <div className="flex flex-col flex-1">
          {roundGames.map((game) => {
            const hint = firstFourHints.get(game.gameSlot);
            const hintA = !game.teamA && hint && game.teamAId === null ? hint : undefined;
            const hintB = !game.teamB && hint && game.teamBId === null ? hint : undefined;

            return (
              <div key={game.gameSlot} className="flex-1 flex items-center">
                <GameSlot
                  gameSlot={game.gameSlot}
                  teamA={game.teamA}
                  teamB={game.teamB}
                  selectedTeamId={picks.get(game.gameSlot) ?? null}
                  winnerId={game.winnerId}
                  isEditable={isEditable}
                  isCorrect={pickResults.get(game.gameSlot) ?? null}
                  onPick={onPick}
                  firstFourHintA={hintA}
                  firstFourHintB={hintB}
                />
              </div>
            );
          })}
        </div>
      </div>
    );

    // Add connector column after each round except the last
    if (i < orderedRounds.length - 1) {
      const connectorCount = orderedConnectors[i];
      columns.push(
        <ConnectorColumn
          key={`conn-${i}`}
          count={connectorCount}
          direction={direction}
        />
      );
    }
  });

  return (
    <div className="flex flex-col">
      {showHeader && (
        <div className="scoreboard-heading text-[0.55rem] text-center mb-4 rounded">
          {REGION_DISPLAY_NAMES[region]} Region
        </div>
      )}
      <div
        className="flex pb-4"
        style={{ flexDirection: "row" }}
      >
        {columns}
      </div>
    </div>
  );
}
