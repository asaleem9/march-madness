// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { bracketPicks, brackets, games, teams } from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/tournament", () => ({
  getTournamentConfig: vi.fn().mockResolvedValue({ year: 2027, bracket_lock_deadline: "2027-03-18T16:00:00Z" }),
  isPastDeadline: () => false,
  getScoringMultipliers: () => ({ first_round: 10 }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/bracket/BracketBuilder", () => ({
  BracketBuilder: (props: Record<string, unknown>) => <div data-props={JSON.stringify(props)} />,
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { BracketBuilder } from "@/components/bracket/BracketBuilder";
import BracketPage, { generateMetadata } from "../page";
import Image from "../opengraph-image";

const OWNER = seedUserId(1);
const VIEWER = seedUserId(2);
let bracketId: string;
let dukeId: number;

function builderProps(tree: React.ReactElement): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type === BracketBuilder && el.props) found = el.props;
    if (el.props?.children) walk(el.props.children);
  };
  walk(tree);
  return found;
}

beforeAll(async () => {
  await seedProfile(db as unknown as TestDb, { id: OWNER, displayName: "Owner" });
  await seedProfile(db as unknown as TestDb, { id: VIEWER, displayName: "Viewer" });
  const [duke, unc] = await db
    .insert(teams)
    .values([
      { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", record: "30-3", espnId: "150" },
      { name: "UNC", abbreviation: "UNC", seed: 16, region: "east", eliminated: true },
    ])
    .returning();
  dukeId = duke.id;
  await db.insert(games).values([
    { gameSlot: 14, round: "first_round", region: "east", nextGameSlot: 45, slotPosition: "top" },
    {
      gameSlot: 13,
      round: "first_round",
      region: "east",
      teamAId: duke.id,
      teamBId: unc.id,
      winnerId: duke.id,
      status: "final",
      nextGameSlot: 45,
      slotPosition: "top",
      scheduledAt: new Date("2027-03-19T17:00:00Z"),
    },
  ]);
  const [bracket] = await db
    .insert(brackets)
    .values({ userId: OWNER, name: "Owner's Bracket", score: 15, locked: true })
    .returning();
  bracketId = bracket.id;
  await db.insert(bracketPicks).values({
    bracketId,
    gameSlot: 13,
    round: "first_round",
    pickedTeamId: duke.id,
    isCorrect: true,
    pointsEarned: 15,
  });
});

describe("BracketPage", () => {
  it("renders a public bracket with camelCase games, picks, and owner info", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const props = builderProps(await BracketPage({ params: Promise.resolve({ id: bracketId }) }));
    expect(props).toBeDefined();
    expect(props).toMatchObject({
      bracketId,
      existingName: "Owner's Bracket",
      isOwner: false,
      isLocked: true,
      finalized: true,
      score: 15,
      ownerName: "Owner",
      userId: null,
      multipliers: { first_round: 10 },
    });
    expect(typeof props!.serverUpdatedAt).toBe("string");
    const list = props!.games as { gameSlot: number; teamA: unknown; winner: unknown; teamB: unknown }[];
    expect(list.map((g) => g.gameSlot)).toEqual([13, 14]);
    expect(list[0].teamA).toEqual({
      id: dukeId,
      name: "Duke",
      abbreviation: "DUKE",
      seed: 1,
      region: "east",
      record: "30-3",
      logoUrl: null,
      eliminated: false,
      espnId: "150",
    });
    expect(list[0].teamB).toMatchObject({ name: "UNC", eliminated: true });
    expect(list[0].winner).toMatchObject({ name: "Duke" });
    expect(list[1].teamA).toBeNull();
    expect(props!.existingPicks).toEqual([
      { gameSlot: 13, round: "first_round", pickedTeamId: dukeId, pointsEarned: 15, isCorrect: true },
    ]);
  });

  it("marks the owner and 404s unknown ids", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: OWNER, email: "o@example.com", name: null, image: null });
    const props = builderProps(await BracketPage({ params: Promise.resolve({ id: bracketId }) }));
    expect(props).toMatchObject({ isOwner: true, userId: OWNER });

    await expect(
      BracketPage({ params: Promise.resolve({ id: "00000000-0000-4000-8000-00000000dead" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(BracketPage({ params: Promise.resolve({ id: "nope" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("builds share metadata from the owner's display name and score", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ id: bracketId }) });
    expect(meta.title).toBe("Owner's bracket · 15 pts");
    expect(await generateMetadata({ params: Promise.resolve({ id: "nope" }) })).toEqual({
      title: "Bracket not found",
    });
  });

  it("renders the OG image without throwing, even for a missing bracket", async () => {
    const ok = await Image({ params: Promise.resolve({ id: bracketId }) });
    expect(ok.headers.get("content-type")).toContain("image/png");
    const missing = await Image({ params: Promise.resolve({ id: "nope" }) });
    expect(missing.headers.get("content-type")).toContain("image/png");
  });
});
