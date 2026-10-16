"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { Loader } from "@/components/Loader";
import { AuthShell, labelClass } from "../_components/AuthShell";

/**
 * Landing page for the password-recovery email. The browser client exchanges
 * the `code` in the URL for a session on load; once that session exists
 * (PASSWORD_RECOVERY / SIGNED_IN, or an already-present session) the user can
 * set a new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  if (!ready) {
    return (
      <AuthShell className="text-center">
        <h1 className="font-display text-navy text-sm mb-2">RESET PASSWORD</h1>
        <Loader label="Verifying your link" />
        <p className="font-body text-xs text-navy/60">
          Link expired or opened in a different browser?{" "}
          <Link href="/forgot-password" className="text-burnt-orange font-bold hover:underline">
            Request a new one
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display text-navy text-sm text-center mb-8">
        CHOOSE A NEW PASSWORD
      </h1>

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
          <label htmlFor="reset-password" className={labelClass}>
            NEW PASSWORD
          </label>
          <PasswordInput
            id="reset-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Min. 6 characters"
          />
        </div>
        <div>
          <label htmlFor="reset-confirm" className={labelClass}>
            CONFIRM PASSWORD
          </label>
          <PasswordInput
            id="reset-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Retype your new password"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="retro-btn retro-btn-primary w-full disabled:opacity-50"
        >
          {saving ? "Saving..." : "Set New Password"}
        </button>
      </form>
    </AuthShell>
  );
}
