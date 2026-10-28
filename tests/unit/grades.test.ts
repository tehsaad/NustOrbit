import { describe, expect, it } from "vitest";
import { computeStanding, creditWeightedGpa, gapToClassAverage, planForTarget } from "@/domain/grades";

const items = [
  { title: "Quiz 1", obtainedMarks: 8, maxMarks: 10, weightPct: 5 },
  { title: "Quiz 2", obtainedMarks: 6, maxMarks: 10, weightPct: 5 },
  { title: "Assignment", obtainedMarks: 18, maxMarks: 20, weightPct: 10 },
  { title: "Mid", obtainedMarks: 30, maxMarks: 50, weightPct: 30 },
  { title: "Final", obtainedMarks: null, maxMarks: 100, weightPct: 50 },
];

describe("computeStanding", () => {
  it("separates raw percentage from weighted contribution", () => {
    const s = computeStanding(items);
    expect(s.rawObtained).toBe(62);
    expect(s.rawMax).toBe(90);
    expect(s.rawPct).toBeCloseTo(68.89, 2);
    // 4 + 3 + 9 + 18 = 34 points of 50 graded weight
    expect(s.earnedPoints).toBe(34);
    expect(s.gradedWeight).toBe(50);
    expect(s.weightedPctSoFar).toBe(68);
    expect(s.remainingWeight).toBe(50);
    expect(s.maxAttainablePct).toBe(84);
    expect(s.weightsComplete).toBe(true);
    expect(s.warnings).toEqual([]);
  });

  it("flags missing weights and over-100 totals", () => {
    const s = computeStanding([
      { title: "A", obtainedMarks: 5, maxMarks: 10, weightPct: null },
      { title: "B", obtainedMarks: 5, maxMarks: 10, weightPct: 120 },
    ]);
    expect(s.weightsComplete).toBe(false);
    expect(s.maxAttainablePct).toBeNull();
    expect(s.warnings.some((w) => w.includes("more than 100%"))).toBe(true);
  });

  it("returns null percentages when nothing is graded", () => {
    const s = computeStanding([{ obtainedMarks: null, maxMarks: 10, weightPct: 100 }]);
    expect(s.rawPct).toBeNull();
    expect(s.weightedPctSoFar).toBeNull();
  });

  it("skips items with invalid maximum marks", () => {
    const s = computeStanding([{ title: "Bad", obtainedMarks: 3, maxMarks: 0, weightPct: 10 }]);
    expect(s.gradedCount).toBe(0);
    expect(s.warnings[0]).toMatch(/no valid maximum/);
  });
});

describe("planForTarget", () => {
  const s = computeStanding(items);
  it("computes required average on remaining weight", () => {
    const p = planForTarget(s, 80);
    expect(p.kind).toBe("required");
    if (p.kind === "required") expect(p.requiredPctOnRemaining).toBe(92);
  });
  it("detects impossible targets with the gap in points", () => {
    const p = planForTarget(s, 90);
    expect(p.kind).toBe("impossible");
    if (p.kind === "impossible") {
      expect(p.maxAttainablePct).toBe(84);
      expect(p.gapPoints).toBe(6);
    }
  });
  it("detects already-achieved targets", () => {
    expect(planForTarget(s, 30).kind).toBe("achieved");
  });
  it("refuses to plan when weights are incomplete", () => {
    expect(planForTarget(computeStanding([{ obtainedMarks: 1, maxMarks: 2, weightPct: 40 }]), 50).kind).toBe("weights-incomplete");
  });
  it("reports the final gap when nothing remains", () => {
    const done = computeStanding([{ obtainedMarks: 70, maxMarks: 100, weightPct: 100 }]);
    const p = planForTarget(done, 80);
    expect(p.kind).toBe("no-remaining");
    if (p.kind === "no-remaining") expect(p.gapPoints).toBe(10);
  });
});

describe("class average and GPA", () => {
  it("expresses gap to class average in percentage points", () => {
    expect(gapToClassAverage({ obtainedMarks: 18, maxMarks: 20, weightPct: 10, classAverage: 14 })).toBe(20);
    expect(gapToClassAverage({ obtainedMarks: 18, maxMarks: 20, weightPct: 10, classAverage: null })).toBeNull();
  });
  it("computes credit-weighted GPA only from provided grade points", () => {
    expect(creditWeightedGpa([{ gradePoints: 4, creditHours: 3 }, { gradePoints: 3, creditHours: 1 }, { gradePoints: null, creditHours: 3 }])).toBe(3.75);
    expect(creditWeightedGpa([])).toBeNull();
  });
});
