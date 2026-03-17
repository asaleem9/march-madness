import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import type { GameWithTeams } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BracketPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch the bracket
  const { data: bracket } = await supabase
    .from("brackets")
    .select("*")
    .eq("id", id)
    .single();

  if (!bracket) notFound();

  const isOwner = bracket.user_id === user.id;

  // Fetch bracket picks
  const { data: picks } = await supabase
    .from("bracket_picks")
    .select("*")
    .eq("bracket_id", id);

  // Check lock status
  const { data: config } = await supabase
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .single();

  const isLocked =
    bracket.locked ||
    (config ? new Date() > new Date(config.bracket_lock_deadline) : false);

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

  const existingPicks = (picks || []).map((p) => ({
    gameSlot: p.game_slot,
    round: p.round,
    pickedTeamId: p.picked_team_id,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <BracketBuilder
        games={formattedGames}
        bracketId={id}
        existingPicks={existingPicks}
        existingName={bracket.name}
        isLocked={isLocked}
        isOwner={isOwner}
        score={bracket.score || 0}
      />
    </div>
  );
}
