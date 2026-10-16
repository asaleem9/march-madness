import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { LeaderboardClient } from "../LeaderboardClient";
import type { LeaderboardRow } from "../buildRows";

const mockUseRealtimeGames = vi.fn();
vi.mock("@/hooks/useRealtimeGames", () => ({
  useRealtimeGames: () => mockUseRealtimeGames(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

// --- IntersectionObserver stub ---
type IOCallback = (entries: { isIntersecting: boolean }[]) => void;
let ioCallback: IOCallback | null = null;
const ioObserve = vi.fn();
const ioDisconnect = vi.fn();

class FakeIO {
  constructor(cb: IOCallback) {
    ioCallback = cb;
  }
  observe = ioObserve;
  disconnect = ioDisconnect;
  unobserve = vi.fn();
}

function row(overrides: Partial<LeaderboardRow> & { userId: string; rank: number }): LeaderboardRow {
  return {
    bracketId: `b-${overrides.userId}`,
    displayName: overrides.userId.toUpperCase(),
    avatarUrl: null,
    score: 100,
    correctPicks: 20,
    decidedPicks: 32,
    totalPicks: 63,
    maxPossible: 900,
    badges: [],
    champion: null,
    ...overrides,
  };
}

const rows: LeaderboardRow[] = [
  row({ userId: "ann", rank: 1, score: 340, badges: ["fortune_teller", "cinderella"],
    champion: { teamId: 1, name: "Duke", abbreviation: "DUKE", logoUrl: "https://l/d.png", eliminated: false, isChampion: false } }),
  row({ userId: "bob", rank: 2, score: 300,
    champion: { teamId: 2, name: "Lehigh", abbreviation: "LEH", logoUrl: null, eliminated: true, isChampion: false } }),
  row({ userId: "cat", rank: 2, score: 300 }),
  row({ userId: "dan", rank: 4, score: 120, correctPicks: 12, decidedPicks: 32, maxPossible: 400 }),
];

beforeEach(() => {
  mockUseRealtimeGames.mockClear();
  ioObserve.mockClear();
  ioDisconnect.mockClear();
  ioCallback = null;
  vi.stubGlobal("IntersectionObserver", FakeIO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeaderboardClient", () => {
  it("subscribes to realtime games", () => {
    render(<LeaderboardClient rows={rows} currentUserId={null} />);
    expect(mockUseRealtimeGames).toHaveBeenCalled();
  });

  it("renders medals for the top three and shared ranks for ties", () => {
    render(<LeaderboardClient rows={rows} currentUserId={null} />);
    expect(screen.getByAltText("Rank 1")).toHaveAttribute("src", "/images/medals/gold.png");
    expect(screen.getAllByAltText("Rank 2")).toHaveLength(2);
    expect(screen.getByText("#4")).toBeInTheDocument();
  });

  it("makes each row a link to the bracket named after the player", () => {
    render(<LeaderboardClient rows={rows} currentUserId={null} />);
    const link = screen.getByRole("link", { name: /DAN's bracket, rank 4, 120 points/ });
    expect(link).toHaveAttribute("href", "/bracket/b-dan");
    expect(screen.queryByText("View Bracket")).toBeNull();
  });

  it("shows picks, champion state and max possible per row", () => {
    render(<LeaderboardClient rows={rows} currentUserId={null} />);
    expect(screen.getByLabelText("12 of 32 decided picks correct")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum possible 400 points")).toBeInTheDocument();
    expect(screen.getByLabelText("Champion pick: Duke, alive")).toBeInTheDocument();
    const out = screen.getByLabelText("Champion pick: Lehigh, out");
    expect(within(out).getByText("OUT")).toBeInTheDocument();
  });

  it("highlights the viewer's row and shows the sticky bar only when it's off screen", () => {
    render(<LeaderboardClient rows={rows} currentUserId="dan" />);
    const yours = document.querySelector("[data-you-row]") as HTMLElement;
    expect(yours).not.toBeNull();
    expect(yours).toHaveAttribute("aria-current", "true");
    expect(within(yours).getByText("You")).toBeInTheDocument();
    expect(ioObserve).toHaveBeenCalledWith(yours);

    const bar = screen.getByTestId("you-bar");
    expect(bar).toHaveTextContent("You: #4 · 120 pts");
    // Visible by default (row assumed on screen) → bar hidden.
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar.className).toContain("opacity-0");

    act(() => ioCallback?.([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute("aria-hidden", "false");
    expect(bar.className).toContain("opacity-100");

    act(() => ioCallback?.([{ isIntersecting: true }]));
    expect(bar.className).toContain("opacity-0");
  });

  it("renders no You bar for visitors or users without a bracket", () => {
    const { rerender } = render(<LeaderboardClient rows={rows} currentUserId={null} />);
    expect(screen.queryByTestId("you-bar")).toBeNull();
    rerender(<LeaderboardClient rows={rows} currentUserId="nobody" />);
    expect(screen.queryByTestId("you-bar")).toBeNull();
    expect(document.querySelector("[data-you-row]")).toBeNull();
  });

  it("toggles the badge legend popover with aria-expanded and links to the legend", () => {
    render(<LeaderboardClient rows={rows} currentUserId={null} />);
    const toggle = screen.getByRole("button", { name: /ANN's badges: Fortune Teller, Cinderella Story/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Badges" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Badges" });
    expect(within(dialog).getByText("Fortune Teller")).toBeInTheDocument();
    expect(within(dialog).getByText("Picked the national champion.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "What are badges?" })).toHaveAttribute(
      "href",
      "/scoring#badges"
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Badges" })).toBeNull();
  });

  it("renders no badge toggle for players without badges", () => {
    render(<LeaderboardClient rows={rows} currentUserId={null} />);
    expect(screen.queryByRole("button", { name: /DAN's badges/ })).toBeNull();
  });
});
