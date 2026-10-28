"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, CloudUpload, Download, ExternalLink, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceBadge, SuggestedBadge } from "@/components/source-badge";
import { ConfirmAction } from "@/components/forms";
import { addDaysYmd, ymdInZone, zonedWallTime, type Ymd } from "@/domain/time";
import { deleteEvent, rescheduleEvent } from "@/server/actions/schedule";
import { pushEventToGoogleAction } from "@/server/actions/integrations";
import { fmtTime, toLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EventFormDialog } from "./event-forms";

export type CalItem = {
  id: string;
  eventId?: string;
  title: string;
  start: string;
  end: string;
  kind: string;
  source: string;
  movable: boolean;
  allDay: boolean;
  cancelled?: boolean;
  suggested?: boolean;
  done?: boolean;
  syncStatus?: string;
  location?: string | null;
  description?: string | null;
  courseId?: string | null;
  url?: string | null;
};

const KIND_COLOR: Record<string, string> = {
  CLASS: "border-l-primary bg-primary/10",
  EXAM: "border-l-warning bg-warning/10",
  QUIZ: "border-l-warning bg-warning/10",
  DEADLINE: "border-l-destructive bg-destructive/10",
  STUDY: "border-l-chart-3 bg-chart-3/10",
  TASK: "border-l-chart-3 bg-chart-3/10",
  REMINDER: "border-l-chart-5 bg-chart-5/10",
  PERSONAL: "border-l-chart-2 bg-chart-2/10",
  OTHER: "border-l-muted-foreground bg-muted",
};

const key = (y: Ymd) => `${y.y}-${String(y.m).padStart(2, "0")}-${String(y.d).padStart(2, "0")}`;

export function CalendarView({
  items,
  view,
  tz,
  startYmd,
  days,
  anchorYmd,
  conflictIds,
  courses,
  googleConnected,
  upcoming,
}: {
  items: CalItem[];
  view: "day" | "week" | "month";
  tz: string;
  startYmd: Ymd;
  days: number;
  anchorYmd: Ymd;
  conflictIds: string[];
  courses: { value: string; label: string }[];
  googleConnected: boolean;
  upcoming: { id: string; title: string; dueAt: string }[];
}) {
  const [selected, setSelected] = useState<CalItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, start] = useTransition();
  const conflicts = useMemo(() => new Set(conflictIds), [conflictIds]);
  const todayKey = key(ymdInZone(new Date(), tz));

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) {
      const k = key(ymdInZone(new Date(it.start), tz));
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    for (const list of m.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
    return m;
  }, [items, tz]);

  const cells = Array.from({ length: days }, (_, i) => addDaysYmd(startYmd, i));
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const prev = view === "month" ? { y: anchorYmd.m === 1 ? anchorYmd.y - 1 : anchorYmd.y, m: anchorYmd.m === 1 ? 12 : anchorYmd.m - 1, d: 1 } : addDaysYmd(anchorYmd, -step);
  const next = view === "month" ? { y: anchorYmd.m === 12 ? anchorYmd.y + 1 : anchorYmd.y, m: anchorYmd.m === 12 ? 1 : anchorYmd.m + 1, d: 1 } : addDaysYmd(anchorYmd, step);
  const title =
    view === "month"
      ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(anchorYmd.y, anchorYmd.m - 1, 1)))
      : view === "week"
        ? `Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(startYmd.y, startYmd.m - 1, startYmd.d)))}`
        : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(anchorYmd.y, anchorYmd.m - 1, anchorYmd.d)));

  function drop(target: Ymd) {
    const it = items.find((i) => i.id === dragId);
    setDragId(null);
    if (!it || !it.movable || !it.eventId) return;
    const s = new Date(it.start);
    const e = new Date(it.end);
    const local = toLocalInput(s, tz);
    const minutes = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
    const newStart = zonedWallTime(target, minutes, tz);
    if (newStart.getTime() === s.getTime()) return;
    const newEnd = new Date(newStart.getTime() + (e.getTime() - s.getTime()));
    start(async () => {
      const r = await rescheduleEvent({ id: it.eventId!, startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() });
      if (r.ok) toast.success(r.message ?? "Moved");
      else toast.error(r.error);
    });
  }

  function Chip({ it, compact }: { it: CalItem; compact?: boolean }) {
    return (
      <button
        type="button"
        draggable={it.movable}
        onDragStart={() => setDragId(it.id)}
        onClick={() => setSelected(it)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border-l-2 px-1.5 py-1 text-left text-xs",
          KIND_COLOR[it.kind] ?? KIND_COLOR.OTHER,
          it.cancelled && "line-through opacity-50",
          it.done && "opacity-60",
          it.movable && "cursor-grab active:cursor-grabbing",
          conflicts.has(it.id) && "ring-1 ring-warning",
          it.suggested && "border-dashed",
        )}
        title={`${it.title} · ${it.source}${it.movable ? " · drag to move" : ""}`}
      >
        {!it.allDay ? <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{fmtTime(new Date(it.start), tz)}</span> : null}
        <span className="min-w-0 flex-1 truncate">{it.title}</span>
        {!compact ? <SourceBadge source={it.source} className="shrink-0" /> : null}
        {conflicts.has(it.id) ? <AlertTriangle className="size-3 shrink-0 text-warning" aria-label="Conflict" /> : null}
      </button>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button asChild size="icon-sm" variant="outline" aria-label="Previous">
              <Link href={`/calendar?view=${view}&date=${key(prev)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/calendar?view=${view}`}>Today</Link>
            </Button>
            <Button asChild size="icon-sm" variant="outline" aria-label="Next">
              <Link href={`/calendar?view=${view}&date=${key(next)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <h2 className="font-semibold">{title}</h2>
          <div className="ml-auto flex rounded-lg border p-0.5" role="tablist" aria-label="Calendar view">
            {(["day", "week", "month"] as const).map((v) => (
              <Link
                key={v}
                role="tab"
                aria-selected={view === v}
                href={`/calendar?view=${v}&date=${key(anchorYmd)}`}
                className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <div className="grid grid-cols-7 overflow-hidden rounded-xl border bg-card">
            {cells.slice(0, 7).map((d) => (
              <div key={`h-${key(d)}`} className="border-b px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                {new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(d.y, d.m - 1, d.d)))}
              </div>
            ))}
            {cells.map((d) => {
              const list = byDay.get(key(d)) ?? [];
              return (
                <div
                  key={key(d)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={() => drop(d)}
                  className={cn("min-h-24 border-b border-r p-1 last:border-r-0", d.m !== anchorYmd.m && "bg-muted/30")}
                >
                  <Link href={`/calendar?view=day&date=${key(d)}`} className={cn("mb-1 inline-grid size-6 place-items-center rounded-full text-xs", key(d) === todayKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                    {d.d}
                  </Link>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((it) => (
                      <Chip key={it.id} it={it} compact />
                    ))}
                    {list.length > 3 ? (
                      <Link href={`/calendar?view=day&date=${key(d)}`} className="block px-1 text-[11px] text-muted-foreground hover:underline">
                        +{list.length - 3} more
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={cn("grid gap-2", view === "week" ? "md:grid-cols-7" : "")}>
            {cells.map((d) => {
              const list = byDay.get(key(d)) ?? [];
              return (
                <section
                  key={key(d)}
                  aria-label={key(d)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={() => drop(d)}
                  className={cn("min-h-32 rounded-xl border bg-card p-2", key(d) === todayKey && "border-primary/60")}
                >
                  <Link href={`/calendar?view=day&date=${key(d)}`} className={cn("mb-2 block text-xs font-semibold uppercase", key(d) === todayKey ? "text-primary" : "text-muted-foreground")}>
                    {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(d.y, d.m - 1, d.d)))}
                  </Link>
                  <div className="space-y-1">
                    {list.length === 0 ? <p className="text-xs text-muted-foreground">Free</p> : list.map((it) => <Chip key={it.id} it={it} compact={view === "week"} />)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Drag Orbit events to another day to reschedule. LMS, Google and timetable items can&apos;t be moved from here.</p>
      </div>

      <aside className="space-y-4">
        {selected ? (
          <div className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 font-semibold">{selected.title}</h3>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close details">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <SourceBadge source={selected.source} />
              {selected.suggested ? <SuggestedBadge /> : null}
              {selected.syncStatus && selected.source === "ORBIT" ? <span className="text-[10px] uppercase text-muted-foreground">{selected.syncStatus === "SYNCED" ? "in Google" : "Orbit only"}</span> : null}
            </div>
            <p className="mt-2 text-sm">
              {selected.allDay ? "All day" : `${fmtTime(new Date(selected.start), tz)}${selected.end !== selected.start ? `–${fmtTime(new Date(selected.end), tz)}` : ""}`}
              {selected.location ? ` · ${selected.location}` : ""}
            </p>
            {selected.description ? <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs text-muted-foreground">{selected.description}</p> : null}
            {conflicts.has(selected.id) ? <p className="mt-2 text-xs text-warning">Overlaps another class or event.</p> : null}
            <div className="mt-3 flex flex-wrap gap-1">
              {selected.url ? (
                <Button asChild size="xs" variant="ghost">
                  <a href={selected.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink /> Open
                  </a>
                </Button>
              ) : null}
              {selected.eventId ? (
                <Button asChild size="xs" variant="ghost">
                  <a href={`/api/export/ics?event=${selected.eventId}`}>
                    <Download /> .ics
                  </a>
                </Button>
              ) : null}
              {selected.movable && selected.eventId ? (
                <>
                  <EventFormDialog
                    courses={courses}
                    tz={tz}
                    ev={{
                      id: selected.eventId,
                      title: selected.title,
                      kind: selected.kind,
                      courseId: selected.courseId ?? null,
                      startsAt: toLocalInput(new Date(selected.start), tz),
                      endsAt: toLocalInput(new Date(selected.end), tz),
                      allDay: selected.allDay,
                      location: selected.location ?? null,
                      description: selected.description ?? null,
                    }}
                  />
                  {googleConnected ? (
                    <ConfirmAction
                      action={pushEventToGoogleAction}
                      hidden={{ id: selected.eventId }}
                      title={selected.syncStatus === "SYNCED" ? "Update this event in Google Calendar?" : "Add this event to Google Calendar?"}
                      description={`“${selected.title}” will be ${selected.syncStatus === "SYNCED" ? "updated in" : "created in"} your primary Google Calendar. If it was changed in Google since the last sync, Orbit will stop instead of overwriting it.`}
                      confirmLabel={selected.syncStatus === "SYNCED" ? "Update in Google" : "Add to Google"}
                      trigger={
                        <Button size="xs" variant="ghost">
                          <CloudUpload /> Google
                        </Button>
                      }
                    />
                  ) : null}
                  <ConfirmAction
                    action={deleteEvent}
                    hidden={{ id: selected.eventId }}
                    title="Delete event?"
                    description="It will be removed from Orbit. A copy already pushed to Google Calendar is not deleted."
                    trigger={
                      <Button size="xs" variant="ghost">
                        <Trash2 /> Delete
                      </Button>
                    }
                  />
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <h3 className="text-sm font-semibold">Next 3 days</h3>
          <p className="text-[11px] text-muted-foreground">Pending deadlines, soonest first.</p>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing due.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {upcoming.map((u) => (
                <li key={u.id} className="flex gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmtTime(new Date(u.dueAt), tz)}</span>
                  <span className="min-w-0 flex-1 truncate">{u.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
