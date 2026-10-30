import "server-only";
import { db } from "@/server/db";
import { creditWeightedGpa } from "@/domain/grades";
import { coursesNeedingAttention, type CourseAttentionInput } from "@/domain/attention";
import { getPrefs } from "@/server/prefs";
import { coursesWithStats } from "./courses";

const label = (c: { name: string; code: string | null }) => (c.code && c.code !== c.name ? `${c.code} · ${c.name}` : c.name);

/** Everything the academics-first overview needs: standing, GPA/CGPA and the attention list. */
export async function getAcademicStanding(userId: string, now = new Date()) {
  const [prefs, courses, grades, overdue] = await Promise.all([
    getPrefs(userId),
    coursesWithStats(userId),
    db.grade.findMany({ where: { userId }, include: { course: { select: { creditHours: true } } }, orderBy: { updatedAt: "desc" } }),
    db.assignment.groupBy({
      by: ["courseId"],
      where: { userId, dueAt: { lt: now }, universityStatus: { notIn: ["SUBMITTED", "GRADED"] }, personalStatus: { not: "DONE" } },
      _count: { _all: true },
    }),
  ]);

  const overdueByCourse = new Map(overdue.map((o) => [o.courseId, o._count._all]));
  const cgpa = creditWeightedGpa(grades.map((g) => ({ gradePoints: g.gradePoints, creditHours: g.course.creditHours })));

  // Semester GPA = grade points of the most recently updated term, when terms are recorded.
  const latestTerm = grades.find((g) => g.term)?.term ?? null;
  const termGrades = latestTerm ? grades.filter((g) => g.term === latestTerm) : [];
  const semesterGpa = latestTerm ? creditWeightedGpa(termGrades.map((g) => ({ gradePoints: g.gradePoints, creditHours: g.course.creditHours }))) : null;

  const credits = courses.reduce((s, c) => s + (c.creditHours ?? 0), 0);

  const attentionInputs: CourseAttentionInput[] = courses.map((c) => ({
    id: c.id,
    label: label(c),
    weightedPctSoFar: c.standing.weightedPctSoFar,
    gradedWeight: c.standing.gradedWeight,
    targetPct: c.targetPct ?? prefs.defaultTargetPct,
    attendancePct: c.attendanceSummary.pct,
    attendanceThreshold: c.threshold,
    overdueCount: overdueByCourse.get(c.id) ?? 0,
    nextDueAt: c.assignments[0]?.dueAt ?? null,
    nextDueTitle: c.assignments[0]?.title ?? null,
  }));

  return {
    prefs,
    courses,
    courseCount: courses.length,
    credits,
    cgpa,
    semesterGpa,
    latestTerm,
    gradeCount: grades.length,
    gradedAssessmentCount: courses.reduce((s, c) => s + c.standing.gradedCount, 0),
    attention: coursesNeedingAttention(attentionInputs, now),
  };
}
