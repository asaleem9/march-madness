// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSendPushNotification = vi.fn().mockResolvedValue(true);
const mockSendSMS = vi.fn().mockResolvedValue(true);
const mockSendEmail = vi.fn().mockResolvedValue(true);
const mockIsInQuietHours = vi.fn().mockReturnValue(false);
const mockGetPreferredChannels = vi.fn().mockReturnValue(["push"]);

vi.mock("@/lib/notifications", () => ({
  sendPushNotification: (...args: unknown[]) => mockSendPushNotification(...args),
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  isInQuietHours: (...args: unknown[]) => mockIsInQuietHours(...args),
  getPreferredChannels: (...args: unknown[]) => mockGetPreferredChannels(...args),
}));

type MockBuilder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
};

let fromImpl: ((table: string) => MockBuilder) | null = null;

function createBuilder(defaultData: unknown = null): MockBuilder {
  const result = { data: defaultData, error: null, count: 0 };
  const builder: MockBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    order: vi.fn().mockResolvedValue(result),
  };
  return builder;
}

const mockAuth = {
  admin: {
    getUserById: vi.fn().mockResolvedValue({ data: { user: null } }),
  },
};

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (fromImpl) return fromImpl(table);
    return createBuilder();
  }),
  auth: mockAuth,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? headers?.[name] ?? null,
    },
  }) as unknown as NextRequest;

function makeQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    user_id: "user-1",
    type: "game_result",
    payload: { game_id: "g1", team_a: "Duke", team_b: "Lehigh", winner: "Duke", score: "75-68" },
    batch_key: "20260318-afternoon",
    sent: false,
    created_at: "2026-03-18T14:00:00Z",
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    display_name: "TestUser",
    timezone: "America/New_York",
    phone: "+15551234567",
    notification_preferences: { push: true, sms: false, email: false, digest_only: false },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/notifications/send-batch", () => {
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    fromImpl = null;
    mockSendPushNotification.mockReset().mockResolvedValue(true);
    mockSendSMS.mockReset().mockResolvedValue(true);
    mockSendEmail.mockReset().mockResolvedValue(true);
    mockIsInQuietHours.mockReset().mockReturnValue(false);
    mockGetPreferredChannels.mockReset().mockReturnValue(["push"]);
    mockSupabase.from.mockClear();
    mockAuth.admin.getUserById.mockReset().mockResolvedValue({ data: { user: null } });

    process.env.CRON_SECRET = "test-cron-secret";

    const mod = await import("../route");
    POST = mod.POST;
  });

  // 1. Auth check
  it("returns 401 without a valid CRON_SECRET bearer token", async () => {
    const res = await POST(mockRequest({ authorization: "Bearer bad-secret" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  // 2. Empty queue
  it("returns 200 with message when queue is empty", async () => {
    fromImpl = (table: string) => {
      const builder = createBuilder();
      if (table === "notification_queue") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [] }),
          }),
        });
      }
      return builder;
    };

    const res = await POST(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("No pending notifications");
  });

  // 3. Groups by user_id + batch_key
  it("groups queue items by user_id and batch_key", async () => {
    const queueItems = [
      makeQueueItem({ id: "q-1", user_id: "user-1", batch_key: "20260318-afternoon" }),
      makeQueueItem({ id: "q-2", user_id: "user-1", batch_key: "20260318-afternoon" }),
      makeQueueItem({ id: "q-3", user_id: "user-2", batch_key: "20260318-afternoon" }),
    ];
    const profile1 = makeProfile({ id: "user-1" });
    const profile2 = makeProfile({ id: "user-2" });
    const pushSub = { id: "sub-1", user_id: "user-1", endpoint: "https://push.example.com", keys: { p256dh: "key1", auth: "auth1" } };

    let markedSentIds: string[] = [];

    fromImpl = (table: string) => {
      const builder = createBuilder();

      if (table === "notification_queue") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: queueItems }),
          }),
        });
        builder.update.mockReturnValue({
          in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
            markedSentIds = [...markedSentIds, ...ids];
            return Promise.resolve({ data: null, error: null });
          }),
        });
      }

      if (table === "profiles") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, val: string) => ({
            single: vi.fn().mockResolvedValue({
              data: val === "user-1" ? profile1 : profile2,
            }),
          })),
        });
      }

      if (table === "notifications_log") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        });
        builder.insert.mockResolvedValue({ data: null, error: null });
      }

      if (table === "push_subscriptions") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: pushSub }),
          }),
        });
      }

      return builder;
    };

    const res = await POST(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // All 3 items should be marked as sent (2 for user-1 batch + 1 for user-2 batch)
    expect(body.sent).toBe(3);

    // Push notification should be called twice (once per batch group)
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);

    // The message for user-1 should mention 2 games
    const firstCallBody = mockSendPushNotification.mock.calls[0][1].body;
    expect(firstCallBody).toContain("2 game(s) decided");
  });

  // 4. Skips users in quiet hours
  it("skips users in quiet hours and reports them as skipped", async () => {
    const queueItems = [
      makeQueueItem({ id: "q-1", user_id: "user-quiet", batch_key: "20260318-evening" }),
      makeQueueItem({ id: "q-2", user_id: "user-quiet", batch_key: "20260318-evening" }),
    ];
    const profile = makeProfile({ id: "user-quiet", timezone: "America/New_York" });

    mockIsInQuietHours.mockReturnValue(true);

    fromImpl = (table: string) => {
      const builder = createBuilder();

      if (table === "notification_queue") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: queueItems }),
          }),
        });
        builder.update.mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      }

      if (table === "profiles") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profile }),
          }),
        });
      }

      return builder;
    };

    const res = await POST(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.skipped).toBe(2);
    expect(body.sent).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockIsInQuietHours).toHaveBeenCalledWith("America/New_York");
  });

  // 5. Enforces 3/day rate limit
  it("enforces the 3-per-day rate limit and skips over-limit users", async () => {
    const queueItems = [
      makeQueueItem({ id: "q-1", user_id: "user-limited" }),
    ];
    const profile = makeProfile({ id: "user-limited" });

    fromImpl = (table: string) => {
      const builder = createBuilder();

      if (table === "notification_queue") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: queueItems }),
          }),
        });
        builder.update.mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      }

      if (table === "profiles") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profile }),
          }),
        });
      }

      if (table === "notifications_log") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 3 }), // already at limit
          }),
        });
      }

      return builder;
    };

    const res = await POST(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  // 6. Sends via preferred channels
  it("sends notifications via all preferred channels (push, sms, email)", async () => {
    const queueItems = [makeQueueItem({ id: "q-1", user_id: "user-multi" })];
    const profile = makeProfile({
      id: "user-multi",
      phone: "+15559876543",
      notification_preferences: { push: true, sms: true, email: true, digest_only: false },
    });
    const pushSub = {
      id: "sub-1",
      user_id: "user-multi",
      endpoint: "https://push.example.com/multi",
      keys: { p256dh: "pk", auth: "ak" },
    };

    mockGetPreferredChannels.mockReturnValue(["push", "sms", "email"]);
    mockAuth.admin.getUserById.mockResolvedValue({
      data: { user: { email: "user@example.com" } },
    });

    fromImpl = (table: string) => {
      const builder = createBuilder();

      if (table === "notification_queue") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: queueItems }),
          }),
        });
        builder.update.mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      }

      if (table === "profiles") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profile }),
          }),
        });
      }

      if (table === "notifications_log") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        });
        builder.insert.mockResolvedValue({ data: null, error: null });
      }

      if (table === "push_subscriptions") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: pushSub }),
          }),
        });
      }

      return builder;
    };

    const res = await POST(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);

    // Push was called with subscription data and message
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/multi", keys: { p256dh: "pk", auth: "ak" } },
      expect.objectContaining({ title: "March Madness Update", body: expect.any(String) })
    );

    // SMS was called with phone and message
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(mockSendSMS).toHaveBeenCalledWith("+15559876543", expect.any(String));

    // Email was called after fetching user email via admin auth
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      "user@example.com",
      "March Madness Update",
      expect.any(String)
    );
  });

  // 7. Cleans up stale push subscriptions
  it("deletes stale push subscription when push notification fails", async () => {
    const queueItems = [makeQueueItem({ id: "q-stale", user_id: "user-stale" })];
    const profile = makeProfile({ id: "user-stale" });
    const pushSub = {
      id: "sub-stale",
      user_id: "user-stale",
      endpoint: "https://push.example.com/gone",
      keys: { p256dh: "pk", auth: "ak" },
    };

    // Push fails (returns false — simulating 410 gone)
    mockSendPushNotification.mockResolvedValue(false);
    mockGetPreferredChannels.mockReturnValue(["push"]);

    let deletedSubId: string | null = null;

    fromImpl = (table: string) => {
      const builder = createBuilder();

      if (table === "notification_queue") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: queueItems }),
          }),
        });
        builder.update.mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      }

      if (table === "profiles") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profile }),
          }),
        });
      }

      if (table === "notifications_log") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        });
        builder.insert.mockResolvedValue({ data: null, error: null });
      }

      if (table === "push_subscriptions") {
        builder.select.mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: pushSub }),
          }),
        });
        builder.delete.mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, val: string) => {
            deletedSubId = val;
            return Promise.resolve({ data: null, error: null });
          }),
        });
      }

      return builder;
    };

    const res = await POST(mockRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);

    // Push was attempted
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);

    // Stale subscription should have been deleted
    expect(deletedSubId).toBe("sub-stale");

    // Since push failed, no log entry should have been created for the push channel
    // (the handler only logs on success)
  });
});
