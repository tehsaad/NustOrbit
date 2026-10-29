/**
 * Marks arithmetic. Terminology (kept distinct in the UI):
 * - raw percentage: Σ obtained / Σ max across graded items, ignoring weights.
 * - weighted contribution: obtained/max × weight, in percentage points of the course.
 * - weighted course percentage so far: contribution / graded weight × 100.
 * Course letter grades, semester GPA and CGPA are NOT derived here: Orbit only
 * shows them when an authoritative source provides them (no invented scale).
 */
export type MarkItem = {
  id?: string;
  title?: string;
  obtainedMarks: number | null | undefined;
  maxMarks: number;
  weightPct: number | null | undefined;
  classAverage?: number | null;
};

export type CourseStanding = {
  gradedCount: number;
  pendingCount: number;
  rawObtained: number;
  rawMax: number;
  /** null when nothing graded yet */
  rawPct: number | null;
  /** True when every item (graded and pending) has a weight. */
  weightsComplete: boolean;
  totalWeight: number;
  gradedWeight: number;
  /** Earned percentage points of the final course total. */
  earnedPoints: number;
  /** Weight of pending items (course points still available). */
  remainingWeight: number;
  /** earned / graded weight × 100 — null if no weighted item is graded. */
  weightedPctSoFar: number | null;
  /** Highest final course % still attainable (earned + all remaining). Null if weights incomplete. */
  maxAttainablePct: number | null;
  warnings: string[];
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function isGraded(item: MarkItem): item is MarkItem & { obtainedMarks: number } {
  return typeof item.obtainedMarks === "number" && Number.isFinite(item.obtainedMarks);
}

export function computeStanding(items: MarkItem[]): CourseStanding {
  const warnings: string[] = [];
  let rawObtained = 0;
  let rawMax = 0;
  let gradedWeight = 0;
  let earnedPoints = 0;
  let remainingWeight = 0;
  let totalWeight = 0;
  let gradedCount = 0;
  let weightsComplete = items.length > 0;

  for (const item of items) {
    if (!(item.maxMarks > 0)) {
      warnings.push(`"${item.title ?? "Untitled"}" has no valid maximum marks and was skipped.`);
      continue;
    }
    const hasWeight = typeof item.weightPct === "number" && item.weightPct >= 0;
    if (!hasWeight) weightsComplete = false;
    else totalWeight += item.weightPct as number;

    if (isGraded(item)) {
      gradedCount++;
      if (item.obtainedMarks > item.maxMarks) warnings.push(`"${item.title ?? "Untitled"}" has obtained marks above the maximum.`);
      rawObtained += item.obtainedMarks;
      rawMax += item.maxMarks;
      if (hasWeight) {
        gradedWeight += item.weightPct as number;
        earnedPoints += (item.obtainedMarks / item.maxMarks) * (item.weightPct as number);
      }
    } else if (hasWeight) {
      remainingWeight += item.weightPct as number;
    }
  }

  if (totalWeight > 100.0001) warnings.push(`Weights add up to ${round(totalWeight)}%, which is more than 100%.`);
  if (weightsComplete && totalWeight < 99.9999 && items.length > 0) {
    warnings.push(`Weights add up to ${round(totalWeight)}%. Add the remaining components to plan accurately.`);
  }

  return {
    gradedCount,
    pendingCount: items.length - gradedCount,
    rawObtained: round(rawObtained),
    rawMax: round(rawMax),
    rawPct: rawMax > 0 ? round((rawObtained / rawMax) * 100) : null,
    weightsComplete,
    totalWeight: round(totalWeight),
    gradedWeight: round(gradedWeight),
    earnedPoints: round(earnedPoints),
    remainingWeight: round(remainingWeight),
    weightedPctSoFar: gradedWeight > 0 ? round((earnedPoints / gradedWeight) * 100) : null,
    maxAttainablePct: weightsComplete ? round(earnedPoints + remainingWeight) : null,
    warnings,
  };
}

export type TargetPlan =
  | { kind: "weights-incomplete"; message: string }
  | { kind: "achieved"; earnedPoints: number; target: number; message: string }
  | { kind: "no-remaining"; earnedPoints: number; target: number; gapPoints: number; message: string }
  | { kind: "impossible"; requiredPctOnRemaining: number; maxAttainablePct: number; gapPoints: number; message: string }
  | { kind: "required"; requiredPctOnRemaining: number; requiredPoints: number; remainingWeight: number; message: string };

/**
 * Average percentage needed across all remaining weighted work to finish at
 * `targetPct` of the course total. Assumes the course total is exactly the sum
 * of the listed weights (must be 100%) and that remaining items are scored
 * uniformly — both stated to the user.
 */
export function planForTarget(standing: CourseStanding, targetPct: number): TargetPlan {
  if (!standing.weightsComplete || Math.abs(standing.totalWeight - 100) > 0.01) {
    return {
      kind: "weights-incomplete",
      message: "A target plan needs every assessment's weight, totalling 100%. Add the missing weights first.",
    };
  }
  const earned = standing.earnedPoints;
  const remaining = standing.remainingWeight;
  const neededPoints = targetPct - earned;
  if (neededPoints <= 0) {
    return { kind: "achieved", earnedPoints: earned, target: targetPct, message: `You have already secured ${earned} of the ${targetPct} points needed.` };
  }
  if (remaining <= 0) {
    return {
      kind: "no-remaining",
      earnedPoints: earned,
      target: targetPct,
      gapPoints: round(neededPoints),
      message: `All weighted work is graded. You finished ${round(neededPoints)} percentage points below the target.`,
    };
  }
  const required = round((neededPoints / remaining) * 100);
  if (required > 100) {
    const maxAttainable = round(earned + remaining);
    return {
      kind: "impossible",
      requiredPctOnRemaining: required,
      maxAttainablePct: maxAttainable,
      gapPoints: round(targetPct - maxAttainable),
      message: `Even full marks on the remaining ${remaining}% would reach ${maxAttainable}%, ${round(targetPct - maxAttainable)} points short.`,
    };
  }
  return {
    kind: "required",
    requiredPctOnRemaining: required,
    requiredPoints: round(neededPoints),
    remainingWeight: remaining,
    message: `Average ${required}% across the remaining ${remaining}% of weighted work to reach ${targetPct}%.`,
  };
}

/** Student % minus class average %, in percentage points (null if either is unknown). */
export function gapToClassAverage(item: MarkItem): number | null {
  if (!isGraded(item) || item.classAverage == null || !(item.maxMarks > 0)) return null;
  return round(((item.obtainedMarks - item.classAverage) / item.maxMarks) * 100);
}

/**
 * Credit-weighted mean of grade points. Only call with grade points that came
 * from an authoritative source; Orbit never converts percentages to points.
 */
export function creditWeightedGpa(rows: { gradePoints: number | null | undefined; creditHours: number | null | undefined }[]): number | null {
  let pts = 0;
  let credits = 0;
  for (const r of rows) {
    if (typeof r.gradePoints !== "number" || typeof r.creditHours !== "number" || r.creditHours <= 0) continue;
    pts += r.gradePoints * r.creditHours;
    credits += r.creditHours;
  }
  return credits > 0 ? round(pts / credits, 2) : null;
}
