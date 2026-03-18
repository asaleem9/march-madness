import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import type { GameWithTeams, Region } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BracketPage({ params }: Props) {
  const { id } = await params;

  // Use admin client for reads so unauthenticated users can view brackets
  const adminSupabase = createAdminClient();

  // Get current user (optional — viewers may not be logged in)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch the bracket
  const { data: bracket } = await adminSupabase
    .from("brackets")
    .select("*")
    .eq("id", id)
    .single();

  if (!bracket) notFound();

  const isOwner = !!user && bracket.user_id === user.id;

  // Fetch bracket picks
  const { data: picks } = await adminSupabase
    .from("bracket_picks")
    .select("*")
    .eq("bracket_id", id);

  const isLocked = bracket.locked;

  // Fetch all games with teams
  const { data: games } = await adminSupabase
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

  function mapTeam(t: Record<string, unknown> | null) {
    if (!t) return null;
    return {
      id: t.id as number,
      name: t.name as string,
      abbreviation: t.abbreviation as string,
      seed: t.seed as number,
      region: t.region as Region,
      record: t.record as string,
      logoUrl: (t.logo_url as string) || null,
      eliminated: t.eliminated as boolean,
      espnId: (t.espn_id as string) || null,
    };
  }

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
    teamA: mapTeam(g.team_a as Record<string, unknown> | null),
    teamB: mapTeam(g.team_b as Record<string, unknown> | null),
    winner: mapTeam(g.winner as Record<string, unknown> | null),
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
