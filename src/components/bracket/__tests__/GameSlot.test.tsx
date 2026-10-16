import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameSlot } from "../GameSlot";
import type { Team, Region } from "@/types";

// --- Mocks ---

vi.mock("@/lib/odds", () => ({
  getWinProbability: () => 5.0,
  formatOdds: () => "5.0%",
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) =>
    args
      .filter(Boolean)
      .join(" "),
}));

// --- Helpers ---

function makeTeam(overrides: Partial<Team> & { id: number; name: string }): Team {
  return {
    abbreviation: overrides.name.slice(0, 3).toUpperCase(),
    seed: 1,
    region: "east" as Region,
    record: "25-6",
    logoUrl: null,
    eliminated: false,
    espnId: null,
    ...overrides,
  };
}

const duke = makeTeam({ id: 101, name: "Duke", seed: 1, region: "east" });
const lehigh = makeTeam({ id: 102, name: "Lehigh", seed: 16, region: "east" });
const eliminatedTeam = makeTeam({
  id: 103,
  name: "Furman",
  seed: 15,
  region: "south",
  eliminated: true,
});

// --- Tests ---

describe("GameSlot", () => {
  const mockOnPick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders team names and seeds", () => {
    render(
      <GameSlot
        gameSlot={5}
        teamA={duke}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );

    expect(screen.getByText("Duke")).toBeInTheDocument();
    expect(screen.getByText("Lehigh")).toBeInTheDocument();
    expect(screen.getByLabelText("Seed 1")).toHaveClass("seed-badge");
    expect(screen.getByLabelText("Seed 16")).toHaveClass("seed-badge");
    // The old "Seed N" caption is gone in favour of the badge
    expect(screen.queryByText("Seed 1")).not.toBeInTheDocument();
  });

  it("shows title odds only while editable", () => {
    const { rerender } = render(
      <GameSlot
        gameSlot={5}
        teamA={duke}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );
    expect(screen.getAllByText("5.0%")).toHaveLength(2);

    rerender(
      <GameSlot
        gameSlot={5}
        teamA={duke}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={false}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );
    expect(screen.queryByText("5.0%")).not.toBeInTheDocument();
  });

  it("shows TBD for null teams", () => {
    render(
      <GameSlot
        gameSlot={37}
        teamA={null}
        teamB={null}
        selectedTeamId={null}
        winnerId={null}
        isEditable={false}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );

    const tbdElements = screen.getAllByText("TBD");
    expect(tbdElements).toHaveLength(2);
  });

  it("shows a two-button play-in picker when team is null but hint provided", () => {
    render(
      <GameSlot
        gameSlot={5}
        teamA={null}
        teamB={lehigh}
        selectedTeamId={201}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
        playInHintA={{
          teamAName: "Texas",
          teamBName: "NC State",
          teamAId: 200,
          teamBId: 201,
          seed: 11,
        }}
      />
    );

    const texas = screen.getByRole("button", { name: /Texas/ });
    const ncState = screen.getByRole("button", { name: /NC State/ });
    expect(texas).toHaveAttribute("aria-pressed", "false");
    expect(ncState).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Play-in")).toBeInTheDocument();

    fireEvent.click(texas);
    expect(mockOnPick).toHaveBeenCalledWith(5, 200);
  });

  it("renders a ghost row for a pick that is no longer in the slot", () => {
    const { container } = render(
      <GameSlot
        gameSlot={37}
        teamA={lehigh}
        teamB={null}
        selectedTeamId={101}
        winnerId={null}
        isEditable={false}
        isCorrect={null}
        onPick={mockOnPick}
        ghostPick={{ team: { ...duke, eliminated: true }, side: "top", lostPlayIn: false }}
        ownerLabel="Ali's"
      />
    );
    const ghost = container.querySelector(".game-slot-ghost");
    expect(ghost).not.toBeNull();
    expect(ghost!.textContent).toBe("Ali's pick: DUK ✗ (out)");
  });

  it("flags a dead play-in pick with a repick prompt while editable", () => {
    render(
      <GameSlot
        gameSlot={5}
        teamA={lehigh}
        teamB={duke}
        selectedTeamId={300}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
        ghostPick={{
          team: makeTeam({ id: 300, name: "Texas", seed: 11 }),
          side: "top",
          lostPlayIn: true,
        }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Your pick TEX lost the play-in — repick");
  });

  it("calls onPick when editable and clicked", () => {
    render(
      <GameSlot
        gameSlot={5}
        teamA={duke}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );

    fireEvent.click(screen.getByText("Duke"));
    expect(mockOnPick).toHaveBeenCalledWith(5, 101);

    fireEvent.click(screen.getByText("Lehigh"));
    expect(mockOnPick).toHaveBeenCalledWith(5, 102);
  });

  it("does not call onPick when not editable", () => {
    render(
      <GameSlot
        gameSlot={5}
        teamA={duke}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={false}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );

    fireEvent.click(screen.getByText("Duke"));
    fireEvent.click(screen.getByText("Lehigh"));
    expect(mockOnPick).not.toHaveBeenCalled();
  });

  it("highlights selected team with selected class", () => {
    const { container } = render(
      <GameSlot
        gameSlot={5}
        teamA={duke}
        teamB={lehigh}
        selectedTeamId={101}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );

    // The TeamRow for Duke (selectedTeamId === teamA.id, isCorrect === null)
    // gets the "selected" CSS class via cn()
    const teamRows = container.querySelectorAll(".game-slot-team");
    const dukeRow = Array.from(teamRows).find((row) =>
      row.textContent?.includes("Duke")
    );
    expect(dukeRow?.className).toContain("selected");
  });

  it("shows OUT badge for eliminated teams", () => {
    render(
      <GameSlot
        gameSlot={21}
        teamA={eliminatedTeam}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={false}
        isCorrect={null}
        onPick={mockOnPick}
      />
    );

    expect(screen.getByText("OUT")).toBeInTheDocument();
  });
});
