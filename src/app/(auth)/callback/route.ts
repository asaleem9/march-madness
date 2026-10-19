import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/utils";

/**
 * Landing page for OAuth sign-in. The proxy (middleware) has already exchanged
 * the Neon Auth session verifier for cookies by the time this runs, so all
 * that's left is to send the user on to where they were going.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const user = await getCurrentUser();
  if (user) return NextResponse.redirect(`${origin}${redirect}`);
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
