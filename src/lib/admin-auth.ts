import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Emails allowed to use the admin page and admin API routes (comma-separated env var). */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/** True when the current session belongs to an admin (reads the auth cookie). */
export async function isAdminUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}

/** True when the request carries the CRON_SECRET bearer token. */
export function hasCronSecret(request: Pick<NextRequest, "headers">): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Shared guard for operational endpoints: accept the cron secret (schedulers)
 * or a signed-in admin (buttons on the admin page).
 */
export async function authorizeCronOrAdmin(
  request: Pick<NextRequest, "headers">
): Promise<boolean> {
  if (hasCronSecret(request)) return true;
  return isAdminUser();
}
