// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { bracketPicks, brackets, games, teams, userAchievements, wagers } from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/tournament", () => ({
  getSeason: vi.fn(),
  isPastDeadline: () => true,
  isPastWagerDeadline: () => true,
  getScoringMultipliers: () => ({
    first_round: 10,
    second_round: 20,
    sweet_16: 40,
    elite_eight: 80,
    final_four: 160,
    championship: 320,
  }),
}));
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => (props: Record<string, unknown>) => ({
    type: "div",
    props: { "data-stub": name, "data-props": props },
  }),
}));
vi.mock("@/components/dashboard/StandingCard", () => ({ StandingCard: stub("StandingCard") }));
vi.mock("@/components/dashboard/TodaysGames", () => ({ TodaysGames: stub("TodaysGames") }));
vi.mock("@/components/dashboard/MiniLeaderboard", () => ({ MiniLeaderboard: stub("MiniLeaderboard") }));
vi.mock("@/components/dashboard/WagersWidget", () => ({ WagersWidget: stub("WagersWidget") }));
vi.mock("@/components/dashboard/BracketStatusCard", () => ({ BracketStatusCard: stub("BracketStatusCard") }));
vi.mock("@/components/dashboard/AchievementsCard", () => ({ AchievementsCard: stub("AchievementsCard") }));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getSeason } from "@/lib/tournament";
import DashboardPage from "../page";

const ME = seedUserId(1);
const RIVAL = seedUserId(2);
let myBracketId: string;
let dukeId: number;

/** Props of every stubbed widget, keyed by stub name. */
function widgets(tree: React.ReactElement): Record<string, Record<string, unknown>> {
  const found: Record<string, Record<string, unknown>> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function" && el.props) {
      const rendered = (el.type as (p: Record<string, unknown>) => { props: Record<string, unknown> })(el.props);
      const name = rendered?.props?.["data-stub"] as string | undefined;
      if (name) found[name] = rendered.props["data-props"] as Record<string, unknown>;
    }
    if (el.props?.children) walk(el.props.children);
  };
  walk(tree);
  return found;
}

beforeAll(async () => {
  await seedProfile(db as unknown as TestDb, { id: ME, displayName: "Me" });
  await seedProfile(db as unknown as TestDb, { id: RIVAL, displayName: "Rival", avatarUrl: "https://x/r.png" });
  const [duke, unc] = await db
    .insert(teams)
    .values([
      { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east" },
      { name: "UNC", abbreviation: "UNC", seed: 16, region: "east", eliminated: true },
    ])
    .returning();
  dukeId = duke.id;
  await db.insert(games).values([
    {
      gameSlot: 13,
      round: "first_round",
      region: "east",
      teamAId: duke.id,
      teamBId: unc.id,
      status: "final",
      winnerId: duke.id,
      scoreA: 90,
      scoreB: 50,
      scheduledAt: new Date(), // today, so it shows in "today's games"
    },
    { gameSlot: 75, round: "championship" },
  ]);
  const [mine, rival] = await db
    .insert(brackets)
    .values([
      { userId: ME, name: "Mine", locked: true, score: 10 },
      { userId: RIVAL, name: "Rival's", locked: true, score: 25 },
    ])
    .returning();
  myBracketId = mine.id;
  await db.insert(bracketPicks).values([
    { bracketId: mine.id, gameSlot: 13, round: "first_round", pickedTeamId: duke.id, isCorrect: true, pointsEarned: 10 },
    { bracketId: mine.id, gameSlot: 75, round: "championship", pickedTeamId: duke.id },
    { bracketId: rival.id, gameSlot: 13, round: "first_round", pickedTeamId: unc.id, isCorrect: false, pointsEarned: 0 },
  ]);
  await db.insert(wagers).values([
    { challengerId: RIVAL, opponentId: ME, challengerBracketId: rival.id, stakes: "Pizza", status: "pending" },
    { challengerId: ME, opponentId: RIVAL, challengerBracketId: mine.id, stakes: "Declined one", status: "declined" },
  ]);
  await db.insert(userAchievements).values({ userId: ME, achievementType: "chalk_walk" });
});

describe("DashboardPage", () => {
  it("redirects signed-out visitors to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login?redirect=/dashboard");
  });

  it("assembles standing, today's games, leaderboard, and wagers from the database", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: ME, email: "me@example.com", name: null, image: null });
    vi.mocked(getSeason).mockResolvedValue({
      config: {
        year: 2027,
        bracket_lock_deadline: "2027-03-18T16:00:00Z",
        wager_creation_deadline: "2027-03-18T16:00:00Z",
      },
      phase: "first_round",
      tournamentYear: 2027,
      displayYear: 2027,
      offSeason: false,
      upcoming: null,
    } as never);

    const w = widgets(await DashboardPage());

    expect(w.StandingCard).toMatchObject({
      bracketId: myBracketId,
      rank: 2,
      total: 2,
      score: 10,
      correct: 1,
      scored: 1,
      maxPossible: 330, // 10 earned + a live 320-point champion pick
      championPick: { name: "Duke", seed: 1, alive: true },
      final: false,
    });

    const today = w.TodaysGames.games as Record<string, unknown>[];
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({
      roundLabel: "First Round · East",
      teamA: { seed: 1, name: "Duke" },
      teamB: { seed: 16, name: "UNC" },
      scoreA: 90,
      scoreB: 50,
      status: "final",
      pick: { name: "Duke", outcome: "correct" },
    });

    const entries = w.MiniLeaderboard.entries as { rank: number; displayName: string; avatarUrl: string | null }[];
    expect(entries.map((e) => [e.rank, e.displayName, e.avatarUrl])).toEqual([
      [1, "Rival", "https://x/r.png"],
      [2, "Me", null],
    ]);
    expect(w.MiniLeaderboard.myBracketId).toBe(myBracketId);

    // Declined wagers are left out; the pending one carries both parties' names.
    const rows = w.WagersWidget.wagers as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stakes: "Pizza",
      status: "pending",
      challenger_id: RIVAL,
      opponent_id: ME,
      challenger: { display_name: "Rival" },
      opponent: { display_name: "Me" },
    });
    expect(w.WagersWidget.userId).toBe(ME);
    expect(w.AchievementsCard).toBeUndefined(); // only once the tournament is completed
    expect(dukeId).toBeGreaterThan(0);
  });
});
