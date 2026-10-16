import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTournamentConfig } from "@/lib/tournament";
import { ScheduleClient, type ScheduleGame } from "@/components/schedule/ScheduleClient";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const [
    {
      data: { user },
    },
    config,
    { data: games, error: gamesError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    getTournamentConfig(),
    // Admin client so logged-out visitors can view the schedule too.
    adminSupabase
      .from("games")
      .select(
        `
        *,
        team_a:teams!team_a_id(*),
        team_b:teams!team_b_id(*)
      `
      )
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("game_slot", { ascending: true }),
  ]);
  if (gamesError) throw new Error(`Failed to load schedule: ${gamesError.message}`);

  // The current user's picks, so their team is highlighted on each matchup.
  const userPicks: Record<number, number> = {};
  if (user) {
    const { data: bracket, error: bracketError } = await supabase
      .from("brackets")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (bracketError) throw new Error(`Failed to load bracket: ${bracketError.message}`);

    if (bracket) {
      const { data: picks, error: picksError } = await supabase
        .from("bracket_picks")
        .select("game_slot, picked_team_id")
        .eq("bracket_id", bracket.id);
      if (picksError) throw new Error(`Failed to load picks: ${picksError.message}`);

      for (const p of picks ?? []) {
        userPicks[p.game_slot] = p.picked_team_id;
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-4 text-center">GAME SCHEDULE</h1>
      <p className="text-center text-xs text-navy/50 mb-8">
        {user
          ? "Your bracket picks are highlighted on each matchup."
          : "Log in to see your bracket picks on each matchup."}
      </p>
      <ScheduleClient
        games={(games ?? []) as unknown as ScheduleGame[]}
        userPicks={userPicks}
        isLoggedIn={!!user}
        lastUpdatedAt={config?.last_score_update_at ?? null}
      />
    </div>
  );
}
