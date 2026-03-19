import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = createAdminClient();

  // Fetch all primary brackets with profiles (admin client bypasses RLS so
  // unauthenticated visitors can see the leaderboard)
  const { data: brackets } = await supabase
    .from("brackets")
    .select("*, profiles!inner(id, display_name, avatar_url)")
    .eq("is_primary", true)
    .eq("locked", true)
    .order("score", { ascending: false });

  // Fetch achievements for badge display
  const { data: achievements } = await supabase
    .from("user_achievements")
    .select("*");

  const achievementsByUser = new Map<string, string[]>();
  achievements?.forEach((a) => {
    const existing = achievementsByUser.get(a.user_id) || [];
    existing.push(a.achievement_type);
    achievementsByUser.set(a.user_id, existing);
  });

  const achievementLabels: Record<string, { label: string; icon: string }> = {
    cinderella: { label: "Cinderella Story", icon: "/images/badges/cinderella.png" },
    perfect_region: { label: "Perfect Region", icon: "/images/badges/perfect-region.png" },
    chalk_walk: { label: "Chalk Walk", icon: "/images/badges/chalk-walk.png" },
    bracket_genius: { label: "Bracket Genius", icon: "/images/badges/bracket-genius.png" },
    fortune_teller: { label: "Fortune Teller", icon: "/images/badges/fortune-teller.png" },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-4 text-center">
        LEADERBOARD
      </h1>
      <p className="text-center text-xs text-navy/50 mb-8">
        Points are awarded as games finish. Later rounds are worth more, and upset picks earn a 1.5x bonus.
      </p>

      <div className="retro-card overflow-hidden">
        <div className="scoreboard-heading text-[0.55rem] flex justify-between px-6">
          <span>RANK</span>
          <span>PLAYER</span>
          <span>SCORE</span>
        </div>

        {brackets && brackets.length > 0 ? (
          <div className="divide-y-2 divide-navy/10">
            {brackets.map((bracket, index) => {
              const profile = bracket.profiles as unknown as {
                id: string;
                display_name: string;
                avatar_url: string | null;
              };
              // Tied players share the same rank number
              let rankNum = index + 1;
              for (let i = index - 1; i >= 0; i--) {
                if (brackets[i].score === bracket.score) rankNum = i + 1;
                else break;
              }
              const rank = `#${rankNum}`;
              const userAchievements =
                achievementsByUser.get(profile.id) || [];

              return (
                <div
                  key={bracket.id}
                  className={`flex items-center justify-between px-6 py-4 ${
                    rankNum <= 3 ? "bg-gold/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-[60px]">
                    {rankNum <= 3 ? (
                      <Image
                        src={`/images/medals/${rankNum === 1 ? "gold" : rankNum === 2 ? "silver" : "bronze"}.png`}
                        alt={`Rank ${rankNum}`}
                        width={32}
                        height={32}
                      />
                    ) : (
                      <span className="font-display text-sm w-8 text-navy/40">
                        {rank}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full border-2 border-navy bg-cream flex items-center justify-center font-display text-[0.4rem]"
                      style={
                        profile.avatar_url
                          ? {
                              backgroundImage: `url(${profile.avatar_url})`,
                              backgroundSize: "cover",
                            }
                          : {}
                      }
                    >
                      {!profile.avatar_url &&
                        (profile.display_name?.[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <div className="font-body text-sm font-bold">
                        {profile.display_name || "Anonymous"}
                      </div>
                      {userAchievements.length > 0 && (
                        <div className="flex gap-1 mt-0.5">
                          {userAchievements.map((a) => (
                            <Image
                              key={a}
                              src={achievementLabels[a]?.icon || ""}
                              alt={achievementLabels[a]?.label || a}
                              title={achievementLabels[a]?.label}
                              width={20}
                              height={20}
                              className="rounded-sm"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-display text-sm text-forest">
                      {bracket.score || 0}
                    </div>
                    <Link
                      href={`/bracket/${bracket.id}`}
                      className="text-[0.5rem] text-burnt-orange hover:underline"
                    >
                      View Bracket
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-navy/50 text-sm">
            No brackets submitted yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}
