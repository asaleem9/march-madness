"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function ChampionModal() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    const dismissed = localStorage.getItem("champ-modal-2026");
    if (!dismissed) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("champ-modal-2026", "true");
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-navy/80 backdrop-blur-sm" onClick={dismiss} />

      {/* Modal */}
      <div className="relative bg-cream border-4 border-gold shadow-[6px_6px_0_rgba(0,0,0,0.3)] max-w-md w-full rounded overflow-hidden animate-in">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-navy-light/60 border border-gold/40 text-cream hover:bg-burnt-orange hover:border-burnt-orange transition-all"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Confetti strips */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="confetti-strip confetti-1" />
          <div className="confetti-strip confetti-2" />
          <div className="confetti-strip confetti-3" />
          <div className="confetti-strip confetti-4" />
          <div className="confetti-strip confetti-5" />
          <div className="confetti-strip confetti-6" />
          <div className="confetti-strip confetti-7" />
          <div className="confetti-strip confetti-8" />
        </div>

        {/* Trophy header */}
        <div className="relative bg-navy py-8 px-6 text-center overflow-hidden">
          {/* Radial glow behind logo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 rounded-full bg-gold/10 blur-2xl" />
          </div>

          {/* Sparkle accents */}
          <div className="absolute top-4 left-6 text-gold/60 animate-pulse text-lg">&#10022;</div>
          <div className="absolute top-8 right-8 text-gold/40 animate-pulse text-sm" style={{ animationDelay: "0.5s" }}>&#10022;</div>
          <div className="absolute bottom-6 left-10 text-gold/30 animate-pulse text-xs" style={{ animationDelay: "1s" }}>&#10022;</div>
          <div className="absolute bottom-4 right-6 text-gold/50 animate-pulse text-base" style={{ animationDelay: "0.3s" }}>&#10022;</div>

          <div className="relative z-10">
            {/* Team logo */}
            <div className="flex justify-center mb-4">
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 champ-logo-glow">
                <Image
                  src="https://a.espncdn.com/i/teamlogos/ncaa/500/130.png"
                  alt="Michigan Wolverines"
                  fill
                  className="object-contain drop-shadow-[0_0_12px_rgba(212,168,67,0.5)]"
                  unoptimized
                />
              </div>
            </div>

            {/* Trophy row */}
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="text-2xl champ-trophy-bounce">🏆</span>
              <h2 className="font-display text-gold text-base sm:text-lg leading-relaxed champ-title-glow">
                MICHIGAN
              </h2>
              <span className="text-2xl champ-trophy-bounce" style={{ animationDelay: "0.15s" }}>🏆</span>
            </div>

            <p className="font-display text-burnt-orange text-[0.6rem] sm:text-[0.7rem] tracking-wider">
              2026 NCAA CHAMPIONS
            </p>

            {/* Score line */}
            <div className="flex items-center justify-center gap-3 mt-3">
              <div className="flex items-center gap-2">
                <div className="relative w-5 h-5">
                  <Image
                    src="https://a.espncdn.com/i/teamlogos/ncaa/500/130.png"
                    alt="Michigan"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <span className="font-display text-cream text-[0.6rem]">69</span>
              </div>
              <span className="font-body text-cream/40 text-xs">-</span>
              <div className="flex items-center gap-2">
                <span className="font-display text-cream/60 text-[0.6rem]">63</span>
                <div className="relative w-5 h-5">
                  <Image
                    src="https://a.espncdn.com/i/teamlogos/ncaa/500/41.png"
                    alt="UConn"
                    fill
                    className="object-contain opacity-60"
                    unoptimized
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Email signup */}
        <div className="relative z-10 p-6">
          {status === "success" ? (
            <div className="text-center py-2">
              <p className="font-display text-forest text-[0.6rem] mb-1">
                YOU&apos;RE IN!
              </p>
              <p className="font-body text-navy/60 text-xs">
                We&apos;ll let you know when March Madness 2027 brackets open.
              </p>
            </div>
          ) : (
            <>
              <p className="font-body text-navy/70 text-xs text-center mb-4">
                Get notified when brackets open for March Madness 2027.
              </p>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 font-body text-xs bg-white border-2 border-navy/15 rounded px-3 py-2 text-navy placeholder:text-navy/30 focus:border-gold focus:outline-none"
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
