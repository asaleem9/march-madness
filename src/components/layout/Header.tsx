"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import type { AppUser } from "@/lib/auth/session";
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
  initialUser?: AppUser | null;
  isAdmin?: boolean;
}

export function Header({ initialUser = null, isAdmin = false }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // The server-seeded user carries the first paint; once the browser session
  // has loaded it takes over (sign-in/out elsewhere updates it).
  const { data: session, isPending } = authClient.useSession();
  const user: Pick<AppUser, "id" | "email"> | null = isPending
    ? initialUser
    : session?.user
      ? { id: session.user.id, email: session.user.email }
      : null;

  // "Bracket" (href /bracket/new) should stay active while viewing /bracket/[id].
  const isActive = (href: string) =>
    href === "/bracket/new"
      ? pathname?.startsWith("/bracket")
      : pathname === href || pathname?.startsWith(href + "/");

  // Close the drawer whenever the route changes (tap on a link, back button).
  // Derived-state pattern: compare during render instead of in an effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setConfirmSignOut(false);
  }

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
      setMenuOpen(false);
    }
    router.push("/");
    router.refresh();
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
            className="font-display text-gold text-[0.6rem] sm:text-sm tracking-wide hover:text-burnt-orange transition-colors flex items-center gap-2 whitespace-nowrap min-w-0 mr-2"
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
                      disabled={signingOut}
                      className="text-burnt-orange hover:underline px-1 py-2 disabled:opacity-50"
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
              <div className="flex items-center gap-2 sm:gap-5">
                <Link
                  href="/login"
                  className="text-xs text-cream-dark hover:text-gold transition-colors whitespace-nowrap py-2 px-1"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="retro-btn retro-btn-primary text-[0.6rem] whitespace-nowrap px-3 py-2 sm:px-6 sm:py-3"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        {menuOpen && user && (
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
            <Link href="/profile" className={cn(linkClass("/profile"), "py-3")}>
              Profile
            </Link>
            {isAdmin && (
              <Link href="/admin" className={cn(linkClass("/admin"), "py-3")}>
                Admin
              </Link>
            )}
            {confirmSignOut ? (
              <div className="flex items-center gap-3 px-3 py-3 text-xs" role="group" aria-label="Confirm sign out">
                <span className="text-cream-dark">Sign out?</span>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="font-body text-burnt-orange hover:underline disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmSignOut(false)}
                  className="font-body text-cream-dark hover:underline"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmSignOut(true)}
                className="font-body text-xs px-3 py-3 text-left text-burnt-orange hover:text-cream rounded"
              >
                Sign Out
              </button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
