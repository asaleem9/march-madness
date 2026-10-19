"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigForm } from "./ConfigForm";
import { ImportPanel } from "./ImportPanel";
import { ActionsPanel } from "./ActionsPanel";
import { ScoreEntry } from "./ScoreEntry";
import { HealthPanel } from "./HealthPanel";
import type { AdminConfig, GameForAdmin } from "./types";

interface Props {
  config: AdminConfig | null;
  games: GameForAdmin[];
  teamCount: number | null;
}

/**
 * The interactive half of the admin page. Data arrives from the server page;
 * after an action that changes the database, `router.refresh()` re-runs it
 * and the derived-state syncs below adopt the fresh props.
 */
export function AdminDashboard({ config: initialConfig, games: initialGames, teamCount }: Props) {
  const router = useRouter();

  const [config, setConfig] = useState(initialConfig);
  const [lastConfig, setLastConfig] = useState(initialConfig);
  if (lastConfig !== initialConfig) {
    setLastConfig(initialConfig);
    setConfig(initialConfig);
  }

  const [games, setGames] = useState(initialGames);
  const [lastGames, setLastGames] = useState(initialGames);
  if (lastGames !== initialGames) {
    setLastGames(initialGames);
    setGames(initialGames);
  }

  const onDataChanged = useCallback(() => {
    router.refresh();
  }, [router]);

  if (!config) {
    return (
      <p className="font-body text-sm text-navy/70">
        Tournament config is missing — run the rollover script first.
      </p>
    );
  }

  return (
    <>
      <HealthPanel config={config} games={games} teamCount={teamCount} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <ConfigForm key={config.year} config={config} onSaved={setConfig} />
          <ImportPanel year={config.year} onImported={onDataChanged} />
          <ScoreEntry
            games={games}
            onGameUpdated={(updated) => {
              setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
              // A final advances the winner into the next slot; refresh to show it.
              if (updated.status === "final") onDataChanged();
            }}
          />
        </div>
        <ActionsPanel onDataChanged={onDataChanged} />
      </div>
    </>
  );
}
