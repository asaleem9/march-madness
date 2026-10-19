// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { asc, sql } from "drizzle-orm";
import { notificationsLog, pushSubscriptions } from "@/db/schema";
import { seedProfile, seedUserId } from "@/test/db";

const mockSendPushNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  sendPushNotification: (...args: unknown[]) => mockSendPushNotification(...args),
}));

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { POST } from "../route";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

const USER = seedUserId(1);
const OTHER = seedUserId(2);
const keys = { p256dh: "pk", auth: "ak" };

async function seedSubs(endpoints: string[], userId = USER) {
  if (endpoints.length === 0) return;
  await db.insert(pushSubscriptions).values(endpoints.map((endpoint) => ({ userId, endpoint, keys })));
}

const subEndpoints = () =>
  db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).orderBy(asc(pushSubscriptions.id));

const logs = () =>
  db
    .select({ userId: notificationsLog.userId, message: notificationsLog.message, channel: notificationsLog.channel })
    .from(notificationsLog);

beforeEach(async () => {
  await db.execute(sql`truncate table notifications_log, push_subscriptions, profiles restart identity cascade`);
  await seedProfile(db, { id: USER, displayName: "User" });
  await seedProfile(db, { id: OTHER, displayName: "Other" });
  mockSendPushNotification.mockReset().mockResolvedValue(true);
  mockGetCurrentUser.mockReset().mockResolvedValue({ id: USER, email: "u@example.com", name: null, image: null });
});

describe("POST /api/notifications/test", () => {
  it("returns 401 when not signed in", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("rate limits to one test per minute", async () => {
    await seedSubs(["https://push.example.com/a"]);
    await db.insert(notificationsLog).values({ userId: USER, message: "test", channel: "push" });

    const res = await POST();
    expect(res.status).toBe(429);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("ignores old test rows, other users' tests and ordinary notifications", async () => {
    await seedSubs(["https://push.example.com/a"]);
    await db.insert(notificationsLog).values([
      { userId: USER, message: "test", channel: "push", sentAt: new Date(Date.now() - 120_000) },
      { userId: OTHER, message: "test", channel: "push" },
      { userId: USER, message: "1 game decided: Duke ✓", channel: "push" },
    ]);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the user has no subscription", async () => {
    await seedSubs(["https://push.example.com/theirs"], OTHER);
    const res = await POST();
    expect(res.status).toBe(404);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("pushes to every device and logs a 'test' row", async () => {
    await seedSubs(["https://push.example.com/a", "https://push.example.com/b"]);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, delivered: 2, removed: 0 });
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
    expect(mockSendPushNotification.mock.calls[0][0]).toEqual({ endpoint: "https://push.example.com/a", keys });
    expect(mockSendPushNotification.mock.calls[0][1]).toMatchObject({ url: "/profile" });

    expect(await logs()).toEqual([{ userId: USER, message: "test", channel: "push" }]);
  });

  it("removes a bounced subscription but still succeeds when another device got it", async () => {
    mockSendPushNotification.mockImplementation(
      async (s: { endpoint: string }) => s.endpoint !== "https://push.example.com/gone"
    );
    await seedSubs(["https://push.example.com/a", "https://push.example.com/gone"]);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, delivered: 1, removed: 1 });
    expect(await subEndpoints()).toEqual([{ endpoint: "https://push.example.com/a" }]);
  });

  it("removes a bounced subscription and reports 502 when nothing delivered", async () => {
    mockSendPushNotification.mockResolvedValue(false);
    await seedSubs(["https://push.example.com/a"]);

    const res = await POST();
    expect(res.status).toBe(502);
    expect(await subEndpoints()).toEqual([]);
    expect(await logs()).toHaveLength(0);
  });
});
