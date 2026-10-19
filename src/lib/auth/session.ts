import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { auth } from "./server";

/** The signed-in user as the app sees it. `id` is the `profiles.id` uuid. */
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * The current user, or null. Per-request cached. Makes sure a `profiles` row
 * exists for the user (the profile used to be created by a database trigger
 * on signup; now it's created lazily the first time we see a session).
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const appUser: AppUser = {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
  };
  await ensureProfile(appUser);
  return appUser;
});

/** Insert the profile row if missing. Falls back to a null display name when the chosen one is taken. */
export async function ensureProfile(user: AppUser): Promise<void> {
  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (existing.length > 0) return;
  const displayName = user.name?.trim() || null;
  try {
    await db
      .insert(profiles)
      .values({ id: user.id, displayName, avatarUrl: user.image })
      .onConflictDoNothing({ target: profiles.id });
  } catch {
    // display_name is unique — another user already has this name
    await db
      .insert(profiles)
      .values({ id: user.id, displayName: null, avatarUrl: user.image })
      .onConflictDoNothing({ target: profiles.id });
  }
}

/** Throws a 401-style error for route handlers that require a session. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
