import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";

export default async function SchedulePage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Use admin client so unauthenticated users can also view games
  const { data: games } = await adminSupabase
    .from("games")
    .select(
      `
      *,
      team_a:teams!team_a_id(*),
      team_b:teams!team_b_id(*)
    `
    )
    .order("scheduled_at", { ascending: true });

  // Fetch user's bracket picks if logged in
  let userPicks: Record<number, number> = {};
  if (user) {
    const { data: bracket } = await supabase
      .from("brackets")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (bracket) {
      const { data: picks } = await supabase
        .from("bracket_picks")
        .select("game_slot, picked_team_id")
        .eq("bracket_id", bracket.id);

      if (picks) {
        for (const p of picks) {
          userPicks[p.game_slot] = p.picked_team_id;
        }
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-4 text-center">
        GAME SCHEDULE
      </h1>
      <p className="text-center text-xs text-navy/50 mb-8">
        {user
          ? "Scores update automatically as games are played. Your bracket picks are highlighted on each matchup."
          : "Scores update automatically as games are played. Log in to see your bracket picks on each matchup."}
      </p>
      <ScheduleClient games={games || []} userPicks={userPicks} />
    </div>
  );
}
