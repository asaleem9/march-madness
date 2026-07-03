"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function ChampionModal() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("champ-modal-2026", "true");
  };

  useEffect(() => {
    const dismissed = localStorage.getItem("champ-modal-2026");
    if (!dismissed) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Dismiss on Escape for keyboard users.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

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

  return (
    // A dismissible bottom card — celebratory but non-blocking, so it never
    // covers the hero or the primary CTA on load.
    <div
      role="region"
      aria-label="2026 champion and 2027 waitlist"
      className="fixed z-40 bottom-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80 animate-in"
    >
      <div className="relative bg-cream border-4 border-gold rounded overflow-hidden shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
        {/* Close button */}
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
            <div className="relative w-12 h-12 champ-logo-glow">
              <Image
                src="https://a.espncdn.com/i/teamlogos/ncaa/500/130.png"
                alt="Michigan Wolverines"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="font-display text-cream text-xs">69</span>
              <span className="font-body text-cream/40 text-[0.5rem] my-0.5">vs</span>
              <span className="font-display text-cream/50 text-xs">63</span>
            </div>
            <div className="relative w-9 h-9 opacity-50">
              <Image
                src="https://a.espncdn.com/i/teamlogos/ncaa/500/41.png"
                alt="UConn Huskies"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg champ-trophy-bounce">🏆</span>
            <h2 className="font-display text-gold text-base champ-title-glow">MICHIGAN</h2>
            <span className="text-lg champ-trophy-bounce" style={{ animationDelay: "0.15s" }}>🏆</span>
          </div>
          <p className="font-display text-burnt-orange text-[0.55rem] tracking-wider mt-1">
            2026 NCAA CHAMPIONS
          </p>
        </div>

        {/* Email signup */}
        <div className="relative z-10 p-4">
          {status === "success" ? (
            <div className="text-center py-1">
              <p className="font-display text-forest text-[0.6rem] mb-1">YOU&apos;RE IN!</p>
              <p className="font-body text-navy/70 text-xs">
                We&apos;ll let you know when 2027 brackets open.
              </p>
            </div>
          ) : (
            <>
              <p className="font-body text-navy/70 text-xs text-center mb-3">
                Get notified when brackets open for 2027.
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
                  className="flex-1 min-w-0 font-body text-xs bg-white border-2 border-navy/15 rounded px-3 py-2 text-navy placeholder:text-navy/40 focus:border-gold focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="retro-btn retro-btn-primary text-[0.5rem] whitespace-nowrap disabled:opacity-50"
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
