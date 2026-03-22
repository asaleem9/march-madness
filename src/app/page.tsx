import Link from "next/link";
import FeatureIcon from "@/components/FeatureIcon";
import SectionDivider from "@/components/SectionDivider";

export default function HomePage() {
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
              <span className="text-burnt-orange">2026</span>
            </h1>
          </div>

          {/* Tournament bracket mini-graphic */}
          <div className="flex justify-center mb-8">
            <svg
              viewBox="0 0 280 60"
              className="w-64 sm:w-80 h-auto"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
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
            <Link href="/signup" className="retro-btn retro-btn-primary">
              Create Bracket
            </Link>
            <Link href="/leaderboard" className="retro-btn retro-btn-gold">
              Leaderboard
            </Link>
            <Link href="/schedule" className="retro-btn retro-btn-secondary">
              Live Scores
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
