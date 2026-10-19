"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell, labelClass } from "../_components/AuthShell";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

/**
 * Landing page for the password-recovery email. The link carries a one-time
 * `token`; submitting the form exchanges it for the new password.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) return;
    setSaving(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setError(error.message || "This reset link is no longer valid");
      setSaving(false);
      return;
    }
    router.push("/login");
    router.refresh();
  };

  if (!token || linkError) {
    return (
      <AuthShell className="text-center">
        <h1 className="font-display text-navy text-sm mb-4">RESET PASSWORD</h1>
        <p className="font-body text-sm text-navy/80" role="alert">
          This reset link is missing or has expired.
        </p>
        <p className="font-body text-xs text-navy/60 mt-3">
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
            minLength={8}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
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
            minLength={8}
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
