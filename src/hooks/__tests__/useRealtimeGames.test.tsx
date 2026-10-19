import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRealtimeGames, POLL_INTERVAL_MS } from "../useRealtimeGames";

// --- Mocks ---

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockUseSession = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => mockUseSession() },
}));

// --- Helpers ---

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const signedIn = { data: { user: { id: "u1", email: "u1@test.com" } }, isPending: false };
const signedOut = { data: null, isPending: false };

beforeEach(() => {
  vi.useFakeTimers();
  mockRefresh.mockClear();
  mockUseSession.mockReturnValue(signedIn);
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useRealtimeGames", () => {
  it("does not poll for anonymous visitors", () => {
    mockUseSession.mockReturnValue(signedOut);
    renderHook(() => useRealtimeGames());
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 3));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("waits for the session to load before polling", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const { rerender } = renderHook(() => useRealtimeGames());
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(mockRefresh).not.toHaveBeenCalled();

    mockUseSession.mockReturnValue(signedIn);
    rerender();
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes the page every interval for a signed-in user", () => {
    renderHook(() => useRealtimeGames());
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS - 1));
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 2));
    expect(mockRefresh).toHaveBeenCalledTimes(3);
  });

  it("pauses while hidden and refreshes immediately when the tab comes back", () => {
    renderHook(() => useRealtimeGames());

    setVisibility("hidden");
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 4));
    expect(mockRefresh).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    // The interval restarts from the moment the tab became visible.
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh on visibility for anonymous visitors", () => {
    mockUseSession.mockReturnValue(signedOut);
    renderHook(() => useRealtimeGames());
    setVisibility("hidden");
    setVisibility("visible");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("stops polling on sign-out", () => {
    const { rerender } = renderHook(() => useRealtimeGames());
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    mockUseSession.mockReturnValue(signedOut);
    rerender();
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 2));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("tears the interval down on unmount", () => {
    const { unmount } = renderHook(() => useRealtimeGames());
    unmount();
    act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 2));
    expect(mockRefresh).not.toHaveBeenCalled();
    setVisibility("hidden");
    setVisibility("visible");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
