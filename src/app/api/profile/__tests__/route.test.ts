// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { GET, PATCH } = await import("../route");
const { db } = (await import("@/db")) as unknown as { db: TestDb };

const me = { id: seedUserId(1), email: "me@example.com", name: "Me", image: null };
const other = { id: seedUserId(2), email: "other@example.com", name: "Other", image: null };

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await seedProfile(db, { id: me.id, displayName: "Ali", timezone: "America/Chicago" });
  await seedProfile(db, { id: other.id, displayName: "Taken" });
});

beforeEach(() => {
  mockGetCurrentUser.mockResolvedValue(me);
});

describe("GET /api/profile", () => {
  it("requires a session", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the caller's own profile in camelCase", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      displayName: "Ali",
      phone: null,
      timezone: "America/Chicago",
      notificationPreferences: { push: true, sms: false, email: false, digest_only: false },
    });
  });
});

describe("PATCH /api/profile", () => {
  it("requires a session", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ displayName: "x" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty or malformed body", async () => {
    expect((await PATCH(patchRequest({}))).status).toBe(400);
    expect((await PATCH(patchRequest({ displayName: "   " }))).status).toBe(400);
    expect((await PATCH(patchRequest({ timezone: "Mars/Olympus" }))).status).toBe(400);
    expect((await PATCH(patchRequest({ phone: "555-1234" }))).status).toBe(400);
    expect(
      (await PATCH(patchRequest({ notificationPreferences: { push: true } }))).status
    ).toBe(400);
  });

  it("updates only the given fields and returns the row", async () => {
    const res = await PATCH(
      patchRequest({
        phone: "+15551234567",
        notificationPreferences: { push: false, sms: true, email: false, digest_only: true },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      displayName: "Ali",
      phone: "+15551234567",
      timezone: "America/Chicago",
      notificationPreferences: { push: false, sms: true, email: false, digest_only: true },
    });

    const [row] = await db.select().from(profiles).where(eq(profiles.id, me.id));
    expect(row.phone).toBe("+15551234567");
    expect(row.displayName).toBe("Ali");
  });

  it("clears the phone with an empty string or null", async () => {
    await PATCH(patchRequest({ phone: "+15551234567" }));
    let res = await PATCH(patchRequest({ phone: "" }));
    expect((await res.json()).phone).toBeNull();
    await PATCH(patchRequest({ phone: "+15551234567" }));
    res = await PATCH(patchRequest({ phone: null }));
    expect((await res.json()).phone).toBeNull();
  });

  it("changes the display name and timezone", async () => {
    const res = await PATCH(patchRequest({ displayName: "  Ali S  ", timezone: "Europe/London" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.displayName).toBe("Ali S");
    expect(body.timezone).toBe("Europe/London");
  });

  it("maps a taken display name to a 409", async () => {
    const res = await PATCH(patchRequest({ displayName: "Taken" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "That name is taken" });
    // The other user's row is untouched.
    const [row] = await db.select().from(profiles).where(eq(profiles.id, other.id));
    expect(row.displayName).toBe("Taken");
  });

  it("never writes another user's row", async () => {
    await PATCH(patchRequest({ timezone: "Asia/Tokyo" }));
    const [row] = await db.select().from(profiles).where(eq(profiles.id, other.id));
    expect(row.timezone).toBe("America/New_York");
  });

  it("creates the row when the profile is missing", async () => {
    const fresh = { id: seedUserId(3), email: "fresh@example.com", name: null, image: null };
    mockGetCurrentUser.mockResolvedValue(fresh);
    const res = await PATCH(patchRequest({ displayName: "Fresh" }));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(profiles).where(eq(profiles.id, fresh.id));
    expect(row?.displayName).toBe("Fresh");
  });
});
