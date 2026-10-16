"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

const memberLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bracket/new", label: "Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/wagers", label: "Wagers" },
  { href: "/scoring", label: "Scoring" },
];

const publicLinks = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/scoring", label: "Scoring" },
];

interface HeaderProps {
  /** Seeded from the server so the logged-in nav renders on first paint (no flash). */
  initialUser?: User | null;
  isAdmin?: boolean;
}

export function Header({ initialUser = null, isAdmin = false }: HeaderProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Memoize so the auth listener isn't re-subscribed on every render.
  const [supabase] = useState<SupabaseClient>(() => createClient());

  // "Bracket" (href /bracket/new) should stay active while viewing /bracket/[id].
  const isActive = (href: string) =>
    href === "/bracket/new"
      ? pathname?.startsWith("/bracket")
      : pathname === href || pathname?.startsWith(href + "/");

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // Close the drawer whenever the route changes (tap on a link, back button).
  useEffect(() => {
    setMenuOpen(false);
    setConfirmSignOut(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const links = user ? memberLinks : publicLinks;
  const linkClass = (href: string) =>
    cn(
      "font-body text-xs px-3 py-2 rounded transition-colors",
      isActive(href) ? "bg-forest text-cream" : "text-cream-dark hover:text-gold"
    );

  return (
    <header className="bg-navy text-cream border-b-4 border-gold">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="font-display text-gold text-[0.6rem] sm:text-sm tracking-wide hover:text-burnt-orange transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Image
              src="/images/logo.png"
              alt=""
              width={28}
              height={28}
              className="rounded shrink-0"
            />
            MARCH MADNESS
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={linkClass(link.href)}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
            {user && isAdmin && (
              <Link
                href="/admin"
                className={linkClass("/admin")}
                aria-current={isActive("/admin") ? "page" : undefined}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="text-xs text-cream-dark hover:text-gold transition-colors hidden md:block px-2 py-2"
                  aria-current={isActive("/profile") ? "page" : undefined}
                >
                  Profile
                </Link>
                {confirmSignOut ? (
                  <span className="hidden md:flex items-center gap-2 text-xs">
                    <span className="text-cream-dark">Sign out?</span>
                    <button
                      onClick={handleSignOut}
                      className="text-burnt-orange hover:underline px-1 py-2"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmSignOut(false)}
                      className="text-cream-dark hover:underline px-1 py-2"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmSignOut(true)}
                    className="hidden md:block text-xs text-cream-dark hover:text-burnt-orange transition-colors px-2 py-2"
                  >
                    Sign Out
                  </button>
                )}
                {/* Mobile menu button */}
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="md:hidden text-cream w-11 h-11 flex items-center justify-center rounded hover:bg-navy-light"
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    {menuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3 sm:gap-5">
                <Link
                  href="/login"
                  className="text-xs text-cream-dark hover:text-gold transition-colors whitespace-nowrap py-2"
                >
                  Log In
                </Link>
                <Link href="/signup" className="retro-btn retro-btn-primary text-[0.6rem] whitespace-nowrap">
                  Sign Up
                </Link>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="md:hidden text-cream w-11 h-11 flex items-center justify-center rounded hover:bg-navy-light"
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    {menuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        {menuOpen && (
          <nav id="mobile-nav" className="md:hidden pb-4 flex flex-col gap-1" aria-label="Primary">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(linkClass(link.href), "py-3")}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <>
                <Link href="/profile" className={cn(linkClass("/profile"), "py-3")}>
                  Profile
                </Link>
                {isAdmin && (
                  <Link href="/admin" className={cn(linkClass("/admin"), "py-3")}>
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="font-body text-xs px-3 py-3 text-left text-burnt-orange hover:text-cream rounded"
                >
                  Sign Out
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
