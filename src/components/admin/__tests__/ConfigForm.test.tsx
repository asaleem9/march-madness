import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfigForm, diffConfig } from "../ConfigForm";
import { toLocalInput } from "../datetime";
import type { AdminConfig } from "../types";

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

const base: AdminConfig = {
  id: 1,
  year: 2027,
  bracket_lock_deadline: "2027-03-18T16:00:00+00:00",
  wager_creation_deadline: "2027-03-18T16:00:00Z",
  active_phase: "pre_tournament",
  scoring_multipliers: {
    first_round: 10,
    second_round: 20,
    sweet_16: 40,
    elite_eight: 80,
    final_four: 160,
    championship: 320,
  },
  final_four_pairing: [
    ["east", "west"],
    ["south", "midwest"],
  ],
  last_score_update_at: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
});
afterEach(() => vi.unstubAllGlobals());

describe("diffConfig", () => {
  it("returns no updates when the draft matches the saved config", () => {
    const draft = {
      year: "2027",
      lock: toLocalInput(base.bracket_lock_deadline),
      wager: toLocalInput(base.wager_creation_deadline),
      phase: "pre_tournament" as const,
      multipliers: {
        first_round: "10",
        second_round: "20",
        sweet_16: "40",
        elite_eight: "80",
        final_four: "160",
        championship: "320",
      },
      pairing: ["east", "west", "south", "midwest"] as ["east", "west", "south", "midwest"],
    };
    expect(diffConfig(base, draft)).toEqual({ updates: {}, errors: [] });
  });
});

describe("ConfigForm", () => {
  it("disables Save with no changes, then sends ONE PUT with only the changed fields", async () => {
    const onSaved = vi.fn();
    render(<ConfigForm config={base} onSaved={onSaved} />);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Bracket lock deadline/), {
      target: { value: "2027-03-18T13:30" },
    });
    expect(screen.getByTestId("lock-utc")).toHaveTextContent("UTC");
    fireEvent.change(screen.getByLabelText("Championship"), { target: { value: "400" } });

    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/config");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(["bracket_lock_deadline", "scoring_multipliers"]);
    expect(body.bracket_lock_deadline).toBe(new Date(2027, 2, 18, 13, 30).toISOString());
    expect(body.scoring_multipliers).toEqual({ ...base.scoring_multipliers, championship: 400 });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0].scoring_multipliers.championship).toBe(400);
    expect(screen.getByText(/^Saved /)).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith("Config saved", "success");
  });

  it("asks for confirmation before saving a phase change", async () => {
    render(<ConfigForm config={base} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Active phase"), { target: { value: "first_round" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Pre Tournament.*First Round/);

    fireEvent.click(screen.getByRole("button", { name: "Yes, save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ active_phase: "first_round" });
  });

  it("blocks Save when the Final Four pairing repeats a region and surfaces a 409 from the API", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Elite Eight games are already final; the pairing can't change" }),
    });
    render(<ConfigForm config={base} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Semi A bottom"), { target: { value: "east" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/each region exactly once/);

    // Swap to a valid but different pairing.
    fireEvent.change(screen.getByLabelText("Semi A bottom"), { target: { value: "south" } });
    fireEvent.change(screen.getByLabelText("Semi B top"), { target: { value: "west" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByText(/already final/)).toBeInTheDocument());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      final_four_pairing: [
        ["east", "south"],
        ["west", "midwest"],
      ],
    });
    expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/already final/), "error");
  });

  it("disables Save on an invalid deadline", () => {
    render(<ConfigForm config={base} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Bracket lock deadline/), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByTestId("lock-utc")).toHaveTextContent("Invalid date");
  });
});
