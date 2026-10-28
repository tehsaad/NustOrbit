import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPrefs } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { classOccurrences } from "@/server/queries/schedule";
import { findConflicts } from "@/domain/timetable";
import { addDaysYmd, dayBounds, weekBounds, ymdInZone, zonedWallTime, type Ymd } from "@/domain/time";
import { PageHeader } from "@/components/page-header";
import { daysFromNow } from "@/lib/clock";
import { CalendarView, type CalItem } from "./calendar-view";
import { EventFormDialog, ReminderFormDialog } from "./event-forms";
import { RemindersPanel } from "./reminders-panel";

export const metadata: Metadata = { title: "Calendar" };

function parseYmd(s: string | undefined): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; new?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const prefs = await getPrefs(user.id);
  const tz = prefs.timezone;
  const view = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const anchorYmd = parseYmd(sp.date) ?? ymdInZone(new Date(), tz);
  const anchor = zonedWallTime(anchorYmd, 12 * 60, tz);

  let from: Date, to: Date, startYmd: Ymd, days: number;
  if (view === "day") {
    ({ start: from, end: to } = dayBounds(anchor, tz));
    startYmd = anchorYmd;
    days = 1;
  } else if (view === "week") {
    const w = weekBounds(anchor, tz, prefs.weekStartsOn);
    from = w.start;
    to = w.end;
    startYmd = w.startYmd;
    days = 7;
  } else {
    const first = { y: anchorYmd.y, m: anchorYmd.m, d: 1 };
    const w = weekBounds(zonedWallTime(first, 12 * 60, tz), tz, prefs.weekStartsOn);
    startYmd = w.startYmd;
    days = 42;
    from = w.start;
    to = zonedWallTime(addDaysYmd(startYmd, days), 0, tz);
  }

  const [classes, events, assignments, tasks, reminders, options, gcal] = await Promise.all([
    classOccurrences(user.id, from, to),
    db.calendarEvent.findMany({ where: { userId: user.id, startsAt: { lt: to }, endsAt: { gte: from } }, include: { course: { select: { name: true, code: true } } }, orderBy: { startsAt: "asc" } }),
    db.assignment.findMany({ where: { userId: user.id, dueAt: { gte: from, lt: to } }, include: { course: { select: { code: true, name: true } } } }),
    db.task.findMany({ where: { userId: user.id, dueAt: { gte: from, lt: to }, status: { not: "DONE" } } }),
    db.reminder.findMany({ where: { userId: user.id, status: "ACTIVE", remindAt: { gte: from, lt: to } } }),
    courseOptions(user.id),
    db.integrationConnection.findUnique({ where: { userId_provider: { userId: user.id, provider: "google-calendar" } }, select: { status: true } }),
  ]);

  const items: CalItem[] = [
    ...classes.map((c) => ({ id: `class:${c.slotId}:${c.startsAt.getTime()}`, title: c.title, start: c.startsAt.toISOString(), end: c.endsAt.toISOString(), kind: "CLASS", source: c.source, movable: false, cancelled: c.status !== "SCHEDULED", allDay: false })),
    ...events.map((e) => ({
      id: `event:${e.id}`,
      eventId: e.id,
      title: e.title,
      start: e.startsAt.toISOString(),
      end: e.endsAt.toISOString(),
      kind: e.kind,
      source: e.source,
      movable: e.source === "ORBIT" && !e.readOnly,
      allDay: e.allDay,
      suggested: e.suggested,
      syncStatus: e.syncStatus,
      location: e.location,
      description: e.description,
      courseId: e.courseId,
      url: e.url,
    })),
    ...assignments.map((a) => ({ id: `assignment:${a.id}`, title: `Due: ${a.title}`, start: a.dueAt!.toISOString(), end: a.dueAt!.toISOString(), kind: "DEADLINE", source: a.source, movable: false, allDay: false, suggested: a.suggested, done: a.universityStatus === "SUBMITTED" || a.universityStatus === "GRADED" })),
    ...tasks.map((t) => ({ id: `task:${t.id}`, title: t.title, start: t.dueAt!.toISOString(), end: t.dueAt!.toISOString(), kind: "TASK", source: t.source, movable: false, allDay: false })),
    ...reminders.map((r) => ({ id: `reminder:${r.id}`, title: r.title, start: r.remindAt.toISOString(), end: r.remindAt.toISOString(), kind: "REMINDER", source: "ORBIT", movable: false, allDay: false })),
  ];

  const timed = items
    .filter((i) => !i.allDay && !i.cancelled && i.start !== i.end && (i.kind === "CLASS" || i.id.startsWith("event:")))
    .map((i) => ({ id: i.id, startsAt: new Date(i.start), endsAt: new Date(i.end) }));
  const conflictIds = [...new Set(findConflicts(timed).flatMap(([a, b]) => [a.id, b.id]))];

  const upcoming = await db.assignment.findMany({
    where: { userId: user.id, dueAt: { gte: daysFromNow(0), lte: daysFromNow(3) }, universityStatus: { notIn: ["SUBMITTED", "GRADED"] } },
    orderBy: { dueAt: "asc" },
    take: 6,
    select: { id: true, title: true, dueAt: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Classes, deadlines, exams, Google events, tasks and reminders in one place. Externally owned events are read-only here."
        actions={
          <>
            <ReminderFormDialog />
            <EventFormDialog courses={options} defaultOpen={sp.new === "1"} tz={tz} />
          </>
        }
      />
      <CalendarView
        items={items}
        view={view}
        tz={tz}
        startYmd={startYmd}
        days={days}
        anchorYmd={anchorYmd}
        conflictIds={conflictIds}
        courses={options}
        googleConnected={gcal?.status === "CONNECTED"}
        upcoming={upcoming.map((u) => ({ id: u.id, title: u.title, dueAt: u.dueAt!.toISOString() }))}
      />
      <RemindersPanel userId={user.id} tz={tz} />
    </div>
  );
}
