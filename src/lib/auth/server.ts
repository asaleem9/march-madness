import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Server-side Neon Auth (managed Better Auth). Provides `.handler()` for the
 * `/api/auth/[...path]` proxy route, `.middleware()` for route protection, and
 * the Better Auth server methods (`getSession`, `signOut`, ...).
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
