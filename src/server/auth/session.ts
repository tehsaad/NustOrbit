import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "@/server/db";
import { recordAudit } from "@/server/audit";

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPastAbsoluteLifetime(createdAt: Date, now = new Date(), absoluteDays = Number(process.env.SESSION_ABSOLUTE_DAYS ?? 60)): boolean {
  return now.getTime() - createdAt.getTime() > absoluteDays * DAY_MS;
}

/**
 * Server-side session validation (database lookup on every request).
 * Enforces the absolute lifetime cap on top of Better Auth's rolling idle expiry.
 */
export const getCurrentSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (isPastAbsoluteLifetime(new Date(session.session.createdAt))) {
    await db.session.deleteMany({ where: { id: session.session.id } });
    await recordAudit({ userId: session.user.id, action: "auth.session.absolute_expired", targetId: session.session.id });
    return null;
  }
  return session;
});

/** Use in every private page, layout, server action and route handler. */
export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/** Variant for route handlers: returns null instead of redirecting. */
export async function getUserOrNull() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}
