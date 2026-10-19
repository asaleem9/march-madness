"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * Starts Google sign-in. Neon Auth handles the provider round-trip and lands
 * on /callback (which the proxy covers, so the session verifier is exchanged
 * for cookies there) before sending the user on to `redirect`.
 */
export function GoogleButton({
  redirect,
  label,
  onError,
}: {
  redirect: string;
  label: string;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    onError("");
    const callbackURL = `${window.location.origin}/callback?redirect=${encodeURIComponent(redirect)}`;
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) {
      onError(error.message || "Google sign-in failed — try again");
      setLoading(false);
    }
    // On success the browser navigates away; leave the button disabled.
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading}
      className="retro-btn retro-btn-secondary w-full disabled:opacity-50"
    >
      {loading ? "Redirecting to Google…" : label}
    </button>
  );
}
