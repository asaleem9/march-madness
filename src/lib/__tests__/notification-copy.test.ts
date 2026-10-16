import { describe, it, expect } from "vitest";
import {
  buildBatchMessage,
  formatPickResult,
  toSmsText,
  MAX_LISTED_PICKS,
} from "../notification-copy";

function game(
  overrides: Partial<{
    picked: string;
    correct: boolean;
    points: number;
    winner: string;
  }> = {},
  meta: { batch_key?: string | null; created_at?: string } = {}
) {
  return {
    type: "game_result",
    payload: {
      game_id: 1,
      picked: "Duke",
      correct: true,
      points: 20,
      winner: "Duke",
      ...overrides,
    },
    batch_key: "batch_key" in meta ? meta.batch_key : "20270318-afternoon",
    created_at: meta.created_at ?? "2027-03-18T18:00:00Z",
  };
}

describe("formatPickResult", () => {
  it("formats a correct pick with points", () => {
    expect(formatPickResult({ picked: "Duke", correct: true, points: 20 })).toBe("Duke ✓ +20");
  });

  it("keeps the half point from an upset bonus", () => {
    expect(formatPickResult({ picked: "Oakland", correct: true, points: 7.5 })).toBe(
      "Oakland ✓ +7.5"
    );
  });

  it("formats a wrong pick", () => {
    expect(formatPickResult({ picked: "Kansas", correct: false, points: 0 })).toBe("Kansas ✗");
  });

  it("falls back to the winner when there is no pick", () => {
    expect(formatPickResult({ winner: "UConn" })).toBe("UConn won");
  });
});

describe("buildBatchMessage — game results", () => {
  it("lists each pick and the daily tally", () => {
    const msg = buildBatchMessage([
      game({ picked: "Duke", correct: true, points: 20 }),
      game({ picked: "Kansas", correct: false, points: 0 }),
      game({ picked: "Gonzaga", correct: true, points: 10 }),
    ]);
    expect(msg).not.toBeNull();
    expect(msg!.title).toBe("3 games decided");
    expect(msg!.body).toBe("Duke ✓ +20 · Kansas ✗ · Gonzaga ✓ +10 · 2 of 3 right today");
    expect(msg!.url).toBe("/dashboard");
  });

  it("uses the singular for one game", () => {
    const msg = buildBatchMessage([game()]);
    expect(msg!.title).toBe("1 game decided");
    expect(msg!.body).toBe("Duke ✓ +20 · 1 of 1 right today");
  });

  it("collapses beyond the listed-pick limit into +N more", () => {
    const items = Array.from({ length: MAX_LISTED_PICKS + 3 }, (_, i) =>
      game({ picked: `Team${i}`, correct: i % 2 === 0, points: 10 })
    );
    const msg = buildBatchMessage(items)!;
    expect(msg.body).toContain("+3 more");
    expect(msg.body).toContain(`of ${MAX_LISTED_PICKS + 3} right today`);
    // Only the first four picks are listed by name.
    expect(msg.body).toContain("Team3");
    expect(msg.body).not.toContain("Team4 ");
  });

  it("merges older batches into one summary line", () => {
    const earlier = Array.from({ length: 12 }, (_, i) =>
      game(
        { picked: `Old${i}`, correct: i < 7, points: 10 },
        { batch_key: "20270316-evening", created_at: "2027-03-16T23:00:00Z" }
      )
    );
    const today = [
      game({ picked: "Duke", correct: true, points: 20 }),
      game({ picked: "Kansas", correct: false, points: 0 }),
    ];
    const msg = buildBatchMessage([...earlier, ...today])!;
    const lines = msg.body.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Duke ✓ +20 · Kansas ✗ · 1 of 2 right today");
    expect(lines[1]).toBe("12 earlier games: 7 right");
    expect(msg.title).toBe("14 games decided");
  });

  it("groups by created_at day when batch_key is missing", () => {
    const msg = buildBatchMessage([
      game({ picked: "Old" }, { batch_key: null, created_at: "2027-03-16T20:00:00Z" }),
      game({ picked: "New" }, { batch_key: null, created_at: "2027-03-17T20:00:00Z" }),
    ])!;
    expect(msg.body.split("\n")).toEqual([
      "New ✓ +20 · 1 of 1 right today",
      "1 earlier game: 1 right",
    ]);
  });
});

describe("buildBatchMessage — wagers", () => {
  it("formats a wager request", () => {
    const msg = buildBatchMessage([
      {
        type: "wager_request",
        payload: { wager_id: "w1", challenger_name: "Alice", stakes: "Loser buys dinner" },
      },
    ])!;
    expect(msg.title).toBe("New wager challenge");
    expect(msg.body).toBe("Alice challenged you: Loser buys dinner");
    expect(msg.url).toBe("/wagers");
  });

  it("formats a won wager result with scores", () => {
    const msg = buildBatchMessage([
      {
        type: "wager_result",
        payload: {
          wager_id: "w1",
          stakes: "Pizza",
          opponent_name: "Bob",
          your_score: 420,
          their_score: 380,
          won: true,
          tie: false,
        },
      },
    ])!;
    expect(msg.title).toBe("Wager won");
    expect(msg.body).toBe("You won the wager with Bob: Pizza (420–380)");
    expect(msg.url).toBe("/wagers");
  });

  it("formats lost and tied results, falling back when the name is missing", () => {
    const lost = buildBatchMessage([
      {
        type: "wager_result",
        payload: { stakes: "Pizza", your_score: 1, their_score: 2, won: false, tie: false },
      },
    ])!;
    expect(lost.body).toBe("You lost the wager with your opponent: Pizza (1–2)");

    const tied = buildBatchMessage([
      {
        type: "wager_result",
        payload: { stakes: "Pizza", your_score: 5, their_score: 5, won: false, tie: true },
      },
    ])!;
    expect(tied.title).toBe("Wager tied");
    expect(tied.body).toBe("You tied the wager with your opponent: Pizza (5–5)");
  });

  it("formats accept / decline / revoke status updates", () => {
    const accepted = buildBatchMessage([
      {
        type: "wager_result",
        payload: { wager_id: "w1", status: "accepted", opponent_name: "Bob", stakes: "Pizza" },
      },
    ])!;
    expect(accepted.title).toBe("Wager accepted");
    expect(accepted.body).toBe("Bob accepted your wager: Pizza");

    const declined = buildBatchMessage([
      { type: "wager_result", payload: { status: "declined", opponent_name: "Bob", stakes: "Pizza" } },
    ])!;
    expect(declined.body).toBe("Bob declined your wager: Pizza");

    const revoked = buildBatchMessage([
      { type: "wager_result", payload: { status: "revoked", opponent_name: "Alice", stakes: "Pizza" } },
    ])!;
    expect(revoked.title).toBe("Wager revoked");
    expect(revoked.body).toBe("Alice revoked the wager: Pizza");
  });
});

describe("buildBatchMessage — mixed and empty", () => {
  it("leads with wager lines, then games, and deep-links to /wagers", () => {
    const msg = buildBatchMessage([
      game({ picked: "Duke" }),
      { type: "wager_request", payload: { challenger_name: "Alice", stakes: "Lunch" } },
    ])!;
    expect(msg.title).toBe("New wager challenge");
    expect(msg.body.split("\n")).toEqual([
      "Alice challenged you: Lunch",
      "Duke ✓ +20 · 1 of 1 right today",
    ]);
    expect(msg.url).toBe("/wagers");
  });

  it("returns null when there is nothing to say", () => {
    expect(buildBatchMessage([])).toBeNull();
    expect(buildBatchMessage([{ type: "unknown_type", payload: {} }])).toBeNull();
  });

  it("flattens to one line for SMS", () => {
    const msg = { title: "2 games decided", body: "a\nb", url: "/dashboard" };
    expect(toSmsText(msg)).toBe("2 games decided: a · b");
  });
});
