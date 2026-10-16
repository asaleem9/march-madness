"use client";

import { useId, useState } from "react";

export interface WaitlistFormProps {
  /** Season the signup is for ("We'll email you when 2027 brackets open"). */
  nextYear: number;
  /** Pre-fill for signed-in users; the announce email only goes to the waitlist. */
  defaultEmail?: string | null;
  className?: string;
}

/**
 * Inline "notify me when brackets open" form. Posts to /api/waitlist, which
 * upserts into `email_waitlist`, so re-submitting the same address is harmless.
 */
export function WaitlistForm({ nextYear, defaultEmail, className = "" }: WaitlistFormProps) {
  const inputId = useId();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

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
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className={`text-center ${className}`} role="status">
        <p className="font-display text-gold text-[0.6rem] mb-1">YOU&apos;RE IN!</p>
        <p className="font-body text-cream/80 text-xs">
          We&apos;ll email you when {nextYear} brackets open.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-2 ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <input
        id={inputId}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        autoComplete="email"
        className="flex-1 min-w-0 font-body text-base bg-cream border-2 border-gold/40 rounded px-3 py-2 text-navy placeholder:text-navy/40 focus:border-gold focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="retro-btn retro-btn-primary text-[0.6rem] whitespace-nowrap disabled:opacity-50"
      >
        {status === "loading" ? "..." : "Notify Me"}
      </button>
      {status === "error" && (
        <p className="font-body text-burnt-orange text-xs text-center sm:basis-full" role="alert">
          Something went wrong. Try again.
        </p>
      )}
    </form>
  );
}
