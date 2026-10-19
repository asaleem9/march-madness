import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  WagersClient,
  type BracketLite,
  type PlayerOption,
  type WagerView,
} from "../WagersClient";
import { tabFromParam } from "../tabs";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const me = "user-me";
const bob = "user-bob";
const carol = "user-carol";

const brackets: BracketLite[] = [
  { id: "b-me", userId: me, name: "My bracket", isPrimary: true, score: 120 },
  { id: "b-bob", userId: bob, name: "Bob's bracket", isPrimary: true, score: 90 },
];

const players: PlayerOption[] = [
  { id: bob, displayName: "Bob", hasBracket: true },
  { id: carol, displayName: "Carol", hasBracket: false },
];

const wagers: WagerView[] = [
  {
    id: "w-pending-in",
    stakes: "Loser buys lunch",
    status: "pending",
    challengerId: bob,
    opponentId: me,
    challengerBracketId: "b-bob",
    opponentBracketId: null,
    winnerId: null,
    createdAt: "2027-03-15T12:00:00Z",
    challengerName: "Bob",
    opponentName: "Me",
  },
  {
    id: "w-pending-out",
    stakes: "Coffee",
    status: "pending",
    challengerId: me,
    opponentId: bob,
    challengerBracketId: "b-me",
    opponentBracketId: null,
    winnerId: null,
    createdAt: "2027-03-14T12:00:00Z",
    challengerName: "Me",
    opponentName: "Bob",
  },
  {
    id: "w-active",
    stakes: "Dinner",
    status: "accepted",
    challengerId: me,
    opponentId: bob,
    challengerBracketId: "b-me",
    opponentBracketId: "b-bob",
    winnerId: null,
    createdAt: "2027-03-13T12:00:00Z",
    challengerName: "Me",
    opponentName: "Bob",
  },
  {
    id: "w-won",
    stakes: "Bragging rights",
    status: "resolved",
    challengerId: bob,
    opponentId: me,
    challengerBracketId: "b-bob",
    opponentBracketId: "b-me",
    winnerId: me,
    createdAt: "2026-04-06T12:00:00Z",
    challengerName: "Bob",
    opponentName: "Me",
  },
];

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const baseProps = { userId: me, wagers, brackets, players, wagerDeadline: future };

let fetchMock: ReturnType<typeof vi.fn>;
let fetchResponse: { status: number; body?: unknown } = { status: 200, body: {} };

beforeEach(() => {
  mockRefresh.mockReset();
  fetchResponse = { status: 200, body: {} };
  fetchMock = vi.fn(async () => ({
    ok: fetchResponse.status < 300,
    status: fetchResponse.status,
    json: async () => fetchResponse.body ?? {},
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sentBody = (n = 0) => JSON.parse(String((fetchMock.mock.calls[n] as [string, RequestInit])[1].body));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("tabFromParam", () => {
  it("maps the dashboard's deep-link values", () => {
    expect(tabFromParam("pending")).toBe("pending");
    expect(tabFromParam("active")).toBe("accepted");
    expect(tabFromParam("accepted")).toBe("accepted");
    expect(tabFromParam("history")).toBe("history");
    expect(tabFromParam(undefined)).toBe("pending");
    expect(tabFromParam("junk")).toBe("pending");
  });
});

describe("WagersClient", () => {
  it("lists pending wagers by default and switches tabs", () => {
    render(<WagersClient {...baseProps} />);

    expect(screen.getByText("Loser buys lunch")).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.queryByText("Dinner")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "ACTIVE" }));
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    // Live scores come from the attached brackets.
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "HISTORY" }));
    expect(screen.getByText("Bragging rights")).toBeInTheDocument();
    expect(screen.getByText("WON")).toBeInTheDocument();
  });

  it("opens on the tab the server page asked for", () => {
    render(<WagersClient {...baseProps} initialTab="history" />);
    expect(screen.getByRole("tab", { name: "HISTORY" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Bragging rights")).toBeInTheDocument();
  });

  it("creates a wager through POST /api/wagers with the existing body shape", async () => {
    render(<WagersClient {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new wager/i }));

    const opponent = screen.getByLabelText("CHALLENGE") as HTMLSelectElement;
    // Players without a bracket can't be picked.
    expect(within(opponent).getByRole("option", { name: /carol/i })).toBeDisabled();
    fireEvent.change(opponent, { target: { value: bob } });
    fireEvent.change(screen.getByLabelText("STAKES"), { target: { value: "  Pizza  " } });
    fireEvent.click(screen.getByRole("button", { name: /send challenge/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/wagers", expect.objectContaining({ method: "POST" }));
    });
    expect(sentBody()).toEqual({
      opponent_id: bob,
      challenger_bracket_id: "b-me",
      stakes: "Pizza",
    });
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText("STAKES")).not.toBeInTheDocument();
  });

  it("shows the API error when creation fails", async () => {
    fetchResponse = { status: 403, body: { error: "Wager creation deadline has passed" } };
    render(<WagersClient {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new wager/i }));
    fireEvent.change(screen.getByLabelText("CHALLENGE"), { target: { value: bob } });
    fireEvent.change(screen.getByLabelText("STAKES"), { target: { value: "Pizza" } });
    fireEvent.click(screen.getByRole("button", { name: /send challenge/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wager creation deadline has passed");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("accepts an incoming wager with the user's bracket and moves it to ACTIVE", async () => {
    render(<WagersClient {...baseProps} />);
    const card = screen.getByText("Loser buys lunch").closest(".retro-card")!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/wagers", expect.objectContaining({ method: "PATCH" }));
    });
    expect(sentBody()).toEqual({ wager_id: "w-pending-in", action: "accept", bracket_id: "b-me" });

    await waitFor(() => {
      expect(screen.queryByText("Loser buys lunch")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "ACTIVE" }));
    expect(screen.getByText("Loser buys lunch")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("revokes an outgoing wager only after confirmation", async () => {
    render(<WagersClient {...baseProps} />);
    const card = screen.getByText("Coffee").closest(".retro-card")!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /revoke/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/revoke your wager/i);
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /revoke/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /revoke it/i }));

    await waitFor(() => {
      expect(sentBody()).toEqual({ wager_id: "w-pending-out", action: "revoke" });
    });
    await waitFor(() => {
      expect(screen.queryByText("Coffee")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "HISTORY" }));
    expect(screen.getByText("REVOKED")).toBeInTheDocument();
  });

  it("closes new wagers after the deadline", () => {
    render(<WagersClient {...baseProps} wagerDeadline={past} />);
    expect(screen.getByRole("button", { name: /new wager/i })).toBeDisabled();
    expect(screen.getByText("— CLOSED")).toBeInTheDocument();
  });

  it("asks the user to make a bracket before accepting", () => {
    render(<WagersClient {...baseProps} brackets={brackets.filter((b) => b.userId !== me)} />);
    const card = screen.getByText("Loser buys lunch").closest(".retro-card")!;
    expect(within(card as HTMLElement).queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole("link", { name: /create a bracket first/i })).toHaveAttribute(
      "href",
      "/bracket/new"
    );
  });

  it("adopts fresh wagers when the server page re-renders", () => {
    const { rerender } = render(<WagersClient {...baseProps} />);
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    rerender(<WagersClient {...baseProps} wagers={wagers.filter((w) => w.id !== "w-pending-out")} />);
    expect(screen.queryByText("Coffee")).not.toBeInTheDocument();
  });
});
