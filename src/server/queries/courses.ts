import "server-only";
import { db } from "@/server/db";
import { computeStanding } from "@/domain/grades";
import { summarizeAttendance } from "@/domain/attendance";
import { getAttendancePolicy } from "@/server/prefs";

export async function courseOptions(userId: string) {
  const courses = await db.course.findMany({ where: { userId, archived: false }, orderBy: [{ code: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true } });
  return courses.map((c) => ({ value: c.id, label: c.code && c.code !== c.name ? `${c.code} · ${c.name}` : c.name }));
}

export async function coursesWithStats(userId: string, includeArchived = false) {
  const policy = await getAttendancePolicy(userId);
  const courses = await db.course.findMany({
    where: { userId, ...(includeArchived ? {} : { archived: false }) },
    include: {
      assessments: { select: { obtainedMarks: true, maxMarks: true, weightPct: true, title: true } },
      attendance: { select: { status: true, sessions: true } },
      assignments: { where: { dueAt: { gte: new Date() }, universityStatus: { notIn: ["SUBMITTED", "GRADED"] } }, orderBy: { dueAt: "asc" }, take: 1, select: { title: true, dueAt: true } },
      grades: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
    orderBy: [{ archived: "asc" }, { code: "asc" }, { name: "asc" }],
  });
  return courses.map((c) => ({
    ...c,
    standing: computeStanding(c.assessments),
    attendanceSummary: summarizeAttendance(c.attendance, policy),
    threshold: c.attendanceThresholdPct ?? policy.thresholdPct,
  }));
}
