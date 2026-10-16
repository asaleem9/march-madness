import Image from "next/image";
import Link from "next/link";
import type { AchievementType } from "@/types";
import { ACHIEVEMENT_INFO, ACHIEVEMENT_ORDER } from "@/lib/achievements";

export function AchievementsCard({ earned }: { earned: AchievementType[] }) {
  const ordered = ACHIEVEMENT_ORDER.filter((t) => earned.includes(t));

  return (
    <div className="retro-card p-4">
      <h3 className="scoreboard-heading text-[0.6rem] rounded px-3 py-2 mb-3">BADGES</h3>
      {ordered.length === 0 ? (
        <p className="font-body text-xs text-navy/50">
          No badges this year.{" "}
          <Link href="/scoring#badges" className="text-burnt-orange hover:underline">
            See how to earn them
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((t) => {
            const info = ACHIEVEMENT_INFO[t];
            return (
              <li key={t} className="flex items-center gap-3">
                <Image
                  src={info.icon}
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-sm shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-body text-xs font-bold text-navy">{info.label}</div>
                  <div className="font-body text-xs text-navy/60">{info.description}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
