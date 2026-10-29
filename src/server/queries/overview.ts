import "server-only";
import { db } from "@/server/db";
import { getPrefs } from "@/server/prefs";
import { dayBounds } from "@/domain/time";
import { classOccurrences } from "./schedule";

export type AgendaItem = {
  id: string;
  at: Date;
  end?: Date;
  title: string;
  kind: "class" | "deadline" | "event" | "task" | "reminder" | "exam";
  source: string;
  href: string;
  status?: string;
  suggested?: boolean;
};

export async function getOverview(userId: string, now = new Date()) {
  const prefs = await getPrefs(userId);
  const tz = prefs.timezone;
  const today = dayBounds(now, tz);
  const weekAhead = new Date(now.getTime() + 7 * 86400_000);
  const twoWeeks = new Date(now.getTime() + 14 * 86400_000);

  const [classesToday, upcomingClasses, assignments, overdueCount, recentMarks, exams, eventsToday, tasks, pinnedNotes, reminders, attendanceToday, connections, deliveries, courseCount] = await Promise.all([
    classOccurrences(userId, today.start, today.end),
    classOccurrences(userId, now, weekAhead),
    db.assignment.findMany({
      where: { userId, universityStatus: { notIn: ["SUBMITTED", "GRADED"] }, dueAt: { gte: now, lte: weekAhead } },
      include: { course: { select: { name: true, code: true } } },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    db.assignment.count({ where: { userId, universityStatus: { notIn: ["SUBMITTED", "GRADED"] }, dueAt: { lt: now }, personalStatus: { not: "DONE" } } }),
    db.assessment.findMany({ where: { userId, obtainedMarks: { not: null } }, include: { course: { select: { name: true, code: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    db.calendarEvent.findMany({ where: { userId, kind: { in: ["EXAM", "QUIZ"] }, startsAt: { gte: now, lte: twoWeeks } }, include: { course: { select: { name: true, code: true } } }, orderBy: { startsAt: "asc" }, take: 6 }),
    db.calendarEvent.findMany({ where: { userId, startsAt: { lt: today.end }, endsAt: { gt: today.start } }, orderBy: { startsAt: "asc" } }),
    db.task.findMany({ where: { userId, status: { not: "DONE" }, OR: [{ dueAt: { lt: today.end } }, { dueAt: null, priority: 1 }] }, orderBy: [{ dueAt: "asc" }, { priority: "asc" }], take: 8 }),
    db.note.findMany({ where: { userId, archived: false, OR: [{ pinned: true }, { favorite: true }] }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, title: true, updatedAt: true, tags: true } }),
    db.reminder.findMany({ where: { userId, status: "ACTIVE", remindAt: { lte: twoWeeks } }, orderBy: { remindAt: "asc" }, take: 5 }),
    db.attendanceRecord.findMany({ where: { userId, date: { gte: today.start, lt: today.end } }, include: { course: { select: { name: true, code: true } } } }),
    db.integrationConnection.findMany({ where: { userId } }),
    db.notificationDelivery.findMany({ where: { userId, channel: "IN_APP", status: "SENT", sentAt: { gte: new Date(now.getTime() - 2 * 86400_000) } }, include: { reminder: { select: { title: true } } }, orderBy: { sentAt: "desc" }, take: 5 }),
    db.course.count({ where: { userId, archived: false } }),
  ]);

  const agenda: AgendaItem[] = [
    ...classesToday.map((c) => ({ id: `c-${c.slotId}-${c.startsAt.getTime()}`, at: c.startsAt, end: c.endsAt, title: c.title, kind: "class" as const, source: c.source, href: "/timetable", status: c.status })),
    ...eventsToday.map((e) => ({ id: `e-${e.id}`, at: e.startsAt, end: e.endsAt, title: e.title, kind: e.kind === "EXAM" || e.kind === "QUIZ" ? ("exam" as const) : ("event" as const), source: e.source, href: "/calendar", suggested: e.suggested })),
    ...assignments.filter((a) => a.dueAt! < today.end).map((a) => ({ id: `a-${a.id}`, at: a.dueAt!, title: `Due: ${a.title}`, kind: "deadline" as const, source: a.source, href: "/assignments", suggested: a.suggested })),
    ...tasks.filter((t) => t.dueAt && t.dueAt >= today.start && t.dueAt < today.end).map((t) => ({ id: `t-${t.id}`, at: t.dueAt!, title: t.title, kind: "task" as const, source: t.source, href: "/tasks" })),
    ...reminders.filter((r) => r.remindAt >= today.start && r.remindAt < today.end).map((r) => ({ id: `r-${r.id}`, at: r.remindAt, title: r.title, kind: "reminder" as const, source: "ORBIT", href: "/calendar" })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    tz,
    prefs,
    today,
    classesToday,
    nextClass: upcomingClasses.find((c) => c.status === "SCHEDULED" && c.startsAt > now) ?? null,
    currentClass: classesToday.find((c) => c.status === "SCHEDULED" && c.startsAt <= now && c.endsAt > now) ?? null,
    assignments,
    overdueCount,
    recentMarks,
    exams,
    tasks,
    pinnedNotes,
    reminders,
    attendanceToday,
    connections,
    deliveries,
    agenda,
    courseCount,
  };
}
