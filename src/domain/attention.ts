/**
 * Decides which courses need attention and why, from already-computed per-course
 * stats. Pure and transparent: every flag carries a human reason, and Orbit
 * never invents data — a signal only fires when the underlying value exists.
 */
export type Severity = "high" | "medium" | "low";

export type CourseAttentionInput = {
  id: string;
  label: string;
  weightedPctSoFar: number | null;
  gradedWeight: number;
  targetPct: number | null;
  attendancePct: number | null;
  attendanceThreshold: number | null;
  overdueCount: number;
  nextDueAt: Date | null;
  nextDueTitle: string | null;
};

export type AttentionReason = { severity: Severity; text: string };
export type CourseAttention = { id: string; label: string; reasons: AttentionReason[]; topSeverity: Severity };

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function courseAttention(c: CourseAttentionInput, now: Date): CourseAttention | null {
  const reasons: AttentionReason[] = [];

  if (c.attendanceThreshold != null && c.attendancePct != null && c.attendancePct < c.attendanceThreshold) {
    reasons.push({ severity: "high", text: `Attendance ${c.attendancePct}% is below the ${c.attendanceThreshold}% minimum` });
  }
  if (c.overdueCount > 0) {
    reasons.push({ severity: "high", text: `${c.overdueCount} assignment${c.overdueCount > 1 ? "s" : ""} overdue and not submitted` });
  }
  if (c.nextDueAt) {
    const hours = (c.nextDueAt.getTime() - now.getTime()) / 3_600_000;
    if (hours >= 0 && hours <= 48) {
      const when = hours < 1 ? "under an hour" : `${Math.round(hours)}h`;
      reasons.push({ severity: "medium", text: `${c.nextDueTitle ?? "An assignment"} due in ${when}` });
    }
  }
  if (c.targetPct != null && c.weightedPctSoFar != null && c.gradedWeight > 0 && c.weightedPctSoFar < c.targetPct) {
    reasons.push({ severity: "low", text: `Weighted score ${c.weightedPctSoFar}% is below your ${c.targetPct}% target` });
  }

  if (reasons.length === 0) return null;
  reasons.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { id: c.id, label: c.label, reasons, topSeverity: reasons[0].severity };
}

export function coursesNeedingAttention(courses: CourseAttentionInput[], now: Date): CourseAttention[] {
  return courses
    .map((c) => courseAttention(c, now))
    .filter((x): x is CourseAttention => x !== null)
    .sort((a, b) => RANK[a.topSeverity] - RANK[b.topSeverity]);
}
