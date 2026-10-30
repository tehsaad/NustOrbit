import { describe, expect, it } from "vitest";
import { courseAttention, coursesNeedingAttention, type CourseAttentionInput } from "@/domain/attention";

const now = new Date("2026-10-30T06:00:00Z");
const base: CourseAttentionInput = {
  id: "c1",
  label: "CS-110",
  weightedPctSoFar: null,
  gradedWeight: 0,
  targetPct: null,
  attendancePct: null,
  attendanceThreshold: null,
  overdueCount: 0,
  nextDueAt: null,
  nextDueTitle: null,
};

describe("courseAttention", () => {
  it("returns null when nothing is wrong", () => {
    expect(courseAttention(base, now)).toBeNull();
  });
  it("flags attendance below the configured minimum (high) only when both values exist", () => {
    expect(courseAttention({ ...base, attendancePct: 60, attendanceThreshold: 75 }, now)?.reasons[0]).toMatchObject({ severity: "high" });
    // No threshold configured → no attendance flag (never assumes 75%).
    expect(courseAttention({ ...base, attendancePct: 60, attendanceThreshold: null }, now)).toBeNull();
  });
  it("flags overdue work (high) and imminent deadlines (medium)", () => {
    const o = courseAttention({ ...base, overdueCount: 2 }, now)!;
    expect(o.reasons[0]).toEqual({ severity: "high", text: "2 assignments overdue and not submitted" });
    const d = courseAttention({ ...base, nextDueAt: new Date("2026-10-31T06:00:00Z"), nextDueTitle: "Lab 3" }, now)!;
    expect(d.reasons[0]).toMatchObject({ severity: "medium", text: "Lab 3 due in 24h" });
    // A deadline >48h out is not "attention".
    expect(courseAttention({ ...base, nextDueAt: new Date("2026-11-05T06:00:00Z") }, now)).toBeNull();
  });
  it("flags below-target only when a target and graded weight exist", () => {
    expect(courseAttention({ ...base, weightedPctSoFar: 50, gradedWeight: 20, targetPct: 70 }, now)?.reasons[0]).toMatchObject({ severity: "low" });
    expect(courseAttention({ ...base, weightedPctSoFar: 50, gradedWeight: 0, targetPct: 70 }, now)).toBeNull();
  });
  it("orders reasons by severity and reports the top one", () => {
    const c = courseAttention({ ...base, attendancePct: 50, attendanceThreshold: 75, weightedPctSoFar: 40, gradedWeight: 30, targetPct: 60 }, now)!;
    expect(c.topSeverity).toBe("high");
    expect(c.reasons.map((r) => r.severity)).toEqual(["high", "low"]);
  });
});

describe("coursesNeedingAttention", () => {
  it("returns only flagged courses, most severe first", () => {
    const list = coursesNeedingAttention(
      [
        { ...base, id: "ok", label: "OK" },
        { ...base, id: "low", label: "Low", weightedPctSoFar: 50, gradedWeight: 20, targetPct: 70 },
        { ...base, id: "high", label: "High", overdueCount: 1 },
      ],
      now,
    );
    expect(list.map((c) => c.id)).toEqual(["high", "low"]);
  });
});
