"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const supabase = createClient();

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
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${redirect}`,
      },
    });
  };

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="retro-card p-8 w-full max-w-md">
        <h1 className="font-display text-navy text-sm text-center mb-8">
          LOG IN
        </h1>

        {error && (
          <div className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-6 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
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
              className="w-full border-2 border-navy p-3 font-body text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="********"
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
          <span className="font-display text-[0.5rem] text-navy/50">OR</span>
          <div className="flex-1 border-t-2 border-navy/20" />
        </div>

        <button
          onClick={handleGoogleLogin}
          className="retro-btn retro-btn-secondary w-full"
        >
          Sign in with Google
        </button>

        <p className="text-center text-xs text-navy/60 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-burnt-orange font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
