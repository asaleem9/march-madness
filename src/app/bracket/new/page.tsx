import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import { getTournamentConfig, isPastDeadline, getScoringMultipliers } from "@/lib/tournament";
import type { GameWithTeams, Region } from "@/types";

export const metadata: Metadata = {
  title: "Create your bracket",
};

export default async function NewBracketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=%2Fbracket%2Fnew");

  // Enforce one bracket per user — redirect to existing bracket
  const { data: existingBracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existingBracket) {
    redirect(`/bracket/${existingBracket.id}`);
  }

  const config = await getTournamentConfig();
  const year = config?.year ?? new Date().getFullYear();

  if (isPastDeadline(config)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="retro-card p-6 sm:p-8 space-y-4 text-center">
          <h1 className="font-display text-navy text-sm">BRACKETS ARE CLOSED FOR {year}</h1>
          <p className="font-body text-sm text-navy/70">
            The lock deadline has passed, so new brackets can&apos;t be created this year. You can still
            follow the tournament and see how everyone else is doing.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/leaderboard" className="retro-btn retro-btn-primary">
              Leaderboard
            </Link>
            <Link href="/schedule" className="retro-btn retro-btn-secondary">
              Schedule
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fetch all games with teams
  const { data: games, error: gamesError } = await supabase
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
  if (gamesError) throw new Error(`Failed to load games: ${gamesError.message}`);

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
      <p className="font-display text-navy/60 text-[0.6rem] mb-6">CREATE NEW BRACKET</p>
      <BracketBuilder
        games={formattedGames}
        isLocked={false}
        isOwner={true}
        defaultName={defaultBracketName}
        userId={user.id}
        ownerName={typeof displayName === "string" ? displayName : null}
        multipliers={getScoringMultipliers(config)}
      />
    </div>
  );
}
