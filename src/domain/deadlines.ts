import { dayBounds, weekBounds } from "./time";

export type DueBucket = "overdue" | "today" | "this-week" | "later" | "no-date";

export function dueBucket(dueAt: Date | null | undefined, now: Date, tz: string, weekStartsOn = 1): DueBucket {
  if (!dueAt) return "no-date";
  if (dueAt.getTime() < now.getTime()) return "overdue";
  const today = dayBounds(now, tz);
  if (dueAt < today.end) return "today";
  const week = weekBounds(now, tz, weekStartsOn);
  if (dueAt < week.end) return "this-week";
  return "later";
}

export type AssignmentLike = {
  dueAt: Date | null;
  universityStatus: "UNKNOWN" | "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
  personalStatus: "TODO" | "IN_PROGRESS" | "DONE";
};

export type AssignmentFilter = "all" | "pending" | "submitted" | "graded" | "overdue" | "today" | "week";

/** Submitted means a university source confirmed it. The student's own "done" never counts. */
export function isConfirmedSubmitted(a: Pick<AssignmentLike, "universityStatus">): boolean {
  return a.universityStatus === "SUBMITTED" || a.universityStatus === "GRADED";
}

export function matchesFilter(a: AssignmentLike, filter: AssignmentFilter, now: Date, tz: string): boolean {
  const bucket = dueBucket(a.dueAt, now, tz);
  const submitted = isConfirmedSubmitted(a);
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return !submitted;
    case "submitted":
      return a.universityStatus === "SUBMITTED";
    case "graded":
      return a.universityStatus === "GRADED";
    case "overdue":
      return !submitted && bucket === "overdue";
    case "today":
      return !submitted && bucket === "today";
    case "week":
      return !submitted && (bucket === "today" || bucket === "this-week");
  }
}
