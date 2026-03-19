"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
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
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${redirect}`,
      },
    });
  };

  if (success) {
    return (
      <div
        className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 relative"
        style={{
          backgroundImage: "url(/images/auth-bg.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-cream/90" />
        <div className="retro-card p-8 w-full max-w-md text-center relative z-10">
          <h1 className="font-display text-navy text-sm mb-4">
            CHECK YOUR EMAIL
          </h1>
          <p className="font-body text-sm text-navy/80">
            We sent a confirmation link to <strong>{email}</strong>. Click the
            link to activate your account, then log in.
          </p>
          <Link
            href="/login"
            className="retro-btn retro-btn-primary inline-block mt-6"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: "url(/images/auth-bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-cream/90" />
      <div className="retro-card p-8 w-full max-w-md relative z-10">
        <h1 className="font-display text-navy text-sm text-center mb-8">
          SIGN UP
        </h1>

        {error && (
          <div className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-6 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              DISPLAY NAME
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full border-2 border-navy p-3 font-body text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="BracketKing42"
            />
          </div>
          <div>
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border-2 border-navy p-3 font-body text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border-2 border-navy p-3 font-body text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="Min. 6 characters"
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
          <span className="font-display text-[0.5rem] text-navy/50">OR</span>
          <div className="flex-1 border-t-2 border-navy/20" />
        </div>

        <button
          onClick={handleGoogleSignup}
          className="retro-btn retro-btn-secondary w-full"
        >
          Sign up with Google
        </button>

        <p className="text-center text-xs text-navy/60 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-burnt-orange font-bold hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
