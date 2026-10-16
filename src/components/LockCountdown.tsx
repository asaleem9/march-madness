"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { d, h, m, s };
}

export function formatCountdown(ms: number): string {
  const { d, h, m, s } = parts(ms);
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

interface Props {
  /** ISO timestamp of the bracket lock. */
  deadline: string;
  className?: string;
  /** Render inline (no card chrome). */
  compact?: boolean;
}

/**
 * "BRACKETS LOCK IN 3d 04h 05m" — renders nothing until mounted so the server
 * and client never disagree, then ticks every second and flips to LOCKED.
 */
export function LockCountdown({ deadline, className = "", compact = false }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // First tick is deferred (not synchronous in the effect) so the server
    // and client markup match until the component is mounted.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (now === null) return null;
  const remaining = new Date(deadline).getTime() - now;
  const locked = remaining <= 0;
  const urgent = !locked && remaining < 24 * 60 * 60 * 1000;
  const local = new Date(deadline).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const text = locked ? "BRACKETS ARE LOCKED" : `BRACKETS LOCK IN ${formatCountdown(remaining)}`;

  if (compact) {
    return (
      <span
        className={`font-display text-[0.6rem] ${locked ? "text-burnt-orange" : urgent ? "text-burnt-orange" : "text-gold"} ${className}`}
        title={local}
      >
        {text}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex flex-col items-center gap-1 border-2 ${urgent || locked ? "border-burnt-orange" : "border-gold/60"} bg-navy/60 px-4 py-2 rounded ${className}`}
      role="timer"
      aria-live="off"
    >
      <span className={`font-display text-[0.6rem] ${locked || urgent ? "text-burnt-orange" : "text-gold"}`}>
        {text}
      </span>
      {!locked && (
        <span className="font-body text-[0.7rem] text-cream/70">{local}</span>
      )}
    </div>
  );
}
