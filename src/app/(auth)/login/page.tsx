"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/utils";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell, inputClass, labelClass } from "../_components/AuthShell";
import { ResendConfirmation } from "../_components/ResendConfirmation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const OAUTH_ERROR_COPY: Record<string, string> = {
  auth_failed: "Google sign-in failed — try again",
};

function LoginForm() {
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const supabase = createClient();

  const notConfirmed = /not confirmed/i.test(error);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      setError(error.message || "Google sign-in failed — try again");
      setGoogleLoading(false);
    }
    // On success the browser navigates away; leave the button disabled.
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
          {notConfirmed && (
            <div className="mt-3 text-navy">
              <p className="font-body text-xs mb-2">
                Confirm your email first — check your spam folder, or send a new link.
              </p>
              <ResendConfirmation email={email} />
            </div>
          )}
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

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className="retro-btn retro-btn-secondary w-full disabled:opacity-50"
      >
        {googleLoading ? "Redirecting to Google…" : "Sign in with Google"}
      </button>

      <p className="text-center text-xs text-navy/60 mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-burnt-orange font-bold hover:underline">
          Sign Up
        </Link>
      </p>
    </AuthShell>
  );
}
