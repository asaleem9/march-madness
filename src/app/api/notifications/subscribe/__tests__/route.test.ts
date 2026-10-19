// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { asc, sql } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { seedProfile, seedUserId } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { POST, DELETE } from "../route";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

const USER = seedUserId(1);
const OTHER = seedUserId(2);

function request(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost:3000/api/notifications/subscribe", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function signIn(id: string | null) {
  mockGetCurrentUser.mockResolvedValue(
    id ? { id, email: `${id}@example.com`, name: null, image: null } : null
  );
}

const subscription = {
  endpoint: "https://push.example.com/sub/456",
  keys: { p256dh: "pubkey", auth: "authkey" },
};

const rows = () =>
  db
    .select({ userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, keys: pushSubscriptions.keys })
    .from(pushSubscriptions)
    .orderBy(asc(pushSubscriptions.id));

beforeEach(async () => {
  await db.execute(sql`truncate table push_subscriptions, profiles restart identity cascade`);
  await seedProfile(db, { id: USER, displayName: "User" });
  await seedProfile(db, { id: OTHER, displayName: "Other" });
  mockGetCurrentUser.mockReset();
  signIn(null);
});

describe("POST /api/notifications/subscribe", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await POST(request("POST", subscription));
    expect(res.status).toBe(401);
    expect(await rows()).toHaveLength(0);
  });

  it("returns 400 for a malformed subscription", async () => {
    signIn(USER);
    const res = await POST(request("POST", { endpoint: "x" }));
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    signIn(USER);
    const res = await POST(
      new NextRequest("http://localhost:3000/api/notifications/subscribe", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("stores the subscription for the signed-in user", async () => {
    signIn(USER);

    const res = await POST(request("POST", subscription));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(await rows()).toEqual([{ userId: USER, ...subscription }]);
  });

  it("upserts on endpoint so a user can register several devices", async () => {
    signIn(USER);

    await POST(request("POST", subscription));
    await POST(request("POST", { ...subscription, endpoint: "https://push.example.com/sub/laptop" }));
    // Re-subscribing the first device just refreshes its keys.
    const res = await POST(
      request("POST", { ...subscription, keys: { p256dh: "newpub", auth: "newauth" } })
    );
    expect(res.status).toBe(200);

    expect(await rows()).toEqual([
      { userId: USER, endpoint: subscription.endpoint, keys: { p256dh: "newpub", auth: "newauth" } },
      { userId: USER, endpoint: "https://push.example.com/sub/laptop", keys: subscription.keys },
    ]);
  });

  it("moves an endpoint to whoever subscribes from that device next", async () => {
    signIn(OTHER);
    await POST(request("POST", subscription));
    signIn(USER);
    await POST(request("POST", subscription));

    expect(await rows()).toEqual([{ userId: USER, ...subscription }]);
  });

  it("returns a sanitized 500 when the insert fails", async () => {
    // A user with no profile row trips the foreign key.
    signIn(seedUserId(42));
    const res = await POST(request("POST", subscription));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Something went wrong. Please try again.");
  });
});

describe("DELETE /api/notifications/subscribe", () => {
  beforeEach(async () => {
    await db.insert(pushSubscriptions).values([
      { userId: USER, ...subscription },
      { userId: OTHER, endpoint: "https://push.example.com/sub/other", keys: subscription.keys },
    ]);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await DELETE(request("DELETE", { endpoint: subscription.endpoint }));
    expect(res.status).toBe(401);
    expect(await rows()).toHaveLength(2);
  });

  it("returns 400 without an endpoint", async () => {
    signIn(USER);
    const res = await DELETE(request("DELETE", {}));
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(2);
  });

  it("deletes the user's row for that endpoint", async () => {
    signIn(USER);

    const res = await DELETE(request("DELETE", { endpoint: subscription.endpoint }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(await rows()).toEqual([
      { userId: OTHER, endpoint: "https://push.example.com/sub/other", keys: subscription.keys },
    ]);
  });

  it("won't delete another user's subscription", async () => {
    signIn(USER);

    const res = await DELETE(request("DELETE", { endpoint: "https://push.example.com/sub/other" }));
    expect(res.status).toBe(200);
    expect(await rows()).toHaveLength(2);
  });
});
