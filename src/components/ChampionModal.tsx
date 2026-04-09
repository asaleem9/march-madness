"use client";

import { useState, useEffect } from "react";

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
          className="absolute top-3 right-3 text-navy/40 hover:text-navy transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Trophy header */}
        <div className="bg-navy py-6 px-6 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <h2 className="font-display text-gold text-sm sm:text-base leading-relaxed">
            MICHIGAN
          </h2>
          <p className="font-display text-burnt-orange text-[0.55rem] mt-1">
            2026 NCAA CHAMPIONS
          </p>
          <p className="font-body text-cream/60 text-xs mt-2">
            defeated UConn 69-63
          </p>
        </div>

        {/* Email signup */}
        <div className="p-6">
          {status === "success" ? (
            <div className="text-center py-2">
              <p className="font-display text-forest text-[0.6rem] mb-1">
                YOU'RE IN!
              </p>
              <p className="font-body text-navy/60 text-xs">
                We'll let you know when March Madness 2027 brackets open.
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
