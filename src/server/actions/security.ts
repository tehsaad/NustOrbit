"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { requireUser, getCurrentSession } from "@/server/auth/session";
import { recordAudit } from "@/server/audit";
import type { ActionResult } from "@/lib/action-result";

/** Revoke one of the user's other sessions by id (tokens never leave the server). */
export async function revokeSession(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const current = await getCurrentSession();
  const id = String(fd.get("id") ?? "");
  if (id === current?.session.id) return { ok: false, error: "Use Sign out to end the current session." };
  const r = await db.session.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) return { ok: false, error: "Session not found." };
  const h = await headers();
  await recordAudit({ userId: user.id, action: "auth.session.revoked", targetType: "session", targetId: id, userAgent: h.get("user-agent") });
  revalidatePath("/settings/security");
  return { ok: true, message: "Session revoked" };
}

export async function revokeOtherSessions(_: ActionResult): Promise<ActionResult> {
  const user = await requireUser();
  const current = await getCurrentSession();
  const r = await db.session.deleteMany({ where: { userId: user.id, id: { not: current?.session.id } } });
  await recordAudit({ userId: user.id, action: "auth.session.revoked_others", metadata: { count: r.count } });
  revalidatePath("/settings/security");
  return { ok: true, message: `Signed out ${r.count} other session${r.count === 1 ? "" : "s"}` };
}
