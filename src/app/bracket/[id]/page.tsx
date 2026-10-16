import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import { getTournamentConfig, isPastDeadline, getScoringMultipliers } from "@/lib/tournament";
import type { GameWithTeams, Region } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchBracketSummary(id: string) {
  if (!UUID_RE.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("brackets")
    .select("id, name, score, locked, user_id, updated_at, profiles(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const profile = data.profiles as unknown as { display_name: string | null } | { display_name: string | null }[] | null;
  const ownerName = Array.isArray(profile) ? profile[0]?.display_name ?? null : profile?.display_name ?? null;
  return { ...data, ownerName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bracket = await fetchBracketSummary(id);
  if (!bracket) return { title: "Bracket not found" };
  const owner = bracket.ownerName ?? "Someone";
  const title = `${owner}'s bracket · ${bracket.score ?? 0} pts`;
  const description = `${bracket.name} — ${bracket.score ?? 0} points so far. See every pick and follow along live.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BracketPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  // Use admin client for reads so unauthenticated users can view brackets
  const adminSupabase = createAdminClient();

  // Get current user (optional — viewers may not be logged in)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: bracket, error: bracketError }, config] = await Promise.all([
    adminSupabase.from("brackets").select("*").eq("id", id).maybeSingle(),
    getTournamentConfig(),
  ]);
  if (bracketError) throw new Error(`Failed to load bracket: ${bracketError.message}`);
  if (!bracket) notFound();

  const isOwner = !!user && bracket.user_id === user.id;
  const pastDeadline = isPastDeadline(config);
  const multipliers = getScoringMultipliers(config);

  const [{ data: picks, error: picksError }, { data: games, error: gamesError }, { data: profile }] =
    await Promise.all([
      adminSupabase.from("bracket_picks").select("*").eq("bracket_id", id),
      adminSupabase
        .from("games")
        .select(
          `
          *,
          team_a:teams!team_a_id(*),
          team_b:teams!team_b_id(*),
          winner:teams!winner_id(*)
        `
        )
        .order("game_slot"),
      adminSupabase.from("profiles").select("display_name").eq("id", bracket.user_id).maybeSingle(),
    ]);
  if (picksError) throw new Error(`Failed to load picks: ${picksError.message}`);
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

  const existingPicks = (picks || []).map((p) => ({
    gameSlot: p.game_slot,
    round: p.round,
    pickedTeamId: p.picked_team_id,
    pointsEarned: p.points_earned ?? 0,
    isCorrect: p.is_correct ?? null,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <BracketBuilder
        games={formattedGames}
        bracketId={id}
        existingPicks={existingPicks}
        existingName={bracket.name}
        isLocked={bracket.locked || pastDeadline}
        finalized={!!bracket.locked}
        deadlinePassed={pastDeadline}
        isOwner={isOwner}
        score={bracket.score || 0}
        ownerName={profile?.display_name ?? null}
        userId={user?.id ?? null}
        serverUpdatedAt={bracket.updated_at ?? null}
        multipliers={multipliers}
      />
    </div>
  );
}
