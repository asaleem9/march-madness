"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const COOLDOWN_SECONDS = 60;

/**
 * "Resend confirmation email" with a 60s cooldown. Used on the signup success
 * screen and inline on login when Supabase says the email isn't confirmed.
 */
export function ResendConfirmation({
  email,
  className = "",
}: {
  email: string;
  className?: string;
}) {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email || sending || cooldown > 0) return;
    setSending(true);
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    if (error) {
      setIsError(true);
      setStatus(error.message);
      return;
    }
    setIsError(false);
    setStatus(`Sent a new link to ${email}.`);
    setCooldown(COOLDOWN_SECONDS);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={resend}
        disabled={sending || cooldown > 0 || !email}
        className="retro-btn retro-btn-secondary text-[0.6rem] py-2.5 px-4 disabled:opacity-50 min-h-11"
      >
        {sending
          ? "Sending…"
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Resend email"}
      </button>
      {status && (
        <p
          role={isError ? "alert" : "status"}
          className={`font-body text-xs mt-2 ${isError ? "text-burnt-orange" : "text-forest"}`}
        >
          {status}
        </p>
      )}
    </div>
  );
}
