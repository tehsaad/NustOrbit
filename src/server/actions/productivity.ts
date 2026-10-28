"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getTimezone } from "@/server/prefs";
import type { ActionResult } from "@/lib/action-result";
import { localToUtc, notFound, optId, optStr, ownedCourseId, parseForm, reqStr } from "./util";

const done = (message?: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ── Tasks ────────────────────────────────────────────────

const taskSchema = z.object({
  id: optId,
  title: reqStr(200),
  notes: optStr(5000),
  kind: z.enum(["READING", "STUDY", "REVISION", "COURSEWORK", "PERSONAL", "OTHER"]).default("OTHER"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  dueAt: optStr(30),
  courseId: optId,
  assignmentId: optId,
});

export async function saveTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(taskSchema, fd);
  if (!p.ok) return p.result;
  const tz = await getTimezone(user.id);
  let assignmentId: string | null = null;
  if (p.data.assignmentId && p.data.assignmentId !== "none") {
    const a = await db.assignment.findFirst({ where: { id: p.data.assignmentId, userId: user.id }, select: { id: true } });
    if (!a) return notFound;
    assignmentId = a.id;
  }
  const fields = {
    title: p.data.title,
    notes: p.data.notes ?? null,
    kind: p.data.kind,
    priority: p.data.priority,
    dueAt: localToUtc(p.data.dueAt, tz) ?? null,
    courseId: await ownedCourseId(user.id, p.data.courseId),
    assignmentId,
  };
  if (p.data.id) {
    const r = await db.task.updateMany({ where: { id: p.data.id, userId: user.id }, data: fields });
    if (!r.count) return notFound;
    return done("Task updated");
  }
  await db.task.create({ data: { ...fields, userId: user.id } });
  return done("Task added");
}

export async function toggleTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  const task = await db.task.findFirst({ where: { id, userId: user.id } });
  if (!task) return notFound;
  const doneNow = task.status !== "DONE";
  await db.task.update({ where: { id }, data: { status: doneNow ? "DONE" : "TODO", completedAt: doneNow ? new Date() : null } });
  return done();
}

export async function deleteTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.task.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Task deleted");
}

// ── Notes ────────────────────────────────────────────────

const noteSchema = z.object({
  id: reqStr(64),
  title: z.string().trim().max(200).default(""),
  content: z.string().max(200_000).default(""),
  folder: optStr(80),
  tags: optStr(400),
  courseId: optId,
  assignmentId: optId,
  calendarEventId: optId,
});

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 20);
}

/** Autosave endpoint for the note editor. Returns the save time for the status indicator. */
export async function autosaveNote(input: Record<string, string | undefined>): Promise<ActionResult<{ savedAt: string }>> {
  const user = await requireUser();
  const fd = new FormData();
  for (const [k, v] of Object.entries(input)) if (v != null) fd.set(k, v);
  const p = parseForm(noteSchema, fd);
  if (!p.ok) return p.result;
  let assignmentId: string | null = null;
  if (p.data.assignmentId && p.data.assignmentId !== "none") {
    assignmentId = (await db.assignment.findFirst({ where: { id: p.data.assignmentId, userId: user.id }, select: { id: true } }))?.id ?? null;
  }
  let calendarEventId: string | null = null;
  if (p.data.calendarEventId && p.data.calendarEventId !== "none") {
    calendarEventId = (await db.calendarEvent.findFirst({ where: { id: p.data.calendarEventId, userId: user.id }, select: { id: true } }))?.id ?? null;
  }
  const r = await db.note.updateMany({
    where: { id: p.data.id, userId: user.id },
    data: {
      title: p.data.title || "Untitled",
      content: p.data.content,
      folder: p.data.folder ?? null,
      tags: parseTags(p.data.tags),
      courseId: await ownedCourseId(user.id, p.data.courseId),
      assignmentId,
      calendarEventId,
    },
  });
  if (!r.count) return notFound;
  return { ok: true, data: { savedAt: new Date().toISOString() } };
}

export async function createNote(courseId?: string): Promise<{ id: string }> {
  const user = await requireUser();
  const note = await db.note.create({ data: { userId: user.id, title: "Untitled", content: "", courseId: await ownedCourseId(user.id, courseId) } });
  revalidatePath("/notes");
  return { id: note.id };
}

export async function setNoteFlag(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const flag = z.enum(["pinned", "favorite", "archived"]).safeParse(fd.get("flag"));
  if (!flag.success) return { ok: false, error: "Invalid flag" };
  const value = fd.get("value") === "true";
  const r = await db.note.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id }, data: { [flag.data]: value } });
  if (!r.count) return notFound;
  return done();
}

export async function deleteNote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.note.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Note deleted");
}

// ── Reminders ────────────────────────────────────────────

const reminderSchema = z.object({
  id: optId,
  title: reqStr(200),
  body: optStr(1000),
  remindAt: reqStr(30),
  recurrence: z.enum(["NONE", "DAILY", "WEEKDAYS", "WEEKLY"]).default("NONE"),
  channels: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.enum(["PUSH", "EMAIL", "IN_APP"])).min(1, "Pick at least one channel")),
});

export async function saveReminder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(reminderSchema, fd);
  if (!p.ok) return p.result;
  const tz = await getTimezone(user.id);
  const remindAt = localToUtc(p.data.remindAt, tz, "09:00");
  if (!remindAt) return { ok: false, error: "Invalid time", fieldErrors: { remindAt: ["Invalid time"] } };
  if (remindAt < new Date() && p.data.recurrence === "NONE") return { ok: false, error: "Pick a time in the future", fieldErrors: { remindAt: ["Must be in the future"] } };
  const fields = { title: p.data.title, body: p.data.body ?? null, remindAt, recurrence: p.data.recurrence, timezone: tz, channels: p.data.channels, status: "ACTIVE" as const };
  if (p.data.id) {
    const r = await db.reminder.updateMany({ where: { id: p.data.id, userId: user.id }, data: fields });
    if (!r.count) return notFound;
    return done("Reminder updated");
  }
  await db.reminder.create({ data: { ...fields, userId: user.id } });
  return done("Reminder scheduled in Orbit");
}

export async function setReminderStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const status = z.enum(["ACTIVE", "PAUSED", "DONE"]).safeParse(fd.get("status"));
  if (!status.success) return { ok: false, error: "Invalid status" };
  const r = await db.reminder.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id }, data: { status: status.data } });
  if (!r.count) return notFound;
  return done("Reminder updated");
}

export async function deleteReminder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.reminder.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Reminder deleted");
}
