// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRecordingClient } from "@/test/helpers";

const mockSendPushNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  sendPushNotification: (...args: unknown[]) => mockSendPushNotification(...args),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

let admin: ReturnType<typeof createRecordingClient>;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => admin),
}));

import { POST } from "../route";

function setup(opts: { recentTests?: number; subs?: Array<{ id: number; endpoint: string }> }) {
  admin = createRecordingClient((table, chain) => {
    if (table === "notifications_log" && chain[0]?.method === "select") {
      return Array.from({ length: opts.recentTests ?? 0 }, (_, i) => ({ id: i }));
    }
    if (table === "push_subscriptions" && chain[0]?.method === "select") {
      return (opts.subs ?? [{ id: 1, endpoint: "https://push.example.com/a" }]).map((s) => ({
        ...s,
        keys: { p256dh: "pk", auth: "ak" },
      }));
    }
    return null;
  });
}

beforeEach(() => {
  mockSendPushNotification.mockReset().mockResolvedValue(true);
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } } });
  setup({});
});

describe("POST /api/notifications/test", () => {
  it("returns 401 when not signed in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("rate limits to one test per minute", async () => {
    setup({ recentTests: 1 });
    const res = await POST();
    expect(res.status).toBe(429);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no subscription", async () => {
    setup({ subs: [] });
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("pushes to every device and logs a 'test' row", async () => {
    setup({
      subs: [
        { id: 1, endpoint: "https://push.example.com/a" },
        { id: 2, endpoint: "https://push.example.com/b" },
      ],
    });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, delivered: 2, removed: 0 });
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
    expect(mockSendPushNotification.mock.calls[0][1]).toMatchObject({ url: "/profile" });

    const [log] = admin.inserts("notifications_log");
    expect(log.args[0]).toEqual({ user_id: "user-1", message: "test", channel: "push" });
  });

  it("removes a bounced subscription and reports 502 when nothing delivered", async () => {
    mockSendPushNotification.mockResolvedValue(false);
    const res = await POST();
    expect(res.status).toBe(502);

    const del = admin.calls.find((c) => c.table === "push_subscriptions" && c.method === "delete");
    expect(del).toBeDefined();
    expect(admin.inserts("notifications_log")).toHaveLength(0);
  });
});
