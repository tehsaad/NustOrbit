"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getTimezone } from "@/server/prefs";
import type { ActionResult } from "@/lib/action-result";
import { validateSlot } from "@/domain/timetable";
import { isValidTimeZone } from "@/domain/time";
import { checkbox, localToUtc, notFound, optId, optNum, optStr, ownedCourseId, parseForm, reqStr } from "./util";

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ── Timetable ────────────────────────────────────────────

const slotSchema = z.object({
  id: optId,
  courseId: optId,
  title: optStr(160),
  kind: z.enum(["LECTURE", "LAB", "TUTORIAL", "OTHER"]).default("LECTURE"),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: reqStr(5),
  endTime: reqStr(5),
  room: optStr(80),
  campus: optStr(80),
  instructor: optStr(120),
  validFrom: optStr(30),
  validUntil: optStr(30),
});

export async function saveTimetableEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(slotSchema, fd);
  if (!p.ok) return p.result;
  const err = validateSlot(p.data);
  if (err) return { ok: false, error: err, fieldErrors: { endTime: [err] } };
  const tz = await getTimezone(user.id);
  const courseId = await ownedCourseId(user.id, p.data.courseId);
  const course = courseId ? await db.course.findUnique({ where: { id: courseId }, select: { name: true, code: true } }) : null;
  const title = p.data.title ?? (course ? (course.code ? `${course.code} · ${course.name}` : course.name) : null);
  if (!title) return { ok: false, error: "Choose a course or enter a title", fieldErrors: { title: ["Required without a course"] } };
  const fields = {
    courseId,
    title,
    kind: p.data.kind,
    dayOfWeek: p.data.dayOfWeek,
    startTime: p.data.startTime,
    endTime: p.data.endTime,
    timezone: tz,
    room: p.data.room ?? null,
    campus: p.data.campus ?? null,
    instructor: p.data.instructor ?? null,
    validFrom: localToUtc(p.data.validFrom, tz, "00:00") ?? null,
    validUntil: localToUtc(p.data.validUntil, tz, "23:59") ?? null,
  };
  if (p.data.id) {
    const r = await db.timetableEntry.updateMany({ where: { id: p.data.id, userId: user.id }, data: fields });
    if (!r.count) return notFound;
    return done("Class updated");
  }
  await db.timetableEntry.create({ data: { ...fields, userId: user.id, source: "MANUAL" } });
  return done("Class added to timetable");
}

export async function deleteTimetableEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.timetableEntry.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Class removed");
}

/** Mark a single occurrence cancelled / holiday, or add a make-up session. */
export async function saveClassOverride(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(
    z.object({
      timetableEntryId: optId,
      status: z.enum(["CANCELLED", "HOLIDAY", "SCHEDULED"]),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      note: optStr(300),
    }),
    fd,
  );
  if (!p.ok) return p.result;
  let courseId: string | null = null;
  if (p.data.timetableEntryId) {
    const e = await db.timetableEntry.findFirst({ where: { id: p.data.timetableEntryId, userId: user.id } });
    if (!e) return notFound;
    courseId = e.courseId;
  }
  await db.classSession.create({
    data: {
      userId: user.id,
      timetableEntryId: p.data.timetableEntryId ?? null,
      courseId,
      status: p.data.status,
      startsAt: new Date(p.data.startsAt),
      endsAt: new Date(p.data.endsAt),
      note: p.data.note ?? null,
      source: "MANUAL",
    },
  });
  return done(p.data.status === "SCHEDULED" ? "Session added" : "Class marked " + p.data.status.toLowerCase());
}

export async function deleteClassOverride(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.classSession.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Change undone");
}

// ── Attendance (user-maintained) ─────────────────────────

const attendanceSchema = z.object({
  id: optId,
  courseId: reqStr(64),
  date: reqStr(30),
  status: z.enum(["PRESENT", "ABSENT", "LEAVE", "LATE"]),
  sessions: z.coerce.number().int().min(1).max(6).default(1),
  note: optStr(300),
});

export async function saveAttendance(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(attendanceSchema, fd);
  if (!p.ok) return p.result;
  const tz = await getTimezone(user.id);
  const courseId = await ownedCourseId(user.id, p.data.courseId);
  if (!courseId) return { ok: false, error: "Choose a course" };
  const date = localToUtc(p.data.date, tz, "12:00");
  if (!date) return { ok: false, error: "Invalid date", fieldErrors: { date: ["Invalid date"] } };
  const fields = { courseId, date, status: p.data.status, sessions: p.data.sessions, note: p.data.note ?? null };
  if (p.data.id) {
    // Only manual records are editable; provider records are authoritative.
    const r = await db.attendanceRecord.updateMany({ where: { id: p.data.id, userId: user.id, source: "MANUAL" }, data: fields });
    if (!r.count) return notFound;
    return done("Attendance updated");
  }
  await db.attendanceRecord.create({ data: { ...fields, userId: user.id, source: "MANUAL" } });
  return done("Attendance recorded");
}

export async function deleteAttendance(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.attendanceRecord.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id, source: "MANUAL" } });
  if (!r.count) return notFound;
  return done("Record deleted");
}

// ── Calendar events ──────────────────────────────────────

const eventSchema = z.object({
  id: optId,
  title: reqStr(200),
  kind: z.enum(["CLASS", "EXAM", "QUIZ", "DEADLINE", "STUDY", "PERSONAL", "OTHER"]),
  courseId: optId,
  startsAt: reqStr(30),
  endsAt: optStr(30),
  allDay: checkbox,
  location: optStr(200),
  description: optStr(5000),
  remindMinutes: optNum(0, 60 * 24 * 14),
});

export async function saveEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(eventSchema, fd);
  if (!p.ok) return p.result;
  const tz = await getTimezone(user.id);
  const startsAt = localToUtc(p.data.startsAt, tz, "00:00");
  if (!startsAt) return { ok: false, error: "Invalid start", fieldErrors: { startsAt: ["Invalid date"] } };
  const endsAt = localToUtc(p.data.endsAt, tz, "23:59") ?? new Date(startsAt.getTime() + (p.data.allDay ? 24 * 3600_000 : 3600_000));
  if (endsAt < startsAt) return { ok: false, error: "End must be after start", fieldErrors: { endsAt: ["End must be after start"] } };
  const fields = {
    title: p.data.title,
    kind: p.data.kind,
    courseId: await ownedCourseId(user.id, p.data.courseId),
    startsAt,
    endsAt,
    allDay: p.data.allDay,
    location: p.data.location ?? null,
    description: p.data.description ?? null,
  };
  let eventId = p.data.id;
  if (eventId) {
    // Externally owned events are read-only in Orbit.
    const r = await db.calendarEvent.updateMany({ where: { id: eventId, userId: user.id, readOnly: false }, data: { ...fields, syncStatus: "LOCAL_ONLY" } });
    if (!r.count) return { ok: false, error: "This event is owned by another calendar and can't be edited in Orbit." };
  } else {
    const ev = await db.calendarEvent.create({ data: { ...fields, userId: user.id, source: "ORBIT" } });
    eventId = ev.id;
  }
  if (p.data.remindMinutes != null) {
    const remindAt = new Date(startsAt.getTime() - p.data.remindMinutes * 60_000);
    if (remindAt > new Date()) {
      await db.reminder.create({
        data: { userId: user.id, title: p.data.title, body: `Starts ${p.data.remindMinutes} min after this reminder`, remindAt, timezone: tz, targetType: "event", targetId: eventId, channels: ["PUSH", "IN_APP"] },
      });
    }
  }
  return done(p.data.id ? "Event updated" : "Event created");
}

/** Drag-and-drop / quick reschedule for Orbit-owned events only. */
export async function rescheduleEvent(input: { id: string; startsAt: string; endsAt: string }): Promise<ActionResult> {
  const user = await requireUser();
  const s = new Date(input.startsAt);
  const e = new Date(input.endsAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return { ok: false, error: "Invalid time" };
  const r = await db.calendarEvent.updateMany({ where: { id: input.id, userId: user.id, readOnly: false, source: "ORBIT" }, data: { startsAt: s, endsAt: e } });
  if (!r.count) return { ok: false, error: "Only events created in Orbit can be moved here." };
  return done("Event moved");
}

export async function deleteEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.calendarEvent.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id, readOnly: false } });
  if (!r.count) return { ok: false, error: "Only events created in Orbit can be deleted here." };
  return done("Event deleted");
}

// ── Settings ─────────────────────────────────────────────

const prefSchema = z.object({
  timezone: reqStr(64).refine(isValidTimeZone, "Unknown timezone"),
  attendanceThresholdPct: optNum(1, 100),
  attendancePolicyNote: optStr(500),
  attendanceLateAs: z.enum(["present", "absent"]),
  attendanceLeaveAs: z.enum(["absent", "present", "excluded"]),
  defaultTargetPct: optNum(0, 100),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
  defaultReminderMinutes: z.coerce.number().int().min(0).max(10080),
  notifyPush: checkbox,
  notifyEmail: checkbox,
});

export async function savePreferences(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(prefSchema, fd);
  if (!p.ok) return p.result;
  const data = { ...p.data, attendanceThresholdPct: p.data.attendanceThresholdPct ?? null, attendancePolicyNote: p.data.attendancePolicyNote ?? null, defaultTargetPct: p.data.defaultTargetPct ?? null };
  await db.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  return done("Preferences saved");
}
