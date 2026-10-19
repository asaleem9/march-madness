import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/db";
import { emailWaitlist } from "@/db/schema";
import { isAdminUser } from "@/lib/admin-auth";
import { getEmailFrom } from "@/lib/notifications";
import { sanitizeError } from "@/lib/sanitizeError";

export const maxDuration = 60;

const bodySchema = z.object({
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10000),
  dryRun: z.boolean().default(false),
});

/** Resend's batch endpoint accepts up to 100 messages per call. */
const BATCH_SIZE = 100;
const OPT_OUT_LINE = "Reply STOP to be removed from this list.";

/**
 * Email everyone on the pre-launch waitlist (admin session only).
 * `dryRun` just counts the deduped recipients; otherwise messages go out via
 * Resend's batch endpoint in chunks of 100, each with an opt-out footer.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const { subject, text, dryRun } = parsed.data;

  let rows: { email: string }[];
  try {
    rows = await db.select({ email: emailWaitlist.email }).from(emailWaitlist);
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err instanceof Error ? err.message : null) },
      { status: 500 }
    );
  }

  const recipients = Array.from(
    new Set(
      rows
        .map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : ""))
        .filter((e) => e.includes("@"))
    )
  );

  if (dryRun) {
    return NextResponse.json({ recipients: recipients.length, dryRun: true });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ recipients: 0, sent: 0, failed: 0 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });
  }

  const from = getEmailFrom();
  const body = `${text}\n\n—\n${OPT_OUT_LINE}`;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk.map((to) => ({ from, to, subject, text: body }))),
      });
      if (res.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        console.error("Resend batch failed:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      failed += chunk.length;
      console.error("Resend batch threw:", err);
    }
  }

  return NextResponse.json({ recipients: recipients.length, sent, failed });
}
