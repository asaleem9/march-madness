import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import {
  ScheduleClient,
  dayKey,
  periodLabel,
  liveStatusLabel,
  groupGames,
  findFocusGame,
  type ScheduleGame,
  type ScheduleTeam,
} from "../ScheduleClient";
import { useChangedSlots } from "@/hooks/useChangedSlots";

vi.mock("@/hooks/useRealtimeGames", () => ({ useRealtimeGames: vi.fn() }));

// --- Fixtures ---

function team(id: number, name: string, seed: number, eliminated = false): ScheduleTeam {
  return {
    id,
    name,
    seed,
    abbreviation: name.slice(0, 4).toUpperCase(),
    logo_url: `https://logos.test/${id}.png`,
    eliminated,
  };
}

const duke = team(1, "Duke", 1);
const lehigh = team(2, "Lehigh", 16, true);
const kansas = team(3, "Kansas", 2);
const yale = team(4, "Yale", 15);
const houston = team(5, "Houston", 1);
const uconn = team(6, "UConn", 3);

function game(overrides: Partial<ScheduleGame> & { id: number; game_slot: number }): ScheduleGame {
  return {
    round: "first_round",
    region: "east",
    team_a_id: null,
    team_b_id: null,
    winner_id: null,
    status: "scheduled",
    score_a: null,
    score_b: null,
    scheduled_at: null,
    espn_game_id: null,
    clock: null,
    period: null,
    team_a: null,
    team_b: null,
    ...overrides,
  };
}

// "Now" is Thu Mar 18 2027, 3pm ET.
const NOW = new Date("2027-03-18T19:00:00Z");

const finalGame = game({
  id: 10,
  game_slot: 13,
  status: "final",
  team_a_id: 1,
  team_b_id: 2,
  team_a: duke,
  team_b: lehigh,
  winner_id: 1,
  score_a: 80,
  score_b: 60,
  scheduled_at: "2027-03-17T16:15:00Z", // Wed Mar 17, 12:15pm ET
  espn_game_id: "401",
});
const liveGame = game({
  id: 11,
  game_slot: 14,
  status: "in_progress",
  team_a_id: 3,
  team_b_id: 4,
  team_a: kansas,
  team_b: yale,
  score_a: 41,
  score_b: 39,
  clock: "4:32",
  period: 2,
  scheduled_at: "2027-03-18T18:00:00Z", // Thu Mar 18, 2pm ET
});
const upcomingGame = game({
  id: 12,
  game_slot: 15,
  team_a_id: 5,
  team_b_id: 6,
  team_a: houston,
  team_b: uconn,
  scheduled_at: "2027-03-18T23:30:00Z", // Thu Mar 18, 7:30pm ET
});
// Second-round slot fed by the final game: Duke advanced, the user had Lehigh.
const r2Game = game({
  id: 20,
  game_slot: 45,
  round: "second_round",
  team_a_id: 1,
  team_b_id: 3,
  team_a: duke,
  team_b: kansas,
  scheduled_at: "2027-03-20T17:00:00Z",
});

const games = [finalGame, liveGame, upcomingGame, r2Game];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  useChangedSlots.getState().clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("helpers", () => {
  it("dayKey buckets by Eastern calendar day", () => {
    // 11:30pm ET on the 17th is 03:30Z on the 18th.
    expect(dayKey("2027-03-18T03:30:00Z")).toBe("2027-03-17");
    expect(dayKey("2027-03-18T19:00:00Z")).toBe("2027-03-18");
  });

  it("periodLabel maps halves and overtimes", () => {
    expect(periodLabel(1)).toBe("1H");
    expect(periodLabel(2)).toBe("2H");
    expect(periodLabel(3)).toBe("OT");
    expect(periodLabel(4)).toBe("2OT");
    expect(periodLabel(null)).toBeNull();
    expect(periodLabel(0)).toBeNull();
  });

  it("liveStatusLabel combines period and clock", () => {
    expect(liveStatusLabel({ clock: "4:32", period: 2 })).toBe("2H 4:32");
    expect(liveStatusLabel({ clock: null, period: 1 })).toBe("1H");
    expect(liveStatusLabel({ clock: "0:00", period: null })).toBe("0:00");
    expect(liveStatusLabel({ clock: null, period: null })).toBeNull();
  });

  it("groupGames nests days under rounds in round order and flags today", () => {
    const grouped = groupGames(games, "2027-03-18");
    expect(grouped.map((g) => g.round)).toEqual(["first_round", "second_round"]);
    const r1 = grouped[0];
    expect(r1.days.map((d) => d.key)).toEqual(["2027-03-17", "2027-03-18"]);
    expect(r1.days[0].isToday).toBe(false);
    expect(r1.days[1].isToday).toBe(true);
    expect(r1.days[1].games.map((g) => g.id)).toEqual([11, 12]);
  });

  it("groupGames puts undated games last", () => {
    const undated = game({ id: 99, game_slot: 16 });
    const grouped = groupGames([undated, finalGame], "2027-03-18");
    expect(grouped[0].days.map((d) => d.label)).toEqual(["Wed, Mar 17", "Date TBD"]);
  });

  it("findFocusGame prefers a live game, then the next upcoming one", () => {
    expect(findFocusGame(games, NOW)?.id).toBe(11);
    expect(findFocusGame([finalGame, upcomingGame, r2Game], NOW)?.id).toBe(12);
    // Everything in the past: fall back to the earliest scheduled game.
    const later = new Date("2027-04-10T00:00:00Z");
    expect(findFocusGame([finalGame, upcomingGame, r2Game], later)?.id).toBe(12);
    expect(findFocusGame([finalGame], NOW)).toBeNull();
  });
});

describe("ScheduleClient", () => {
  it("renders round <h2>s, day sub-headers and a Today pill", () => {
    render(<ScheduleClient games={games} />);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["First Round", "Second Round"]);
    const todayPills = screen.getAllByText("Today").filter((el) => el.tagName === "SPAN");
    expect(todayPills).toHaveLength(1);
    const dayHeaders = screen.getAllByRole("heading", { level: 3 });
    expect(dayHeaders.map((h) => h.textContent)).toEqual([
      "Wed, Mar 17",
      "Thu, Mar 18Today",
      "Sat, Mar 20",
    ]);
  });

  it("shows clock + period on live cards, the date on final cards, and ESPN links", () => {
    render(<ScheduleClient games={games} />);
    const live = screen.getByRole("article", { name: "Kansas vs Yale" });
    expect(within(live).getByText("LIVE")).toBeInTheDocument();
    expect(within(live).getByText("2H 4:32")).toBeInTheDocument();
    expect(live.className).toContain("border-burnt-orange");

    const final = screen.getByRole("article", { name: "Duke vs Lehigh" });
    expect(within(final).getByText("FINAL")).toBeInTheDocument();
    expect(within(final).getByText("Wed, Mar 17")).toBeInTheDocument();
    const espn = within(final).getByRole("link", { name: /ESPN/ });
    expect(espn).toHaveAttribute(
      "href",
      "https://www.espn.com/mens-college-basketball/game/_/gameId/401"
    );
    expect(espn).toHaveAttribute("target", "_blank");
    expect(espn.getAttribute("rel")).toContain("noopener");
    expect(within(live).queryByRole("link", { name: /ESPN/ })).toBeNull();
  });

  it("gives team logos an empty alt", () => {
    render(<ScheduleClient games={games} />);
    const logos = screen.getAllByRole("presentation");
    expect(logos.length).toBeGreaterThan(0);
    for (const img of document.querySelectorAll("article img")) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("marks the user's picks and shows a ghost row when the pick is out of the slot", () => {
    // Picked Lehigh in R1 (lost) and Lehigh again in R2 (now Duke vs Kansas).
    render(<ScheduleClient games={games} userPicks={{ 13: 2, 45: 2, 15: 5 }} isLoggedIn />);
    const final = screen.getByRole("article", { name: "Duke vs Lehigh" });
    expect(within(final).getByText("Wrong")).toBeInTheDocument();

    const r2 = screen.getByRole("article", { name: "Duke vs Kansas" });
    const ghost = within(r2).getByTestId("ghost-pick");
    expect(ghost).toHaveTextContent("Your pick (LEHI) is out");
    expect(ghost.className).toContain("game-slot-ghost");

    const upcoming = screen.getByRole("article", { name: "Houston vs UConn" });
    expect(within(upcoming).getByText("Your pick")).toBeInTheDocument();
    expect(within(upcoming).queryByTestId("ghost-pick")).toBeNull();
  });

  it("does not ghost a pick while the slot is still waiting on a team", () => {
    const pending = game({ id: 30, game_slot: 46, round: "second_round", team_a_id: 5, team_a: houston });
    // Picked Kansas (still alive) for a slot that only has its top team so far.
    render(<ScheduleClient games={[liveGame, pending]} userPicks={{ 46: 3 }} isLoggedIn />);
    expect(screen.queryByTestId("ghost-pick")).toBeNull();
  });

  it("filters by Live, Today and My picks; My picks is hidden when logged out", () => {
    const { rerender } = render(
      <ScheduleClient games={games} userPicks={{ 13: 2 }} isLoggedIn />
    );
    expect(screen.getAllByRole("article")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: /^Live/ }));
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual([
      "Kansas vs Yale",
    ]);
    expect(screen.getByRole("button", { name: /^Live/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /^Today/ }));
    expect(screen.getAllByRole("article")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /My picks/ }));
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual([
      "Duke vs Lehigh",
    ]);

    rerender(<ScheduleClient games={games} userPicks={{}} isLoggedIn={false} />);
    expect(screen.queryByRole("button", { name: /My picks/ })).toBeNull();
  });

  it("shows an empty message for a filter with no matches", () => {
    render(<ScheduleClient games={[finalGame]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Live/ }));
    expect(screen.getByText("No games are live right now.")).toBeInTheDocument();
  });

  it("auto-scrolls to the first live game on mount", () => {
    render(<ScheduleClient games={games} />);
    const live = screen.getByRole("article", { name: "Kansas vs Yale" });
    expect(live.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll when the focus game is already first", () => {
    render(<ScheduleClient games={[liveGame, upcomingGame]} />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows login copy for visitors and the last-updated time for members", () => {
    const { rerender } = render(
      <ScheduleClient games={games} lastUpdatedAt="2027-03-18T18:50:00Z" />
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login?redirect=/schedule"
    );
    expect(screen.getByText(/for live updates/)).toBeInTheDocument();

    rerender(<ScheduleClient games={games} isLoggedIn lastUpdatedAt="2027-03-18T18:50:00Z" />);
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    // Rendered in ET on the server, then re-rendered in the viewer's zone, so
    // only assert the zone-independent part.
    expect(screen.getByText(/Last updated Mar 18, \d{1,2}:\d{2} [AP]M/)).toBeInTheDocument();
  });

  it("switches times to the viewer's zone after mount", async () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ timeZone: "America/Los_Angeles", locale: "en-US", calendar: "gregory", numberingSystem: "latn" });
    try {
      render(<ScheduleClient games={[upcomingGame]} />);
      await act(async () => {});
      // 23:30Z → 4:30 PM PDT
      expect(screen.getByText(/4:30 PM/)).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it("flashes cards whose slot changed", () => {
    render(<ScheduleClient games={games} />);
    const live = screen.getByRole("article", { name: "Kansas vs Yale" });
    expect(live.className).not.toContain("flash-update");
    act(() => useChangedSlots.getState().mark([14]));
    expect(live.className).toContain("flash-update");
    expect(screen.getByRole("article", { name: "Duke vs Lehigh" }).className).not.toContain(
      "flash-update"
    );
    act(() => useChangedSlots.getState().clear());
    expect(live.className).not.toContain("flash-update");
  });

  it("renders the empty state with no games", () => {
    render(<ScheduleClient games={[]} />);
    expect(screen.getByText(/No games scheduled yet/)).toBeInTheDocument();
  });
});
