import type { Metadata } from "next";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "Scoring - March Madness Bracket Challenge",
  description: "How bracket scoring works: points per round, upset bonuses, and examples.",
};

const rounds = [
  { name: "First Four", short: "FF", points: 5, games: 4 },
  { name: "First Round", short: "R1", points: 10, games: 32 },
  { name: "Second Round", short: "R2", points: 20, games: 16 },
  { name: "Sweet 16", short: "S16", points: 40, games: 8 },
  { name: "Elite Eight", short: "E8", points: 80, games: 4 },
  { name: "Final Four", short: "F4", points: 160, games: 2 },
  { name: "Championship", short: "CHAMP", points: 320, games: 1 },
];

const maxPossible = rounds.reduce((sum, r) => sum + r.points * r.games, 0);

const examples = [
  {
    label: "Correct pick in Round 1",
    seed: "(1) Duke over (16) Siena",
    base: 10,
    multiplier: "1x",
    total: 10,
  },
  {
    label: "Upset pick in Round 1",
    seed: "(12) McNeese over (5) Vanderbilt",
    base: 10,
    multiplier: "1.5x",
    total: 15,
  },
  {
    label: "Correct pick in Sweet 16",
    seed: "(1) Arizona over (4) Arkansas",
    base: 40,
    multiplier: "1x",
    total: 40,
  },
  {
    label: "Upset pick in Elite Eight",
    seed: "(3) Illinois over (2) Houston",
    base: 80,
    multiplier: "1.5x",
    total: 120,
  },
];

export default function ScoringPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <section className="bg-navy py-10">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="font-display text-gold text-lg sm:text-xl mb-3">
            SCORING
          </h1>
          <p className="font-body text-cream/70 text-sm max-w-xl mx-auto">
            Points increase each round. Pick upsets for bonus points.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Points Per Round */}
      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="font-display text-navy text-xs sm:text-sm text-center mb-8">
          POINTS PER ROUND
        </h2>
        <div className="retro-card overflow-hidden">
          <div className="scoreboard-heading text-center text-[0.55rem] py-2">
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
                  <span className="font-body text-navy text-xs sm:text-sm">
                    {round.name}
                  </span>
                </div>
                <span className="font-body text-navy/40 text-xs">
                  {round.games} game{round.games !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="bg-navy/5 px-4 sm:px-6 py-3 flex items-center justify-between border-t border-navy/10">
            <span className="font-display text-navy text-[0.6rem]">
              MAX POSSIBLE
            </span>
            <span className="font-display text-forest text-xs sm:text-sm">
              {maxPossible.toLocaleString()} pts
            </span>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Upset Bonus */}
      <section className="bg-navy py-12">
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
                <p className="font-display text-burnt-orange text-xs mb-1">
                  1.5x MULTIPLIER
                </p>
                <p className="font-body text-navy/70 text-xs">
                  When a higher-seeded team beats a lower-seeded team (e.g. a 12 seed beats a 5 seed), the base points are multiplied by 1.5x. The upset bonus rewards bold picks.
                </p>
              </div>
            </div>
            <div className="font-body text-navy/50 text-xs border-t border-navy/10 pt-3">
              An upset is any game where the winning team has a higher seed number than the losing team. Seed 1 is the best, seed 16 is the lowest.
            </div>
          </div>

          {/* Examples */}
          <h3 className="font-display text-cream text-[0.6rem] text-center mb-4">
            EXAMPLES
          </h3>
          <div className="space-y-3">
            {examples.map((ex) => (
              <div key={ex.label} className="retro-card bg-cream/95 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-body text-navy text-xs font-bold">
                    {ex.label}
                  </span>
                  <span className="font-display text-forest text-xs">
                    {ex.total} pts
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body text-navy/50 text-xs">
                    {ex.seed}
                  </span>
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
      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="font-display text-navy text-xs sm:text-sm text-center mb-8">
          ADDITIONAL RULES
        </h2>
        <div className="space-y-4">
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">
              BRACKET LOCK
            </h3>
            <p className="font-body text-navy/70 text-xs">
              All brackets lock when the First Round tips off. No changes can be made after the deadline. Make sure your picks are finalized before then.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">
              INCORRECT PICKS
            </h3>
            <p className="font-body text-navy/70 text-xs">
              An incorrect pick earns 0 points. If a team you picked gets eliminated in an earlier round, all your later-round picks for that team also score 0.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">
              FIRST FOUR
            </h3>
            <p className="font-body text-navy/70 text-xs">
              The four play-in games are worth 5 points each. These games determine the final teams in the 64-team bracket. Upset bonuses apply here too.
            </p>
          </div>
          <div className="retro-card p-4">
            <h3 className="font-display text-burnt-orange text-[0.6rem] mb-2">
              LEADERBOARD
            </h3>
            <p className="font-body text-navy/70 text-xs">
              Your total score is the sum of points from all correct picks. The leaderboard ranks all brackets by total score. Ties are broken by whoever has more correct picks in later rounds.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
