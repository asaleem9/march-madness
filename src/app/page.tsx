import Link from "next/link";
import { HeroDynamic } from "@/components/HeroDynamic";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-navy py-12 sm:py-20">
        <div className="absolute inset-0 crt-effect" />
        <div className="relative z-10 max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="text-center lg:text-left">
              <h1 className="font-display text-gold text-lg sm:text-2xl leading-relaxed mb-6">
                MARCH
                <br />
                MADNESS
                <br />
                <span className="text-burnt-orange">2026</span>
              </h1>
              <p className="font-body text-cream text-sm mb-8 max-w-md mx-auto lg:mx-0">
                Fill out your bracket. Challenge your friends. Track every
                buzzer-beater in retro style.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/signup" className="retro-btn retro-btn-primary">
                  Create Bracket
                </Link>
                <Link href="/leaderboard" className="retro-btn retro-btn-gold">
                  Leaderboard
                </Link>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                <HeroDynamic />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-navy text-center text-sm mb-12">
          HOW IT WORKS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="retro-card p-6">
            <div className="scoreboard-heading text-center text-[0.55rem] mb-4 rounded-t">
              STEP 1
            </div>
            <h3 className="font-display text-[0.65rem] text-navy mb-3">
              Pick Your Winners
            </h3>
            <p className="font-body text-xs text-navy/70">
              Fill out your bracket with all 63 picks before the First Round
              tips off. Pick upsets for bonus points.
            </p>
          </div>
          <div className="retro-card p-6">
            <div className="scoreboard-heading text-center text-[0.55rem] mb-4 rounded-t">
              STEP 2
            </div>
            <h3 className="font-display text-[0.65rem] text-navy mb-3">
              Challenge Friends
            </h3>
            <p className="font-body text-xs text-navy/70">
              Create IOU wagers with other players. Loser buys dinner, does a
              dare, or whatever you agree on.
            </p>
          </div>
          <div className="retro-card p-6">
            <div className="scoreboard-heading text-center text-[0.55rem] mb-4 rounded-t">
              STEP 3
            </div>
            <h3 className="font-display text-[0.65rem] text-navy mb-3">
              Track Live Results
            </h3>
            <p className="font-body text-xs text-navy/70">
              Watch your bracket update in real-time. Climb the leaderboard and
              earn badges for epic picks.
            </p>
          </div>
        </div>
      </section>

      {/* Scoring Section */}
      <section className="bg-navy py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-display text-gold text-center text-sm mb-8">
            SCORING
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {[
              { round: "R1", points: 10 },
              { round: "R2", points: 20 },
              { round: "S16", points: 40 },
              { round: "E8", points: 80 },
              { round: "F4", points: 160 },
              { round: "CHAMP", points: 320 },
            ].map((item) => (
              <div key={item.round} className="text-center">
                <div className="font-display text-burnt-orange text-sm mb-1">
                  {item.points}
                </div>
                <div className="font-display text-cream text-[0.5rem]">
                  {item.round}
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-cream/60 text-xs mt-6">
            Upset picks earn a 1.5x bonus multiplier
          </p>
        </div>
      </section>
    </div>
  );
}
