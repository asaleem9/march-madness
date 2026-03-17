import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import type { GameWithTeams, Region } from "@/types";

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

  // Enforce one bracket per user — redirect to existing bracket
  const { data: existingBracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (existingBracket) {
    redirect(`/bracket/${existingBracket.id}`);
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

  const displayName =
    user.user_metadata?.display_name || user.email?.split("@")[0] || "My";
  const defaultBracketName = `${displayName}'s Bracket`;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-navy text-sm mb-6">
        CREATE NEW BRACKET
      </h1>
      <BracketBuilder
        games={formattedGames}
        isLocked={isLocked}
        isOwner={true}
        defaultName={defaultBracketName}
      />
    </div>
  );
}
