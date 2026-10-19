// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { emailWaitlist } from "@/db/schema";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});

import { db } from "@/db";
import { POST, resetWaitlistRateLimit } from "../route";

function request(body: BodyInit | Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/waitlist", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const emails = async () => (await db.select({ email: emailWaitlist.email }).from(emailWaitlist)).map((r) => r.email);

beforeEach(async () => {
  await db.execute(sql`truncate table email_waitlist restart identity`);
  resetWaitlistRateLimit();
});

function fromIp(ip: string, email: string) {
  return new NextRequest("http://localhost:3000/api/waitlist", {
    method: "POST",
    body: JSON.stringify({ email }),
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
  });
}

describe("POST /api/waitlist", () => {
  it("rejects a missing or malformed email", async () => {
    for (const body of [{}, { email: "" }, { email: "nope" }, { email: 42 }, "not json"]) {
      const res = await POST(request(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Valid email required" });
    }
    expect(await emails()).toEqual([]);
  });

  it("stores the email lower-cased without needing a session", async () => {
    const res = await POST(request({ email: "Fan@Example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await emails()).toEqual(["fan@example.com"]);
  });

  it("is idempotent on email", async () => {
    await POST(request({ email: "fan@example.com" }));
    const res = await POST(request({ email: "FAN@example.com" }));
    expect(res.status).toBe(200);
    expect(await emails()).toEqual(["fan@example.com"]);
  });

  it("caps sign-ups per IP so the waitlist can't be stuffed", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await POST(fromIp("203.0.113.9", `p${i}@example.com`))).status).toBe(200);
    }
    const blocked = await POST(fromIp("203.0.113.9", "p5@example.com"));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("Too many sign-ups, try again later");
    // Another address is unaffected.
    expect((await POST(fromIp("203.0.113.10", "p6@example.com"))).status).toBe(200);
    expect(await emails()).toHaveLength(6);
  });
});
