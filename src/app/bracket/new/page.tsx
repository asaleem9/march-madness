import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brackets, games, profiles, teams } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import { getSeason, isPastDeadline, getScoringMultipliers } from "@/lib/tournament";
import { formatEasternDate } from "@/components/dashboard/helpers";
import type { GameWithTeams, Team } from "@/types";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your bracket",
};

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

export default async function NewBracketPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=%2Fbracket%2Fnew");

  // Enforce one bracket per user — redirect to existing bracket
  const [existingBracket] = await db
    .select({ id: brackets.id })
    .from(brackets)
    .where(eq(brackets.userId, user.id))
    .limit(1);

  if (existingBracket) {
    redirect(`/bracket/${existingBracket.id}`);
  }

  const { config, tournamentYear, displayYear, offSeason, upcoming } = await getSeason();

  if (offSeason) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="retro-card p-6 sm:p-8 space-y-4 text-center">
          <h1 className="font-display text-navy text-sm leading-relaxed">
            {displayYear} BRACKETS OPEN SELECTION SUNDAY
          </h1>
          <p className="font-body text-sm text-navy/70">
            The {tournamentYear} tournament is over. Brackets for {displayYear} open
            {upcoming ? ` ${formatEasternDate(upcoming.selectionSunday)}` : " on Selection Sunday"} —
            join the waitlist on the homepage and we&apos;ll email you when they do.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/#waitlist" className="retro-btn retro-btn-primary">
              Join the Waitlist
            </Link>
            <Link href="/leaderboard" className="retro-btn retro-btn-secondary">
              {tournamentYear} Final Standings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isPastDeadline(config)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="retro-card p-6 sm:p-8 space-y-4 text-center">
          <h1 className="font-display text-navy text-sm">BRACKETS ARE CLOSED FOR {tournamentYear}</h1>
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

  const [gameRows, profile] = await Promise.all([
    db.query.games.findMany({
      with: { teamA: true, teamB: true, winner: true },
      orderBy: asc(games.gameSlot),
    }),
    db.query.profiles.findFirst({
      columns: { displayName: true },
      where: eq(profiles.id, user.id),
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

  const displayName =
    profile?.displayName?.trim() || user.name?.trim() || user.email.split("@")[0] || "My";
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
        ownerName={displayName}
        multipliers={getScoringMultipliers(config)}
      />
    </div>
  );
}
