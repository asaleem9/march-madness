import { NextRequest, NextResponse } from "next/server";
import { count, gt } from "drizzle-orm";
import { db } from "@/db";
import { emailWaitlist } from "@/db/schema";

// The waitlist feeds the admin "email everyone" blast, so unauthenticated
// inserts are capped: a few per IP per hour (per server instance) and a global
// ceiling per hour, which is far above any real sign-up rate.
const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_HOUR = 100;
const HOUR_MS = 60 * 60 * 1000;
const recentByIp = new Map<string, number[]>();

function ipLimited(ip: string, now = Date.now()): boolean {
  const hits = (recentByIp.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.length >= PER_IP_PER_HOUR) {
    recentByIp.set(ip, hits);
    return true;
  }
  hits.push(now);
  recentByIp.set(ip, hits);
  if (recentByIp.size > 10_000) recentByIp.clear(); // keep the map bounded
  return false;
}

/** Test hook: forget every IP's recent hits. */
export function resetWaitlistRateLimit() {
  recentByIp.clear();
}

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({}) as { email?: unknown });

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (ipLimited(ip)) {
    return NextResponse.json({ error: "Too many sign-ups, try again later" }, { status: 429 });
  }

  // Public insert; signing up twice is a no-op.
  try {
    const [{ n }] = await db
      .select({ n: count() })
      .from(emailWaitlist)
      .where(gt(emailWaitlist.createdAt, new Date(Date.now() - HOUR_MS)));
    if (n >= GLOBAL_PER_HOUR) {
      return NextResponse.json({ error: "Too many sign-ups, try again later" }, { status: 429 });
    }
    await db
      .insert(emailWaitlist)
      .values({ email: email.toLowerCase().trim() })
      .onConflictDoNothing({ target: emailWaitlist.email });
  } catch {
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
