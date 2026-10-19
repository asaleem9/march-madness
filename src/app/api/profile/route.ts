import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isValidE164 } from "@/components/profile/phone";
import type { NotificationPreferences } from "@/types";

/** The editable part of the signed-in user's `profiles` row. */
export interface ProfileJson {
  displayName: string | null;
  phone: string | null;
  timezone: string;
  notificationPreferences: NotificationPreferences;
}

const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_PREFERENCES: NotificationPreferences = {
  push: true,
  sms: false,
  email: false,
  digest_only: false,
};

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1, "Display name can't be empty").max(40),
    phone: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidE164(v), "Phone must be in E.164 format, like +15551234567")
      .nullable(),
    timezone: z
      .string()
      .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Unknown timezone"),
    notificationPreferences: z.object({
      push: z.boolean(),
      sms: z.boolean(),
      email: z.boolean(),
      digest_only: z.boolean(),
    }),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

function toJson(row: typeof profiles.$inferSelect): ProfileJson {
  return {
    displayName: row.displayName,
    phone: row.phone,
    timezone: row.timezone ?? DEFAULT_TIMEZONE,
    notificationPreferences: row.notificationPreferences ?? DEFAULT_PREFERENCES,
  };
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? e?.code;
  if (code === "23505") return true;
  const message = (e?.cause?.message ?? e?.message ?? "").toLowerCase();
  return message.includes("duplicate key");
}

/** The signed-in user's own profile. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toJson(row));
}

/**
 * Update the signed-in user's profile. Only the caller's own row is ever
 * touched; the body is a partial of `ProfileJson`. A taken display name is a
 * 409 so the form can say so.
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid profile" },
      { status: 400 }
    );
  }
  const patch = parsed.data;

  const values: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) values.displayName = patch.displayName;
  if (patch.phone !== undefined) values.phone = patch.phone || null;
  if (patch.timezone !== undefined) values.timezone = patch.timezone;
  if (patch.notificationPreferences !== undefined) {
    values.notificationPreferences = patch.notificationPreferences;
  }

  try {
    const [row] = await db
      .insert(profiles)
      .values({ id: user.id, ...values })
      .onConflictDoUpdate({ target: profiles.id, set: values })
      .returning();
    return NextResponse.json(toJson(row));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That name is taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
