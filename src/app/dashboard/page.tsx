import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch user's brackets
  const { data: brackets } = await supabase
    .from("brackets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch active wagers
  const { data: wagers } = await supabase
    .from("wagers")
    .select("*, challenger:profiles!challenger_id(display_name), opponent:profiles!opponent_id(display_name)")
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .in("status", ["pending", "accepted"])
    .limit(5);

  // Fetch leaderboard top 5
  const { data: topBrackets } = await supabase
    .from("brackets")
    .select("*, profiles!inner(display_name, avatar_url)")
    .eq("is_primary", true)
    .eq("locked", true)
    .order("score", { ascending: false })
    .limit(5);

  // Fetch tournament config
  const { data: config } = await supabase
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .single();

  const bracketLocked = config
    ? new Date() > new Date(config.bracket_lock_deadline)
    : false;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-2">
        Welcome, {profile?.display_name || "Player"}
      </h1>
      <p className="text-xs text-navy/50 mb-8">
        {brackets && brackets.length > 0 && brackets[0].locked
          ? "Your bracket is locked in. Check the schedule for live scores and the leaderboard to see where you stand."
          : brackets && brackets.length > 0
          ? "Fill out all 63 picks and finalize your bracket before the deadline. Once locked, you can challenge friends to wagers."
          : "Get started by creating your bracket below. Pick winners for every game, then challenge your friends."}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brackets */}
        <div className="lg:col-span-2 retro-card p-6">
          <div className="mb-4">
            <h2 className="scoreboard-heading text-[0.55rem] rounded px-3 py-2">
              MY BRACKETS
            </h2>
          </div>

          {brackets && brackets.length > 0 ? (
            <div className="space-y-3">
              {brackets.map((bracket) => (
                <Link
                  key={bracket.id}
                  href={`/bracket/${bracket.id}`}
                  className="block border-2 border-navy/20 p-4 hover:border-navy transition-colors rounded"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-body text-sm font-bold">
                        {bracket.name}
                      </span>
                      {bracket.is_primary && (
                        <span className="ml-2 text-[0.5rem] font-display bg-gold text-navy px-2 py-0.5 rounded">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-sm text-forest">
                        {bracket.score || 0}
                      </div>
                      <div className="text-[0.55rem] text-navy/50">points</div>
                    </div>
                  </div>
                  <span
                    className={`text-[0.5rem] font-display mt-1 block ${
                      bracket.locked
                        ? "text-forest"
                        : "text-burnt-orange"
                    }`}
                  >
                    {bracket.locked ? "FINALIZED" : "DRAFT"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-navy/60 mb-4">
                You haven&apos;t created a bracket yet.
              </p>
              <Link href="/bracket/new" className="retro-btn retro-btn-primary inline-block text-center">
                Create Bracket
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Mini Leaderboard */}
          <div className="retro-card p-4">
            <h3 className="scoreboard-heading text-[0.5rem] rounded px-3 py-2 mb-3">
              LEADERBOARD
            </h3>
            {topBrackets && topBrackets.length > 0 ? (
              <div className="space-y-2">
                {topBrackets.map((b, i) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[0.5rem] text-gold w-4">
                        {i + 1}
                      </span>
                      <span className="truncate max-w-[120px]">
                        {(b as Record<string, unknown>).profiles
                          ? ((b as Record<string, unknown>).profiles as Record<string, unknown>).display_name as string
                          : "Unknown"}
                      </span>
                    </div>
                    <span className="font-bold text-forest">{b.score}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-navy/50">No brackets yet</p>
            )}
            <Link
              href="/leaderboard"
              className="block text-center text-[0.55rem] text-burnt-orange mt-3 hover:underline"
            >
              View Full Leaderboard
            </Link>
          </div>

          {/* Active Wagers */}
          <div className="retro-card p-4">
            <h3 className="scoreboard-heading text-[0.5rem] rounded px-3 py-2 mb-3">
              WAGERS
            </h3>
            {wagers && wagers.length > 0 ? (
              <div className="space-y-2">
                {wagers.map((w) => (
                  <div key={w.id} className="text-xs border-b border-navy/10 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="truncate max-w-[140px]">
                        {w.stakes}
                      </span>
                      <span
                        className={`font-display text-[0.45rem] px-2 py-0.5 rounded ${
                          w.status === "pending"
                            ? "bg-gold/20 text-gold"
                            : "bg-forest/20 text-forest"
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-navy/50">No active wagers</p>
            )}
            <Link
              href="/wagers"
              className="block text-center text-[0.55rem] text-burnt-orange mt-3 hover:underline"
            >
              Manage Wagers
            </Link>
          </div>

          {/* Tournament Status */}
          {config && (
            <div className="retro-card p-4">
              <h3 className="scoreboard-heading text-[0.5rem] rounded px-3 py-2 mb-3">
                TOURNAMENT
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-navy/60">Phase:</span>
                  <span className="font-bold capitalize">
                    {config.active_phase?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-navy/60">Brackets Lock:</span>
                  <span className={bracketLocked ? "text-burnt-orange" : "text-forest"}>
                    {bracketLocked
                      ? "Locked"
                      : new Date(config.bracket_lock_deadline).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
