"use client";

import { useEffect, useState } from "react";
import { relativeTime, formatUtc } from "./datetime";
import type { AdminConfig, GameForAdmin } from "./types";

interface Props {
  config: AdminConfig;
  games: GameForAdmin[];
  teamCount: number | null;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "muted" }) {
  const color = tone === "ok" ? "text-forest" : tone === "warn" ? "text-burnt-orange" : "text-navy";
  return (
    <div className="border-2 border-navy/20 rounded p-2 min-w-0">
      <p className="font-body text-xs text-navy/60 truncate">{label}</p>
      <p className={`font-display text-[0.7rem] mt-1 break-words ${color}`}>{value}</p>
    </div>
  );
}

export function HealthPanel({ config, games, teamCount }: Props) {
  const queueDepth = config.queue_depth ?? null;
  // Re-render the relative timestamp once a minute without refetching.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const finals = games.filter((g) => g.status === "final").length;
  const inProgress = games.filter((g) => g.status === "in_progress").length;
  const pending = games.filter((g) => g.status !== "final" && g.team_a && g.team_b).length;
  const withEspn = games.filter((g) => g.espn_game_id).length;
  const last = config.last_score_update_at;
  const staleMs = last ? now.getTime() - new Date(last).getTime() : Infinity;
  const stale = staleMs > 60 * 60 * 1000;

  return (
    <section className="retro-card p-4 sm:p-6">
      <h2 className="scoreboard-heading text-[0.6rem] rounded mb-4">SYSTEM HEALTH</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat
          label="Last score update"
          value={last ? relativeTime(last, now) : "never"}
          tone={last && !stale ? "ok" : "warn"}
        />
        <Stat label="Teams" value={teamCount ?? "n/a"} />
        <Stat label="Games with ESPN id" value={`${withEspn} / ${games.length}`} tone={withEspn === games.length && games.length > 0 ? "ok" : undefined} />
        <Stat label="Final" value={finals} tone="ok" />
        <Stat label="Pending (teams set)" value={pending + (inProgress ? ` (${inProgress} live)` : "")} />
        <Stat label="Notification queue" value={queueDepth ?? "n/a"} tone={queueDepth ? "warn" : "muted"} />
      </div>
      <p className="font-body text-xs text-navy/60 mt-3">
        {last ? (
          <>
            Last update at{" "}
            <time dateTime={last}>
              {new Date(last).toLocaleString()} ({formatUtc(last)})
            </time>
            .
          </>
        ) : (
          "The score cron has never stamped last_score_update_at."
        )}{" "}
        {queueDepth === null && "Queue depth unavailable."}
      </p>
    </section>
  );
}
