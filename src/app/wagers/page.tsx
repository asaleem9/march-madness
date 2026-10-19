import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { brackets, profiles, tournamentConfig, wagers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  WagersClient,
  type BracketLite,
  type PlayerOption,
  type WagerView,
} from "@/components/wagers/WagersClient";
import { tabFromParam } from "@/components/wagers/tabs";

export const metadata: Metadata = { title: "Wagers" };
export const dynamic = "force-dynamic";

/**
 * Server wrapper: loads the signed-in user's wagers (with both players'
 * names), every bracket (for the opponent picker and live scores), the other
 * players, and the wager deadline. Interactions go through /api/wagers.
 */
export default async function WagersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/wagers");

  const [wagerRows, bracketRows, profileRows, config, { tab }] = await Promise.all([
    db.query.wagers.findMany({
      where: or(eq(wagers.challengerId, user.id), eq(wagers.opponentId, user.id)),
      orderBy: [desc(wagers.createdAt)],
      with: {
        challenger: { columns: { displayName: true } },
        opponent: { columns: { displayName: true } },
      },
    }),
    db
      .select({
        id: brackets.id,
        userId: brackets.userId,
        name: brackets.name,
        isPrimary: brackets.isPrimary,
        score: brackets.score,
      })
      .from(brackets)
      // Unlocked drafts stay private (their ids would open /bracket/<id>).
      .where(or(eq(brackets.locked, true), eq(brackets.userId, user.id))),
    db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(ne(profiles.id, user.id)),
    db.query.tournamentConfig.findFirst({
      where: eq(tournamentConfig.id, 1),
      columns: { wagerCreationDeadline: true },
    }),
    searchParams,
  ]);

  const wagerViews: WagerView[] = wagerRows.map((w) => ({
    id: w.id,
    stakes: w.stakes,
    status: w.status,
    challengerId: w.challengerId,
    opponentId: w.opponentId,
    challengerBracketId: w.challengerBracketId,
    opponentBracketId: w.opponentBracketId,
    winnerId: w.winnerId,
    createdAt: (w.createdAt ?? new Date(0)).toISOString(),
    challengerName: w.challenger?.displayName ?? null,
    opponentName: w.opponent?.displayName ?? null,
  }));

  const bracketList: BracketLite[] = bracketRows.map((b) => ({
    id: b.id,
    userId: b.userId,
    name: b.name,
    isPrimary: b.isPrimary ?? false,
    score: b.score,
  }));

  const usersWithBrackets = new Set(bracketList.map((b) => b.userId));
  const players: PlayerOption[] = profileRows
    .map((p) => ({
      id: p.id,
      displayName: p.displayName || "Unnamed player",
      hasBracket: usersWithBrackets.has(p.id),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));

  return (
    <WagersClient
      userId={user.id}
      wagers={wagerViews}
      brackets={bracketList}
      players={players}
      wagerDeadline={config?.wagerCreationDeadline?.toISOString() ?? null}
      initialTab={tabFromParam(tab)}
    />
  );
}
