"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader } from "@/components/Loader";
import { ConfigForm } from "@/components/admin/ConfigForm";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { ActionsPanel } from "@/components/admin/ActionsPanel";
import { ScoreEntry } from "@/components/admin/ScoreEntry";
import { HealthPanel } from "@/components/admin/HealthPanel";
import type { AdminConfig, GameForAdmin } from "@/components/admin/types";

const GAME_SELECT =
  "id, round, region, game_slot, status, score_a, score_b, winner_id, espn_game_id, clock, period, " +
  "team_a:teams!team_a_id(id, name, seed), team_b:teams!team_b_id(id, name, seed)";

export default function AdminPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [games, setGames] = useState<GameForAdmin[]>([]);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Browser-client reads: games (authenticated-readable) and team count. Queue depth comes with the config. */
  const loadData = useCallback(async () => {
    const [gamesRes, teamsRes] = await Promise.all([
      supabase.from("games").select(GAME_SELECT).order("game_slot"),
      supabase.from("teams").select("id", { count: "exact", head: true }),
    ]);
    if (gamesRes.error) setLoadError(gamesRes.error.message);
    setGames((gamesRes.data as unknown as GameForAdmin[]) ?? []);
    setTeamCount(teamsRes.error ? null : (teamsRes.count ?? 0));
  }, [supabase]);

  const reloadConfig = useCallback(async () => {
    const res = await fetch("/api/admin/config");
    if (res.ok) setConfig((await res.json()) as AdminConfig);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirect=/admin");
        return;
      }
      // Config also serves as the admin check — 403 for non-admins.
      const configRes = await fetch("/api/admin/config");
      if (cancelled) return;
      if (configRes.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      if (configRes.ok) {
        setConfig((await configRes.json()) as AdminConfig);
      } else {
        setLoadError(`Could not load config (HTTP ${configRes.status})`);
      }
      await loadData();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router, loadData]);

  const onDataChanged = useCallback(() => {
    void loadData();
    void reloadConfig();
  }, [loadData, reloadConfig]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Loader label="Loading admin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="retro-card p-8 max-w-md mx-auto">
          <h1 className="font-display text-navy text-sm mb-4">ACCESS DENIED</h1>
          <p className="font-body text-sm text-navy/70">You don&apos;t have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-navy text-sm">ADMIN DASHBOARD</h1>

      {loadError && (
        <p className="font-body text-xs text-burnt-orange" role="alert">
          {loadError}
        </p>
      )}

      {config ? (
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
                  if (updated.status === "final") void loadData();
                }}
              />
            </div>
            <ActionsPanel onDataChanged={onDataChanged} />
          </div>
        </>
      ) : (
        <p className="font-body text-sm text-navy/70">Tournament config is missing — run the rollover script first.</p>
      )}
    </div>
  );
}
