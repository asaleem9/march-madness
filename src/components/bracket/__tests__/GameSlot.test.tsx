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
    expect(screen.getByText("Seed 1")).toBeInTheDocument();
    expect(screen.getByText("Seed 16")).toBeInTheDocument();
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

  it("shows First Four hints when team is null but hint provided", () => {
    render(
      <GameSlot
        gameSlot={5}
        teamA={null}
        teamB={lehigh}
        selectedTeamId={null}
        winnerId={null}
        isEditable={true}
        isCorrect={null}
        onPick={mockOnPick}
        firstFourHintA={{
          teamAName: "Texas",
          teamBName: "NC State",
          teamAId: 200,
          teamBId: 201,
        }}
      />
    );

    expect(screen.getByText("Texas")).toBeInTheDocument();
    expect(screen.getByText("NC State")).toBeInTheDocument();
    expect(screen.getByText("Play-In")).toBeInTheDocument();
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
