import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import FeatureIcon from "@/components/FeatureIcon";
import SectionDivider from "@/components/SectionDivider";
import { LockCountdown } from "@/components/LockCountdown";
import { WaitlistForm } from "@/components/WaitlistForm";
import { formatEastern, formatEasternDate } from "@/components/dashboard/helpers";
import { createClient } from "@/lib/supabase/server";
import { getScoringMultipliers, getSeason, type ChampionInfo } from "@/lib/tournament";
import { REQUIRED_PICKS, type YearDefaults } from "@/lib/tournament-structure";
import type { TournamentPhase } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { displayYear, offSeason, upcoming } = await getSeason();
  return {
    title: { absolute: `March Madness ${displayYear} Bracket Challenge` },
    description: offSeason
      ? `${displayYear} brackets open ${selectionSundayCopy(upcoming)}. Join the waitlist to hear when, then climb the leaderboard and wager with friends.`
      : `Fill out your ${displayYear} bracket, climb the leaderboard, and wager with friends.`,
  };
}

/** "Selection Sunday, Mar 14" — or just "Selection Sunday" when next year's dates aren't known yet. */
function selectionSundayCopy(upcoming: YearDefaults | null): string {
  if (!upcoming) return "on Selection Sunday";
  const day = formatEasternDate(upcoming.selectionSunday).replace(/^\w+, /, "").replace(/, \d{4}$/, "");
  return `Selection Sunday, ${day}`;
}

interface Cta {
  href: string;
  label: string;
  style: "retro-btn-primary" | "retro-btn-gold" | "retro-btn-secondary";
}

function ctasFor(phase: TournamentPhase, loggedIn: boolean, tournamentYear: number): Cta[] {
  if (phase === "completed") {
    return [
      { href: "#waitlist", label: loggedIn ? "Get Notified" : "Join the Waitlist", style: "retro-btn-primary" },
      { href: "/leaderboard", label: `${tournamentYear} Final Standings`, style: "retro-btn-gold" },
      { href: "/schedule", label: "Results", style: "retro-btn-secondary" },
    ];
  }
  if (phase === "pre_tournament") {
    return [
      loggedIn
        ? { href: "/bracket/new", label: "My Bracket", style: "retro-btn-primary" }
        : { href: "/signup", label: "Create Bracket", style: "retro-btn-primary" },
      { href: "/leaderboard", label: "Leaderboard", style: "retro-btn-gold" },
      { href: "/schedule", label: "Live Scores", style: "retro-btn-secondary" },
    ];
  }
  return [
    loggedIn
      ? { href: "/dashboard", label: "My Bracket", style: "retro-btn-primary" }
      : { href: "/signup", label: "Sign Up", style: "retro-btn-primary" },
    { href: "/leaderboard", label: "Leaderboard", style: "retro-btn-gold" },
    { href: "/schedule", label: "Live Scores", style: "retro-btn-secondary" },
  ];
}

function stepOneCopy(
  phase: TournamentPhase,
  tournamentYear: number,
  displayYear: number,
  upcoming: YearDefaults | null
): string {
  if (phase === "completed")
    return `The ${tournamentYear} tournament is in the books. ${displayYear} brackets open ${selectionSundayCopy(upcoming)} — join the waitlist to hear when.`;
  if (phase !== "pre_tournament")
    return `Brackets are locked for ${tournamentYear}. Follow your ${REQUIRED_PICKS} picks as the rounds play out and watch the upsets pay off.`;
  return `Fill out your bracket with all ${REQUIRED_PICKS} picks before the First Round tips off. Pick upsets for bonus points.`;
}

function TeamLogo({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: number }) {
  if (!logoUrl) return null;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Image src={logoUrl} alt={name} fill className="object-contain" unoptimized />
    </span>
  );
}

/** "2026 champions: Michigan def. UConn 69–63" with the logo, linking to the final standings. */
function ChampionLine({ year, champion }: { year: number; champion: ChampionInfo }) {
  const hasScores = champion.winnerScore !== null && champion.loserScore !== null;
  return (
    <p className="font-body text-cream/70 text-xs mt-6 flex items-center justify-center gap-2 flex-wrap">
      <TeamLogo name={champion.winner.name} logoUrl={champion.winner.logoUrl} size={24} />
      <span>
        {year} champions:{" "}
        <Link href="/leaderboard" className="text-gold font-bold hover:underline">
          {champion.winner.name}
        </Link>
        {champion.runnerUp && (
          <>
            {" "}
            def. {champion.runnerUp.name}
            {hasScores && (
              <>
                {" "}
                {champion.winnerScore}–{champion.loserScore}
              </>
            )}
          </>
        )}
      </span>
    </p>
  );
}

/** Off-season callout under the hero CTAs: when brackets open, plus the waitlist signup. */
function OffSeasonCallout({
  displayYear,
  upcoming,
  defaultEmail,
}: {
  displayYear: number;
  upcoming: YearDefaults | null;
  defaultEmail: string | null;
}) {
  return (
    <div
      id="waitlist"
      className="mt-8 mx-auto max-w-md border-2 border-gold/60 bg-navy/60 rounded px-5 py-5 text-center scroll-mt-24"
    >
      <p className="font-display text-gold text-[0.6rem] leading-relaxed">
        {displayYear} BRACKETS OPEN
        <br />
        SELECTION SUNDAY
      </p>
      {upcoming && (
        <p className="font-body text-cream/70 text-[0.7rem] mt-2">
          {formatEasternDate(upcoming.selectionSunday)} · brackets lock{" "}
          {formatEastern(upcoming.lockDeadline)}
        </p>
      )}
      <WaitlistForm nextYear={displayYear} defaultEmail={defaultEmail} className="mt-4" />
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const [season, userRes] = await Promise.all([getSeason(), supabase.auth.getUser()]);
  const { config, champion, phase, tournamentYear, displayYear, offSeason, upcoming } = season;
  const user = userRes.data.user;
  const loggedIn = !!user;
  const multipliers = getScoringMultipliers(config);
  const ctas = ctasFor(phase, loggedIn, tournamentYear);

  const scoringStrip = [
    { round: "R1", points: multipliers.first_round },
    { round: "R2", points: multipliers.second_round },
    { round: "S16", points: multipliers.sweet_16 },
    { round: "E8", points: multipliers.elite_eight },
    { round: "F4", points: multipliers.final_four },
    { round: "CHAMP", points: multipliers.championship },
  ];

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-navy py-12 sm:py-20">
        <div className="absolute inset-0 crt-effect" />

        {/* Background court lines */}
        <div className="absolute inset-0 opacity-[0.06]">
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-72 sm:h-72 rounded-full border-[3px] border-gold" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-24 sm:h-24 rounded-full border-[3px] border-gold" />
          {/* Half-court line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[3px] bg-gold" />
          {/* Free-throw lanes */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 w-24 sm:w-36 h-40 sm:h-56 border-[3px] border-gold border-l-0" />
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-24 sm:w-36 h-40 sm:h-56 border-[3px] border-gold border-r-0" />
          {/* Three-point arcs */}
          <div className="absolute top-1/2 -translate-y-1/2 -left-20 sm:-left-16 w-48 sm:w-64 h-64 sm:h-80 rounded-full border-[3px] border-gold" />
          <div className="absolute top-1/2 -translate-y-1/2 -right-20 sm:-right-16 w-48 sm:w-64 h-64 sm:h-80 rounded-full border-[3px] border-gold" />
        </div>

        {/* Static basketballs scattered */}
        <div className="absolute top-8 left-[8%] opacity-10 hidden sm:block">
          <div className="css-basketball" style={{ width: 28, height: 28 }}>
            <span className="css-basketball-seams" />
          </div>
        </div>
        <div className="absolute bottom-12 right-[12%] opacity-10 hidden sm:block">
          <div className="css-basketball" style={{ width: 22, height: 22 }}>
            <span className="css-basketball-seams" />
          </div>
        </div>
        <div className="absolute top-1/3 right-[6%] opacity-[0.07] hidden md:block">
          <div className="css-basketball" style={{ width: 40, height: 40 }}>
            <span className="css-basketball-seams" />
          </div>
        </div>
        <div className="absolute bottom-1/4 left-[5%] opacity-[0.07] hidden md:block">
          <div className="css-basketball" style={{ width: 34, height: 34 }}>
            <span className="css-basketball-seams" />
          </div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          {/* Bracket frame around title */}
          <div className="inline-block relative px-8 sm:px-16 py-6 sm:py-10 mb-8">
            {/* Bracket corners */}
            <div className="absolute top-0 left-0 w-6 h-6 sm:w-10 sm:h-10 border-l-3 border-t-3 border-gold/50" />
            <div className="absolute top-0 right-0 w-6 h-6 sm:w-10 sm:h-10 border-r-3 border-t-3 border-gold/50" />
            <div className="absolute bottom-0 left-0 w-6 h-6 sm:w-10 sm:h-10 border-l-3 border-b-3 border-gold/50" />
            <div className="absolute bottom-0 right-0 w-6 h-6 sm:w-10 sm:h-10 border-r-3 border-b-3 border-gold/50" />

            {/* Basketball icon above title */}
            <div className="flex justify-center mb-4">
              <div className="css-basketball-lg">
                <span className="css-basketball-seams" />
              </div>
            </div>

            <h1
              className="font-display text-gold text-xl sm:text-3xl leading-relaxed"
              style={{ animation: "title-glow 3s ease-in-out infinite" }}
            >
              MARCH
              <br />
              MADNESS
              <br />
              <span className="text-burnt-orange">{displayYear}</span>
            </h1>
          </div>

          {/* Tournament bracket mini-graphic */}
          <div className="flex justify-center mb-8">
            <svg
              viewBox="0 0 280 60"
              className="w-64 sm:w-80 h-auto"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Left side bracket lines */}
              <line x1="10" y1="8" x2="40" y2="8" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="10" y1="22" x2="40" y2="22" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="40" y1="8" x2="40" y2="22" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="40" y1="15" x2="70" y2="15" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />

              <line x1="10" y1="38" x2="40" y2="38" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="10" y1="52" x2="40" y2="52" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="40" y1="38" x2="40" y2="52" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="40" y1="45" x2="70" y2="45" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />

              <line x1="70" y1="15" x2="70" y2="45" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="70" y1="30" x2="110" y2="30" stroke="#d4a843" strokeWidth="1.5" opacity="0.6" />

              {/* Right side bracket lines */}
              <line x1="270" y1="8" x2="240" y2="8" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="270" y1="22" x2="240" y2="22" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="240" y1="8" x2="240" y2="22" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="240" y1="15" x2="210" y2="15" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />

              <line x1="270" y1="38" x2="240" y2="38" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="270" y1="52" x2="240" y2="52" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="240" y1="38" x2="240" y2="52" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="240" y1="45" x2="210" y2="45" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />

              <line x1="210" y1="15" x2="210" y2="45" stroke="#d4a843" strokeWidth="1.5" opacity="0.5" />
              <line x1="210" y1="30" x2="170" y2="30" stroke="#d4a843" strokeWidth="1.5" opacity="0.6" />

              {/* Championship trophy icon in center */}
              <circle cx="140" cy="30" r="14" stroke="#e8722a" strokeWidth="2" fill="none" opacity="0.7" />
              <line x1="110" y1="30" x2="126" y2="30" stroke="#d4a843" strokeWidth="1.5" opacity="0.6" />
              <line x1="154" y1="30" x2="170" y2="30" stroke="#d4a843" strokeWidth="1.5" opacity="0.6" />
              {/* Trophy shape */}
              <path d="M134 24h12v8c0 3-2.5 5-6 5s-6-2-6-5v-8z" fill="#d4a843" opacity="0.6" />
              <rect x="137" y="37" width="6" height="3" fill="#d4a843" opacity="0.6" />
              <rect x="135" y="40" width="10" height="2" rx="1" fill="#d4a843" opacity="0.6" />
            </svg>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {ctas.map((cta) => (
              <Link key={cta.href} href={cta.href} className={`retro-btn ${cta.style}`}>
                {cta.label}
              </Link>
            ))}
          </div>

          {phase === "pre_tournament" && config?.bracket_lock_deadline && (
            <div className="flex justify-center mt-6">
              <LockCountdown deadline={config.bracket_lock_deadline} />
            </div>
          )}

          {offSeason && (
            <OffSeasonCallout
              displayYear={displayYear}
              upcoming={upcoming}
              defaultEmail={user?.email ?? null}
            />
          )}

          {phase === "completed" && champion && (
            <ChampionLine year={tournamentYear} champion={champion} />
          )}
        </div>
      </section>

      <SectionDivider />

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-navy text-center text-sm mb-12">HOW IT WORKS</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="retro-card p-6">
            <div className="scoreboard-heading text-center text-[0.6rem] mb-4 rounded-t">STEP 1</div>
            <FeatureIcon icon="basketball" />
            <h3 className="font-display text-[0.65rem] text-navy mb-3">Pick Your Winners</h3>
            <p className="font-body text-xs text-navy/70">{stepOneCopy(phase, tournamentYear, displayYear, upcoming)}</p>
          </div>
          <div className="retro-card p-6">
            <div className="scoreboard-heading text-center text-[0.6rem] mb-4 rounded-t">STEP 2</div>
            <FeatureIcon icon="trophy" />
            <h3 className="font-display text-[0.65rem] text-navy mb-3">Challenge Friends</h3>
            <p className="font-body text-xs text-navy/70">
              Create IOU wagers with other players. Loser buys dinner, does a dare, or whatever you
              agree on.{" "}
              <Link href="/scoring#wagers" className="text-burnt-orange hover:underline">
                How wagers work
              </Link>
            </p>
          </div>
          <div className="retro-card p-6">
            <div className="scoreboard-heading text-center text-[0.6rem] mb-4 rounded-t">STEP 3</div>
            <FeatureIcon icon="chart" />
            <h3 className="font-display text-[0.65rem] text-navy mb-3">Track Live Results</h3>
            <p className="font-body text-xs text-navy/70">
              Watch your bracket update in real-time. Climb the leaderboard and{" "}
              <Link href="/scoring#badges" className="text-burnt-orange hover:underline">
                earn badges
              </Link>{" "}
              for epic picks.
            </p>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Scoring Section */}
      <section className="bg-navy py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-display text-gold text-center text-sm mb-8">SCORING</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {scoringStrip.map((item, i) => (
              <div
                key={item.round}
                className={`text-center py-2 ${i < 5 ? "md:border-r md:border-gold/20" : ""}`}
              >
                <div className="font-display text-burnt-orange text-sm mb-1">{item.points}</div>
                <div className="font-display text-cream text-[0.6rem]">{item.round}</div>
              </div>
            ))}
          </div>
          <p className="font-body text-cream/60 text-xs text-center mt-4">
            Opening Round play-ins aren&apos;t picked — pick either team in the first-round tile.
          </p>
          <div className="flex flex-col items-center mt-6 gap-3">
            <span className="inline-block font-display text-[0.6rem] bg-burnt-orange text-cream px-4 py-2 border-2 border-burnt-orange/60 shadow-[3px_3px_0_rgba(0,0,0,0.3)]">
              UPSET PICKS EARN 1.5× BONUS
            </span>
            <Link
              href="/scoring"
              className="font-body text-xs text-gold/70 hover:text-gold transition-colors underline underline-offset-2"
            >
              Full scoring details
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
