import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_COOKIE } from "@/lib/constants";

/**
 * This app is single-user with no auth (per spec). We identify "the user" by an
 * id stored in an httpOnly cookie, set when the first-open form creates them.
 * This is NOT a security boundary — it's just how we scope one browser to one
 * seeded user without building login.
 */

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}

export async function setCurrentUser(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCurrentUser(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
}

/** Resolve the current user record, or null if the cookie is missing/stale. */
export async function getCurrentUser() {
  const id = await getCurrentUserId();
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  return user;
}

/** Like getCurrentUser but throws — use inside handlers that require a user. */
export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) throw new Error("No current user");
  // ensure it still exists
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new Error("No current user");
  return user.id;
}
