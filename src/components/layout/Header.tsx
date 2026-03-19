"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bracket/new", label: "Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/wagers", label: "Wagers" },
];

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <header className="bg-navy text-cream border-b-4 border-gold">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="font-display text-gold text-xs sm:text-sm tracking-wider hover:text-burnt-orange transition-colors flex items-center gap-2"
          >
            <Image
              src="/images/logo.png"
              alt="March Madness"
              width={28}
              height={28}
              className="rounded"
            />
            MARCH MADNESS
          </Link>

          {/* Desktop Nav */}
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "font-body text-xs px-3 py-2 rounded transition-colors",
                    pathname?.startsWith(link.href)
                      ? "bg-forest text-cream"
                      : "text-cream-dark hover:text-gold"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="text-xs text-cream-dark hover:text-gold transition-colors hidden sm:block"
                >
                  Profile
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-cream-dark hover:text-burnt-orange transition-colors"
                >
                  Sign Out
                </button>
                {/* Mobile menu button */}
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="md:hidden text-cream p-1"
                  aria-label="Toggle menu"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {menuOpen ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-xs text-cream-dark hover:text-gold transition-colors whitespace-nowrap"
                >
                  Log In
                </Link>
                <Link href="/signup" className="retro-btn retro-btn-primary text-[0.55rem] whitespace-nowrap">
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        {menuOpen && user && (
          <nav className="md:hidden pb-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "font-body text-xs px-3 py-2 rounded transition-colors",
                  pathname?.startsWith(link.href)
                    ? "bg-forest text-cream"
                    : "text-cream-dark hover:text-gold"
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="font-body text-xs px-3 py-2 text-cream-dark hover:text-gold"
            >
              Profile
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
