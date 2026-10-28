export type AttendanceMark = "PRESENT" | "ABSENT" | "LEAVE" | "LATE";

export type AttendancePolicy = {
  /** Minimum percentage (e.g. 75). Null = not configured; no allowance is computed. */
  thresholdPct: number | null;
  /** How LATE counts. Configurable because institutions differ. */
  lateCountsAs: "present" | "absent";
  /** How LEAVE counts: as absent, as present, or excluded from the total. */
  leaveCountsAs: "absent" | "present" | "excluded";
};

export const DEFAULT_POLICY: AttendancePolicy = { thresholdPct: null, lateCountsAs: "present", leaveCountsAs: "absent" };

export type AttendanceSummary = {
  attended: number;
  missed: number;
  excluded: number;
  total: number;
  pct: number | null;
};

export function summarizeAttendance(records: { status: AttendanceMark; sessions?: number }[], policy: AttendancePolicy = DEFAULT_POLICY): AttendanceSummary {
  let attended = 0;
  let missed = 0;
  let excluded = 0;
  for (const r of records) {
    const n = r.sessions && r.sessions > 0 ? r.sessions : 1;
    const effective =
      r.status === "LATE" ? policy.lateCountsAs : r.status === "LEAVE" ? policy.leaveCountsAs : r.status === "PRESENT" ? "present" : "absent";
    if (effective === "present") attended += n;
    else if (effective === "absent") missed += n;
    else excluded += n;
  }
  const total = attended + missed;
  return { attended, missed, excluded, total, pct: total > 0 ? Math.round((attended / total) * 10000) / 100 : null };
}

export type AttendanceOutlook =
  | { kind: "no-threshold" }
  | { kind: "no-data" }
  | { kind: "safe"; canMiss: number; message: string }
  | { kind: "at-risk"; mustAttend: number; message: string }
  | { kind: "term"; canMissRestOfTerm: number; message: string }
  | { kind: "term-unreachable"; bestPossiblePct: number; message: string };

/**
 * Projection from recorded sessions only.
 * - If `plannedTotal` (sessions in the whole term) is known, compute absences
 *   still allowed across the rest of the term.
 * - Otherwise: how many consecutive absences keep you at/above the threshold,
 *   or how many consecutive attended sessions bring you back to it.
 */
export function attendanceOutlook(summary: AttendanceSummary, thresholdPct: number | null, plannedTotal?: number | null): AttendanceOutlook {
  if (thresholdPct == null) return { kind: "no-threshold" };
  const t = thresholdPct / 100;
  if (t <= 0 || t > 1) return { kind: "no-threshold" };
  const { attended, total } = summary;

  if (plannedTotal != null && plannedTotal > 0 && plannedTotal >= total) {
    const remaining = plannedTotal - total;
    const needAttendedOverall = Math.ceil(t * plannedTotal - 1e-9);
    const canMiss = attended + remaining - needAttendedOverall;
    if (canMiss < 0) {
      const best = Math.round(((attended + remaining) / plannedTotal) * 10000) / 100;
      return { kind: "term-unreachable", bestPossiblePct: best, message: `Even attending every remaining session ends the term at ${best}%.` };
    }
    return { kind: "term", canMissRestOfTerm: canMiss, message: `You can miss ${canMiss} of the remaining ${remaining} sessions and stay at or above ${thresholdPct}%.` };
  }

  if (total === 0) return { kind: "no-data" };
  if (attended / total >= t) {
    // attended / (total + k) >= t  =>  k <= attended / t - total
    const canMiss = Math.max(0, Math.floor(attended / t - total + 1e-9));
    return { kind: "safe", canMiss, message: `You could miss the next ${canMiss} session${canMiss === 1 ? "" : "s"} and stay at or above ${thresholdPct}%.` };
  }
  if (t >= 1) return { kind: "at-risk", mustAttend: Infinity, message: `A ${thresholdPct}% requirement cannot be recovered after an absence.` };
  // (attended + n) / (total + n) >= t  =>  n >= (t*total - attended) / (1 - t)
  const mustAttend = Math.ceil((t * total - attended) / (1 - t) - 1e-9);
  return { kind: "at-risk", mustAttend, message: `Attend the next ${mustAttend} session${mustAttend === 1 ? "" : "s"} in a row to get back to ${thresholdPct}%.` };
}
