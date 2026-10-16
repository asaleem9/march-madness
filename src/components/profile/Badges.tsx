import Image from "next/image";
import { ACHIEVEMENT_INFO, ACHIEVEMENT_ORDER } from "@/lib/achievements";
import type { AchievementType } from "@/types";

/** All five badges: earned ones in colour, the rest greyed with their criteria. */
export function Badges({ earned }: { earned: AchievementType[] }) {
  const earnedSet = new Set(earned);
  return (
    <section className="retro-card p-6 mt-6" aria-labelledby="badges-heading">
      <h2 id="badges-heading" className="scoreboard-heading text-[0.6rem] rounded mb-1">
        BADGES
      </h2>
      <p className="font-body text-xs text-navy/60 mb-4">
        {earnedSet.size} of {ACHIEVEMENT_ORDER.length} earned. Badges are awarded after the
        championship.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ACHIEVEMENT_ORDER.map((type) => {
          const info = ACHIEVEMENT_INFO[type];
          const isEarned = earnedSet.has(type);
          return (
            <li
              key={type}
              className={`border-2 p-3 rounded flex items-center gap-3 ${
                isEarned ? "border-gold bg-gold/10" : "border-navy/20 bg-navy/5"
              }`}
            >
              <Image
                src={info.icon}
                alt=""
                width={48}
                height={48}
                className={`rounded shrink-0 ${isEarned ? "" : "grayscale opacity-40"}`}
              />
              <div className="min-w-0">
                <div
                  className={`font-display text-[0.6rem] ${isEarned ? "text-gold" : "text-navy/50"}`}
                >
                  {info.label}
                  {!isEarned && <span className="sr-only"> (locked)</span>}
                </div>
                <div className="font-body text-xs text-navy/60 mt-1">{info.description}</div>
                {!isEarned && (
                  <div className="font-body text-[0.65rem] text-navy/40 mt-1 uppercase tracking-wide">
                    Locked
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
