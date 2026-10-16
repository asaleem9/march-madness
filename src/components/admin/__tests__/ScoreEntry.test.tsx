import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScoreEntry, deriveWinner } from "../ScoreEntry";
import type { GameForAdmin } from "../types";

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

const duke = { id: 1, name: "Duke", seed: 1 };
const unc = { id: 2, name: "UNC", seed: 16 };

function game(overrides: Partial<GameForAdmin> = {}): GameForAdmin {
  return {
    id: 10,
    round: "first_round",
    region: "east",
    game_slot: 13,
    status: "scheduled",
    score_a: null,
    score_b: null,
    winner_id: null,
    espn_game_id: null,
    clock: null,
    period: null,
    team_a: duke,
    team_b: unc,
    ...overrides,
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
});
afterEach(() => vi.unstubAllGlobals());

describe("deriveWinner", () => {
  it("picks the higher score and returns null on ties or blanks", () => {
    const g = game();
    expect(deriveWinner(g, "70", "65")).toBe(1);
    expect(deriveWinner(g, "60", "65")).toBe(2);
    expect(deriveWinner(g, "65", "65")).toBeNull();
    expect(deriveWinner(g, "", "65")).toBeNull();
  });
});

describe("ScoreEntry", () => {
  it("auto-derives the winner from the scores and submits it", async () => {
    const onGameUpdated = vi.fn();
    render(<ScoreEntry games={[game()]} onGameUpdated={onGameUpdated} />);

    fireEvent.click(screen.getByRole("button", { name: "Enter score" }));
    fireEvent.change(screen.getByLabelText("Duke"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("UNC"), { target: { value: "65" } });

    const winner = screen.getByLabelText(/Winner/) as HTMLSelectElement;
    expect(winner.value).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      game_id: 10,
      score_a: 70,
      score_b: 65,
      winner_id: 1,
      status: "final",
    });
    await waitFor(() => expect(onGameUpdated).toHaveBeenCalled());
    expect(onGameUpdated.mock.calls[0][0]).toMatchObject({ id: 10, status: "final", winner_id: 1 });
  });

  it("shows the API error inline", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Winner contradicts the scores" }),
    });
    render(<ScoreEntry games={[game()]} onGameUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter score" }));
    fireEvent.change(screen.getByLabelText("Duke"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("UNC"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText(/Winner/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Winner contradicts the scores"));
  });

  it("refuses a tied final before calling the API", () => {
    render(<ScoreEntry games={[game()]} onGameUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter score" }));
    fireEvent.change(screen.getByLabelText("Duke"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("UNC"), { target: { value: "65" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/tied/);
  });

  it("lists final games under a collapsible section with Edit that re-submits", async () => {
    const final = game({ id: 11, game_slot: 14, status: "final", score_a: 80, score_b: 70, winner_id: 1 });
    render(<ScoreEntry games={[final]} onGameUpdated={vi.fn()} />);

    expect(screen.getByText("No games are waiting for a score.")).toBeInTheDocument();
    expect(screen.getByText("Final games (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Duke") as HTMLInputElement).value).toBe("80");

    fireEvent.change(screen.getByLabelText("UNC"), { target: { value: "82" } });
    expect((screen.getByLabelText(/Winner/) as HTMLSelectElement).value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Re-submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ game_id: 11, winner_id: 2 });
  });

  it("shows clock and period for in-progress games", () => {
    render(
      <ScoreEntry
        games={[game({ status: "in_progress", clock: "4:32", period: 2, score_a: 40, score_b: 38 })]}
        onGameUpdated={vi.fn()}
      />
    );
    expect(screen.getByText(/LIVE · H2 4:32 · 40–38/)).toBeInTheDocument();
  });
});
