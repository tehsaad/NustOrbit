import "server-only";
import { db } from "@/server/db";
import { expandWeekly, type Occurrence } from "@/domain/timetable";

/** Concrete class occurrences for a user in [from, to), with cancellations and make-ups applied. */
export async function classOccurrences(userId: string, from: Date, to: Date): Promise<(Occurrence & { course: { id: string; name: string; code: string | null; color: string | null } | null; source: string })[]> {
  const [slots, overrides, courses] = await Promise.all([
    db.timetableEntry.findMany({ where: { userId } }),
    db.classSession.findMany({ where: { userId, startsAt: { lt: to }, endsAt: { gt: from } } }),
    db.course.findMany({ where: { userId }, select: { id: true, name: true, code: true, color: true } }),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const srcBySlot = new Map(slots.map((s) => [s.id, s.source]));
  return expandWeekly(slots, from, to, overrides).map((o) => ({
    ...o,
    course: o.courseId ? (byId.get(o.courseId) ?? null) : null,
    source: srcBySlot.get(o.slotId) ?? "MANUAL",
  }));
}
