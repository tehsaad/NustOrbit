import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { getUserOrNull } from "@/server/auth/session";
import { getPrefs } from "@/server/prefs";
import { buildIcs, type ExportEvent } from "@/domain/ics";

/**
 * Downloadable calendar of upcoming deadlines/events/reminders with alerts.
 * This is the supported way to get Orbit items into a phone's calendar
 * (including Samsung Calendar). It does NOT create Samsung Clock alarms.
 */
export async function GET(request: NextRequest) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = await getPrefs(user.id);
  const alarm = prefs.defaultReminderMinutes;
  const now = new Date();
  const horizon = new Date(now.getTime() + 120 * 86400_000);
  const id = request.nextUrl.searchParams.get("event");
  const events: ExportEvent[] = [];

  if (id) {
    const ev = await db.calendarEvent.findFirst({ where: { id, userId: user.id } });
    if (!ev) return NextResponse.json({ error: "not found" }, { status: 404 });
    events.push({ uid: `orbit-event-${ev.id}`, title: ev.title, startsAt: ev.startsAt, endsAt: ev.endsAt, description: ev.description, location: ev.location, alarmMinutesBefore: alarm });
  } else {
    const [assignments, evs, reminders] = await Promise.all([
      db.assignment.findMany({ where: { userId: user.id, dueAt: { gte: now, lte: horizon }, universityStatus: { notIn: ["SUBMITTED", "GRADED"] } }, include: { course: true } }),
      db.calendarEvent.findMany({ where: { userId: user.id, startsAt: { gte: now, lte: horizon }, kind: { in: ["EXAM", "QUIZ", "DEADLINE", "STUDY"] } } }),
      db.reminder.findMany({ where: { userId: user.id, status: "ACTIVE", remindAt: { gte: now, lte: horizon } } }),
    ]);
    for (const a of assignments) {
      events.push({ uid: `orbit-assignment-${a.id}`, title: `Due: ${a.title}${a.course ? ` (${a.course.code ?? a.course.name})` : ""}`, startsAt: a.dueAt!, endsAt: a.dueAt!, description: a.url ?? undefined, alarmMinutesBefore: alarm });
    }
    for (const e of evs) events.push({ uid: `orbit-event-${e.id}`, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, description: e.description, location: e.location, alarmMinutesBefore: alarm });
    for (const r of reminders) events.push({ uid: `orbit-reminder-${r.id}`, title: r.title, startsAt: r.remindAt, endsAt: r.remindAt, description: r.body, alarmMinutesBefore: 0 });
  }

  return new NextResponse(buildIcs(events, "Orbit"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id ? "orbit-event" : "orbit-upcoming"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
