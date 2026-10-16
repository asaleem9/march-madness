import Link from "next/link";
import { getTournamentConfig } from "@/lib/tournament";

const links = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/scoring", label: "Scoring" },
  { href: "/profile", label: "Profile" },
];

export async function Footer() {
  const config = await getTournamentConfig();
  const year = config?.year ?? new Date().getFullYear();
  return (
    <footer className="bg-navy text-cream-dark border-t-4 border-gold">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-display text-[0.6rem] text-gold tracking-wider">
            MARCH MADNESS {year}
          </p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-body text-xs text-cream-dark/80 hover:text-gold transition-colors py-1"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="font-body text-[0.7rem] text-cream-dark opacity-70 text-center">
            For entertainment purposes only. Not affiliated with the NCAA.
          </p>
        </div>
      </div>
    </footer>
  );
}
