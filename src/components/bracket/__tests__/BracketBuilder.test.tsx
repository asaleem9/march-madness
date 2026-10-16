import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BracketBuilder } from "../BracketBuilder";
import type { GameWithTeams, Team, Region, Round } from "@/types";

// --- Mocks ---

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}));

const mockSetPick = vi.fn();
const mockSetPicks = vi.fn();
const mockSetBracketName = vi.fn();
const mockHydrate = vi.fn();
const mockClearDownstreamPicks = vi.fn();
const mockPushUndo = vi.fn();
const mockUndo = vi.fn();
const mockMarkClean = vi.fn();
const mockMarkDirty = vi.fn();
const mockToast = vi.fn();

let storePicks = new Map<number, { gameSlot: number; round: Round; pickedTeamId: number }>();
let storeIsDirty = false;
let storeBracketName = "My Bracket";
let storePreviousPicks: Map<number, unknown> | null = null;

vi.mock("@/hooks/useBracket", () => ({
  useBracketStore: () => ({
    picks: storePicks,
    bracketName: storeBracketName,
    isDirty: storeIsDirty,
    previousPicks: storePreviousPicks,
    setPick: mockSetPick,
    setPicks: mockSetPicks,
    setBracketName: mockSetBracketName,
    hydrate: mockHydrate,
    clearDownstreamPicks: mockClearDownstreamPicks,
    pushUndo: mockPushUndo,
    undo: mockUndo,
    markClean: mockMarkClean,
    markDirty: mockMarkDirty,
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("../BracketView", () => ({
  BracketView: (props: Record<string, unknown>) => (
    <div data-testid="bracket-view" data-editable={String(props.isEditable)} />
  ),
}));

// --- Helpers ---

// Node 26 defines a `localStorage` global (undefined without --localstorage-file)
// that shadows jsdom's, so give the window an in-memory one.
function installStorage() {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
  return store;
}

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

const teamA1 = makeTeam({ id: 101, name: "Duke", seed: 1, region: "east" });
const teamB1 = makeTeam({ id: 102, name: "Lehigh", seed: 16, region: "east" });
const teamA2 = makeTeam({ id: 103, name: "Arizona", seed: 1, region: "west" });
const teamB2 = makeTeam({ id: 104, name: "Furman", seed: 16, region: "west" });
const teamA3 = makeTeam({ id: 105, name: "Florida", seed: 1, region: "south" });
const teamB3 = makeTeam({ id: 106, name: "Queens NC", seed: 16, region: "south" });

function makeGame(
  slot: number,
  round: Round,
  region: Region | null,
  tA: Team | null,
  tB: Team | null,
  nextSlot: number | null = null,
  position: "top" | "bottom" = "top",
): GameWithTeams {
  return {
    id: slot,
    round,
    region,
    gameSlot: slot,
    nextGameSlot: nextSlot,
    slotPosition: position,
    teamAId: tA?.id ?? null,
    teamBId: tB?.id ?? null,
    winnerId: null,
    scoreA: null,
    scoreB: null,
    scheduledAt: null,
    status: "scheduled",
    espnGameId: null,
    teamA: tA,
    teamB: tB,
    winner: null,
  };
}

const testGames: GameWithTeams[] = [
  makeGame(5, "first_round", "east", teamA1, teamB1, 37),
  makeGame(6, "first_round", "east", teamA1, teamB1, 37, "bottom"),
  makeGame(13, "first_round", "west", teamA2, teamB2, 41),
  makeGame(14, "first_round", "west", teamA2, teamB2, 41),
  makeGame(21, "first_round", "south", teamA3, teamB3, 45),
  makeGame(22, "first_round", "south", teamA3, teamB3, 45),
  makeGame(37, "second_round", "east", null, null, 53),
  makeGame(41, "second_round", "west", null, null, 55),
  makeGame(45, "second_round", "south", null, null, 57),
  makeGame(65, "final_four", null, null, null, 67),
  makeGame(67, "championship", null, null, null, null),
];

function resetStoreState() {
  storePicks = new Map();
  storeIsDirty = false;
  storeBracketName = "My Bracket";
  storePreviousPicks = null;
}

// --- Tests ---

describe("BracketBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStoreState();
    installStorage();
    global.fetch = vi.fn();
  });

  function renderEditable(overrides: Partial<Parameters<typeof BracketBuilder>[0]> = {}) {
    return render(
      <BracketBuilder
        games={testGames}
        isLocked={false}
        isOwner={true}
        {...overrides}
      />
    );
  }

  it("renders name input, Save Draft, and Finalize when editable", () => {
    renderEditable();
    expect(screen.getByDisplayValue("My Bracket")).toBeInTheDocument();
    expect(screen.getByText("Save Draft")).toBeInTheDocument();
    expect(screen.getByText("Finalize Bracket")).toBeInTheDocument();
  });

  it("Save Draft disabled when isDirty is false", () => {
    storeIsDirty = false;
    renderEditable();
    const saveBtn = screen.getByText("Save Draft");
    expect(saveBtn).toBeDisabled();
  });

  it("Save Draft stays disabled on a fresh load of an existing bracket", () => {
    const existingPicks = [
      { gameSlot: 5, round: "first_round", pickedTeamId: 101 },
      { gameSlot: 6, round: "first_round", pickedTeamId: 102 },
    ];
    renderEditable({ bracketId: "b1", existingPicks, existingName: "Ali's Bracket" });
    // Server state is loaded through hydrate (one call, isDirty stays false) —
    // never through a separate setBracketName that would dirty the draft.
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(mockHydrate).toHaveBeenCalledWith({
      picks: expect.arrayContaining([expect.objectContaining({ gameSlot: 5, pickedTeamId: 101 })]),
      bracketName: "Ali's Bracket",
    });
    expect(mockSetBracketName).not.toHaveBeenCalled();
    expect(mockMarkDirty).not.toHaveBeenCalled();
    expect(screen.getByText("Save Draft")).toBeDisabled();
  });

  it("restores a newer local draft, marks it dirty and toasts", () => {
    window.localStorage.setItem(
      "bracket-draft:user-1:b1",
      JSON.stringify({
        picks: [{ gameSlot: 5, round: "first_round", pickedTeamId: 102 }],
        bracketName: "Local name",
        savedAt: "2027-03-15T12:00:00Z",
      })
    );
    renderEditable({
      bracketId: "b1",
      userId: "user-1",
      serverUpdatedAt: "2027-03-14T12:00:00Z",
      existingPicks: [{ gameSlot: 5, round: "first_round", pickedTeamId: 101 }],
    });
    expect(mockHydrate).toHaveBeenCalledWith({
      picks: [expect.objectContaining({ gameSlot: 5, pickedTeamId: 102 })],
      bracketName: "Local name",
    });
    expect(mockMarkDirty).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("Restored unsaved picks", "info");
  });

  it("ignores (and clears) a local draft older than the server copy", () => {
    window.localStorage.setItem(
      "bracket-draft:user-1:b1",
      JSON.stringify({
        picks: [{ gameSlot: 5, round: "first_round", pickedTeamId: 102 }],
        bracketName: "Stale",
        savedAt: "2027-03-10T12:00:00Z",
      })
    );
    renderEditable({
      bracketId: "b1",
      userId: "user-1",
      serverUpdatedAt: "2027-03-14T12:00:00Z",
      existingPicks: [{ gameSlot: 5, round: "first_round", pickedTeamId: 101 }],
      existingName: "Server name",
    });
    expect(mockHydrate).toHaveBeenCalledWith({
      picks: [expect.objectContaining({ pickedTeamId: 101 })],
      bracketName: "Server name",
    });
    expect(mockMarkDirty).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("bracket-draft:user-1:b1")).toBeNull();
  });

  it("autosaves a dirty draft to localStorage", () => {
    storeIsDirty = true;
    storePicks.set(5, { gameSlot: 5, round: "first_round" as Round, pickedTeamId: 101 });
    renderEditable({ bracketId: "b1", userId: "user-1" });
    const raw = window.localStorage.getItem("bracket-draft:user-1:b1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).picks).toEqual([{ gameSlot: 5, round: "first_round", pickedTeamId: 101 }]);
  });

  it("Finalize disabled when picks < 63 and shows how many remain", () => {
    // storePicks is empty, so picks.size === 0
    renderEditable();
    const finalizeBtn = screen.getByText("Finalize Bracket");
    expect(finalizeBtn).toBeDisabled();
    expect(finalizeBtn).not.toHaveAttribute("title");
    expect(screen.getByText("63 picks remaining to finalize")).toBeInTheDocument();
  });

  it("calls POST for new bracket (no bracketId prop)", async () => {
    storeIsDirty = true;
    const mockResponse = { bracketId: "new-id-123" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    renderEditable();
    await act(async () => {
      fireEvent.click(screen.getByText("Save Draft"));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/brackets", expect.objectContaining({
      method: "POST",
    }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/new-id-123?saved=1");
    });
  });

  it("calls PUT for existing bracket (has bracketId)", async () => {
    storeIsDirty = true;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    renderEditable({ bracketId: "existing-bracket-456" });
    await act(async () => {
      fireEvent.click(screen.getByText("Save Draft"));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/brackets", expect.objectContaining({
      method: "PUT",
    }));
  });

  it("shows success message on draft save", async () => {
    storeIsDirty = true;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    renderEditable({ bracketId: "existing-bracket" });
    await act(async () => {
      fireEvent.click(screen.getByText("Save Draft"));
    });

    await waitFor(() => {
      expect(screen.getByText("Draft saved!")).toBeInTheDocument();
    });
  });

  it("shows error message on failed save", async () => {
    storeIsDirty = true;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Deadline has passed" }),
    });

    renderEditable({ bracketId: "existing-bracket" });
    await act(async () => {
      fireEvent.click(screen.getByText("Save Draft"));
    });

    await waitFor(() => {
      expect(screen.getByText("Deadline has passed")).toBeInTheDocument();
    });
  });

  it("401 shows a session-expired link back to the bracket", async () => {
    storeIsDirty = true;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });

    renderEditable({ bracketId: "existing-bracket" });
    await act(async () => {
      fireEvent.click(screen.getByText("Save Draft"));
    });

    const link = await screen.findByRole("link", { name: "Log in again" });
    expect(link.getAttribute("href")).toMatch(/^\/login\?redirect=/);
    expect(screen.getByRole("alert")).toHaveTextContent(/session expired/i);
  });

  it("clears the local draft and redirects with ?finalized=1 when locking a new bracket", async () => {
    for (let i = 5; i < 68; i++) {
      storePicks.set(i, { gameSlot: i, round: "first_round" as Round, pickedTeamId: 100 + i });
    }
    storeIsDirty = true;
    window.localStorage.setItem("bracket-draft:user-1:new", JSON.stringify({ picks: [], bracketName: "x", savedAt: "2027-01-01T00:00:00Z" }));
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ bracketId: "new-id" }),
    });

    renderEditable({ userId: "user-1" });
    await act(async () => {
      fireEvent.click(screen.getByText("Finalize Bracket"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Lock It In"));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/new-id?finalized=1");
    });
    expect(window.localStorage.getItem("bracket-draft:user-1:new")).toBeNull();
  });

  it("finalize dialog is a modal: role, Escape closes, Cancel is focused", async () => {
    for (let i = 5; i < 68; i++) {
      storePicks.set(i, { gameSlot: i, round: "first_round" as Round, pickedTeamId: 100 + i });
    }
    renderEditable({ bracketId: "b" });
    await act(async () => {
      fireEvent.click(screen.getByText("Finalize Bracket"));
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(screen.getByText("Cancel"));

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Undo is disabled until a pick has been made, then calls the store", () => {
    renderEditable();
    expect(screen.getByText("Undo")).toBeDisabled();
  });

  it("Undo calls undo() when a snapshot exists", () => {
    storePreviousPicks = new Map();
    renderEditable();
    fireEvent.click(screen.getByText("Undo"));
    expect(mockUndo).toHaveBeenCalled();
  });

  it("Fill remaining with better seeds fills only the empty slots of the current step", () => {
    // East: slot 5 already picked (Lehigh), slot 6 empty → only slot 6 is filled with the 1-seed.
    storePicks.set(5, { gameSlot: 5, round: "first_round" as Round, pickedTeamId: 102 });
    renderEditable();
    fireEvent.click(screen.getByText("Fill remaining with better seeds"));
    expect(mockPushUndo).toHaveBeenCalled();
    expect(mockSetPicks).toHaveBeenCalledTimes(1);
    const added = mockSetPicks.mock.calls[0][0] as { gameSlot: number; pickedTeamId: number }[];
    const slots = added.map((p) => p.gameSlot).sort((a, b) => a - b);
    expect(slots).not.toContain(5);
    expect(slots).toContain(6);
    expect(added.find((p) => p.gameSlot === 6)!.pickedTeamId).toBe(101); // Duke, the 1-seed
    // R2 slot 37 is fed by 5 (Lehigh, picked) and 6 (Duke, filled) → Duke (seed 1) over Lehigh (16)
    expect(added.find((p) => p.gameSlot === 37)!.pickedTeamId).toBe(101);
    // Nothing from the West region
    expect(slots.some((s) => s === 13 || s === 14 || s === 41)).toBe(false);
  });

  it("read-only owner view shows the deadline banner when not finalized", () => {
    render(
      <BracketBuilder
        games={testGames}
        bracketId="b"
        isLocked={true}
        finalized={false}
        deadlinePassed={true}
        isOwner={true}
        existingPicks={[]}
      />
    );
    expect(screen.getByText(/DEADLINE PASSED/)).toBeInTheDocument();
    expect(screen.queryByText(/BRACKET FINALIZED/)).not.toBeInTheDocument();
  });

  it("Finalize button opens confirmation dialog instead of saving directly", async () => {
    for (let i = 5; i < 68; i++) {
      storePicks.set(i, { gameSlot: i, round: "first_round" as Round, pickedTeamId: 100 + i });
    }
    storeIsDirty = true;

    renderEditable({ bracketId: "bracket-to-lock" });
    await act(async () => {
      fireEvent.click(screen.getByText("Finalize Bracket"));
    });

    // Dialog should appear, no fetch yet
    expect(screen.getByText("FINALIZE BRACKET?")).toBeInTheDocument();
    expect(screen.getByText(/lock your bracket permanently/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("confirmation dialog Cancel closes without saving", async () => {
    for (let i = 5; i < 68; i++) {
      storePicks.set(i, { gameSlot: i, round: "first_round" as Round, pickedTeamId: 100 + i });
    }
    renderEditable({ bracketId: "bracket-to-lock" });

    await act(async () => {
      fireEvent.click(screen.getByText("Finalize Bracket"));
    });
    expect(screen.getByText("FINALIZE BRACKET?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Cancel"));
    });
    expect(screen.queryByText("FINALIZE BRACKET?")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("confirmation dialog Lock It In finalizes and shows banner", async () => {
    for (let i = 5; i < 68; i++) {
      storePicks.set(i, { gameSlot: i, round: "first_round" as Round, pickedTeamId: 100 + i });
    }
    storeIsDirty = true;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    renderEditable({ bracketId: "bracket-to-lock" });
    await act(async () => {
      fireEvent.click(screen.getByText("Finalize Bracket"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Lock It In"));
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(/BRACKET FINALIZED/)).toBeInTheDocument();
    });
  });

  it("button disabled during saving state (double-click protection)", async () => {
    storeIsDirty = true;
    let resolveFetch!: (value: unknown) => void;
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    renderEditable({ bracketId: "bracket-abc" });

    const saveBtn = screen.getByText("Save Draft");

    // Fire multiple rapid clicks before React can re-render
    await act(async () => {
      fireEvent.click(saveBtn);
      fireEvent.click(saveBtn);
      fireEvent.click(saveBtn);
    });

    // The ref guard should ensure only one fetch call despite multiple clicks
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // While saving, both buttons should show "Saving..." and be disabled
    const savingButtons = screen.getAllByText("Saving...");
    savingButtons.forEach((btn) => expect(btn).toBeDisabled());

    // Resolve to clean up
    await act(async () => {
      resolveFetch({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("loads existing picks on mount", () => {
    const existingPicks = [
      { gameSlot: 5, round: "first_round", pickedTeamId: 101 },
      { gameSlot: 6, round: "first_round", pickedTeamId: 102 },
    ];
    renderEditable({ existingPicks });
    expect(mockHydrate).toHaveBeenCalledWith(
      expect.objectContaining({
        picks: expect.arrayContaining([
          expect.objectContaining({ gameSlot: 5, pickedTeamId: 101 }),
          expect.objectContaining({ gameSlot: 6, pickedTeamId: 102 }),
        ]),
      })
    );
  });

  it("step navigation changes currentStep", () => {
    renderEditable();

    // Default step is "east", click "West" tab
    const westTab = screen.getByText("WEST");
    fireEvent.click(westTab);

    // The step counter should now show "2 / 5"
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("pick count shows X/63", () => {
    storePicks.set(5, { gameSlot: 5, round: "first_round" as Round, pickedTeamId: 101 });
    storePicks.set(6, { gameSlot: 6, round: "first_round" as Round, pickedTeamId: 102 });

    renderEditable();
    expect(screen.getByText(/2\/63 PICKS/)).toBeInTheDocument();
  });

  it("isLocked=true hides edit controls", () => {
    render(
      <BracketBuilder games={testGames} isLocked={true} isOwner={true} />
    );
    expect(screen.queryByText("Save Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Finalize Bracket")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("My Bracket")).not.toBeInTheDocument();
  });

  it("isOwner=false hides edit controls", () => {
    render(
      <BracketBuilder games={testGames} isLocked={false} isOwner={false} />
    );
    expect(screen.queryByText("Save Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Finalize Bracket")).not.toBeInTheDocument();
  });

  it("409 response redirects to existing bracket instead of showing error", async () => {
    storeIsDirty = true;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "You already have a bracket", bracketId: "existing-123" }),
    });

    renderEditable();
    await act(async () => {
      fireEvent.click(screen.getByText("Save Draft"));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/existing-123");
    });
    // Should NOT show an error message
    expect(screen.queryByText("You already have a bracket")).not.toBeInTheDocument();
  });

  it("step tabs show correct labels", () => {
    renderEditable();
    expect(screen.getByText("EAST")).toBeInTheDocument();
    expect(screen.getByText("WEST")).toBeInTheDocument();
    expect(screen.getByText("SOUTH")).toBeInTheDocument();
    expect(screen.getByText("MIDWEST")).toBeInTheDocument();
    expect(screen.getByText("FINAL FOUR")).toBeInTheDocument();
  });
});
