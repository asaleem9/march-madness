"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { safeRedirectPath } from "@/lib/utils";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell, inputClass, labelClass } from "./AuthShell";
import { GoogleButton } from "./GoogleButton";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const { error: signUpError } = await authClient.signUp.email({
      email,
      password,
      name: displayName.trim(),
    });

    if (signUpError) {
      setError(signUpError.message || "Could not create your account");
      setLoading(false);
      return;
    }

    // Email verification is off, so a successful sign-up is already signed in.
    router.push(redirect);
    router.refresh();
  };

  return (
    <AuthShell>
      <h1 className="font-display text-navy text-sm text-center mb-8">SIGN UP</h1>

      {error && (
        <div
          role="alert"
          className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-6 rounded"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="signup-display-name" className={labelClass}>
            DISPLAY NAME
          </label>
          <input
            id="signup-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
            autoComplete="nickname"
            className={inputClass}
            placeholder="BracketKing42"
          />
        </div>
        <div>
          <label htmlFor="signup-email" className={labelClass}>
            EMAIL
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={inputClass}
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="signup-password" className={labelClass}>
            PASSWORD
          </label>
          <PasswordInput
            id="signup-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
          />
        </div>
        <div>
          <label htmlFor="signup-confirm-password" className={labelClass}>
            CONFIRM PASSWORD
          </label>
          <PasswordInput
            id="signup-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Retype your password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="retro-btn retro-btn-primary w-full disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 border-t-2 border-navy/20" />
        <span className="font-display text-[0.6rem] text-navy/50">OR</span>
        <div className="flex-1 border-t-2 border-navy/20" />
      </div>

      <GoogleButton redirect={redirect} label="Sign up with Google" onError={setError} />

      <p className="text-center text-xs text-navy/60 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-burnt-orange font-bold hover:underline">
          Log In
        </Link>
      </p>
    </AuthShell>
  );
}
