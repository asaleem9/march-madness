import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import type { GameWithTeams } from "@/types";

export default async function NewBracketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if brackets are locked
  const { data: config } = await supabase
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .single();

  const isLocked = config
    ? new Date() > new Date(config.bracket_lock_deadline)
    : false;

  if (isLocked) {
    redirect("/dashboard");
  }

  // Fetch all games with teams
  const { data: games } = await supabase
    .from("games")
    .select(
      `
      *,
      team_a:teams!team_a_id(*),
      team_b:teams!team_b_id(*),
      winner:teams!winner_id(*)
    `
    )
    .order("game_slot");

  const formattedGames: GameWithTeams[] = (games || []).map((g) => ({
    id: g.id,
    round: g.round,
    region: g.region,
    gameSlot: g.game_slot,
    nextGameSlot: g.next_game_slot,
    slotPosition: g.slot_position,
    teamAId: g.team_a_id,
    teamBId: g.team_b_id,
    winnerId: g.winner_id,
    scoreA: g.score_a,
    scoreB: g.score_b,
    scheduledAt: g.scheduled_at,
    status: g.status,
    espnGameId: g.espn_game_id,
    teamA: g.team_a || null,
    teamB: g.team_b || null,
    winner: g.winner || null,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-6">
        CREATE NEW BRACKET
      </h1>
      <BracketBuilder
        games={formattedGames}
        isLocked={isLocked}
        isOwner={true}
      />
    </div>
  );
}
