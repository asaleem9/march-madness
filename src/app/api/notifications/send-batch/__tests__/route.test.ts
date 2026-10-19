// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { asc, ne, sql } from "drizzle-orm";
import {
  notificationQueue,
  notificationsLog,
  profiles,
  pushSubscriptions,
} from "@/db/schema";
import { seedProfile, seedUserId } from "@/test/db";

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

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

// The session is only consulted by the admin-session auth fallback.
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, POST } from "../route";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockGetCurrentUser = vi.mocked(getCurrentUser);

const USER_1 = seedUserId(1);
const USER_2 = seedUserId(2);

const mockRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
  }) as unknown as NextRequest;

const cronRequest = () => mockRequest({ authorization: "Bearer test-cron-secret" });

type QueueInsert = typeof notificationQueue.$inferInsert;

function queueItem(overrides: Partial<QueueInsert> = {}): QueueInsert {
  return {
    userId: USER_1,
    type: "game_result",
    payload: { game_id: 1, picked: "Duke", correct: true, points: 20, winner: "Duke" },
    batchKey: "20270318-afternoon",
    sent: false,
    attempts: 0,
    createdAt: new Date("2027-03-18T14:00:00Z"),
    ...overrides,
  };
}

const defaultPrefs = { push: true, sms: false, email: false, digest_only: false };

async function seedUser(
  id: string,
  overrides: Partial<typeof profiles.$inferInsert> = {},
  opts: { subs?: Array<{ endpoint: string }>; logCount?: number; email?: string } = {}
) {
  await seedProfile(db, {
    id,
    displayName: `user-${id.slice(-4)}`,
    timezone: "America/New_York",
    phone: "+15551234567",
    notificationPreferences: defaultPrefs,
    ...overrides,
  });
  const subs = opts.subs ?? [{ endpoint: `https://push.example.com/${id.slice(-1)}` }];
  if (subs.length > 0) {
    await db.insert(pushSubscriptions).values(
      subs.map((s) => ({ userId: id, endpoint: s.endpoint, keys: { p256dh: "pk", auth: "ak" } }))
    );
  }
  if (opts.logCount) {
    // "Already sent today": rows stamped now, inside the user's local day.
    await db.insert(notificationsLog).values(
      Array.from({ length: opts.logCount }, () => ({ userId: id, message: "earlier", channel: "push" as const }))
    );
  }
  if (opts.email) {
    await db.execute(sql`insert into neon_auth."user" (id, email) values (${id}::uuid, ${opts.email})`);
  }
}

/** Insert queue rows and return their ids in insertion order. */
async function enqueue(items: QueueInsert[]): Promise<number[]> {
  const rows = await db.insert(notificationQueue).values(items).returning({ id: notificationQueue.id });
  return rows.map((r) => r.id);
}

const queueRows = () =>
  db
    .select({ id: notificationQueue.id, sent: notificationQueue.sent, attempts: notificationQueue.attempts })
    .from(notificationQueue)
    .orderBy(asc(notificationQueue.id));

const sentIds = async () => (await queueRows()).filter((r) => r.sent).map((r) => r.id);

/** Log rows written by the batch (the seeded "earlier" rows are excluded). */
const logRows = () => db.select().from(notificationsLog).where(ne(notificationsLog.message, "earlier"));

const subEndpoints = () =>
  db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).orderBy(asc(pushSubscriptions.id));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("send-batch", () => {
  beforeEach(async () => {
    await db.execute(sql`create schema if not exists neon_auth`);
    await db.execute(
      sql`create table if not exists neon_auth."user" (id uuid primary key, email text, name text)`
    );
    await db.execute(
      sql`truncate table notification_queue, notifications_log, push_subscriptions, profiles, neon_auth."user" restart identity cascade`
    );
    mockSendPushNotification.mockReset().mockResolvedValue(true);
    mockSendSMS.mockReset().mockResolvedValue(true);
    mockSendEmail.mockReset().mockResolvedValue(true);
    mockIsInQuietHours.mockReset().mockReturnValue(false);
    mockGetCurrentUser.mockReset().mockResolvedValue(null);
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.ADMIN_EMAILS = "admin@example.com";
  });

  it("returns 401 without a valid CRON_SECRET bearer or admin session", async () => {
    const res = await POST(mockRequest({ authorization: "Bearer bad-secret" }));
    expect(res.status).toBe(401);
  });

  it("accepts an admin session instead of the cron secret", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: seedUserId(9),
      email: "admin@example.com",
      name: null,
      image: null,
    });
    const res = await GET(mockRequest());
    expect(res.status).toBe(200);
  });

  it("returns 200 with a message when the queue is empty", async () => {
    const res = await POST(cronRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("No pending notifications");
  });

  it("sends one consolidated message per user with personalised copy", async () => {
    await seedUser(USER_1);
    await seedUser(USER_2);
    const ids = await enqueue([
      queueItem({ payload: { picked: "Duke", correct: true, points: 20 } }),
      queueItem({ payload: { picked: "Kansas", correct: false, points: 0 } }),
      queueItem({ userId: USER_2 }),
    ]);

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
    expect(await sentIds()).toEqual(ids);
  });

  it("merges items from older batches into the same notification", async () => {
    await seedUser(USER_1);
    const ids = await enqueue([
      queueItem({ batchKey: "20270317-evening", createdAt: new Date("2027-03-17T23:00:00Z") }),
      queueItem({ payload: { picked: "Houston", correct: true, points: 10 } }),
    ]);

    await POST(cronRequest());

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendPushNotification.mock.calls[0][1].body).toBe(
      "Houston ✓ +10 · 1 of 1 right today\n1 earlier game: 1 right"
    );
    expect(await sentIds()).toEqual(ids);
  });

  it("skips users in quiet hours", async () => {
    mockIsInQuietHours.mockReturnValue(true);
    await seedUser(USER_1);
    await enqueue([queueItem(), queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(2);
    expect(body.sent).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockIsInQuietHours).toHaveBeenCalledWith("America/New_York");
    expect(await sentIds()).toEqual([]);
  });

  it("enforces the 3-per-day cap", async () => {
    await seedUser(USER_1, {}, { logCount: 3 });
    await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(1);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("sends when under the daily cap", async () => {
    await seedUser(USER_1, {}, { logCount: 2 });
    await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.sent).toBe(1);
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
  });

  it("limits digest_only users to one notification per day", async () => {
    await seedUser(
      USER_1,
      { notificationPreferences: { ...defaultPrefs, digest_only: true } },
      { logCount: 1 }
    );
    await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(1);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    // The item stays queued (not marked sent) for tomorrow's digest.
    expect(await sentIds()).toEqual([]);
  });

  it("discards items for users who turned every channel off", async () => {
    await seedUser(USER_1, {
      notificationPreferences: { push: false, sms: false, email: false, digest_only: false },
    });
    const ids = await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.discarded).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(await sentIds()).toEqual(ids);
    expect(await logRows()).toHaveLength(0);
  });

  it("sends via every preferred channel and logs once", async () => {
    await seedUser(
      USER_1,
      { notificationPreferences: { push: true, sms: true, email: true, digest_only: false } },
      { email: "user@example.com" }
    );
    await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.sent).toBe(1);

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/1", keys: { p256dh: "pk", auth: "ak" } },
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

    const logs = await logRows();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId: USER_1,
      channel: "push",
      message: "1 game decided: Duke ✓ +20 · 1 of 1 right today",
    });
  });

  it("skips email when the auth record has no address", async () => {
    await seedUser(USER_1, {
      notificationPreferences: { push: false, sms: false, email: true, digest_only: false },
    });
    await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(body.skipped).toBe(1);
  });

  it("pushes to every device and deletes only the stale endpoint", async () => {
    mockSendPushNotification.mockImplementation(async (s: { endpoint: string }) =>
      s.endpoint !== "https://push.example.com/gone"
    );
    await seedUser(USER_1, {}, {
      subs: [{ endpoint: "https://push.example.com/a" }, { endpoint: "https://push.example.com/gone" }],
    });
    await enqueue([queueItem()]);

    const body = await (await POST(cronRequest())).json();
    expect(body.sent).toBe(1);
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
    expect(await subEndpoints()).toEqual([{ endpoint: "https://push.example.com/a" }]);
  });

  it("bumps attempts and keeps the item when nothing is delivered", async () => {
    mockSendPushNotification.mockResolvedValue(false);
    await seedUser(USER_1);
    const [id] = await enqueue([queueItem({ attempts: 1 })]);

    const body = await (await POST(cronRequest())).json();
    expect(body.skipped).toBe(1);
    expect(await queueRows()).toEqual([{ id, sent: false, attempts: 2 }]);
    expect(await logRows()).toHaveLength(0);
    // The bounced subscription is gone, so the next run won't retry it.
    expect(await subEndpoints()).toEqual([]);
  });

  it("gives up after the fifth failed attempt", async () => {
    mockSendPushNotification.mockResolvedValue(false);
    await seedUser(USER_1);
    const [id] = await enqueue([queueItem({ attempts: 4 })]);

    await POST(cronRequest());
    expect(await queueRows()).toEqual([{ id, sent: true, attempts: 5 }]);
  });

  it("deep-links wager notifications to /wagers", async () => {
    await seedUser(USER_1);
    await enqueue([
      queueItem({
        type: "wager_request",
        payload: { wager_id: "w1", challenger_name: "Alice", stakes: "Lunch" },
      }),
    ]);

    await POST(cronRequest());
    expect(mockSendPushNotification.mock.calls[0][1]).toEqual({
      title: "New wager challenge",
      body: "Alice challenged you: Lunch",
      url: "/wagers",
    });
  });
});
