// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { bracketPicks, brackets, games, teams, userAchievements } from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/tournament", () => ({
  getSeason: vi.fn(),
  getScoringMultipliers: () => ({
    first_round: 10,
    second_round: 20,
    sweet_16: 40,
    elite_eight: 80,
    final_four: 160,
    championship: 320,
  }),
}));
vi.mock("@/components/leaderboard/LeaderboardClient", () => ({
  LeaderboardClient: (props: Record<string, unknown>) => <div data-props={JSON.stringify(props)} />,
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getSeason } from "@/lib/tournament";
import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";
import type { LeaderboardRow } from "@/components/leaderboard/buildRows";
import LeaderboardPage from "../page";

const ALICE = seedUserId(1);
const BOB = seedUserId(2);
const DRAFTER = seedUserId(3);

function clientProps(tree: React.ReactElement): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type === LeaderboardClient && el.props) found = el.props;
    if (el.props?.children) walk(el.props.children);
  };
  walk(tree);
  return found;
}

/** Every string rendered anywhere in the element tree. */
function textOf(tree: React.ReactElement): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") parts.push(node);
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { props?: Record<string, unknown> };
    if (el.props?.children) walk(el.props.children);
  };
  walk(tree);
  return parts.join("");
}

const season = {
  config: { last_score_update_at: "2027-03-20T02:00:00.000Z" },
  phase: "first_round",
  offSeason: false,
  tournamentYear: 2027,
};

beforeAll(async () => {
  await seedProfile(db as unknown as TestDb, { id: ALICE, displayName: "Alice", avatarUrl: "https://x/a.png" });
  await seedProfile(db as unknown as TestDb, { id: BOB, displayName: "Bob" });
  await seedProfile(db as unknown as TestDb, { id: DRAFTER, displayName: "Drafter" });
  const [duke, unc] = await db
    .insert(teams)
    .values([
      { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east" },
      { name: "UNC", abbreviation: "UNC", seed: 2, region: "west", eliminated: true },
    ])
    .returning();
  await db.insert(games).values([
    { gameSlot: 13, round: "first_round", region: "east", teamAId: duke.id, teamBId: unc.id, status: "final", winnerId: duke.id },
    { gameSlot: 75, round: "championship" },
  ]);
  const [alice, bob] = await db
    .insert(brackets)
    .values([
      { userId: ALICE, name: "Alice's", locked: true, score: 10 },
      { userId: BOB, name: "Bob's", locked: true, score: 0 },
      { userId: DRAFTER, name: "Draft", locked: false, score: 999 },
    ])
    .returning();
  await db.insert(bracketPicks).values([
    { bracketId: alice.id, gameSlot: 13, round: "first_round", pickedTeamId: duke.id, isCorrect: true, pointsEarned: 10 },
    { bracketId: alice.id, gameSlot: 75, round: "championship", pickedTeamId: duke.id },
    { bracketId: bob.id, gameSlot: 13, round: "first_round", pickedTeamId: unc.id, isCorrect: false, pointsEarned: 0 },
    { bracketId: bob.id, gameSlot: 75, round: "championship", pickedTeamId: unc.id },
  ]);
  await db.insert(userAchievements).values({ userId: ALICE, achievementType: "cinderella" });
});

describe("LeaderboardPage", () => {
  it("ranks locked brackets with picks, badges, and champion picks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: BOB, email: "b@example.com", name: null, image: null });
    vi.mocked(getSeason).mockResolvedValue(season as never);

    const props = clientProps(await LeaderboardPage());
    expect(props).toBeDefined();
    expect(props!.currentUserId).toBe(BOB);
    const rows = props!.rows as LeaderboardRow[];
    expect(rows.map((r) => [r.rank, r.displayName, r.score])).toEqual([
      [1, "Alice", 10],
      [2, "Bob", 0],
    ]);
    expect(rows[0]).toMatchObject({
      avatarUrl: "https://x/a.png",
      correctPicks: 1,
      decidedPicks: 1,
      totalPicks: 2,
      badges: ["cinderella"],
      champion: { name: "Duke", eliminated: false, isChampion: false },
    });
    expect(rows[1].champion).toMatchObject({ name: "UNC", eliminated: true });
    // Alice's championship pick is alive: 10 earned + 320 still possible.
    expect(rows[0].maxPossible).toBe(330);
  });

  it("shows the empty state when nothing is locked yet", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(getSeason).mockResolvedValue({ ...season, phase: "pre_tournament" } as never);
    await db.update(brackets).set({ locked: false });
    const tree = await LeaderboardPage();
    expect(clientProps(tree)).toBeUndefined();
    expect(textOf(tree)).toContain("No brackets are in yet");
    await db.update(brackets).set({ locked: true });
  });
});
