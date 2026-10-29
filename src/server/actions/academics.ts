"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getTimezone } from "@/server/prefs";
import type { ActionResult } from "@/lib/action-result";
import { localToUtc, notFound, optId, optNum, optStr, ownedCourseId, parseForm, reqStr } from "./util";

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ── Courses ──────────────────────────────────────────────

const courseSchema = z.object({
  id: optId,
  name: reqStr(160),
  code: optStr(40),
  instructor: optStr(120),
  creditHours: optNum(0, 12),
  term: optStr(60),
  color: optStr(20),
  url: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().max(500).optional()),
  targetPct: optNum(0, 100),
  attendanceThresholdPct: optNum(1, 100),
});

export async function saveCourse(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(courseSchema, fd);
  if (!p.ok) return p.result;
  const { id, ...data } = p.data;
  const fields = {
    name: data.name,
    code: data.code ?? null,
    instructor: data.instructor ?? null,
    creditHours: data.creditHours ?? null,
    term: data.term ?? null,
    color: data.color ?? null,
    url: data.url ?? null,
    targetPct: data.targetPct ?? null,
    attendanceThresholdPct: data.attendanceThresholdPct ?? null,
  };
  if (id) {
    const r = await db.course.updateMany({ where: { id, userId: user.id }, data: fields });
    if (!r.count) return notFound;
    return done("Course updated");
  }
  await db.course.create({ data: { ...fields, userId: user.id, source: "MANUAL" } });
  return done("Course added");
}

export async function archiveCourse(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  const archived = fd.get("archived") === "true";
  const r = await db.course.updateMany({ where: { id, userId: user.id }, data: { archived } });
  if (!r.count) return notFound;
  return done(archived ? "Course archived" : "Course restored");
}

export async function deleteCourse(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.course.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Course deleted");
}

// ── Assessments (marks) ──────────────────────────────────

const assessmentSchema = z
  .object({
    id: optId,
    courseId: reqStr(64),
    title: reqStr(160),
    category: z.enum(["QUIZ", "ASSIGNMENT", "MIDTERM", "FINAL", "LAB", "PROJECT", "PRESENTATION", "OTHER"]),
    obtainedMarks: optNum(0, 100000),
    maxMarks: z.coerce.number().positive("Must be greater than 0").max(100000),
    weightPct: optNum(0, 100),
    classAverage: optNum(0, 100000),
    heldAt: optStr(30),
  })
  .refine((d) => d.classAverage == null || d.classAverage <= d.maxMarks, { path: ["classAverage"], message: "Cannot exceed maximum marks" });

export async function saveAssessment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(assessmentSchema, fd);
  if (!p.ok) return p.result;
  const tz = await getTimezone(user.id);
  const courseId = await ownedCourseId(user.id, p.data.courseId);
  if (!courseId) return { ok: false, error: "Choose a course", fieldErrors: { courseId: ["Choose a course"] } };
  const existing = p.data.id ? await db.assessment.findFirst({ where: { id: p.data.id, userId: user.id } }) : null;
  if (p.data.id && !existing) return notFound;
  const fields = {
    courseId,
    title: p.data.title,
    category: p.data.category,
    obtainedMarks: p.data.obtainedMarks ?? null,
    maxMarks: p.data.maxMarks,
    weightPct: p.data.weightPct ?? null,
    classAverage: p.data.classAverage ?? null,
    // A class average typed by the student is labelled as manual input.
    classAverageSrc: p.data.classAverage == null ? null : existing?.classAverage === p.data.classAverage ? existing.classAverageSrc : ("MANUAL" as const),
    heldAt: localToUtc(p.data.heldAt, tz, "09:00") ?? null,
  };
  if (existing) {
    await db.assessment.update({ where: { id: existing.id }, data: fields });
    return done("Assessment updated");
  }
  await db.assessment.create({ data: { ...fields, userId: user.id, source: "MANUAL" } });
  return done("Assessment added");
}

export async function deleteAssessment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.assessment.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Assessment deleted");
}

const gradeSchema = z.object({
  id: optId,
  courseId: reqStr(64),
  term: optStr(60),
  letter: optStr(5),
  gradePoints: optNum(0, 10),
  percentage: optNum(0, 100),
});

/** Records an official course grade the student copied from a transcript/result card. */
export async function saveGrade(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(gradeSchema, fd);
  if (!p.ok) return p.result;
  const courseId = await ownedCourseId(user.id, p.data.courseId);
  if (!courseId) return { ok: false, error: "Choose a course" };
  const fields = { courseId, term: p.data.term ?? null, letter: p.data.letter ?? null, gradePoints: p.data.gradePoints ?? null, percentage: p.data.percentage ?? null };
  if (p.data.id) {
    const r = await db.grade.updateMany({ where: { id: p.data.id, userId: user.id }, data: fields });
    if (!r.count) return notFound;
  } else {
    await db.grade.create({ data: { ...fields, userId: user.id, source: "MANUAL" } });
  }
  return done("Grade saved");
}

export async function deleteGrade(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.grade.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Grade deleted");
}

// ── Assignments ──────────────────────────────────────────

const assignmentSchema = z.object({
  id: optId,
  title: reqStr(200),
  courseId: optId,
  dueAt: optStr(30),
  maxMarks: optNum(0, 100000),
  weightPct: optNum(0, 100),
  url: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().max(1000).optional()),
  description: optStr(5000),
  notes: optStr(10000),
  personalStatus: z.enum(["TODO", "IN_PROGRESS", "DONE"]).default("TODO"),
});

export async function saveAssignment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = parseForm(assignmentSchema, fd);
  if (!p.ok) return p.result;
  const tz = await getTimezone(user.id);
  const fields = {
    title: p.data.title,
    courseId: await ownedCourseId(user.id, p.data.courseId),
    dueAt: localToUtc(p.data.dueAt, tz) ?? null,
    maxMarks: p.data.maxMarks ?? null,
    weightPct: p.data.weightPct ?? null,
    url: p.data.url ?? null,
    description: p.data.description ?? null,
    notes: p.data.notes ?? null,
    personalStatus: p.data.personalStatus,
  };
  if (p.data.id) {
    const r = await db.assignment.updateMany({ where: { id: p.data.id, userId: user.id }, data: fields });
    if (!r.count) return notFound;
    return done("Assignment updated");
  }
  // Manually added assignments never claim a university status.
  await db.assignment.create({ data: { ...fields, userId: user.id, source: "MANUAL", universityStatus: "UNKNOWN" } });
  return done("Assignment added");
}

export async function setAssignmentPersonalStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const status = z.enum(["TODO", "IN_PROGRESS", "DONE"]).safeParse(fd.get("personalStatus"));
  if (!status.success) return { ok: false, error: "Invalid status" };
  const r = await db.assignment.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id }, data: { personalStatus: status.data } });
  if (!r.count) return notFound;
  return done("Status updated");
}

export async function confirmSuggestedAssignment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.assignment.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id, suggested: true }, data: { suggested: false } });
  if (!r.count) return notFound;
  return done("Suggestion confirmed");
}

const checklistSchema = z.array(z.object({ text: z.string().max(300), done: z.boolean() })).max(50);

export async function saveChecklist(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let items: unknown;
  try {
    items = JSON.parse(String(fd.get("checklist") ?? "[]"));
  } catch {
    return { ok: false, error: "Invalid checklist" };
  }
  const parsed = checklistSchema.safeParse(items);
  if (!parsed.success) return { ok: false, error: "Invalid checklist" };
  const r = await db.assignment.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id }, data: { checklist: parsed.data } });
  if (!r.count) return notFound;
  revalidatePath("/assignments");
  return { ok: true };
}

export async function deleteAssignment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.assignment.deleteMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id } });
  if (!r.count) return notFound;
  return done("Assignment deleted");
}

