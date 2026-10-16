"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, inputClass, labelClass } from "../_components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell className="text-center">
        <h1 className="font-display text-navy text-sm mb-4">CHECK YOUR EMAIL</h1>
        <p className="font-body text-sm text-navy/80" role="status">
          If an account exists for <strong>{email}</strong>, we sent a link to
          reset your password. Open it in this browser.
        </p>
        <p className="font-body text-xs text-navy/60 mt-3">
          Nothing there? Check your spam folder.
        </p>
        <div className="mt-6">
          <Link href="/login" className="retro-btn retro-btn-primary inline-block">
            Back to Login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display text-navy text-sm text-center mb-4">
        RESET PASSWORD
      </h1>
      <p className="font-body text-xs text-navy/70 text-center mb-6">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>

      {error && (
        <div
          role="alert"
          className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-6 rounded"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className={labelClass}>
            EMAIL
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={inputClass}
            placeholder="your@email.com"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="retro-btn retro-btn-primary w-full disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      <p className="text-center text-xs text-navy/60 mt-6">
        Remembered it?{" "}
        <Link href="/login" className="text-burnt-orange font-bold hover:underline">
          Log In
        </Link>
      </p>
    </AuthShell>
  );
}
