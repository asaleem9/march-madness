import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChampionModal, type ChampionModalProps } from "../ChampionModal";

const props: ChampionModalProps = {
  year: 2026,
  nextYear: 2027,
  champion: {
    name: "Michigan Wolverines",
    logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/130.png",
    score: 69,
  },
  runnerUp: {
    name: "UConn Huskies",
    logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/41.png",
    score: 63,
  },
};

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

function show() {
  // The card waits 1.2s before appearing so it never fights the hero on load.
  act(() => {
    vi.advanceTimersByTime(1300);
  });
}

describe("ChampionModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installStorage();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing before the delay, then the champion card from props", () => {
    render(<ChampionModal {...props} />);
    expect(screen.queryByRole("region")).toBeNull();

    show();

    const region = screen.getByRole("region", { name: "2026 champion and 2027 waitlist" });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Michigan Wolverines");
    expect(screen.getByText("2026 NCAA CHAMPIONS")).toBeInTheDocument();
    expect(screen.getByText("69")).toBeInTheDocument();
    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.getByAltText("Michigan Wolverines")).toHaveAttribute("src", props.champion.logoUrl);
    expect(screen.getByAltText("UConn Huskies")).toBeInTheDocument();
    expect(screen.getByText("Get notified when brackets open for 2027.")).toBeInTheDocument();
  });

  it("dismisses on the close button and remembers it under a year-scoped key", () => {
    render(<ChampionModal {...props} />);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem("champ-modal-2026")).toBe("true");
    expect(window.localStorage.getItem("champ-modal-2027")).toBeNull();
  });

  it("dismisses on Escape", () => {
    render(<ChampionModal {...props} />);
    show();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem("champ-modal-2026")).toBe("true");
  });

  it("stays hidden once dismissed for that year, but shows for a new year", () => {
    window.localStorage.setItem("champ-modal-2026", "true");
    const { unmount } = render(<ChampionModal {...props} />);
    show();
    expect(screen.queryByRole("region")).toBeNull();
    unmount();

    render(<ChampionModal {...props} year={2027} nextYear={2028} />);
    show();
    expect(
      screen.getByRole("region", { name: "2027 champion and 2028 waitlist" })
    ).toBeInTheDocument();
    expect(screen.getByText("2027 NCAA CHAMPIONS")).toBeInTheDocument();
  });

  it("handles a missing runner-up and logo without crashing", () => {
    render(
      <ChampionModal
        {...props}
        champion={{ name: "Duke Blue Devils", logoUrl: null, score: null }}
        runnerUp={null}
      />
    );
    show();

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Duke Blue Devils");
    expect(screen.queryByText("vs")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("posts the waitlist email and shows the success state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChampionModal {...props} />);
    show();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "fan@example.com" },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Notify Me" }).closest("form")!);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/waitlist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "fan@example.com" }),
      })
    );
    expect(screen.getByText("YOU'RE IN!")).toBeInTheDocument();
    expect(screen.getByText("We'll let you know when 2027 brackets open.")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
