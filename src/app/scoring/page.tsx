import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SectionDivider from "@/components/SectionDivider";
import { getScoringMultipliers, getSeason } from "@/lib/tournament";
import { OPENING_ROUND_GAMES, REQUIRED_PICKS } from "@/lib/tournament-structure";
import { ACHIEVEMENT_INFO, ACHIEVEMENT_ORDER } from "@/lib/achievements";
import { formatEastern } from "@/components/dashboard/helpers";

export const metadata: Metadata = {
  title: "Scoring",
  description:
    "How bracket scoring works: points per round, upset bonuses, wagers, badges, and the lock deadline.",
};

export default async function ScoringPage() {
  const { config, displayYear, offSeason, upcoming } = await getSeason();
  const m = getScoringMultipliers(config);
  // Off-season: last year's deadline is stale, so show next year's planned lock instead.
  const deadline = offSeason ? (upcoming?.lockDeadline ?? null) : (config?.bracket_lock_deadline ?? null);
  const wagerDeadline = config?.wager_creation_deadline ?? null;

  const rounds = [
    { name: "First Round", short: "R1", points: m.first_round, games: 32 },
    { name: "Second Round", short: "R2", points: m.second_round, games: 16 },
    { name: "Sweet 16", short: "S16", points: m.sweet_16, games: 8 },
    { name: "Elite Eight", short: "E8", points: m.elite_eight, games: 4 },
    { name: "Final Four", short: "F4", points: m.final_four, games: 2 },
    { name: "Championship", short: "CHAMP", points: m.championship, games: 1 },
  ];
  const maxPossible = rounds.reduce((sum, r) => sum + r.points * r.games, 0);
  const upset = (base: number) => Math.round(base * 1.5);

  const examples = [
    {
      label: "Correct pick in the First Round",
      seed: "(1) seed over (16) seed",
      base: m.first_round,
      multiplier: "1x",
      total: m.first_round,
    },
    {
      label: "Upset pick in the First Round",
      seed: "(12) seed over (5) seed",
      base: m.first_round,
      multiplier: "1.5x",
      total: upset(m.first_round),
    },
    {
      label: "Correct pick in the Sweet 16",
      seed: "(1) seed over (4) seed",
      base: m.sweet_16,
      multiplier: "1x",
      total: m.sweet_16,
    },
    {
      label: "Upset pick in the Elite Eight",
      seed: "(3) seed over (2) seed",
      base: m.elite_eight,
      multiplier: "1.5x",
      total: upset(m.elite_eight),
    },
  ];

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <section className="bg-navy py-10">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="font-display text-gold text-lg sm:text-xl mb-3">SCORING</h1>
          <p className="font-body text-cream/70 text-sm max-w-xl mx-auto">
            Points increase each round. Pick upsets for bonus points.
          </p>
          <nav aria-label="On this page" className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {[
              ["#rounds", "Rounds"],
              ["#upsets", "Upsets"],
              ["#rules", "Rules"],
              ["#wagers", "Wagers"],
              ["#badges", "Badges"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="font-body text-xs text-gold/70 hover:text-gold underline underline-offset-2"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <SectionDivider />

      {/* Points Per Round */}
      <section id="rounds" className="max-w-3xl mx-auto px-4 py-12 scroll-mt-20">
        <h2 className="font-display text-navy text-xs sm:text-sm text-center mb-8">
          POINTS PER ROUND
        </h2>
        <div className="retro-card overflow-hidden">
          <div className="scoreboard-heading text-center text-[0.6rem] py-2">
            CORRECT PICK = BASE POINTS
          </div>
          <div className="divide-y divide-navy/10">
            {rounds.map((round) => (
              <div
                key={round.short}
                className="flex items-center justify-between px-4 sm:px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-display text-burnt-orange text-xs sm:text-sm w-12 sm:w-16 text-right">
                    {round.points}
                  </span>
                  <span className="font-body text-navy text-xs sm:text-sm">{round.name}</span>
                </div>
                <span className="font-body text-navy/40 text-xs">
                  {round.games} game{round.games !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="bg-navy/5 px-4 sm:px-6 py-3 flex items-center justify-between border-t border-navy/10">
            <span className="font-display text-navy text-[0.6rem]">
              MAX POSSIBLE ({REQUIRED_PICKS} PICKS)
            </span>
            <span className="font-display text-forest text-xs sm:text-sm">
              {maxPossible.toLocaleString()} pts
            </span>
          </div>
        </div>
        <p className="font-body text-navy/50 text-xs text-center mt-4">
          Max possible excludes upset bonuses. The {OPENING_ROUND_GAMES} Opening Round play-ins aren&apos;t picked and
          score nothing.
        </p>
      </section>

      <SectionDivider />

      {/* Upset Bonus */}
      <section id="upsets" className="bg-navy py-12 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="font-display text-gold text-xs sm:text-sm text-center mb-8">
            UPSET BONUS
          </h2>
          <div className="retro-card bg-cream/95 p-6 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="css-basketball" style={{ width: 24, height: 24 }}>
                <span className="css-basketball-seams" />
              </div>
              <div>
                <p className="font-display text-burnt-orange text-xs mb-1">1.5x MULTIPLIER</p>
                <p className="font-body text-navy/70 text-xs">
                  When a team with the bigger seed number beats a better seed (say, a 12 seed over a
                  5 seed), the base points are multiplied by 1.5x. The upset bonus rewards bold
                  picks.
                </p>
              </div>
            </div>
            <div className="font-body text-navy/50 text-xs border-t border-navy/10 pt-3">
              An upset is any game where the winner&apos;s seed number is bigger than the loser&apos;s.
              Seed 1 is the best, seed 16 the worst. Equal seeds (possible from the Final Four on)
              are never an upset.
            </div>
          </div>

          {/* Examples */}
          <h3 className="font-display text-cream text-[0.6rem] text-center mb-4">EXAMPLES</h3>
          <div className="space-y-3">
            {examples.map((ex) => (
              <div key={ex.label} className="retro-card bg-cream/95 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-body text-navy text-xs font-bold">{ex.label}</span>
                  <span className="font-display text-forest text-xs">{ex.total} pts</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body text-navy/50 text-xs">{ex.seed}</span>
                  <span className="font-body text-navy/40 text-xs">
                    {ex.base} x {ex.multiplier}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Additional Rules */}
      <section id="rules" className="max-w-3xl mx-auto px-4 py-12 scroll-mt-20">
        <h2 className="font-display text-navy text-xs sm:text-sm text-center mb-8">
          ADDITIONAL RULES
        </h2>
        <div className="space-y-4">
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">BRACKET LOCK</h3>
            <p className="font-body text-navy/70 text-xs">
              Brackets lock when the First Round tips off
              {deadline ? (
                <>
                  {" "}
                  — <span className="font-bold text-navy">{formatEastern(deadline)}</span> for{" "}
                  {displayYear}
                  {offSeason ? " (tentative)" : ""}
                </>
              ) : null}
              . No changes can be made after the deadline, so finalize your picks before then.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">
              FINALIZE BEFORE THE DEADLINE
            </h3>
            <p className="font-body text-navy/70 text-xs">
              Hit Finalize once all {REQUIRED_PICKS} picks are in. A complete draft that was never
              finalized is auto-locked at the deadline so it still counts. An incomplete draft
              doesn&apos;t — it&apos;s left off the leaderboard.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">OPENING ROUND</h3>
            <p className="font-body text-navy/70 text-xs">
              The {OPENING_ROUND_GAMES} play-in games aren&apos;t picked. Where a play-in feeds a first-round game, the
              tile shows both teams as <span className="font-bold text-navy">A / B</span> — either
              is a valid pick. Once the play-in is final your pick resolves to the winner, so you
              never lose points on a play-in you couldn&apos;t have known.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">INCORRECT PICKS</h3>
            <p className="font-body text-navy/70 text-xs">
              An incorrect pick earns 0 points. If a team you picked gets eliminated in an earlier
              round, all your later-round picks for that team also score 0.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">LEADERBOARD</h3>
            <p className="font-body text-navy/70 text-xs">
              Your total score is the sum of points from all correct picks. The leaderboard ranks
              every finalized bracket by total score. Tied players share a rank.
            </p>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Wagers */}
      <section id="wagers" className="bg-navy py-12 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="font-display text-gold text-xs sm:text-sm text-center mb-8">
            HOW WAGERS WORK
          </h2>
          <ol className="space-y-3">
            {[
              [
                "Create",
                `Challenge another player to an IOU wager — dinner, a dare, whatever you agree on — any time before the wager deadline${
                  wagerDeadline ? ` (${formatEastern(wagerDeadline)})` : ""
                }. Your bracket doesn't need to be finalized first.`,
              ],
              [
                "Accept",
                "Your opponent accepts with their own bracket (or declines). Pending wagers show up on their dashboard.",
              ],
              [
                "Resolve",
                "When the championship is final, the wager is settled by comparing the two brackets' final scores. Higher score wins.",
              ],
              ["Ties push", "If both brackets finish on the same score, the wager is a push — nobody owes anything."],
            ].map(([title, body], i) => (
              <li key={title} className="retro-card bg-cream/95 px-4 py-3 flex gap-4">
                <span className="font-display text-burnt-orange text-xs shrink-0 w-6">{i + 1}</span>
                <div>
                  <p className="font-display text-navy text-[0.6rem] mb-1">{title.toUpperCase()}</p>
                  <p className="font-body text-navy/70 text-xs">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-center mt-6">
            <Link
              href="/wagers"
              className="font-body text-xs text-gold/70 hover:text-gold underline underline-offset-2"
            >
              Go to wagers
            </Link>
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Badges */}
      <section id="badges" className="max-w-3xl mx-auto px-4 py-12 scroll-mt-20">
        <h2 className="font-display text-navy text-xs sm:text-sm text-center mb-3">BADGES</h2>
        <p className="font-body text-navy/60 text-xs text-center mb-8 max-w-xl mx-auto">
          Awarded once the championship is final. They show next to your name on the leaderboard
          and on your profile.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ACHIEVEMENT_ORDER.map((type) => {
            const info = ACHIEVEMENT_INFO[type];
            return (
              <li key={type} className="retro-card p-4 flex items-center gap-4">
                <Image
                  src={info.icon}
                  alt=""
                  width={48}
                  height={48}
                  className="rounded-sm shrink-0"
                />
                <div>
                  <p className="font-display text-navy text-[0.6rem] mb-1">
                    {info.label.toUpperCase()}
                  </p>
                  <p className="font-body text-navy/70 text-xs">{info.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
