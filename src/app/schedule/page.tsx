import { createClient } from "@/lib/supabase/server";
import { ROUND_DISPLAY_NAMES, REGION_DISPLAY_NAMES } from "@/lib/utils";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";

export default async function SchedulePage() {
  const supabase = await createClient();

  const { data: games } = await supabase
    .from("games")
    .select(
      `
      *,
      team_a:teams!team_a_id(*),
      team_b:teams!team_b_id(*)
    `
    )
    .order("scheduled_at", { ascending: true });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-8 text-center">
        GAME SCHEDULE
      </h1>
      <ScheduleClient games={games || []} />
    </div>
  );
}
