"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface GameForAdmin {
  id: number;
  round: string;
  region: string | null;
  game_slot: number;
  status: string;
  score_a: number | null;
  score_b: number | null;
  winner_id: number | null;
  team_a: { id: number; name: string; seed: number } | null;
  team_b: { id: number; name: string; seed: number } | null;
}

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();
  const [games, setGames] = useState<GameForAdmin[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winnerId, setWinnerId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Fetch games
      const { data: gamesData } = await supabase
        .from("games")
        .select("*, team_a:teams!team_a_id(id, name, seed), team_b:teams!team_b_id(id, name, seed)")
        .order("game_slot");

      setGames((gamesData as GameForAdmin[]) || []);

      // Fetch config (also serves as admin check — returns 403 if not admin)
      const configRes = await fetch("/api/admin/config");
      if (configRes.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      if (configRes.ok) {
        setConfig(await configRes.json());
      }

      setLoading(false);
    }
    load();
  }, [supabase, router]);

  const handleScoreSubmit = async (gameId: number) => {
    if (!scoreA || !scoreB || !winnerId) return;
    setUpdating(gameId);

    const response = await fetch("/api/admin/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        score_a: parseInt(scoreA),
        score_b: parseInt(scoreB),
        winner_id: winnerId,
        status: "final",
      }),
    });

    if (response.ok) {
      setGames((prev) =>
        prev.map((g) =>
          g.id === gameId
            ? {
                ...g,
                score_a: parseInt(scoreA),
                score_b: parseInt(scoreB),
                winner_id: winnerId,
                status: "final",
              }
            : g
        )
      );
      setSelectedGame(null);
      setScoreA("");
      setScoreB("");
      setWinnerId(null);
    }

    setUpdating(null);
  };

  const handleConfigUpdate = async (field: string, value: string) => {
    await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSendNotifications = async () => {
    await fetch("/api/notifications/send-batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    alert("Batch notification send triggered");
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <span className="font-display text-xs text-navy/50 animate-pulse">
          Loading...
        </span>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="retro-card p-8 max-w-md mx-auto">
          <h1 className="font-display text-navy text-sm mb-4">ACCESS DENIED</h1>
          <p className="font-body text-sm text-navy/70">
            You don&apos;t have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  const pendingGames = games.filter((g) => g.status !== "final" && g.team_a && g.team_b);
  const completedGames = games.filter((g) => g.status === "final");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-8">ADMIN DASHBOARD</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Entry */}
        <div className="lg:col-span-2">
          <div className="retro-card p-6">
            <h2 className="scoreboard-heading text-[0.55rem] rounded mb-4">
              MANUAL SCORE ENTRY
            </h2>

            <div className="space-y-3">
              {pendingGames.length === 0 && (
                <p className="text-xs text-navy/50">
                  No games pending score entry
                </p>
              )}
              {pendingGames.map((game) => (
                <div key={game.id} className="border-2 border-navy/20 p-3 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs">
                      <span className="font-bold">
                        ({game.team_a?.seed}) {game.team_a?.name}
                      </span>
                      {" vs "}
                      <span className="font-bold">
                        ({game.team_b?.seed}) {game.team_b?.name}
                      </span>
                    </div>
                    <span className="text-[0.5rem] text-navy/40 capitalize">
                      {game.round?.replace(/_/g, " ")}
                    </span>
                  </div>

                  {selectedGame === game.id ? (
                    <div className="flex items-end gap-3 mt-2">
                      <div>
                        <label className="text-[0.5rem] text-navy/60 block">
                          {game.team_a?.name}
                        </label>
                        <input
                          type="number"
                          value={scoreA}
                          onChange={(e) => setScoreA(e.target.value)}
                          className="w-16 border-2 border-navy p-1 text-sm bg-cream"
                        />
                      </div>
                      <div>
                        <label className="text-[0.5rem] text-navy/60 block">
                          {game.team_b?.name}
                        </label>
                        <input
                          type="number"
                          value={scoreB}
                          onChange={(e) => setScoreB(e.target.value)}
                          className="w-16 border-2 border-navy p-1 text-sm bg-cream"
                        />
                      </div>
                      <div>
                        <label className="text-[0.5rem] text-navy/60 block">
                          Winner
                        </label>
                        <select
                          value={winnerId || ""}
                          onChange={(e) =>
                            setWinnerId(parseInt(e.target.value))
                          }
                          className="border-2 border-navy p-1 text-xs bg-cream"
                        >
                          <option value="">Select</option>
                          <option value={game.team_a?.id}>
                            {game.team_a?.name}
                          </option>
                          <option value={game.team_b?.id}>
                            {game.team_b?.name}
                          </option>
                        </select>
                      </div>
                      <button
                        onClick={() => handleScoreSubmit(game.id)}
                        disabled={updating === game.id}
                        className="retro-btn retro-btn-secondary text-[0.45rem] py-1 px-3"
                      >
                        {updating === game.id ? "..." : "Submit"}
                      </button>
                      <button
                        onClick={() => setSelectedGame(null)}
                        className="text-[0.5rem] text-navy/50 hover:text-burnt-orange"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedGame(game.id)}
                      className="text-[0.5rem] text-burnt-orange hover:underline"
                    >
                      Enter Score
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Completed games count */}
            <div className="mt-4 text-xs text-navy/50">
              {completedGames.length} games completed
            </div>
          </div>
        </div>

        {/* Config & System Health */}
        <div className="space-y-6">
          <div className="retro-card p-4">
            <h3 className="scoreboard-heading text-[0.5rem] rounded px-3 py-2 mb-3">
              CONFIG
            </h3>
            {config && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[0.5rem] text-navy/60 block mb-1">
                    Active Phase
                  </label>
                  <select
                    value={(config.active_phase as string) || "pre_tournament"}
                    onChange={(e) =>
                      handleConfigUpdate("active_phase", e.target.value)
                    }
                    className="w-full border-2 border-navy p-1 text-xs bg-cream"
                  >
                    {[
                      "pre_tournament",
                      "first_four",
                      "first_round",
                      "second_round",
                      "sweet_16",
                      "elite_eight",
                      "final_four",
                      "championship",
                      "completed",
                    ].map((phase) => (
                      <option key={phase} value={phase}>
                        {phase.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[0.5rem] text-navy/60 block mb-1">
                    Bracket Lock Deadline
                  </label>
                  <input
                    type="datetime-local"
                    defaultValue={
                      config.bracket_lock_deadline
                        ? new Date(config.bracket_lock_deadline as string)
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      handleConfigUpdate(
                        "bracket_lock_deadline",
                        new Date(e.target.value).toISOString()
                      )
                    }
                    className="w-full border-2 border-navy p-1 text-xs bg-cream"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="retro-card p-4">
            <h3 className="scoreboard-heading text-[0.5rem] rounded px-3 py-2 mb-3">
              ACTIONS
            </h3>
            <div className="space-y-2">
              <button
                onClick={handleSendNotifications}
                className="retro-btn retro-btn-secondary text-[0.45rem] w-full"
              >
                Send Notification Batch
              </button>
            </div>
          </div>

          <div className="retro-card p-4">
            <h3 className="scoreboard-heading text-[0.5rem] rounded px-3 py-2 mb-3">
              SYSTEM HEALTH
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-navy/60">Total Games:</span>
                <span>{games.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy/60">Completed:</span>
                <span className="text-forest">{completedGames.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy/60">Pending:</span>
                <span className="text-gold">{pendingGames.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
