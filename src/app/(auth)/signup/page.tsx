"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/utils";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell, inputClass, labelClass } from "../_components/AuthShell";
import { ResendConfirmation } from "../_components/ResendConfirmation";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push(redirect);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      setError(error.message || "Google sign-up failed — try again");
      setGoogleLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell className="text-center">
        <h1 className="font-display text-navy text-sm mb-4">CHECK YOUR EMAIL</h1>
        <p className="font-body text-sm text-navy/80">
          We sent a confirmation link to <strong>{email}</strong>. Click the
          link to activate your account, then log in.
        </p>
        <p className="font-body text-xs text-navy/60 mt-3">
          Nothing there? Check your spam folder — it can take a minute.
        </p>
        <ResendConfirmation email={email} className="mt-5" />
        <div className="mt-6">
          <Link href="/login" className="retro-btn retro-btn-primary inline-block">
            Go to Login
          </Link>
        </div>
        <p className="font-body text-xs text-navy/60 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-burnt-orange font-bold hover:underline">
            Log in
          </Link>
          {" · "}
          <Link href="/forgot-password" className="text-burnt-orange font-bold hover:underline">
            Reset password
          </Link>
        </p>
      </AuthShell>
    );
  }

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
            minLength={6}
            autoComplete="new-password"
            placeholder="Min. 6 characters"
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
            minLength={6}
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

      <button
        type="button"
        onClick={handleGoogleSignup}
        disabled={googleLoading}
        className="retro-btn retro-btn-secondary w-full disabled:opacity-50"
      >
        {googleLoading ? "Redirecting to Google…" : "Sign up with Google"}
      </button>

      <p className="text-center text-xs text-navy/60 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-burnt-orange font-bold hover:underline">
          Log In
        </Link>
      </p>
    </AuthShell>
  );
}
