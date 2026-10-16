// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createRecordingClient } from "@/test/helpers";

let client: ReturnType<typeof createRecordingClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => client),
}));

import { POST, DELETE } from "../route";

function request(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost:3000/api/notifications/subscribe", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const subscription = {
  endpoint: "https://push.example.com/sub/456",
  keys: { p256dh: "pubkey", auth: "authkey" },
};

beforeEach(() => {
  client = createRecordingClient();
});

describe("POST /api/notifications/subscribe", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await POST(request("POST", subscription));
    expect(res.status).toBe(401);
    expect(client.upserts("push_subscriptions")).toHaveLength(0);
  });

  it("returns 400 for a malformed subscription", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
    const res = await POST(request("POST", { endpoint: "x" }));
    expect(res.status).toBe(400);
  });

  it("upserts on endpoint so a user can register several devices", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });

    const res = await POST(request("POST", subscription));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const [upsert] = client.upserts("push_subscriptions");
    expect(upsert.args).toEqual([
      { user_id: "user-abc", endpoint: subscription.endpoint, keys: subscription.keys },
      { onConflict: "endpoint" },
    ]);
  });

  it("returns a sanitized 500 when the upsert fails", async () => {
    client = createRecordingClient(() => {
      throw new Error("boom");
    });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
    // createRecordingClient rejects on a thrown resolver; emulate a Supabase
    // error object instead so the route's `{ error }` branch runs.
    client.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.upsert = vi.fn(async () => ({ error: { message: "duplicate key value" } }));
      return chain;
    });

    const res = await POST(request("POST", subscription));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Something went wrong. Please try again.");
  });
});

describe("DELETE /api/notifications/subscribe", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await DELETE(request("DELETE", { endpoint: subscription.endpoint }));
    expect(res.status).toBe(401);
  });

  it("returns 400 without an endpoint", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
    const res = await DELETE(request("DELETE", {}));
    expect(res.status).toBe(400);
  });

  it("deletes the user's row for that endpoint", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });

    const res = await DELETE(request("DELETE", { endpoint: subscription.endpoint }));
    expect(res.status).toBe(200);

    const del = client.calls.find(
      (c) => c.table === "push_subscriptions" && c.method === "delete"
    )!;
    expect(del).toBeDefined();
    const filters = client.filtersAfter(del).map((f) => f.args);
    expect(filters).toEqual([
      ["endpoint", subscription.endpoint],
      ["user_id", "user-abc"],
    ]);
  });
});
