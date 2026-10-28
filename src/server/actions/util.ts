import "server-only";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { parseHm, zonedWallTime } from "@/domain/time";
import { db } from "@/server/db";

/** Converts FormData to a plain object (multi-value keys become arrays). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).map((v) => (typeof v === "string" ? v : ""));
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

export function parseForm<T extends z.ZodType>(schema: T, fd: FormData): { ok: true; data: z.infer<T> } | { ok: false; result: ActionResult } {
  const parsed = schema.safeParse(formToObject(fd));
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const k = String(issue.path[0] ?? "form");
    (fieldErrors[k] ??= []).push(issue.message);
  }
  return { ok: false, result: { ok: false, error: "Please fix the highlighted fields.", fieldErrors } };
}

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optStr = (max = 500) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
export const reqStr = (max = 200) => z.string().trim().min(1, "Required").max(max);
export const optNum = (min = -1e9, max = 1e9) => z.preprocess(emptyToUndef, z.coerce.number().min(min).max(max).optional());
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const optId = z.preprocess(emptyToUndef, z.string().min(1).max(64).optional());

/** "YYYY-MM-DDTHH:mm" (datetime-local) or "YYYY-MM-DD" interpreted as wall time in `tz`. */
export function localToUtc(value: string | undefined, tz: string, defaultTime = "23:59"): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(value);
  if (!m) return undefined;
  const minutes = parseHm(m[4] ?? defaultTime);
  if (minutes == null) return undefined;
  return zonedWallTime({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }, minutes, tz);
}

/** Ensures a referenced course belongs to the user; returns null for "none". */
export async function ownedCourseId(userId: string, courseId: string | undefined): Promise<string | null> {
  if (!courseId || courseId === "none") return null;
  const c = await db.course.findFirst({ where: { id: courseId, userId }, select: { id: true } });
  if (!c) throw new Error("Course not found");
  return c.id;
}

export const notFound: ActionResult = { ok: false, error: "That item no longer exists or is not yours." };
