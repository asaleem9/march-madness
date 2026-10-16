import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRealtimeGames, REFRESH_DEBOUNCE_MS } from "../useRealtimeGames";
import { useChangedSlots } from "../useChangedSlots";
import { useToastStore } from "../useToast";

// --- Mocks ---

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

type ChangeHandler = (payload: {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}) => void;

let session: { user: { id: string } } | null = null;
let authCallback:
  | ((event: string, session: { user: { id: string } } | null) => void)
  | null = null;
const authUnsubscribe = vi.fn();
const mockRemoveChannel = vi.fn();
const channels: { handler: ChangeHandler | null; subscribed: boolean }[] = [];

function makeChannel() {
  const entry: { handler: ChangeHandler | null; subscribed: boolean } = {
    handler: null,
    subscribed: false,
  };
  channels.push(entry);
  const channel = {
    on: (_type: string, _filter: unknown, handler: ChangeHandler) => {
      entry.handler = handler;
      return channel;
    },
    subscribe: () => {
      entry.subscribed = true;
      return channel;
    },
  };
  return channel;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      onAuthStateChange: (
        cb: (event: string, s: { user: { id: string } } | null) => void
      ) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: authUnsubscribe } } };
      },
    },
    channel: () => makeChannel(),
    removeChannel: mockRemoveChannel,
  }),
}));

// --- Helpers ---

const flushPromises = () => act(async () => {});

function fire(slot: number) {
  const live = channels[channels.length - 1];
  act(() => live.handler?.({ new: { game_slot: slot } }));
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockRefresh.mockClear();
  mockRemoveChannel.mockClear();
  authUnsubscribe.mockClear();
  channels.length = 0;
  authCallback = null;
  session = { user: { id: "u1" } };
  useChangedSlots.getState().clear();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useRealtimeGames", () => {
  it("does not open a channel for anonymous visitors", async () => {
    session = null;
    renderHook(() => useRealtimeGames());
    await flushPromises();
    expect(channels).toHaveLength(0);
  });

  it("subscribes for an authenticated user and debounces a burst into one refresh", async () => {
    renderHook(() => useRealtimeGames());
    await flushPromises();
    expect(channels).toHaveLength(1);
    expect(channels[0].subscribed).toBe(true);

    fire(13);
    fire(14);
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 100));
    expect(mockRefresh).not.toHaveBeenCalled();

    fire(14);
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 100));
    // Still within the sliding window of the last change.
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(100));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(useChangedSlots.getState().slots).toEqual([13, 14]);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      "Scores updated",
    ]);
  });

  it("clears the flashed slots after the flash window", async () => {
    renderHook(() => useRealtimeGames());
    await flushPromises();
    fire(75);
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(useChangedSlots.getState().slots).toEqual([75]);
    act(() => vi.advanceTimersByTime(1500));
    expect(useChangedSlots.getState().slots).toEqual([]);
  });

  it("refreshes and resubscribes when the tab becomes visible, without a toast", async () => {
    renderHook(() => useRealtimeGames());
    await flushPromises();
    expect(channels).toHaveLength(1);

    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS + 1));
    setVisibility("hidden");
    expect(mockRefresh).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(2);
    expect(channels[1].subscribed).toBe(true);
    expect(useToastStore.getState().toasts).toEqual([]);

    // Focus fires right after visibilitychange in real browsers — coalesced.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on visibility for anonymous visitors", async () => {
    session = null;
    renderHook(() => useRealtimeGames());
    await flushPromises();
    setVisibility("hidden");
    setVisibility("visible");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(channels).toHaveLength(0);
  });

  it("follows auth state changes: opens on sign-in, closes on sign-out", async () => {
    session = null;
    renderHook(() => useRealtimeGames());
    await flushPromises();
    expect(channels).toHaveLength(0);

    act(() => authCallback?.("SIGNED_IN", { user: { id: "u1" } }));
    expect(channels).toHaveLength(1);

    act(() => authCallback?.("SIGNED_OUT", null));
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);

    // Signed out: coming back to the tab must not refresh or reopen a channel.
    setVisibility("hidden");
    setVisibility("visible");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(channels).toHaveLength(1);
  });

  it("tears everything down on unmount", async () => {
    const { unmount } = renderHook(() => useRealtimeGames());
    await flushPromises();
    fire(13);
    unmount();
    expect(authUnsubscribe).toHaveBeenCalled();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
