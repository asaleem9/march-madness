"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { safeRedirectPath } from "@/lib/utils";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell, inputClass, labelClass } from "./AuthShell";
import { GoogleButton } from "./GoogleButton";

const OAUTH_ERROR_COPY: Record<string, string> = {
  auth_failed: "Google sign-in failed — try again",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    oauthError ? OAUTH_ERROR_COPY[oauthError] ?? "Sign-in failed — try again" : ""
  );
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      setError(error.message || "Invalid email or password");
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <AuthShell>
      <h1 className="font-display text-navy text-sm text-center mb-8">LOG IN</h1>

      {error && (
        <div
          role="alert"
          className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-6 rounded"
        >
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="login-email" className={labelClass}>
            EMAIL
          </label>
          <input
            id="login-email"
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
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="login-password" className={`${labelClass} mb-0`}>
              PASSWORD
            </label>
            <Link
              href="/forgot-password"
              className="font-body text-xs text-burnt-orange font-bold hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="retro-btn retro-btn-primary w-full disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 border-t-2 border-navy/20" />
        <span className="font-display text-[0.6rem] text-navy/50">OR</span>
        <div className="flex-1 border-t-2 border-navy/20" />
      </div>

      <GoogleButton redirect={redirect} label="Sign in with Google" onError={setError} />

      <p className="text-center text-xs text-navy/60 mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-burnt-orange font-bold hover:underline">
          Sign Up
        </Link>
      </p>
    </AuthShell>
  );
}
