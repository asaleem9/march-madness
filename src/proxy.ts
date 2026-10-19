import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Route protection. The Neon Auth middleware refreshes the session, completes
 * OAuth sign-ins (the `neon_auth_session_verifier` exchange) and bounces
 * signed-out visitors to /login. We wrap it to add `?redirect=<original path>`
 * so the login page can send people back where they were going.
 */
const protect = auth.middleware({ loginUrl: "/login" });

export async function proxy(request: NextRequest) {
  const response = await protect(request);
  const location = response.headers.get("location");
  if (!location) return response;

  const target = new URL(location, request.url);
  if (target.origin !== request.nextUrl.origin || target.pathname !== "/login") return response;
  if (target.searchParams.has("redirect")) return response;

  target.searchParams.set("redirect", request.nextUrl.pathname);
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.headers.getSetCookie()) redirect.headers.append("Set-Cookie", cookie);
  return redirect;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/bracket/new",
    "/wagers/:path*",
    "/profile/:path*",
    "/admin/:path*",
    "/callback",
  ],
};
