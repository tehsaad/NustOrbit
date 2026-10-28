import type { Metadata } from "next";
import { AlertTriangle, Clock, Trash2, Undo2 } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPrefs } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { classOccurrences } from "@/server/queries/schedule";
import { findSlotConflicts } from "@/domain/timetable";
import { addDaysYmd, weekBounds, zonedWallTime } from "@/domain/time";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { SourceBadge } from "@/components/source-badge";
import { ConfirmAction, InlineAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/live-clock";
import { SlotFormDialog } from "@/components/modules/timetable-form";
import { deleteClassOverride, deleteTimetableEntry, saveClassOverride } from "@/server/actions/schedule";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Timetable" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function TimetablePage() {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const tz = prefs.timezone;
  const now = new Date();
  const week = weekBounds(now, tz, prefs.weekStartsOn);
  const [slots, options, occurrences, overrides, exams] = await Promise.all([
    db.timetableEntry.findMany({ where: { userId: user.id }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    courseOptions(user.id),
    classOccurrences(user.id, week.start, week.end),
    db.classSession.findMany({ where: { userId: user.id, startsAt: { gte: new Date(now.getTime() - 7 * 86400_000) } }, orderBy: { startsAt: "asc" }, include: { timetableEntry: { select: { title: true } } } }),
    db.calendarEvent.findMany({ where: { userId: user.id, kind: "EXAM", startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 10 }),
  ]);
  const conflicts = findSlotConflicts(slots);
  const conflictIds = new Set(conflicts.flatMap(([a, b]) => [a.id, b.id]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const ymd = addDaysYmd(week.startYmd, i);
    const start = zonedWallTime(ymd, 0, tz);
    const end = zonedWallTime(addDaysYmd(ymd, 1), 0, tz);
    return { start, items: occurrences.filter((o) => o.startsAt >= start && o.startsAt < end) };
  });
  const next = occurrences.find((o) => o.status === "SCHEDULED" && o.startsAt > now);

  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" description={`Weekly classes in ${tz}. Scheduled classes are not attendance records.`} actions={<SlotFormDialog courses={options} />} />

      {conflicts.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
          <AlertTriangle className="mt-0.5 size-4 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium">{conflicts.length} timetable conflict{conflicts.length === 1 ? "" : "s"}</p>
            {conflicts.map(([a, b]) => (
              <p key={`${a.id}-${b.id}`} className="text-muted-foreground">
                {DAYS[a.dayOfWeek]}: {a.title} ({a.startTime}–{a.endTime}) overlaps {b.title} ({b.startTime}–{b.endTime})
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {next ? (
        <p className="text-sm">
          Next: <span className="font-medium">{next.title}</span> {fmtDateTime(next.startsAt, tz)} · <Countdown to={next.startsAt.toISOString()} />
        </p>
      ) : null}

      {slots.length === 0 ? (
        <EmptyState icon={Clock} title="Your timetable is empty" description="Add your weekly classes, or import a timetable CSV from Qalam on the Integrations page." action={<SlotFormDialog courses={options} />} />
      ) : (
        <section aria-label="This week" className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((d) => {
            const isToday = fmtDate(d.start, tz) === fmtDate(now, tz);
            return (
              <div key={d.start.toISOString()} className={cn("rounded-xl border bg-card p-3", isToday && "border-primary/60 ring-1 ring-primary/30")}>
                <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>{fmtDate(d.start, tz, { weekday: "short", day: "numeric", month: "short" })}</p>
                {d.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No classes</p>
                ) : (
                  <ul className="space-y-2">
                    {d.items.map((o) => (
                      <li key={`${o.slotId}-${o.startsAt.getTime()}`} className={cn("rounded-lg border-l-2 bg-muted/40 p-2 text-xs", conflictIds.has(o.slotId) ? "border-warning" : "border-primary", o.status !== "SCHEDULED" && "opacity-60")}>
                        <p className={cn("font-medium", o.status !== "SCHEDULED" && "line-through")}>{o.title}</p>
                        <p className="text-muted-foreground">
                          {fmtTime(o.startsAt, tz)}–{fmtTime(o.endsAt, tz)}
                          {o.room ? ` · ${o.room}` : ""}
                        </p>
                        {o.status !== "SCHEDULED" ? <p className="font-medium text-destructive">{o.status.toLowerCase()}</p> : null}
                        {o.status === "SCHEDULED" && o.slotId !== "extra" ? (
                          <InlineAction action={saveClassOverride} hidden={{ timetableEntryId: o.slotId, status: "CANCELLED", startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() }}>
                            <button type="submit" className="mt-1 text-[11px] text-muted-foreground hover:text-destructive">
                              Mark cancelled
                            </button>
                          </InlineAction>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Weekly classes">
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">{DAYS[s.dayOfWeek].slice(0, 3)}</span>
                  <span className="w-24 shrink-0 font-mono text-xs tabular-nums">
                    {s.startTime}–{s.endTime}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.title}
                    {s.room ? <span className="text-muted-foreground"> · {s.room}</span> : null}
                  </span>
                  {conflictIds.has(s.id) ? <AlertTriangle className="size-3.5 text-warning" aria-label="Conflict" /> : null}
                  <SourceBadge source={s.source} />
                  <SlotFormDialog courses={options} slot={s} />
                  <ConfirmAction
                    action={deleteTimetableEntry}
                    hidden={{ id: s.id }}
                    title="Remove class?"
                    description="All weekly occurrences of this class will be removed."
                    trigger={
                      <Button size="icon-xs" variant="ghost" aria-label="Remove">
                        <Trash2 />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Changes, holidays & exams">
          {overrides.length === 0 && exams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cancellations, make-up sessions or exams recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {overrides.map((o) => (
                <li key={o.id} className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">{o.status.toLowerCase()}</span>
                  <span className="min-w-0 flex-1 truncate">{o.timetableEntry?.title ?? "Session"}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(o.startsAt, tz)}</span>
                  <InlineAction action={deleteClassOverride} hidden={{ id: o.id }}>
                    <Button type="submit" size="icon-xs" variant="ghost" aria-label="Undo">
                      <Undo2 />
                    </Button>
                  </InlineAction>
                </li>
              ))}
              {exams.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-warning">exam</span>
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(e.startsAt, tz)}</span>
                  <SourceBadge source={e.source} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
