import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bracketPicks, brackets, games, teams } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import { getTournamentConfig, isPastDeadline, getScoringMultipliers } from "@/lib/tournament";
import type { GameWithTeams, Team } from "@/types";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Brackets are public: anyone with the link can view one, so no session is needed to read. */
async function fetchBracket(id: string) {
  if (!UUID_RE.test(id)) return null;
  const bracket = await db.query.brackets.findFirst({
    where: eq(brackets.id, id),
    with: { user: { columns: { displayName: true } } },
  });
  return bracket ?? null;
}

/** Drizzle's team row is already the `Team` shape apart from the nullable `eliminated` flag. */
function toTeam(t: typeof teams.$inferSelect | null): Team | null {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    seed: t.seed,
    region: t.region,
    record: t.record,
    logoUrl: t.logoUrl,
    eliminated: !!t.eliminated,
    espnId: t.espnId,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bracket = await fetchBracket(id);
  if (!bracket) return { title: "Bracket not found" };
  const owner = bracket.user?.displayName ?? "Someone";
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

  // Viewers may not be logged in; the session only decides ownership.
  const [user, bracket, config] = await Promise.all([
    getCurrentUser(),
    fetchBracket(id),
    getTournamentConfig(),
  ]);
  if (!bracket) notFound();

  const isOwner = !!user && bracket.userId === user.id;
  const pastDeadline = isPastDeadline(config);
  const multipliers = getScoringMultipliers(config);

  // Drafts are private until the owner finalizes or the deadline locks them:
  // otherwise another player could copy or counter the picks before Thursday.
  const picksVisible = isOwner || !!bracket.locked || pastDeadline;

  const [picks, gameRows] = await Promise.all([
    picksVisible
      ? db.select().from(bracketPicks).where(eq(bracketPicks.bracketId, id))
      : Promise.resolve([] as (typeof bracketPicks.$inferSelect)[]),
    db.query.games.findMany({
      with: { teamA: true, teamB: true, winner: true },
      orderBy: asc(games.gameSlot),
    }),
  ]);

  const formattedGames: GameWithTeams[] = gameRows.map((g) => ({
    id: g.id,
    round: g.round,
    region: g.region,
    gameSlot: g.gameSlot,
    nextGameSlot: g.nextGameSlot,
    slotPosition: g.slotPosition,
    teamAId: g.teamAId,
    teamBId: g.teamBId,
    winnerId: g.winnerId,
    scoreA: g.scoreA,
    scoreB: g.scoreB,
    scheduledAt: g.scheduledAt,
    status: g.status,
    espnGameId: g.espnGameId,
    teamA: toTeam(g.teamA),
    teamB: toTeam(g.teamB),
    winner: toTeam(g.winner),
  }));

  const existingPicks = picks.map((p) => ({
    gameSlot: p.gameSlot,
    round: p.round,
    pickedTeamId: p.pickedTeamId,
    pointsEarned: p.pointsEarned ?? 0,
    isCorrect: p.isCorrect ?? null,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <BracketBuilder
        games={formattedGames}
        bracketId={id}
        existingPicks={existingPicks}
        existingName={bracket.name}
        isLocked={!!bracket.locked || pastDeadline}
        finalized={!!bracket.locked}
        deadlinePassed={pastDeadline}
        isOwner={isOwner}
        picksHidden={!picksVisible}
        score={bracket.score || 0}
        ownerName={bracket.user?.displayName ?? null}
        userId={user?.id ?? null}
        serverUpdatedAt={bracket.updatedAt?.toISOString() ?? null}
        multipliers={multipliers}
      />
    </div>
  );
}
