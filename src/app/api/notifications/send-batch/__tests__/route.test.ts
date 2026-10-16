// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { createRecordingClient, type RecordedCall } from "@/test/helpers";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSendPushNotification = vi.fn();
const mockSendSMS = vi.fn();
const mockSendEmail = vi.fn();
const mockIsInQuietHours = vi.fn();

vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>(
    "@/lib/notifications"
  );
  return {
    ...actual,
    sendPushNotification: (...args: unknown[]) => mockSendPushNotification(...args),
    sendSMS: (...args: unknown[]) => mockSendSMS(...args),
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    isInQuietHours: (...args: unknown[]) => mockIsInQuietHours(...args),
  };
});

let client: ReturnType<typeof createRecordingClient>;
const mockGetUserById = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    ...client,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));

// Server client is only used by the admin-session auth fallback.
const mockServerGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockServerGetUser } })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
  }) as unknown as NextRequest;

const cronRequest = () => mockRequest({ authorization: "Bearer test-cron-secret" });

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    user_id: "user-1",
    type: "game_result",
    payload: { game_id: 1, picked: "Duke", correct: true, points: 20, winner: "Duke" },
    batch_key: "20270318-afternoon",
    sent: false,
    attempts: 0,
    created_at: "2027-03-18T14:00:00Z",
    ...overrides,
  };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    display_name: "TestUser",
    timezone: "America/New_York",
    phone: "+15551234567",
    notification_preferences: { push: true, sms: false, email: false, digest_only: false },
    ...overrides,
  };
}

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: "user-1",
    endpoint: "https://push.example.com/a",
    keys: { p256dh: "pk", auth: "ak" },
    ...overrides,
  };
}

const eqArg = (chain: RecordedCall[], column: string) =>
  chain.find((c) => c.method === "eq" && c.args[0] === column)?.args[1];

/**
 * Build a recording client for a scenario. `logCount` is the number of
 * notifications_log rows "already sent today" per user.
 */
function setup(opts: {
  queue: ReturnType<typeof queueItem>[];
  profiles?: Record<string, ReturnType<typeof profile>>;
  subs?: ReturnType<typeof sub>[];
  logCount?: Record<string, number>;
}) {
  const profiles = opts.profiles ?? { "user-1": profile() };
  const subs = opts.subs ?? [sub()];
  client = createRecordingClient((table, chain) => {
    const method = chain[0]?.method;
    if (table === "notification_queue" && method === "select") return opts.queue;
    if (table === "profiles") return profiles[eqArg(chain, "id") as string] ?? null;
    if (table === "push_subscriptions" && method === "select") {
      const uid = eqArg(chain, "user_id");
      return subs.filter((s) => s.user_id === uid);
    }
    if (table === "notifications_log" && method === "select") {
      const uid = eqArg(chain, "user_id") as string;
      const n = opts.logCount?.[uid] ?? 0;
      // createRecordingClient derives `count` from the array length.
      return Array.from({ length: n }, (_, i) => ({ id: i }));
    }
    return null;
  });
}

const sentIds = () =>
  client
    .updates("notification_queue")
    .filter((u) => (u.args[0] as { sent?: boolean }).sent === true)
    .flatMap((u) => client.filtersAfter(u).flatMap((f) => (f.method === "in" ? (f.args[1] as string[]) : [f.args[1] as string])));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("send-batch", () => {
  let POST: (request: NextRequest) => Promise<Response>;
  let GET: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    mockSendPushNotification.mockReset().mockResolvedValue(true);
    mockSendSMS.mockReset().mockResolvedValue(true);
    mockSendEmail.mockReset().mockResolvedValue(true);
    mockIsInQuietHours.mockReset().mockReturnValue(false);
    mockGetUserById.mockReset().mockResolvedValue({ data: { user: null } });
    mockServerGetUser.mockReset().mockResolvedValue({ data: { user: null } });
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.ADMIN_EMAILS = "admin@example.com";
    setup({ queue: [] });

    const mod = await import("../route");
    POST = mod.POST;
    GET = mod.GET;
  });

  it("returns 401 without a valid CRON_SECRET bearer or admin session", async () => {
    const res = await POST(mockRequest({ authorization: "Bearer bad-secret" }));
    expect(res.status).toBe(401);
  });

  it("accepts an admin session instead of the cron secret", async () => {
    mockServerGetUser.mockResolvedValue({ data: { user: { email: "admin@example.com" } } });
    const res = await GET(mockRequest());
    expect(res.status).toBe(200);
  });

  it("returns 200 with a message when the queue is empty", async () => {
    const res = await POST(cronRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("No pending notifications");
  });

  it("sends one consolidated message per user with personalised copy", async () => {
    setup({
      queue: [
        queueItem({ id: "q-1", payload: { picked: "Duke", correct: true, points: 20 } }),
        queueItem({ id: "q-2", payload: { picked: "Kansas", correct: false, points: 0 } }),
        queueItem({ id: "q-3", user_id: "user-2" }),
      ],
      profiles: { "user-1": profile(), "user-2": profile({ id: "user-2" }) },
      subs: [sub(), sub({ id: 2, user_id: "user-2", endpoint: "https://push.example.com/b" })],
    });

    const res = await POST(cronRequest());
    const body = await res.json();
    expect(body.sent).toBe(3);
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);

    const [, payload] = mockSendPushNotification.mock.calls[0];
    expect(payload).toEqual({
      title: "2 games decided",
      body: "Duke ✓ +20 · Kansas ✗ · 1 of 2 right today",
      url: "/dashboard",
    });
    expect(sentIds().sort()).toEqual(["q-1", "q-2", "q-3"]);
  });

  it("merges items from older batches into the same notification", async () => {
    setup({
      queue: [
        queueItem({ id: "q-old", batch_key: "20270317-evening", created_at: "2027-03-17T23:00:00Z" }),
        queueItem({ id: "q-new", payload: { picked: "Houston", correct: true, points: 10 } }),
      ],
    });

    await POST(cronRequest());

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendPushNotification.mock.calls[0][1].body).toBe(
      "Houston ✓ +10 · 1 of 1 right today\n1 earlier game: 1 right"
    );
    expect(sentIds().sort()).toEqual(["q-new", "q-old"]);
  });

  it("skips users in quiet hours", async () => {
    mockIsInQuietHours.mockReturnValue(true);
    setup({ queue: [queueItem(), queueItem({ id: "q-2" })] });

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(2);
    expect(body.sent).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockIsInQuietHours).toHaveBeenCalledWith("America/New_York");
  });

  it("enforces the 3-per-day cap", async () => {
    setup({ queue: [queueItem()], logCount: { "user-1": 3 } });

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(1);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("limits digest_only users to one notification per day", async () => {
    setup({
      queue: [queueItem()],
      profiles: {
        "user-1": profile({
          notification_preferences: { push: true, sms: false, email: false, digest_only: true },
        }),
      },
      logCount: { "user-1": 1 },
    });

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(1);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    // The item stays queued (not marked sent) for tomorrow's digest.
    expect(sentIds()).toEqual([]);
  });

  it("discards items for users who turned every channel off", async () => {
    setup({
      queue: [queueItem()],
      profiles: {
        "user-1": profile({
          notification_preferences: { push: false, sms: false, email: false, digest_only: false },
        }),
      },
    });

    const body = await (await POST(cronRequest())).json();
    expect(body.discarded).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(sentIds()).toEqual(["q-1"]);
  });

  it("sends via every preferred channel and logs once", async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { email: "user@example.com" } } });
    setup({
      queue: [queueItem()],
      profiles: {
        "user-1": profile({
          notification_preferences: { push: true, sms: true, email: true, digest_only: false },
        }),
      },
    });

    const body = await (await POST(cronRequest())).json();
    expect(body.sent).toBe(1);

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/a", keys: { p256dh: "pk", auth: "ak" } },
      expect.objectContaining({ title: "1 game decided" })
    );
    expect(mockSendSMS).toHaveBeenCalledWith(
      "+15551234567",
      "1 game decided: Duke ✓ +20 · 1 of 1 right today"
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      "user@example.com",
      "1 game decided",
      "Duke ✓ +20 · 1 of 1 right today"
    );

    const logs = client.inserts("notifications_log");
    expect(logs).toHaveLength(1);
    expect(logs[0].args[0]).toMatchObject({ user_id: "user-1", channel: "push" });
  });

  it("pushes to every device and deletes only the stale endpoint", async () => {
    mockSendPushNotification.mockImplementation(async (s: { endpoint: string }) =>
      s.endpoint !== "https://push.example.com/gone"
    );
    setup({
      queue: [queueItem()],
      subs: [sub({ id: 1 }), sub({ id: 2, endpoint: "https://push.example.com/gone" })],
    });

    const body = await (await POST(cronRequest())).json();
    expect(body.sent).toBe(1);
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);

    const deletes = client.calls.filter(
      (c) => c.table === "push_subscriptions" && c.method === "delete"
    );
    expect(deletes).toHaveLength(1);
    const inFilter = client.filtersAfter(deletes[0]).find((f) => f.method === "in");
    expect(inFilter?.args).toEqual(["id", [2]]);
  });

  it("bumps attempts and keeps the item when nothing is delivered", async () => {
    mockSendPushNotification.mockResolvedValue(false);
    setup({ queue: [queueItem({ attempts: 1 })] });

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(1);
    const updates = client.updates("notification_queue");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({ attempts: 2, sent: false });
    expect(client.inserts("notifications_log")).toHaveLength(0);
  });

  it("gives up after the fifth failed attempt", async () => {
    mockSendPushNotification.mockResolvedValue(false);
    setup({ queue: [queueItem({ attempts: 4 })] });

    await POST(cronRequest());
    expect(client.updates("notification_queue")[0].args[0]).toEqual({ attempts: 5, sent: true });
  });

  it("deep-links wager notifications to /wagers", async () => {
    setup({
      queue: [
        queueItem({
          id: "q-w",
          type: "wager_request",
          payload: { wager_id: "w1", challenger_name: "Alice", stakes: "Lunch" },
        }),
      ],
    });

    await POST(cronRequest());
    expect(mockSendPushNotification.mock.calls[0][1]).toEqual({
      title: "New wager challenge",
      body: "Alice challenged you: Lunch",
      url: "/wagers",
    });
  });
});
