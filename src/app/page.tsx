import Link from "next/link";
import FeatureIcon from "@/components/FeatureIcon";
import SectionDivider from "@/components/SectionDivider";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-navy py-16 sm:py-24">
        <div className="absolute inset-0 crt-effect" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          {/* Animated bracket lines */}
          <div className="flex justify-center items-center gap-6 sm:gap-10 mb-8">
            {/* Left bracket */}
            <div
              className="hidden sm:block w-8 h-24 border-l-3 border-t-3 border-b-3 border-gold/40"
              style={{ animation: "bracket-draw-left 1s ease-out 0.3s both" }}
            />

            {/* Bouncing basketball */}
            <div
              className="css-basketball"
              style={{ animation: "basketball-bounce 1.2s ease-in-out infinite" }}
            >
              <span className="css-basketball-seams" />
            </div>

            {/* Right bracket */}
            <div
              className="hidden sm:block w-8 h-24 border-r-3 border-t-3 border-b-3 border-gold/40"
              style={{ animation: "bracket-draw-right 1s ease-out 0.3s both" }}
            />
          </div>

          <h1
            className="font-display text-gold text-xl sm:text-3xl leading-relaxed mb-6"
            style={{ animation: "title-glow 3s ease-in-out infinite" }}
          >
            MARCH
            <br />
            MADNESS
            <br />
            <span className="text-burnt-orange">2026</span>
          </h1>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link href="/signup" className="retro-btn retro-btn-primary">
              Create Bracket
            </Link>
            <Link href="/leaderboard" className="retro-btn retro-btn-gold">
              Leaderboard
            </Link>
          </div>
        </div>
      </section>

      <SectionDivider />

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
            <FeatureIcon icon="basketball" />
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
            <FeatureIcon icon="trophy" />
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
            <FeatureIcon icon="chart" />
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

      <SectionDivider />

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
            ].map((item, i) => (
              <div
                key={item.round}
                className={`text-center py-2 ${i < 5 ? "md:border-r md:border-gold/20" : ""}`}
              >
                <div className="font-display text-burnt-orange text-sm mb-1">
                  {item.points}
                </div>
                <div className="font-display text-cream text-[0.5rem]">
                  {item.round}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <span className="inline-block font-display text-[0.5rem] bg-burnt-orange text-cream px-4 py-2 border-2 border-burnt-orange/60 shadow-[3px_3px_0_rgba(0,0,0,0.3)]">
              UPSET PICKS EARN 1.5× BONUS
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
