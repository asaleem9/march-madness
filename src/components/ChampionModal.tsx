"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

export interface ChampionModalTeam {
  name: string;
  logoUrl: string | null;
  score: number | null;
}

export interface ChampionModalProps {
  /** Tournament year that just finished. */
  year: number;
  /** Year the waitlist signs people up for. */
  nextYear: number;
  champion: ChampionModalTeam;
  runnerUp: ChampionModalTeam | null;
}

function storageKey(year: number) {
  return `champ-modal-${year}`;
}

function readDismissed(year: number): boolean {
  try {
    return window.localStorage.getItem(storageKey(year)) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(year: number) {
  try {
    window.localStorage.setItem(storageKey(year), "true");
  } catch {
    // Private mode / blocked storage — the card just shows again next visit.
  }
}

function TeamLogo({
  team,
  size,
  className = "",
}: {
  team: ChampionModalTeam;
  size: number;
  className?: string;
}) {
  if (!team.logoUrl) {
    return (
      <div
        className={`css-basketball ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span className="css-basketball-seams" />
      </div>
    );
  }
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <Image src={team.logoUrl} alt={team.name} fill className="object-contain" unoptimized />
    </div>
  );
}

/**
 * Dismissible bottom card announcing the champion and collecting waitlist
 * emails for next year. Celebratory but non-blocking — never covers the hero.
 */
export function ChampionModal({ year, nextYear, champion, runnerUp }: ChampionModalProps) {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const dismiss = useCallback(() => {
    setVisible(false);
    writeDismissed(year);
  }, [year]);

  useEffect(() => {
    if (readDismissed(year)) return;
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [year]);

  // Dismiss on Escape for keyboard users.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("success");
        setTimeout(dismiss, 2500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (!visible) return null;

  const hasScores = champion.score !== null && runnerUp?.score != null;

  return (
    <div
      role="region"
      aria-label={`${year} champion and ${nextYear} waitlist`}
      className="fixed z-40 bottom-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80 animate-in"
    >
      <div className="relative bg-cream border-4 border-gold rounded overflow-hidden shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-navy-light/70 border border-gold/40 text-cream hover:bg-burnt-orange hover:border-burnt-orange transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Confetti strips */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="confetti-strip confetti-1" />
          <div className="confetti-strip confetti-3" />
          <div className="confetti-strip confetti-5" />
          <div className="confetti-strip confetti-7" />
        </div>

        {/* Champion header */}
        <div className="relative bg-navy py-5 px-4 text-center overflow-hidden">
          <div className="flex items-center justify-center gap-3 mb-3">
            <TeamLogo team={champion} size={48} className="champ-logo-glow" />
            {runnerUp && (
              <>
                <div className="flex flex-col items-center leading-none">
                  {hasScores ? (
                    <>
                      <span className="font-display text-cream text-xs">{champion.score}</span>
                      <span className="font-body text-cream/40 text-[0.6rem] my-0.5">vs</span>
                      <span className="font-display text-cream/50 text-xs">{runnerUp.score}</span>
                    </>
                  ) : (
                    <span className="font-body text-cream/40 text-xs">def.</span>
                  )}
                </div>
                <TeamLogo team={runnerUp} size={36} className="opacity-50" />
              </>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg champ-trophy-bounce" aria-hidden="true">🏆</span>
            <h2 className="font-display text-gold text-xs sm:text-sm champ-title-glow uppercase break-words">
              {champion.name}
            </h2>
            <span className="text-lg champ-trophy-bounce" style={{ animationDelay: "0.15s" }} aria-hidden="true">
              🏆
            </span>
          </div>
          <p className="font-display text-burnt-orange text-[0.6rem] tracking-wider mt-2">
            {year} NCAA CHAMPIONS
          </p>
        </div>

        {/* Email signup */}
        <div className="relative z-10 p-4">
          {status === "success" ? (
            <div className="text-center py-1">
              <p className="font-display text-forest text-[0.6rem] mb-1">YOU&apos;RE IN!</p>
              <p className="font-body text-navy/70 text-xs">
                We&apos;ll let you know when {nextYear} brackets open.
              </p>
            </div>
          ) : (
            <>
              <p className="font-body text-navy/70 text-xs text-center mb-3">
                Get notified when brackets open for {nextYear}.
              </p>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <label htmlFor="champ-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="champ-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  className="flex-1 min-w-0 font-body text-base bg-white border-2 border-navy/15 rounded px-3 py-2 text-navy placeholder:text-navy/40 focus:border-gold focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="retro-btn retro-btn-primary text-[0.6rem] whitespace-nowrap disabled:opacity-50"
                >
                  {status === "loading" ? "..." : "Notify Me"}
                </button>
              </form>
              {status === "error" && (
                <p className="font-body text-burnt-orange text-xs text-center mt-2">
                  Something went wrong. Try again.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
